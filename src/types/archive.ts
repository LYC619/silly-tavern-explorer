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
import type { RatingRecord } from '@/types/rating';

// ---------- 角色（角色库条目 = 设计稿「角色/<名>/档案.json + 卡片.png」） ----------

/**
 * @deprecated 10.0 起废弃（0801 反馈：角色级五档游玩状态 → 互斥「类型」；状态四档下沉到故事级）。
 * 字段暂留供旧档案读取与迁移，10.2 移除 UI 后不再写入。
 */
export type CharacterStatus = '未开始' | '进行中' | '暂停' | '已完成' | '已弃置';

/** 角色类型（10.0，互斥，替代五档游玩状态）；undefined = 未分类（迁移允许不强制归类） */
export type CharacterType = '人物' | '剧情' | '玩法' | '综合' | '同人';

/** 故事状态四档（10.0，0801 反馈：状态下沉到故事级） */
export type StoryStatus = '未开始' | '进行中' | '已完结' | '已搁置';

/** 展示层元信息覆盖（10.0）：只改本地展示，不写回角色卡原件 */
export interface DisplayMeta {
  name?: string;
  creator?: string;
  source?: string;
}

/** 角色级速记备注（10.0，设计稿「备注」tab：玩卡心得，按时间列出） */
export interface CharacterNote {
  id: string;
  body: string;
  at: number;
}

/**
 * 立绘行（10.0 定形，10.3c 实现 UI 与客户端落盘）：
 * 一行 = 一个角色或一个剧情阶段；客户端落盘 `角色/<名>/立绘/<行名>/` + 立绘.json，网页版图片存条目内。
 */
export interface PortraitRow {
  id: string;
  title: string;
  items: PortraitItem[];
}

export interface PortraitItem {
  id: string;
  /** 来源：manual=手动导入；replaced=被替换的旧卡面自动存档 */
  source: 'manual' | 'replaced';
  /** 显示名（原文件名/归档名）；缺省时客户端用 fileName */
  name?: string;
  /** 客户端：行文件夹内的文件名；网页版为空（图片在 dataBase64） */
  fileName?: string;
  /** 网页版：图片数据（纯 base64 无前缀）；客户端为空（图片在文件夹） */
  dataBase64?: string;
  mime?: string;
  addedAt: number;
}

/** 引用资产（10.3c 最小实现，反馈 2.4 导入六类）：文本摘录条目，列在关联资产 tab */
export interface QuoteAsset {
  id: string;
  title: string;
  /** 摘录正文（空行分段，资产抽屉逐段展示） */
  body: string;
  addedAt: number;
}

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
  /** STE 本地标签（不写回 ST 卡文件）；「类别/子标签」分级格式，分类法见 lib/tag-taxonomy */
  tags: string[];
  /** @deprecated 10.0 起废弃（见 CharacterStatus）；暂留兼容旧档案 */
  status: CharacterStatus;
  /** 角色类型（10.0，互斥）；undefined = 未分类 */
  type?: CharacterType;
  /** 展示层元信息覆盖（10.0）：不写回卡原件 */
  displayMeta?: DisplayMeta;
  /** NSFW 卡面标记（10.0）；与标签 '卡面/NSFW' 由 setNsfw 同步维护，字段为真源 */
  nsfw?: boolean;
  /** 角色备注（10.0，10.3c 出 UI） */
  notes?: CharacterNote[];
  /** 立绘分行（10.0 定形，10.3c 出 UI 与落盘） */
  portraitRows?: PortraitRow[];
  /** 当前卡面对应的立绘条目 id（10.3c 设为卡面时记录；换卡面时据此判断旧图是否已在立绘库里） */
  portraitCurrentId?: string;
  /** 引用摘录（10.3c 最小实现）：与 assets 引用一起列在关联资产 tab */
  quotes?: QuoteAsset[];
  /** 10 分制总分（0.5 步进由 UI 约束）；未评分为 undefined */
  rating?: number;
  /** 评分摘要（一句话，详细分项在 ratingDetail 里） */
  ratingNote?: string;
  /** 评分明细（阶段6）：模板/维度分/提示词快照/AI 读取范围/时间 */
  ratingDetail?: RatingRecord;
  /** 当前简介 + 历史版本（新生成先草稿比较，确认后入栈） */
  intro?: { current: IntroVersion; history: IntroVersion[] };
  /** 简介是否可能过期（源卡/世界书变化时置 true，只提示不覆盖） */
  introStale?: boolean;
  /** 最近进入角色页的时间；角色级首页排序字段，不影响 updatedAt。 */
  lastViewedAt?: number;
  /** 关联的独立资产引用（世界书/预设/正则；只记引用，写时复制见定稿第七章） */
  assets?: AssetRef[];
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
  /** 故事状态四档（10.0）；undefined 按「未开始」显示 */
  status?: StoryStatus;
  /** 故事评分（10.0 轻量，0.5 步进）；未评分为 undefined */
  rating?: number;
  /** 物化：主线正文字数（非空白字符数，不含分支；导入/保存时计算，存量迁移回填） */
  wordCount?: number;
  /** 物化：主线最后一条消息时间（gen/send 时间戳最大值；「最后游玩」显示与排序用） */
  lastMessageAt?: number;
  /** 分支列表（主线不在其中，主线=本体字段）；无分支时为空/缺省 */
  branches?: StoryBranch[];
  /** 最近查看的脉络；缺省=主线，旧归档天然兼容 */
  lastViewedBranchId?: string;
  /** 阅读进度：最近查看楼层（主线的；分支阅读位置在各分支上） */
  lastFloor?: number;
  /** 最近查看时间（列表排序用；无记录按 createdAt） */
  lastViewedAt?: number;
  /** 客户端：绑定的原 ST JSONL 路径；手动导入=未绑定，只能导出不能写回 */
  sourcePath?: string;
  /** 最近一次重新导入合并的时间（阶段4，io 页显示） */
  lastImportedAt?: number;
  /** 最近一次导出副本的时间（阶段4，io 页显示） */
  lastExportedAt?: number;
  /** 写回 ST 历史（阶段7.5，客户端；新在前，最多留 10 条） */
  writebacks?: WritebackRecord[];
  createdAt: number;
  updatedAt: number;
}

/** 一次写回 ST 的记录（阶段7.5） */
export interface WritebackRecord {
  at: number;
  /** 写回时的主线楼数 */
  floors: number;
  /** 写前备份在库内的相对路径（.ste/写回备份/…）；源文件当时不存在则无 */
  backupFile?: string;
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

/** 角色卡内置资源的幂等导入标记。 */
export interface EmbeddedAssetMeta {
  characterId: string;
  contentHash: string;
  importedAt: number;
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
