import {
  BUILTIN_TAGS,
  TAG_CATEGORIES,
  makeTag,
  parseTag,
  type ParsedTag,
  type TagCategory,
} from '@/lib/tag-taxonomy';
import type { BuiltinTagCategory } from '@/lib/tag-taxonomy';

export interface LibraryTagPreferences {
  version: 1;
  customCategories: string[];
  customTags: string[];
  categoryOrder: string[];
  order: string[];
  hidden: string[];
}

export interface ManagedTagOption extends ParsedTag {
  builtIn: boolean;
  count: number;
  visible: boolean;
}

export interface LibraryTagSection {
  category: TagCategory;
  options: ManagedTagOption[];
}

export interface LibraryFilterSections {
  categories: LibraryTagSection[];
  uncategorized: {
    options: ManagedTagOption[];
    total: number;
    hasMore: boolean;
  };
}

const BUILTIN_RAWS = new Set(
  TAG_CATEGORIES.flatMap((category) => BUILTIN_TAGS[category].map((label) => makeTag(category, label))),
);

const DEFAULT_HIDDEN = [
  ...BUILTIN_TAGS['卡面'].map((label) => makeTag('卡面', label)),
  ...BUILTIN_TAGS['评价'].map((label) => makeTag('评价', label)),
];

export const DEFAULT_LIBRARY_TAG_PREFERENCES: LibraryTagPreferences = {
  version: 1,
  customCategories: [],
  customTags: [],
  categoryOrder: [],
  order: [],
  hidden: DEFAULT_HIDDEN,
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const raw = item.trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    result.push(raw);
  }
  return result;
}

export function normalizeLibraryTagPreferences(value: unknown): LibraryTagPreferences {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    return {
      version: 1,
      customCategories: [],
      customTags: [],
      categoryOrder: [],
      order: [],
      hidden: [...DEFAULT_HIDDEN],
    };
  }
  const source = value as Partial<LibraryTagPreferences>;
  const customCategories = uniqueStrings(source.customCategories)
    .filter((category) => category !== '未分类' && category !== '类型'
      && !TAG_CATEGORIES.includes(category as BuiltinTagCategory) && !category.includes('/'));
  const categoryOrder = uniqueStrings(source.categoryOrder).filter((category) => (
    category !== '未分类'
    && ((TAG_CATEGORIES as readonly string[]).includes(category) || customCategories.includes(category))
  ));
  return {
    version: 1,
    customCategories,
    customTags: uniqueStrings(source.customTags).filter((raw) => !BUILTIN_RAWS.has(raw) && !raw.startsWith('类型/')),
    categoryOrder,
    order: uniqueStrings(source.order),
    hidden: uniqueStrings(source.hidden),
  };
}

export function getTagCategories(preferences: LibraryTagPreferences): TagCategory[] {
  const builtins = TAG_CATEGORIES.filter((category) => category !== '未分类');
  const all = [...builtins, ...preferences.customCategories];
  const order = new Map(preferences.categoryOrder.map((category, index) => [category, index]));
  return all.sort((a, b) => {
    const ai = order.get(a);
    const bi = order.get(b);
    if (ai !== undefined || bi !== undefined) {
      if (ai === undefined) return 1;
      if (bi === undefined) return -1;
      return ai - bi;
    }
    return (TAG_CATEGORIES.indexOf(a as BuiltinTagCategory) - TAG_CATEGORIES.indexOf(b as BuiltinTagCategory))
      || a.localeCompare(b, 'zh-CN');
  });
}

export function buildManagedTagOptions(
  assignedTags: string[],
  preferences: LibraryTagPreferences,
): ManagedTagOption[] {
  const counts = new Map<string, number>();
  for (const item of assignedTags) {
    const raw = item.trim();
    if (raw && !raw.startsWith('类型/')) counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  const definitions = new Map<string, { parsed: ParsedTag; builtIn: boolean }>();
  for (const category of TAG_CATEGORIES) {
    for (const label of BUILTIN_TAGS[category]) {
      const raw = makeTag(category, label);
      definitions.set(raw, { parsed: parseTag(raw), builtIn: true });
    }
  }
  for (const raw of preferences.customTags) {
    if (!raw.startsWith('类型/') && !definitions.has(raw)) {
      definitions.set(raw, { parsed: parseTag(raw, preferences.customCategories), builtIn: false });
    }
  }
  for (const raw of counts.keys()) {
    if (!definitions.has(raw)) definitions.set(raw, { parsed: parseTag(raw, preferences.customCategories), builtIn: BUILTIN_RAWS.has(raw) });
  }

  const order = new Map(preferences.order.map((raw, index) => [raw, index]));
  const categoryOrder = new Map(getTagCategories(preferences).map((category, index) => [category, index]));
  return [...definitions.entries()]
    .map(([raw, definition]) => ({
      ...definition.parsed,
      raw,
      builtIn: definition.builtIn,
      count: counts.get(raw) ?? 0,
      visible: !preferences.hidden.includes(raw),
    }))
    .sort((a, b) => {
      const ai = order.get(a.raw);
      const bi = order.get(b.raw);
      if (ai !== undefined || bi !== undefined) {
        if (ai === undefined) return 1;
        if (bi === undefined) return -1;
        return ai - bi;
      }
      const categoryDiff = (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER)
        - (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER);
      return categoryDiff || a.label.localeCompare(b.label, 'zh-CN');
    });
}

export function addCustomCategory(
  preferences: LibraryTagPreferences,
  label: string,
): LibraryTagPreferences {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) throw new Error('标签组名称不能为空');
  if (normalizedLabel.includes('/')) throw new Error('标签组名称不能包含“/”');
  if (normalizedLabel === '类型') throw new Error('「类型」是内置分类，请在类型面板维护');
  if (normalizedLabel === '未分类' || (TAG_CATEGORIES as readonly string[]).includes(normalizedLabel)
    || preferences.customCategories.includes(normalizedLabel)) {
    throw new Error('标签组已存在');
  }
  return {
    ...preferences,
    customCategories: [...preferences.customCategories, normalizedLabel],
    categoryOrder: [...preferences.categoryOrder, normalizedLabel],
  };
}

export function setTagVisibility(
  preferences: LibraryTagPreferences,
  raw: string,
  visible: boolean,
): LibraryTagPreferences {
  const hidden = new Set(preferences.hidden);
  if (visible) hidden.delete(raw);
  else hidden.add(raw);
  return { ...preferences, hidden: [...hidden] };
}

export function addCustomTagDefinition(
  preferences: LibraryTagPreferences,
  category: TagCategory,
  label: string,
): LibraryTagPreferences {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) throw new Error('标签名称不能为空');
  if (category !== '未分类' && !TAG_CATEGORIES.includes(category as BuiltinTagCategory)
    && !preferences.customCategories.includes(category)) {
    throw new Error('标签组不存在');
  }
  const raw = makeTag(category, normalizedLabel);
  if (BUILTIN_RAWS.has(raw) || preferences.customTags.includes(raw)) throw new Error('标签已存在');
  return {
    ...preferences,
    customTags: [...preferences.customTags, raw],
    order: preferences.order.includes(raw) ? preferences.order : [...preferences.order, raw],
    hidden: preferences.hidden.filter((item) => item !== raw),
  };
}

export function removeCustomTagDefinition(
  preferences: LibraryTagPreferences,
  raw: string,
): LibraryTagPreferences {
  return {
    ...preferences,
    customTags: preferences.customTags.filter((item) => item !== raw),
    order: preferences.order.filter((item) => item !== raw),
    hidden: preferences.hidden.filter((item) => item !== raw),
  };
}

export function moveTag(
  preferences: LibraryTagPreferences,
  currentOrder: string[],
  raw: string,
  targetIndex: number,
): LibraryTagPreferences {
  const ordered = uniqueStrings(currentOrder);
  const sourceIndex = ordered.indexOf(raw);
  if (sourceIndex < 0) return preferences;
  const [moved] = ordered.splice(sourceIndex, 1);
  const nextIndex = Math.max(0, Math.min(targetIndex, ordered.length));
  ordered.splice(nextIndex, 0, moved);
  const leftovers = preferences.order.filter((item) => !ordered.includes(item));
  return { ...preferences, order: [...ordered, ...leftovers] };
}

export function buildLibraryFilterSections(
  options: ManagedTagOption[],
  uncategorizedExpanded: boolean,
  preferences: LibraryTagPreferences = DEFAULT_LIBRARY_TAG_PREFERENCES,
  hideUnused = false,
): LibraryFilterSections {
  const eligible = options.filter((option) => option.visible && (!hideUnused || option.count > 0));
  const categories = getTagCategories(preferences)
    .map((category) => ({ category, options: eligible.filter((option) => option.category === category) }))
    .filter((section) => section.options.length > 0
      || (!hideUnused && preferences.customCategories.includes(section.category)));
  const uncategorizedAll = eligible.filter((option) => option.category === '未分类' && option.count > 0);
  const optionsToShow = uncategorizedExpanded ? uncategorizedAll : uncategorizedAll.slice(0, 6);
  return {
    categories,
    uncategorized: {
      options: optionsToShow,
      total: uncategorizedAll.length,
      hasMore: !uncategorizedExpanded && uncategorizedAll.length > optionsToShow.length,
    },
  };
}
