/**
 * STE 2.0 归档核心类型（阶段0 定义，阶段1+ 逐步启用）。
 * 设计依据：_reference/STE 概念设计/STE 2.0 设计定稿.md
 *
 * 约束（定稿第七/八章 + findings.md 三）：
 * - 角色卡→故事→下属资源；世界书/预设/正则=独立资产（引用 + 写时复制）。
 * - 类型保持「ST 形状 + 适配器边界」：不做跨工具大一统抽象（无其他 RP 工具真实样本前）。
 * - 所有条目满足仓库层 BaseRecord（id + updatedAt），未来客户端文件库实现同一契约。
 */
import type { ChatSession, ChapterMarker, ExportSettings } from '@/types/chat';
import type { STCharacterCard } from '@/lib/png-parser';

// ---------- 角色（角色库条目 = 设计稿「角色/<名>/档案.json + 卡片.png」） ----------

/** 统一状态（定稿第四章）：用户手动维护，系统只建议不自动改 */
export type CharacterStatus = '未开始' | '进行中' | '暂停' | '已完成' | '已弃置';

/** AI/手动简介的一个历史版本 */
export interface IntroVersion {
  content: string;
  /** 生成来源：manual=手动编辑；ai=AI 生成（记读取范围） */
  source: 'manual' | 'ai';
  /** AI 生成时读取了哪些内容（如 ['card','worldbook:xxx']），手动版为空 */
  readScope?: string[];
  createdAt: number;
}

export interface ArchiveCharacter {
  id: string;
  name: string;
  /** 副标题/一句话说明（可来自卡的 creator_notes 或用户手填） */
  subtitle?: string;
  /** 角色卡数据（原样保留，无损导出） */
  card: STCharacterCard;
  /** 原始 PNG base64（纯数据无前缀）；JSON 导入的卡为空 */
  pngBase64?: string;
  /** STE 本地标签（不写回 ST 卡文件） */
  tags: string[];
  status: CharacterStatus;
  /** 10 分制总分（0.5 步进由 UI 约束）；未评分为 undefined */
  rating?: number;
  /** 评分摘要（一句话，详细分项在评分面板数据里，阶段6） */
  ratingNote?: string;
  /** 当前简介 + 历史版本（新生成先草稿比较，确认后入栈） */
  intro?: { current: IntroVersion; history: IntroVersion[] };
  /** 简介是否可能过期（源卡/世界书变化时置 true，只提示不覆盖） */
  introStale?: boolean;
  /** 客户端：来源文件路径（网页版为空） */
  sourcePath?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------- 故事（= 一个 ST 聊天文件；分支是内部脉络，不是独立故事） ----------

/** 单个故事的归档元数据（不占主要界面，定稿第四章） */
export interface StoryMeta {
  /** 使用过的模型（按首次出现顺序去重） */
  modelsUsed: string[];
  /** 最近一次出现的模型（故事行显示用） */
  lastModel?: string;
  /** 估算游玩时长（毫秒）；无法可靠估算为 null → UI 显示「未统计」 */
  playTimeMs: number | null;
  /** 游玩时段数（15 分钟间隔切分） */
  sessionCount?: number;
  /** 当时使用的资产版本快照（阶段5 启用：assetId → updatedAt） */
  assetSnapshot?: Record<string, number>;
}

/**
 * 故事分支（定稿第五章）：分支=同一故事的不同发展脉络，不是独立故事条目。
 * 每条分支持有自己的消息/章节/收藏/阅读位置；主线即 ArchiveStory 本体字段。
 * 外观与正则等 settings 是故事级别的，分支共享。
 */
export interface StoryBranch {
  id: string;
  /** 分支名（如「分支：告白失败线」），用户可改 */
  name: string;
  session: ChatSession;
  markers: ChapterMarker[];
  favorites?: string[];
  /** 该分支自己的阅读位置（各分支独立） */
  lastFloor?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ArchiveStory {
  id: string;
  /** 所属角色；undefined = 临时/未绑定（定稿第六章：可先处理后绑定） */
  characterId?: string;
  title: string;
  session: ChatSession;
  markers: ChapterMarker[];
  settings?: ExportSettings;
  /** 收藏楼层（messageId） */
  favorites?: string[];
  meta: StoryMeta;
  /** 分支列表（主线不在其中，主线=本体字段）；无分支时为空/缺省 */
  branches?: StoryBranch[];
  /** 阅读进度：最近查看楼层（主线的；分支阅读位置在各分支上） */
  lastFloor?: number;
  /** 最近查看时间（列表排序用；无记录按 createdAt） */
  lastViewedAt?: number;
  /** 客户端：绑定的原 ST JSONL 路径；手动导入=未绑定，只能导出不能写回 */
  sourcePath?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------- 独立资产：引用 + 写时复制（定稿第七章） ----------

export type AssetKind = 'worldbook' | 'preset' | 'regex';

/**
 * 派生资产元数据（写时复制产物，命名 `原资产名_角色卡名`）。
 * 附着在 WorldBookItem/PresetItem 等现有条目上（阶段5 给它们加可选字段），
 * 或作为引用关系单独存储。
 */
export interface DerivedAssetMeta {
  /** 来源资产 id */
  derivedFrom: string;
  /** 触发写时复制的角色 id */
  characterId: string;
  /** 是否仍与原资产存在差异（原资产更新后可提示） */
  diverged?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 角色/故事对独立资产的引用（只记引用，不复制内容） */
export interface AssetRef {
  kind: AssetKind;
  assetId: string;
}

// ---------- 整理成果（总结/日记/自定义记录/故事树 = 故事的下属资源） ----------

export type RecordKind = 'summary' | 'diary' | 'custom' | 'storytree';

/**
 * 生成参数快照（定稿 5.2：每条记录可复现）。
 * 现有 SummaryItem/StoryTree 阶段3 迁入时补挂此结构。
 */
export interface GenerationSnapshot {
  model?: string;
  presetId?: string;
  worldbookId?: string;
  /** 世界书启用的条目范围（uid 列表） */
  worldbookEntries?: string[];
  /** 提示词模板：内置为名称，自定义为 id+名称（列表显示模板名，如「散文型总结」） */
  templateId?: string;
  templateName?: string;
  /** 来源楼层范围 [起, 止]（含） */
  floorRange?: [number, number];
  branchId?: string;
  generatedAt: number;
}
