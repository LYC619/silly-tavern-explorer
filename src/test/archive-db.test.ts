import { describe, it, expect } from 'vitest';
import type { ArchiveStory } from '@/types/archive';
import type { ChatSession } from '@/types/chat';
import {
  buildCharacterFromCard,
  buildStoryFromSession,
  sortStoriesForDisplay,
  computeStoryMeta,
} from '@/lib/archive-db';

describe('buildCharacterFromCard', () => {
  it('V2 卡取 data 字段：名称、creator_notes 首行做副标题', () => {
    const c = buildCharacterFromCard({
      spec: 'chara_card_v2',
      data: {
        name: '赫敏',
        description: '一个聪明的魔法学徒',
        creator_notes: '适合校园魔法题材\n第二行不进副标题',
        tags: ['魔法', '校园'],
      },
    });
    expect(c.name).toBe('赫敏');
    expect(c.subtitle).toBe('适合校园魔法题材');
    expect(c.status).toBe('未开始');
    expect(c.tags).toEqual([]); // STE 本地标签独立维护，初始为空
    expect(c.rating).toBeUndefined();
  });

  it('V1 顶层字段也能取到名称；无名称走 normalize 的缺省 Character', () => {
    expect(buildCharacterFromCard({ name: '老卡' }).name).toBe('老卡');
    expect(buildCharacterFromCard({}).name).toBe('Character');
  });

  it('保留 pngBase64 原图', () => {
    const c = buildCharacterFromCard({ name: 'x' }, 'AAAA');
    expect(c.pngBase64).toBe('AAAA');
  });
});

describe('buildStoryFromSession / computeStoryMeta', () => {
  const session: ChatSession = {
    id: 's1',
    title: '主线故事',
    messages: [
      { id: 'm1', role: 'user', content: 'hi', rawData: { extra: { model: 'claude' }, gen_finished: '2026-01-01T20:00:00Z' } },
      { id: 'm2', role: 'assistant', content: 'hello', rawData: { extra: { model: 'claude' }, gen_finished: '2026-01-01T20:05:00Z' } },
    ],
    character: { name: 'B' },
    user: { name: 'A' },
    createdAt: 1,
  };

  it('绑定角色并计算元数据', () => {
    const story = buildStoryFromSession(session, 'char_1');
    expect(story.characterId).toBe('char_1');
    expect(story.title).toBe('主线故事');
    expect(story.meta.modelsUsed).toEqual(['claude']);
    expect(story.meta.lastModel).toBe('claude');
    expect(story.meta.playTimeMs).toBe(5 * 60_000);
    expect(story.meta.sessionCount).toBe(1);
  });

  it('未绑定（临时）故事 characterId 为空', () => {
    expect(buildStoryFromSession(session).characterId).toBeUndefined();
  });

  it('无时间戳消息 playTimeMs 为 null（未统计）', () => {
    const meta = computeStoryMeta([{ id: 'm', role: 'user', content: 'x' }]);
    expect(meta.playTimeMs).toBeNull();
    expect(meta.modelsUsed).toEqual([]);
  });
});

describe('sortStoriesForDisplay（定稿：有查看记录按最近查看，没看过的按创建序垫后）', () => {
  const mk = (id: string, createdAt: number, lastViewedAt?: number): ArchiveStory => ({
    id,
    title: id,
    session: { id, title: id, messages: [], character: { name: 'c' }, user: { name: 'u' }, createdAt },
    markers: [],
    meta: { modelsUsed: [], playTimeMs: null },
    lastViewedAt,
    createdAt,
    updatedAt: createdAt,
  });

  it('初次导入全无记录：按创建时间升序（≈故事编号）', () => {
    const sorted = sortStoriesForDisplay([mk('c', 3), mk('a', 1), mk('b', 2)]);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('看过的按最近查看降序排最前，没看过的按创建序跟在后面', () => {
    const sorted = sortStoriesForDisplay([
      mk('未读晚建', 4),
      mk('看过较早', 1, 100),
      mk('看过最近', 2, 200),
      mk('未读早建', 3),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['看过最近', '看过较早', '未读早建', '未读晚建']);
  });
});
