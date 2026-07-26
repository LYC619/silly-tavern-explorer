import { describe, it, expect } from 'vitest';
import type { ChatSession } from '@/types/chat';
import {
  buildStoryFromSession,
  buildBranchFromSession,
  getBranchLine,
  updateBranchLine,
  repointForBind,
} from '@/lib/archive-db';

const makeSession = (id: string, model = 'claude'): ChatSession => ({
  id,
  title: `会话${id}`,
  messages: [
    { id: `${id}-m1`, role: 'user', content: 'hi', rawData: {} },
    { id: `${id}-m2`, role: 'assistant', content: 'hello', rawData: { extra: { model } } },
  ],
  character: { name: 'B' },
  user: { name: 'A' },
  createdAt: 1,
});

describe('分支：buildBranchFromSession / getBranchLine / updateBranchLine', () => {
  it('建分支：带自己的 session/markers，空名回退会话标题', () => {
    const b = buildBranchFromSession(makeSession('s2'), '');
    expect(b.name).toBe('会话s2');
    expect(b.markers).toEqual([]);
    expect(buildBranchFromSession(makeSession('s2'), '告白失败线').name).toBe('告白失败线');
  });

  it('getBranchLine：null=主线切片；分支按 id 取；不存在返回 undefined', () => {
    const story = buildStoryFromSession(makeSession('s1'), 'char_1');
    story.lastFloor = 42;
    const branch = buildBranchFromSession(makeSession('s2'), '支线');
    branch.lastFloor = 7;
    story.branches = [branch];

    const trunk = getBranchLine(story, null)!;
    expect(trunk.session.id).toBe('s1');
    expect(trunk.lastFloor).toBe(42);
    expect(trunk.favorites).toEqual([]); // 未设置时给空数组，UI 不用判空

    const line = getBranchLine(story, branch.id)!;
    expect(line.session.id).toBe('s2');
    expect(line.lastFloor).toBe(7);

    expect(getBranchLine(story, 'nope')).toBeUndefined();
  });

  it('updateBranchLine 主线：session 变化重算 meta 并 bump updatedAt；不改入参', () => {
    const story = buildStoryFromSession(makeSession('s1', 'claude'), 'char_1');
    const before = story.updatedAt;
    const next = updateBranchLine(story, null, { session: makeSession('s1b', 'gpt') });
    expect(next.meta.lastModel).toBe('gpt');
    expect(next.updatedAt).toBeGreaterThanOrEqual(before);
    expect(next).not.toBe(story);
    expect(story.session.id).toBe('s1'); // 入参未被改
  });

  it('updateBranchLine：只动 lastFloor 不 bump updatedAt（阅读位置不算内容修改）', () => {
    const story = buildStoryFromSession(makeSession('s1'), 'char_1');
    const stamp = story.updatedAt;
    const next = updateBranchLine(story, null, { lastFloor: 99 });
    expect(next.lastFloor).toBe(99);
    expect(next.updatedAt).toBe(stamp);
  });

  it('updateBranchLine 分支：只改目标分支，主线与其他分支不动；分支不存在原样返回', () => {
    const story = buildStoryFromSession(makeSession('s1'), 'char_1');
    const b1 = buildBranchFromSession(makeSession('s2'), '甲');
    const b2 = buildBranchFromSession(makeSession('s3'), '乙');
    story.branches = [b1, b2];

    const next = updateBranchLine(story, b1.id, { favorites: ['s2-m1'], lastFloor: 3 });
    const nb1 = next.branches!.find((b) => b.id === b1.id)!;
    expect(nb1.favorites).toEqual(['s2-m1']);
    expect(nb1.lastFloor).toBe(3);
    expect(next.branches!.find((b) => b.id === b2.id)).toBe(b2);
    expect(next.session.id).toBe('s1');

    expect(updateBranchLine(story, 'ghost', { lastFloor: 1 })).toBe(story);
  });
});

describe('绑定成果带走：repointForBind', () => {
  it('只重指匹配 bookId 的条目，bookTitle 有则同步为故事标题', () => {
    const items = [
      { id: 'a', bookId: 'book_1', bookTitle: '旧书名', content: 'x' },
      { id: 'b', bookId: 'book_2', bookTitle: '别的书', content: 'y' },
      { id: 'c', bookId: null, bookTitle: '孤儿', content: 'z' },
    ];
    const moved = repointForBind(items, 'book_1', 'astory_9', '新故事');
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: 'a', bookId: 'astory_9', bookTitle: '新故事' });
  });

  it('无 bookTitle 字段的条目（故事树老数据）不会被硬塞 bookTitle', () => {
    const moved = repointForBind([{ id: 't', bookId: 'book_1' }], 'book_1', 'astory_9', '新故事');
    expect(moved[0].bookId).toBe('astory_9');
    expect('bookTitle' in moved[0]).toBe(false);
  });
});
