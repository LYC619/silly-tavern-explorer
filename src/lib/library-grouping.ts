import { ratingTier } from '@/lib/tag-taxonomy';
import type { ArchiveCharacter, CharacterType } from '@/types/archive';

export const LIBRARY_GROUP_BY_OPTIONS = [
  { value: 'none', label: '不分组' },
  { value: 'type', label: '类型' },
  { value: 'rating', label: '评分' },
  { value: 'updated', label: '最后更新' },
  { value: 'tag', label: '标签' },
] as const;

export type LibraryGroupBy = (typeof LIBRARY_GROUP_BY_OPTIONS)[number]['value'];

export interface LibraryCharacterGroup {
  key: string;
  label: string;
  items: ArchiveCharacter[];
}

const TYPE_ORDER: readonly (CharacterType | '未分类')[] = ['人物', '剧情', '玩法', '综合', '同人', '未分类'];
const RATING_ORDER = ['神作', '精品', '及格', '低创', '未评分'] as const;

function collectByLabels(
  items: readonly ArchiveCharacter[],
  labels: readonly string[],
  labelOf: (character: ArchiveCharacter) => string,
): LibraryCharacterGroup[] {
  const groups = new Map(labels.map((label) => [label, [] as ArchiveCharacter[]]));
  for (const character of items) groups.get(labelOf(character))?.push(character);
  return labels
    .map((label) => ({ key: label, label, items: groups.get(label) ?? [] }))
    .filter((group) => group.items.length > 0);
}

export interface LibraryGroupingOptions {
  now?: number;
  tagCategory?: string;
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function updatedLabel(timestamp: number, now: number): string {
  const key = localDateKey(timestamp);
  if (key === localDateKey(now)) return '今天';
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime();
  if (key === localDateKey(yesterday)) return '昨天';
  const date = new Date(timestamp);
  return date.getFullYear() === today.getFullYear()
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function buildUpdatedGroups(
  items: readonly ArchiveCharacter[],
  now: number,
): LibraryCharacterGroup[] {
  const groups = new Map<string, ArchiveCharacter[]>();
  for (const character of items) {
    const key = localDateKey(character.updatedAt);
    const group = groups.get(key) ?? [];
    group.push(character);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupItems]) => ({
      key: `updated:${key}`,
      label: updatedLabel(groupItems[0].updatedAt, now),
      items: groupItems,
    }));
}

function buildTagGroups(
  items: readonly ArchiveCharacter[],
  category: string | undefined,
): LibraryCharacterGroup[] {
  if (!category) return [{ key: 'tag:unset', label: '未设置', items: [...items] }];
  const prefix = `${category}/`;
  const groups = new Map<string, ArchiveCharacter[]>();
  const unset: ArchiveCharacter[] = [];
  for (const character of items) {
    const labels = [...new Set(character.tags
      .filter((raw) => raw.startsWith(prefix) && raw.length > prefix.length)
      .map((raw) => raw.slice(prefix.length)))];
    if (labels.length === 0) unset.push(character);
    for (const label of labels) {
      const group = groups.get(label) ?? [];
      group.push(character);
      groups.set(label, group);
    }
  }
  const result = [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map((label) => ({ key: `tag:${category}:${label}`, label, items: groups.get(label) ?? [] }));
  if (unset.length > 0) result.push({ key: `tag:${category}:unset`, label: '未设置', items: unset });
  return result;
}

/**
 * 将当前已筛选、已排序、已分页的角色切成展示分组。
 * 标签是多值字段，因此按标签分组时一张卡可出现在多个子标签组中。
 */
export function buildLibraryGroups(
  items: readonly ArchiveCharacter[],
  groupBy: LibraryGroupBy,
  options: LibraryGroupingOptions = {},
): LibraryCharacterGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '全部角色', items: [...items] }];
  }

  if (groupBy === 'type') {
    return collectByLabels(items, TYPE_ORDER, (character) => character.type ?? '未分类');
  }

  if (groupBy === 'rating') {
    return collectByLabels(items, RATING_ORDER, (character) => (
      character.rating === undefined ? '未评分' : ratingTier(character.rating)
    ));
  }

  if (groupBy === 'updated') {
    return buildUpdatedGroups(items, options.now ?? Date.now());
  }

  return buildTagGroups(items, options.tagCategory);
}
