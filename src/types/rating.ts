/**
 * 评分模板与评分记录类型（2.0 阶段6，定稿第四章·评分）。
 *
 * 规则：
 * - 10 分制总分；模板 = 多维度 + 权重 + 提示词，算出参考总分。
 * - 内置模板不可改，可复制为自定义模板后再改维度/权重/提示词。
 * - AI 只给建议和理由，用户确认后才保存为正式评分；保存所用模板、提示词和生成时间。
 */

/** 模板里的一个评分维度 */
export interface RatingDimension {
  name: string;
  /** 权重（同一模板内相对值，计算总分时按权重占比加权） */
  weight: number;
  /** 该维度看什么（进提示词，也作 UI 提示） */
  hint?: string;
}

/** 评分模板（内置 = 代码常量；自定义 = IndexedDB ratingTemplates store） */
export interface RatingTemplateItem {
  id: string;
  title: string;
  dimensions: RatingDimension[];
  /** AI 评分提示词正文（描述评分立场与口径；维度清单由引擎自动附加） */
  prompt: string;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 一次已确认保存的评分明细（挂在 ArchiveCharacter.ratingDetail 上） */
export interface RatingDimensionScore {
  name: string;
  weight: number;
  /** 0~10，0.5 步进由 UI 约束 */
  score: number;
  /** 打分理由（AI 建议或用户手填） */
  reason?: string;
}

export interface RatingRecord {
  /** 加权总分（0~10，0.5 步进） */
  total: number;
  /** 打分方式：manual=直接手动；template=按模板维度手动；ai=AI 建议后确认 */
  method: 'manual' | 'template' | 'ai';
  templateId?: string;
  templateTitle?: string;
  dimensions?: RatingDimensionScore[];
  /** 生成/保存时所用提示词快照（模板被改/删仍可追溯） */
  promptSnapshot?: string;
  /** AI 评分时读取了哪些内容（'card' / 'worldbook:<id>' / 'story:<id>'） */
  readScope?: string[];
  /** AI 评分时的模型 */
  model?: string;
  createdAt: number;
}

export function generateRatingTemplateId(): string {
  return `rtpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
