/**
 * 数据来源抽象：库里的内容可以从哪儿进来。
 *
 * 三条路（`.planning/mobile-client-design/architecture.md` 数据层一节）：
 * - `reading-pack`   阅读包文件。已实现。
 * - `cloud-sync`     云同步。未实现，只占位。
 * - `st-backup-zip`  手机上直接导入 ST 备份 zip。未实现，只占位。
 *   （桌面端已有 ST 目录扫描那条路，走 Rust 侧，不归这里管——
 *    这个 kind 说的是「手机上拿到一个 ST 导出的 zip 文件」。）
 *
 * 为什么要这层抽象：三条路的差别只在「怎么拿到字节」和「拿到的是什么格式」，
 * 拿到之后「算出要写什么 → 给用户看 → 确认后写库」是同一套。把后半段固定在
 * 接口里，加一条新来源就只用实现前半段。
 *
 * 接口刻意是**两段式**（inspect → apply）而不是一步 import()：
 * 导入会覆盖本地条目，而本地条目上攒着用户的阅读进度和评分。云同步更需要这个
 * ——同步前必须能说清「这次会动哪些东西」。
 */
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import type { SummaryItem } from '@/types/summary';

export type DataSourceKind = 'reading-pack' | 'cloud-sync' | 'st-backup-zip';

/** 一条待写记录的处置 */
export type ImportAction = 'add' | 'overwrite' | 'skip';

export interface ImportPlanRow {
  id: string;
  /** 展示名（角色名/故事名/总结标题） */
  label: string;
  action: ImportAction;
  /** skip 的原因，展示给用户 */
  reason?: string;
}

/**
 * inspect 的产物：这次导入**会做什么**，但还没做。
 * 界面拿它画确认页；apply 拿它执行。
 */
export interface ImportPlan {
  kind: DataSourceKind;
  /** 来源的人类可读描述（文件名 / 云端账号 / 备份包名） */
  origin: string;
  /** 产出方信息，能拿到的话（阅读包的 manifest 里有） */
  producedBy?: { runtime: string; appVersion: string };
  characters: ImportPlanRow[];
  stories: ImportPlanRow[];
  summaries: ImportPlanRow[];
  totals: { add: number; overwrite: number; skip: number };
}

export interface ImportResult {
  /** 实际写入的条数（不含 skip） */
  written: { characters: number; stories: number; summaries: number };
  skipped: number;
  /** 非致命问题（某张图缺失之类），展示但不阻断 */
  warnings: string[];
}

/** 写库副作用注入，测试里可换成内存实现 */
export interface ImportSink {
  saveCharacter(item: ArchiveCharacter): Promise<void>;
  saveStory(item: ArchiveStory): Promise<void>;
  saveSummary(item: SummaryItem): Promise<void>;
  /** 取本地同 id 故事，用来继承阅读进度 */
  getStory(id: string): Promise<ArchiveStory | undefined>;
}

/**
 * 一条数据来源。
 *
 * TInput 是这条路的入口物料：阅读包是 File/字节，云同步大概是账号凭据 + 上次同步游标，
 * ST 备份 zip 是 File。
 */
export interface DataSource<TInput = unknown> {
  kind: DataSourceKind;
  /** 界面上的名字 */
  label: string;
  /** 当前运行环境支持吗（云同步要网络、ST zip 要选文件能力） */
  isAvailable(): boolean;
  /** 只读：算出计划，不写库 */
  inspect(input: TInput): Promise<ImportPlan>;
  /** 按计划写库。plan 必须来自同一次 inspect（同一份 input）。 */
  apply(input: TInput, plan: ImportPlan, sink: ImportSink): Promise<ImportResult>;
}

/**
 * 反向（本机 → 外部）。阅读包两端对称，所以导出也挂在同一套抽象下：
 * 手机导出、电脑导入，和反过来走的是同一份代码。
 * 云同步将来实现 push 时落在这里；ST zip 不做导出（写回 ST 是桌面端的独立能力）。
 */
export interface DataSink<TOptions = unknown> {
  kind: DataSourceKind;
  isAvailable(): boolean;
  /** 产出字节 + 建议文件名，落盘/分享由调用方决定 */
  produce(options: TOptions): Promise<{ bytes: Uint8Array; fileName: string }>;
}
