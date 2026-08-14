import { describe, expect, it } from 'vitest';
import type { ArchiveCharacter } from '@/types/archive';
import {
  filterCharacters,
  reconcileSelection,
  sortCharacters,
  toggleTagFilter,
  type LibraryFilterState,
} from '@/lib/library-query';

function character(
  id: string,
  extra: Partial<ArchiveCharacter> = {},
): ArchiveCharacter {
  return {
    id,
    name: id,
    card: {},
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  } as ArchiveCharacter;
}

const baseFilters: LibraryFilterState = { search: '', type: 'all', tags: {} };

describe('library query rules', () => {
  it('supports OR within a tag category and AND across categories', () => {
    const chars = [
      character('恋爱悬疑', { tags: ['剧情/恋爱', '剧情/悬疑', '玩法/RPG'] }),
      character('只有恋爱', { tags: ['剧情/恋爱', '玩法/模拟'] }),
      character('只有悬疑', { tags: ['剧情/悬疑', '玩法/RPG'] }),
    ];

    expect(filterCharacters(chars, {
      ...baseFilters,
      tags: { 剧情: ['剧情/恋爱', '剧情/悬疑'], 玩法: ['玩法/RPG'] },
    }).map((c) => c.id)).toEqual(['恋爱悬疑', '只有悬疑']);
  });

  it('matches both original name and local display name', () => {
    const chars = [character('原始名', { displayMeta: { name: '展示名' } })];
    expect(filterCharacters(chars, { ...baseFilters, search: '展示' })).toHaveLength(1);
    expect(filterCharacters(chars, { ...baseFilters, search: '原始' })).toHaveLength(1);
  });

  it('matches local tags when searching roles or tags', () => {
    const chars = [
      character('历史角色', { tags: ['历史/三国'] }),
      character('现代角色', { tags: ['世界观/现代'] }),
    ];
    expect(filterCharacters(chars, { ...baseFilters, search: '三国' }).map((c) => c.id)).toEqual(['历史角色']);
  });

  it('keeps missing numeric values at the end in both directions', () => {
    const chars = [
      character('未评分'),
      character('低分', { rating: 2 }),
      character('高分', { rating: 9 }),
    ];
    expect(sortCharacters(chars, 'rating', true).map((c) => c.id)).toEqual(['低分', '高分', '未评分']);
    expect(sortCharacters(chars, 'rating', false).map((c) => c.id)).toEqual(['高分', '低分', '未评分']);
  });

  it('keeps type single-select while other tag groups toggle multiple values', () => {
    expect(toggleTagFilter({}, '剧情', '剧情/恋爱')).toEqual({ 剧情: ['剧情/恋爱'] });
    expect(toggleTagFilter({ 剧情: ['剧情/恋爱'] }, '剧情', '剧情/悬疑')).toEqual({
      剧情: ['剧情/恋爱', '剧情/悬疑'],
    });
    expect(toggleTagFilter({ 剧情: ['剧情/恋爱', '剧情/悬疑'] }, '剧情', '剧情/恋爱')).toEqual({
      剧情: ['剧情/悬疑'],
    });
    expect(toggleTagFilter({ 剧情: ['剧情/恋爱'] }, '类型', '人物')).toEqual({
      剧情: ['剧情/恋爱'],
      类型: ['人物'],
    });
    expect(toggleTagFilter({ 剧情: ['剧情/恋爱'], 类型: ['人物'] }, '类型', '剧情')).toEqual({
      剧情: ['剧情/恋爱'],
      类型: ['剧情'],
    });
  });

  it('intersects selected ids with a changed filtered result', () => {
    expect(reconcileSelection(new Set(['a', 'b', 'hidden']), ['b', 'c'])).toEqual(new Set(['b']));
  });
});
