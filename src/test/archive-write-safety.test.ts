import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ArchiveCharacter, ArchiveStory, QuoteAsset } from '@/types/archive';
import type { STCharacterCard } from '@/lib/png-parser';
import { closeDB } from '@/lib/idb';
import {
  getCharacter,
  saveCharacter,
  updateCharacter,
} from '@/lib/archive-db';
import {
  StoryDraftSaver,
  flushBeforeStoryTransition,
} from '@/lib/story-draft-save';
import { commitCharacterPatch } from '@/lib/character-write';

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
});

describe('就地阅读显式 flush', () => {
  it('旧保存未完成时保留最新脏状态，并在旧保存后再落最新版本', async () => {
    const releaseOld = deferred();
    const writes: string[] = [];
    const saver = new StoryDraftSaver(async (value) => {
      if (value.title === '旧稿') await releaseOld.promise;
      writes.push(value.title);
    });

    saver.setDraft(story('旧稿'));
    const firstFlush = saver.flush();
    saver.setDraft(story('新稿'));
    const secondFlush = saver.flush();
    releaseOld.resolve();

    await Promise.all([firstFlush, secondFlush]);
    expect(writes).toEqual(['旧稿', '新稿']);
    expect(saver.isDirty()).toBe(false);
  });

  it.each(['切换故事', '返回列表', '打开编辑器'])('保存失败时阻止%s', async () => {
    const saver = new StoryDraftSaver(async () => { throw new Error('disk full'); });
    saver.setDraft(story('未保存'));
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
