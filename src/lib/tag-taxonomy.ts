/**
 * 分级标签分类法（2.0 阶段9.4，用户定稿分类：人物/玩法/评价/其他）。
 * 存储形态不变：ArchiveCharacter.tags 仍是 string[]。「类别/子标签」是分级标签，
 * 无前缀的旧标签自动归入「其他」，完全向后兼容。内置基础子标签打底，
 * 用户输入任意「类别/xx」即为自建子标签（同样进入该类别的筛选下拉）。
 */

export const TAG_CATEGORIES = ['人物', '玩法', '评价', '其他'] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

/** 内置基础子标签（打底，点基础的就行；自建通过「类别/xx」自然扩展） */
export const BUILTIN_TAGS: Record<TagCategory, string[]> = {
  人物: ['男性', '女性', '多角色', '非人'],
  玩法: ['剧情', '日常', '冒险', '恋爱', '养成'],
  评价: ['神作', '优秀', '不错', '一般', '踩雷'],
  其他: [],
};

export interface ParsedTag {
  category: TagCategory;
  label: string;
  /** 存储原文（增删/去重/筛选匹配都按它） */
  raw: string;
}

export function parseTag(raw: string): ParsedTag {
  const i = raw.indexOf('/');
  if (i > 0) {
    const cat = raw.slice(0, i);
    if ((TAG_CATEGORIES as readonly string[]).includes(cat)) {
      return { category: cat as TagCategory, label: raw.slice(i + 1) || raw, raw };
    }
  }
  return { category: '其他', label: raw, raw };
}

/** 组合成存储原文；「其他」不带前缀（与旧平铺标签同形） */
export function makeTag(category: TagCategory, label: string): string {
  return category === '其他' ? label : `${category}/${label}`;
}

/** 每个类别的可选项 = 内置子标签 ∪ 库里已出现的标签（按 raw 去重，中文序） */
export function tagOptionsByCategory(allRawTags: string[]): Record<TagCategory, ParsedTag[]> {
  const maps = new Map<TagCategory, Map<string, ParsedTag>>(TAG_CATEGORIES.map((c) => [c, new Map()]));
  for (const c of TAG_CATEGORIES) {
    for (const label of BUILTIN_TAGS[c]) {
      const raw = makeTag(c, label);
      maps.get(c)!.set(raw, { category: c, label, raw });
    }
  }
  for (const raw of allRawTags) {
    const p = parseTag(raw);
    maps.get(p.category)!.set(p.raw, p);
  }
  const out = {} as Record<TagCategory, ParsedTag[]>;
  for (const c of TAG_CATEGORIES) {
    out[c] = [...maps.get(c)!.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  }
  return out;
}
