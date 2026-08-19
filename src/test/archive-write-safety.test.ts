import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ArchiveCharacter, ArchiveStory, QuoteAsset } from '@/types/archive';
import type { STCharacterCard } from '@/lib/png-parser';
import { closeDB } from '@/lib/idb';
import {
  getCharacter,
  saveCharacter,
  updateCharacter,
  markCharacterViewed,
  getArchiveStory,
  saveArchiveStory,
  updateArchiveStory,
} from '@/lib/archive-db';
import {
  StoryDraftSaver,
  flushBeforeStoryTransition,
} from '@/lib/story-draft-save';
import { commitCharacterPatch } from '@/lib/character-write';
import { updateCharacterAssetReference } from '@/lib/character-asset-ref';

const card = { name: '测试' } as unknown as STCharacterCard;

function character(extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return {
    id: 'c1', name: '测试', card, tags: [], status: '未开始',
    createdAt: 1, updatedAt: 1, ...extra,
  };
}

function story(title: string): ArchiveStory {
  return {
    id: 's1', title,
    session: {
      id: 'session-1', title, messages: [],
      character: { name: '测试' }, user: { name: '用户' }, createdAt: 1,
    },
    markers: [], meta: { modelsUsed: [], playTimeMs: null }, createdAt: 1, updatedAt: 1,
  };
}

function storyWithBranches(extra: Partial<ArchiveStory> = {}): ArchiveStory {
  return {
    ...story('初始故事'),
    branches: [{
      id: 'branch-1', name: '分支 1', session: story('分支').session,
      markers: [], createdAt: 1, updatedAt: 1,
    }],
    ...extra,
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  closeDB();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

describe('角色档案按 ID 串行更新', () => {
  it('两个并发导入都基于最新档案计算，结果不会互相覆盖', async () => {
    await saveCharacter(character());
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const quote = (id: string): QuoteAsset => ({ id, title: id, body: id, addedAt: 1 });

    const first = updateCharacter('c1', async (current) => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { quotes: [...(current.quotes ?? []), quote('a')] };
    });
    await firstStarted.promise;
    const second = updateCharacter('c1', async (current) => ({
      quotes: [...(current.quotes ?? []), quote('b')],
    }));

    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect((await getCharacter('c1'))?.quotes?.map((q) => q.id)).toEqual(['a', 'b']);
  });

  it('COW 切换资产引用时保留排队期间发生的角色字段修改', async () => {
    await saveCharacter(character({
      subtitle: '旧说明',
      assets: [{ kind: 'worldbook', assetId: 'shared-book' }],
    }));
    const firstStarted = deferred();
    const releaseFirst = deferred();

    const concurrentEdit = updateCharacter('c1', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { subtitle: '并发修改后的说明' };
    });
    await firstStarted.promise;
    const switchReference = updateCharacterAssetReference(
      'c1', 'worldbook', 'shared-book', 'derived-book', 99,
    );

    releaseFirst.resolve();
    await Promise.all([concurrentEdit, switchReference]);

    expect(await getCharacter('c1')).toMatchObject({
      subtitle: '并发修改后的说明',
      updatedAt: 99,
      assets: [{ kind: 'worldbook', assetId: 'derived-book' }],
    });
  });
});

describe('故事档案按 ID 串行更新', () => {
  it('交错更新不同字段和分支时，最终持久化记录保留两笔修改', async () => {
    await saveArchiveStory(storyWithBranches());
    const firstStarted = deferred();
    const releaseFirst = deferred();

    const first = updateArchiveStory('s1', async (current) => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return {
        markers: [{ messageId: 'marker-1', messageIndex: 0, title: '第一笔', createdAt: 1 }],
        branches: current.branches?.map((branch) => (
          branch.id === 'branch-1'
            ? { ...branch, markers: [{ messageId: 'branch-marker', messageIndex: 1, title: '分支修改', createdAt: 1 }] }
            : branch
        )),
      };
    });
    await firstStarted.promise;

    const second = updateArchiveStory('s1', () => ({
      favorites: ['message-2'],
    }));

    releaseFirst.resolve();
    await Promise.all([first, second]);

    const saved = await getArchiveStory('s1');
    expect(saved?.markers).toEqual([{ messageId: 'marker-1', messageIndex: 0, title: '第一笔', createdAt: 1 }]);
    expect(saved?.favorites).toEqual(['message-2']);
    expect(saved?.branches?.[0].markers).toEqual([
      { messageId: 'branch-marker', messageIndex: 1, title: '分支修改', createdAt: 1 },
    ]);
  });
});

describe('就地阅读显式 flush', () => {
  it('保存前发生外部字段更新时，mutation replay 不会用旧快照覆盖它', async () => {
    let persisted = story('旧稿');
    const saver = new StoryDraftSaver(async (_id, updater) => {
      const patch = await updater(persisted);
      if (patch) persisted = { ...persisted, ...patch };
      return persisted;
    });

    saver.queueMutation('s1', () => ({ title: '新稿' }));
    persisted = { ...persisted, favorites: ['external-change'] };
    await saver.flush();

    expect(persisted.title).toBe('新稿');
    expect(persisted.favorites).toEqual(['external-change']);
    expect(saver.isDirty()).toBe(false);
  });

  it.each(['切换故事', '返回列表', '打开编辑器'])('保存失败时阻止%s', async () => {
    const saver = new StoryDraftSaver(async () => { throw new Error('disk full'); });
    saver.queueMutation('s1', () => ({ title: '未保存' }));
    let transitioned = false;

    await expect(flushBeforeStoryTransition(saver, () => { transitioned = true; })).rejects.toThrow('disk full');
    expect(transitioned).toBe(false);
    expect(saver.isDirty()).toBe(true);
  });
});

describe('角色补丁提交', () => {
  it('持久化失败时不把未落库数据提交到界面', async () => {
    const original = character({ notes: [] });
    let rendered = original;

    await expect(commitCharacterPatch(
      'c1',
      { notes: [{ id: 'n1', body: '未保存', at: 1 }] },
      async () => { throw new Error('write failed'); },
      (saved) => { rendered = saved; },
    )).rejects.toThrow('write failed');

    expect(rendered).toBe(original);
  });
});

describe('角色级最近查看时间', () => {
  it('通过角色串行写入队列记录访问，且不修改 updatedAt', async () => {
    await saveCharacter(character({ updatedAt: 77 }));

    await markCharacterViewed('c1', 1234);

    expect(await getCharacter('c1')).toMatchObject({ lastViewedAt: 1234, updatedAt: 77 });
  });
});
