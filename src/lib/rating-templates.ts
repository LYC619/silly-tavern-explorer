/**
 * 评分模板：内置模板（代码常量，不可改可复制）+ 自定义模板（IndexedDB）。
 * 定稿第四章：三种打分方式（手动/模板/AI）共用模板的维度与权重；
 * AI 评分时 prompt + 维度清单由 character-ai 引擎组装进提示词。
 */
import type { RatingTemplateItem, RatingDimension } from '@/types/rating';
import { generateRatingTemplateId } from '@/types/rating';
import { getAllRatingTemplates } from '@/lib/rating-db';

export const BUILTIN_RATING_TEMPLATE: RatingTemplateItem = {
  id: 'builtin-rating-standard',
  title: '通用角色卡评分（内置）',
  dimensions: [
    { name: '设定完整度', weight: 25, hint: '人设/背景/场景是否交代清楚，信息是否自洽' },
    { name: '开场白与文笔', weight: 20, hint: '开场白是否引人入戏，文字质量与氛围营造' },
    { name: '角色魅力', weight: 25, hint: '性格是否鲜明立体，是否有记忆点和情感张力' },
    { name: '可玩性', weight: 20, hint: '剧情钩子、互动空间、可发展方向的丰富程度' },
    { name: '世界观一致性', weight: 10, hint: '世界观细节与角色行为是否统一，无明显矛盾' },
  ],
  prompt: `你是一位资深的角色扮演（RP）玩家和角色卡评审。请根据提供的资料，按维度给这张角色卡打分。
评分立场：站在「值不值得玩、玩起来体验如何」的玩家视角，而不是文学批评视角。
打分口径：10 分制；5 分=及格可玩，7 分=优秀，9 分以上=极少数精品。避免集中在 7~8 分的老好人打法，好就是好，差就是差。
每个维度都要给出具体理由，理由要引用资料里的实际内容，不要空泛套话。`,
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

export const BUILTIN_RATING_TEMPLATES: RatingTemplateItem[] = [BUILTIN_RATING_TEMPLATE];

/** 列出全部可用模板：内置在前，自定义在后 */
export async function listRatingTemplates(): Promise<RatingTemplateItem[]> {
  const custom = await getAllRatingTemplates();
  return [...BUILTIN_RATING_TEMPLATES, ...custom];
}

/** 复制模板为自定义副本（内置不可改 → 复制后随便改） */
export function copyRatingTemplate(src: RatingTemplateItem): RatingTemplateItem {
  const now = Date.now();
  return {
    id: generateRatingTemplateId(),
    title: `${src.title.replace(/（内置）$/, '')} 副本`,
    dimensions: src.dimensions.map((d): RatingDimension => ({ ...d })),
    prompt: src.prompt,
    createdAt: now,
    updatedAt: now,
  };
}
