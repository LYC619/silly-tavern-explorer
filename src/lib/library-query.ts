import type { ArchiveCharacter, CharacterType } from '@/types/archive';
import type { TagCategory } from '@/lib/tag-taxonomy';

export type LibrarySortKey = 'recent' | 'added' | 'name' | 'rating' | 'lastPlayed';
export type LibraryTypeFilter = 'all' | CharacterType | 'none';
export type LibraryFilterCategory = TagCategory | '类型';

export interface LibraryFilterState {
  search: string;
  type: LibraryTypeFilter;
  tags: Partial<Record<TagCategory, string[]>>;
}

export function displayCharacterName(character: ArchiveCharacter): string {
  return character.displayMeta?.name?.trim() || character.name;
}

export function filterCharacters(
  characters: ArchiveCharacter[],
  filters: LibraryFilterState,
): ArchiveCharacter[] {
  const query = filters.search.trim().toLocaleLowerCase();
  let result = characters;
  if (query) {
    result = result.filter((character) => (
      [character.name, displayCharacterName(character), character.subtitle ?? '']
        .some((value) => value.toLocaleLowerCase().includes(query))
    ));
  }
  if (filters.type !== 'all') {
    result = result.filter((character) => (
      filters.type === 'none' ? character.type === undefined : character.type === filters.type
    ));
  }
  for (const selected of Object.values(filters.tags)) {
    if (!selected || selected.length === 0) continue;
    result = result.filter((character) => selected.some((tag) => character.tags.includes(tag)));
  }
  return result;
}

function compareNullable(a: number | undefined, b: number | undefined, ascending: boolean): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return (a - b) * (ascending ? 1 : -1);
}

export function sortCharacters(
  characters: ArchiveCharacter[],
  sortKey: LibrarySortKey,
  ascending: boolean,
  lastPlayed: Record<string, number> = {},
): ArchiveCharacter[] {
  return [...characters].sort((a, b) => {
    switch (sortKey) {
      case 'name':
        return displayCharacterName(a).localeCompare(displayCharacterName(b), 'zh-CN') * (ascending ? 1 : -1);
      case 'rating':
        return compareNullable(a.rating, b.rating, ascending);
      case 'lastPlayed':
        return compareNullable(lastPlayed[a.id], lastPlayed[b.id], ascending);
      case 'added':
        return (a.createdAt - b.createdAt) * (ascending ? 1 : -1);
      case 'recent':
      default:
        return (a.updatedAt - b.updatedAt) * (ascending ? 1 : -1);
    }
  });
}

export function toggleTagFilter(
  filters: Partial<Record<LibraryFilterCategory, string[]>>,
  category: LibraryFilterCategory,
  raw: string,
): Partial<Record<LibraryFilterCategory, string[]>> {
  const next = { ...filters };
  const current = next[category] ?? [];
  if (category === '类型') {
    next[category] = current[0] === raw ? [] : [raw];
    return next;
  }
  next[category] = current.includes(raw)
    ? current.filter((value) => value !== raw)
    : [...current, raw];
  if (next[category]?.length === 0) delete next[category];
  return next;
}

export function reconcileSelection(selected: Set<string>, filteredIds: string[]): Set<string> {
  const visible = new Set(filteredIds);
  return new Set([...selected].filter((id) => visible.has(id)));
}
