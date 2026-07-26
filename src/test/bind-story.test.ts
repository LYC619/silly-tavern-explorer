import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, closeDB } from '@/lib/idb';
import { bindSessionToCharacter } from '@/lib/bind-story';
import { getArchiveStory } from '@/lib/archive-db';
import type { ChatSession } from '@/types/chat';

beforeEach(() => {
  closeDB();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

function seed(store: string, item: Record<string, unknown>): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

const session: ChatSession = {
  id: 's1',
  title: '绑定测试',
  messages: [
    { id: 'm1', role: 'user', content: 'hi' },
    { id: 'm2', role: 'assistant', content: 'hello（改过）' },
  ],
  character: { name: 'B' },
  user: { name: 'A' },
  createdAt: 1,
};

describe('bindSessionToCharacter（阶段5：绑定=未绑定故事补 characterId）', () => {
  it('已有未绑定故事：原地升级（同 id），当前编辑态落库，成果计数不重指', async () => {
    const now = Date.now();
    await seed('archiveStories', {
      id: 'astory_u1',
      title: '旧标题',
      session: { ...session, messages: [session.messages[0]] }, // 库里是旧快照
      markers: [],
      meta: { modelsUsed: [], playTimeMs: null },
      createdAt: now,
      updatedAt: now,
    });
    // 未绑定期间的成果本就挂在故事 id 上
    await seed('summaries', { id: 'sm1', bookId: 'astory_u1', bookTitle: '旧标题', kind: 'volume', title: '卷一', floorStart: 0, floorEnd: 1, content: 'x', createdAt: now, updatedAt: now });
    await seed('stories', { id: 'tr1', bookId: 'astory_u1', title: '树', nodes: [], createdAt: now, updatedAt: now });

    const { story, carried } = await bindSessionToCharacter({
      characterId: 'char_1',
      storyId: 'astory_u1',
      session,
      markers: [{ messageId: 'm2', messageIndex: 1, title: '第一章', createdAt: now } as never],
      favorites: ['m2'],
    });

    expect(story.id).toBe('astory_u1'); // 同 id 原地升级，成果无需重指
    expect(story.characterId).toBe('char_1');
    expect(story.title).toBe('绑定测试');
    expect(carried).toBe(2);

    const persisted = await getArchiveStory('astory_u1');
    expect(persisted?.characterId).toBe('char_1');
    expect(persisted?.session.messages).toHaveLength(2); // 最新编辑态已落库
    expect(persisted?.favorites).toEqual(['m2']);
  });

  it('storyId 为 null（示例数据等未落库会话）：新建绑定故事，carried=0', async () => {
    const { story, carried } = await bindSessionToCharacter({
      characterId: 'char_2',
      storyId: null,
      session,
      markers: [],
      favorites: [],
    });
    expect(story.characterId).toBe('char_2');
    expect(carried).toBe(0);
    const persisted = await getArchiveStory(story.id);
    expect(persisted?.session.messages).toHaveLength(2);
  });
});
