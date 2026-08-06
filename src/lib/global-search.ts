/**
 * 全局搜索（10.1-A2 最小可用）：标题栏 ⌘K 搜索框的数据层。
 * 只做名称/标题的子串匹配（不做全文检索）：角色名 / 故事名 / 世界书·预设·正则标题。
 * 排序：前缀命中 > 包含命中；每类截断，避免下拉过长。
 */

export type SearchKind = 'character' | 'story' | 'worldbook' | 'preset' | 'regex';

export interface SearchEntry {
  kind: SearchKind;
  id: string;
  title: string;
  /** 次要说明（角色名/未绑定等），展示用 */
  sub?: string;
  /** 搜索用的原始标题；title 可以是展示名。 */
  searchText?: string;
  /** 点击跳转路径 */
  path: string;
}

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  character: '角色',
  story: '故事',
  worldbook: '世界书',
  preset: '预设',
  regex: '正则',
};

interface BuildInput {
  characters: { id: string; name: string; displayName?: string }[];
  stories: { id: string; title: string; characterId?: string }[];
  worldbooks: { id: string; title: string }[];
  presets: { id: string; title: string }[];
  regexes: { id: string; title: string }[];
}

/** 把各库的列表拍平成统一搜索条目（跳转路径在此定死一处） */
export function buildSearchEntries(input: BuildInput): SearchEntry[] {
  const characterDisplay = (character: { name: string; displayName?: string }) => character.displayName?.trim() || character.name;
  const charName = new Map(input.characters.map((c) => [c.id, characterDisplay(c)]));
  return [
    ...input.characters.map<SearchEntry>((c) => ({
      kind: 'character',
      id: c.id,
      title: characterDisplay(c),
      sub: characterDisplay(c) === c.name ? undefined : c.name,
      searchText: characterDisplay(c) === c.name ? undefined : `${characterDisplay(c)}\n${c.name}`,
      path: `/character/${c.id}`,
    })),
    ...input.stories.map<SearchEntry>((s) => ({
      kind: 'story',
      id: s.id,
      title: s.title,
      sub: s.characterId ? charName.get(s.characterId) : '未绑定',
      path: `/story/${s.id}`,
    })),
    ...input.worldbooks.map<SearchEntry>((w) => ({
      kind: 'worldbook', id: w.id, title: w.title, path: `/worldbook?assetId=${w.id}`,
    })),
    ...input.presets.map<SearchEntry>((p) => ({
      kind: 'preset', id: p.id, title: p.title, path: `/preset?assetId=${p.id}`,
    })),
    ...input.regexes.map<SearchEntry>((r) => ({
      kind: 'regex', id: r.id, title: r.title, path: `/regex?assetId=${r.id}`,
    })),
  ];
}

/**
 * 查询：大小写不敏感子串匹配；前缀命中排前，同优先级保持入参顺序（稳定）。
 * perKind：每类最多条数；total：总条数上限。
 */
export function searchEntries(
  entries: SearchEntry[],
  query: string,
  { perKind = 5, total = 15 }: { perKind?: number; total?: number } = {},
): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const prefix: SearchEntry[] = [];
  const contains: SearchEntry[] = [];
  for (const e of entries) {
    const t = (e.searchText ?? e.title).toLowerCase();
    if (t.startsWith(q)) prefix.push(e);
    else if (t.includes(q)) contains.push(e);
  }
  const kindCount = new Map<SearchKind, number>();
  const out: SearchEntry[] = [];
  for (const e of [...prefix, ...contains]) {
    if (out.length >= total) break;
    const n = kindCount.get(e.kind) ?? 0;
    if (n >= perKind) continue;
    kindCount.set(e.kind, n + 1);
    out.push(e);
  }
  return out;
}

/** 下拉展示用：按 kind 分组，保持组内排序 */
export interface SearchGroup {
  kind: SearchKind;
  items: SearchEntry[];
}

export function groupByKind(results: SearchEntry[]): SearchGroup[] {
  const order: SearchKind[] = ['character', 'story', 'worldbook', 'preset', 'regex'];
  return order
    .map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);
}

/** 视觉分组后的线性顺序，供键盘导航和 Enter 共用。 */
export function flattenSearchGroups(groups: SearchGroup[]): SearchEntry[] {
  return groups.flatMap((group) => group.items);
}
