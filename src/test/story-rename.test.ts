import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ArchiveStory } from '@/types/archive';
import { closeDB } from '@/lib/idb';
import { getArchiveStory, saveArchiveStory, updateArchiveStory, updateBranchLine } from '@/lib/archive-db';
import { normalizeStoryTitle, renameArchiveStory } from '@/lib/story-rename';

beforeEach(() => {
  // 每个用例一套干净的 IndexedDB（与 archive-write-safety 用例同样的隔离方式）
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  closeDB();
});

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

describe('normalizeStoryTitle', () => {
  it('trims a non-empty title', () => {
    expect(normalizeStoryTitle('  新故事  ')).toBe('新故事');
  });

  it('rejects an empty title', () => {
    expect(() => normalizeStoryTitle('  ')).toThrow('故事名称不能为空');
  });
});

describe('renameArchiveStory', () => {
  it('改名同时写入主线 session.title，之后的会话变更不会把旧名写回来', async () => {
    await saveArchiveStory(story('旧名'));

    await renameArchiveStory('s1', '  新名  ');

    const renamed = await getArchiveStory('s1');
    expect(renamed?.title).toBe('新名');
    // 关键断言：session.title 必须跟着改，否则工作区的「主线标题跟随」会回滚改名
    expect(renamed?.session.title).toBe('新名');

    // 模拟故事工作区里一次任意会话变更（隐藏楼层/切分支都走这条路）
    await updateArchiveStory('s1', (cur) => {
      let updated = updateBranchLine(cur, null, { session: { ...cur.session, messages: [] } });
      if (cur.session.title && cur.session.title !== cur.title) {
        updated = { ...updated, title: cur.session.title };
      }
      return updated;
    });

    expect((await getArchiveStory('s1'))?.title).toBe('新名');
  });

  it('拒绝空标题且不写库', async () => {
    await saveArchiveStory(story('旧名'));
    await expect(renameArchiveStory('s1', '   ')).rejects.toThrow('故事名称不能为空');
    expect((await getArchiveStory('s1'))?.title).toBe('旧名');
  });
});
