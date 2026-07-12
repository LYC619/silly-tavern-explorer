/**
 * 总结页数据类型（总结功能一期）。
 *
 * 设计要点：
 * - SummaryItem 绑定「书 + 楼层闭区间」（0-based，与聊天页楼层号一致），
 *   书被删除后 bookId 置 null 但总结保留（bookTitle 冗余供展示）。
 * - 双轨 autoSaved 对齐 presets/cards：每次生成完成即自动落库(true)防丢，
 *   手动保存转永久(false)。生成成本高，自动历史保留 10 份（其余 store 为 5）。
 * - genParams 记录生成时的完整挂载快照，供「重新生成」回填。
 */

export type SummaryKind = 'volume' | 'diary' | 'diy';

export const SUMMARY_KIND_LABELS: Record<SummaryKind, string> = {
  volume: '分卷总结',
  diary: '角色日记',
  diy: 'DIY 创作',
};

/** 生成参数快照：重新生成时按此回填挂载与模板 */
export interface SummaryGenParams {
  model?: string;
  presetId?: string;
  presetTitle?: string;
  worldbookId?: string;
  worldbookTitle?: string;
  /** 世界书条目注入范围：constant=仅常驻(蓝灯) all=全部启用 manual=手动勾选 */
  worldbookMode?: 'constant' | 'all' | 'manual';
  /** manual 模式下勾选的条目 uid */
  worldbookUids?: number[];
  /** 连贯性：生成时实际带上的前情总结 id */
  priorSummaryIds?: string[];
  templateId?: string;
  /** 生成时模板全文快照（模板后续被改/删仍可复现） */
  templateSnapshot?: string;
  /** 楼层消息是否带「名字: 」前缀 */
  speakerPrefix?: boolean;
  /** kind=diary 时「生成谁的日记」填的角色名（自动附加进提示词） */
  diaryOwner?: string;
}

export interface SummaryItem {
  id: string;
  /** 关联的书架书；书被删除后置 null，总结仍保留 */
  bookId: string | null;
  /** 书名冗余，供列表展示（书删后仍可读） */
  bookTitle: string;
  kind: SummaryKind;
  title: string;
  /** kind=volume 时的卷号（从 1 开始） */
  volumeNumber?: number;
  /** 覆盖楼层闭区间起点，0-based，与聊天页楼层号一致 */
  floorStart: number;
  /** 覆盖楼层闭区间终点，0-based */
  floorEnd: number;
  /** 最终文本（生成后可编辑，编辑即更新此字段） */
  content: string;
  genParams?: SummaryGenParams;
  createdAt: number;
  updatedAt: number;
  /** true=生成后自动落库的历史(最近10份，超出自动清理)；false/undefined=手动保存，永久留存 */
  autoSaved?: boolean;
}

/** 用户自定义提示词模板（内置模板是代码常量不入库，见 lib/summary-templates.ts） */
export interface SummaryTemplate {
  id: string;
  title: string;
  /** 适用呈现类型；any=通用（AI 工具页存入的模板即 any，所有 tab 可见） */
  kind: SummaryKind | 'any';
  /** 提示词全文，支持 {{char}}/{{user}}/{{volume}} 宏 */
  content: string;
  createdAt: number;
  updatedAt: number;
}

export function generateSummaryId(): string {
  return `sum_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateSummaryTemplateId(): string {
  return `stpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
