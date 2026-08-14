import { describe, expect, it } from 'vitest';
import type { ArchiveCharacter } from '@/types/archive';
import { buildLibraryGroups, LIBRARY_GROUP_BY_OPTIONS } from '@/lib/library-grouping';

function character(id: string, extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return {
    id,
    name: id,
    card: {},
    tags: [],
    status: '未开始',
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  } as ArchiveCharacter;
}

describe('library grouped card wall', () => {
  it('keeps the current order and every card exactly once when grouping is disabled', () => {
    const cards = [character('c'), character('a'), character('b')];
    const groups = buildLibraryGroups(cards, 'none');

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((card) => card.id)).toEqual(['c', 'a', 'b']);
  });

  it('groups by the fixed type order and puts missing types last', () => {
    const groups = buildLibraryGroups([
      character('none'),
      character('fan', { type: '同人' }),
      character('plot', { type: '剧情' }),
      character('person', { type: '人物' }),
    ], 'type');

    expect(groups.map((group) => group.label)).toEqual(['人物', '剧情', '同人', '未分类']);
    expect(groups.flatMap((group) => group.items.map((card) => card.id))).toEqual([
      'person',
      'plot',
      'fan',
      'none',
    ]);
  });

  it('uses the existing rating tiers and keeps unrated cards separate', () => {
    const groups = buildLibraryGroups([
      character('pass', { rating: 6 }),
      character('unrated'),
      character('great', { rating: 9 }),
      character('low', { rating: 5.5 }),
      character('fine', { rating: 8 }),
    ], 'rating');

    expect(groups.map((group) => group.label)).toEqual(['神作', '精品', '及格', '低创', '未评分']);
  });

  it('groups recent updates by calendar date instead of collapsing one import week', () => {
    const day = 24 * 60 * 60 * 1000;
    const now = new Date('2026-08-11T12:00:00+08:00').getTime();
    const groups = buildLibraryGroups([
      character('today', { updatedAt: now - 2 * 60 * 60 * 1000 }),
      character('yesterday', { updatedAt: now - day }),
      character('same-week-a', { updatedAt: now - 3 * day }),
      character('same-week-b', { updatedAt: now - 3 * day - 60 * 60 * 1000 }),
      character('older', { updatedAt: now - 15 * day }),
    ], 'updated', { now });

    expect(groups.map((group) => group.label)).toEqual(['今天', '昨天', '8月8日', '7月27日']);
    expect(groups[2].items.map((card) => card.id)).toEqual(['same-week-a', 'same-week-b']);
  });

  it('replaces author grouping with a selectable first-level tag category', () => {
    const groups = buildLibraryGroups([
      character('unknown'),
      character('first', { tags: ['作者/甲'] }),
      character('second', { tags: ['作者/乙'] }),
      character('multiple', { tags: ['作者/甲', '作者/乙'] }),
    ], 'tag', { tagCategory: '作者' });

    expect(LIBRARY_GROUP_BY_OPTIONS.map((option) => String(option.value))).not.toContain('creator');
    expect(LIBRARY_GROUP_BY_OPTIONS.some((option) => option.value === 'tag')).toBe(true);
    expect(groups.map((group) => group.label)).toEqual(['甲', '乙', '未设置']);
    expect(groups[0].items.map((card) => card.id)).toEqual(['first', 'multiple']);
    expect(groups[1].items.map((card) => card.id)).toEqual(['second', 'multiple']);
    expect(groups[2].items.map((card) => card.id)).toEqual(['unknown']);
  });
});
