/**
 * 分级标签分类法 v2（10.0，0801 实测反馈换血；v1 是阶段9.4 的 人物/玩法/评价/其他）。
 * 存储形态不变：ArchiveCharacter.tags 仍是 string[]，「类别/子标签」分级，无前缀 = 未分类。
 * v2 要点：
 * - 「类型」（人物/剧情/玩法/综合/同人）是互斥字段 ArchiveCharacter.type，不进 tags（见 types/archive）
 * - 多选组：人物/剧情/玩法/世界观；联动组：卡面（NSFW 开关同步 nsfw 字段）、评价（评分单向自动）
 * - 迁移：migrateLegacyTags 把 v1 标签映射进 v2（允许未分类，自定义标签全保留）
 */

export const TAG_CATEGORIES = ['人物', '剧情', '玩法', '世界观', '卡面', '评价', '未分类'] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

/** 内置基础子标签（打底；用户输入任意「类别/xx」即为自建子标签，进入同类筛选） */
export const BUILTIN_TAGS: Record<TagCategory, string[]> = {
  人物: ['少女', '成女', '非人', '群像'],
  剧情: ['悬疑', '恋爱', '冒险', '历史'],
  玩法: ['模拟', 'RPG', '解谜', '经营', '养成'],
  世界观: ['玄幻', '奇幻', '科幻', '现代', '古风'],
  卡面: ['SFW', 'NSFW'],
  评价: ['低创', '及格', '精品', '神作'],
  未分类: [],
};

/** 每组的问号悬浮说明（0801 反馈：内置标签右上角问号） */
export const CATEGORY_HELP: Record<TagCategory, string> = {
  人物: '卡里角色的人物构成，如少女、群像（可多选）',
  剧情: '故事题材走向，如悬疑、恋爱（可多选）',
  玩法: '卡的玩法机制，如模拟、RPG（可多选）',
  世界观: '故事世界背景，如玄幻、现代（可多选）',
  卡面: '卡面尺度标记；NSFW 用开关维护，可在设置里开启模糊显示',
  评价: '与你的评分联动：打分后自动更新档位；手动点档位会弹出评分确认',
  未分类: '没有归入任何类别的自定义标签',
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
  return { category: '未分类', label: raw, raw };
}

/** 组合成存储原文；「未分类」不带前缀（与旧平铺标签同形） */
export function makeTag(category: TagCategory, label: string): string {
  return category === '未分类' ? label : `${category}/${label}`;
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

// ---------- 卡面（NSFW 开关 ↔ 标签同步；nsfw 字段是真源） ----------

export const NSFW_TAG = '卡面/NSFW';
export const SFW_TAG = '卡面/SFW';

/** 开关 NSFW 时同步标签：开=加 NSFW 去 SFW；关=去 NSFW（不自动加 SFW，未标注≠明确 SFW） */
export function syncNsfwTag(tags: string[], nsfw: boolean): string[] {
  const rest = tags.filter((t) => t !== NSFW_TAG && (!nsfw || t !== SFW_TAG));
  return nsfw ? [...rest, NSFW_TAG] : rest;
}

// ---------- 评价（评分 → 档位标签，单向自动；点标签 → 评分确认弹窗预填） ----------

export const RATING_TIER_LABELS = ['低创', '及格', '精品', '神作'] as const;
export type RatingTier = (typeof RATING_TIER_LABELS)[number];

/** 档位区间（用户定稿）：低创 <6、及格 6~7.5、精品 7.5~9、神作 9~10（下含上不含，神作含 10） */
export function ratingTier(rating: number): RatingTier {
  if (rating < 6) return '低创';
  if (rating < 7.5) return '及格';
  if (rating < 9) return '精品';
  return '神作';
}

/** 点评价标签弹评分确认时的预填值 = 档区间中值取 0.5 步进（6.75→7、8.25→8.5 向上取半） */
export const RATING_TIER_PREFILL: Record<RatingTier, number> = {
  低创: 3,
  及格: 7,
  精品: 8.5,
  神作: 9.5,
};

/**
 * 评分 → 评价档位标签（单向自动）：换掉内置四档中的旧档位，保留自定义「评价/xx」。
 * rating undefined = 清除档位标签（取消评分）。
 */
export function applyRatingTierTag(tags: string[], rating: number | undefined): string[] {
  const tierRaws = RATING_TIER_LABELS.map((l) => `评价/${l}`);
  const rest = tags.filter((t) => !tierRaws.includes(t));
  return rating === undefined ? rest : [...rest, `评价/${ratingTier(rating)}`];
}

// ---------- v1 → v2 迁移（archive-migrate 调用；幂等） ----------

/** v1 内置标签的精确映射；未精确命中的自由标签一律原样保留。 */
const LEGACY_TAG_MAP: Record<string, string> = {
  // v1 评价五档 → v2 四档
  '评价/优秀': '评价/精品',
  '评价/不错': '评价/及格',
  '评价/一般': '评价/及格',
  '评价/踩雷': '评价/低创',
  // v1 玩法组里的题材词 → v2 剧情组
  '玩法/恋爱': '剧情/恋爱',
  '玩法/冒险': '剧情/冒险',
};

/** 单个标签的 v1→v2 映射 */
export function migrateLegacyTag(raw: string): string {
  return LEGACY_TAG_MAP[raw] ?? raw;
}

/** 整组标签迁移：转换结果撞车时保留原文，避免不可逆合并。 */
export function migrateLegacyTags(tags: string[]): { tags: string[]; changed: boolean } {
  const candidates = tags.map(migrateLegacyTag);
  const out = tags.map((raw, index) => {
    const next = candidates[index];
    if (next === raw) return raw;
    const conflicts = candidates.some((candidate, other) => other !== index && candidate === next);
    return conflicts ? raw : next;
  });
  const changed = out.some((raw, index) => raw !== tags[index]);
  return { tags: out, changed };
}
