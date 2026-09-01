/**
 * 数据来源注册表。界面从这里拿「有哪些导入方式」，不直接认某一条。
 */
import type { DataSource, DataSourceKind } from './types';
import { readingPackSource } from './reading-pack-source';

export type {
  DataSource, DataSink, DataSourceKind, ImportAction, ImportPlan, ImportPlanRow,
  ImportResult, ImportSink,
} from './types';
export { readingPackSource } from './reading-pack-source';
export type { ReadingPackInput } from './reading-pack-source';

/**
 * 云同步。未实现。
 *
 * TODO(cloud-sync): 需要先定三件事，都不是纯前端能拍板的：
 * 1. 存哪儿——自建后端 / 用户自己的 WebDAV / 对象存储直传。这决定要不要做账号体系。
 * 2. 冲突怎么办——两台设备都改了同一个故事的评分，谁赢？阅读包那条走的是
 *    updatedAt last-write-wins + 本地进度永远保留，云同步至少要做到同样，
 *    更好的做法是按字段合并。
 * 3. 隐私——聊天记录是很私密的东西，端到端加密不是可选项。密钥托管怎么设计？
 * 接口形状按 DataSource<CloudSyncInput> 来，inspect 出「这次会拉下来什么」的计划。
 */
export const cloudSyncSource: Pick<DataSource, 'kind' | 'label' | 'isAvailable'> = {
  kind: 'cloud-sync',
  label: '云同步（未实现）',
  isAvailable: () => false,
};

/**
 * 手机上直接导入 ST 备份 zip。未实现。
 *
 * TODO(st-backup-zip): 桌面端已有这条路（src-tauri 的 st_backup_import.rs，Rust 侧解 zip），
 * 但那份代码在移动端用不上——Capacitor 里没有 Tauri 的 invoke。要做的是 JS 侧实现：
 * fflate 解 zip → 复用 lib/adapters/st/* 的解析器（chat-jsonl、png-parser 都是纯 JS，
 * 可以直接用）→ 走同一套 inspect/apply。
 * 主要工作量在「ST 目录结构识别」那部分，Rust 侧那份逻辑要翻一遍到 JS。
 * 云酒馆玩家主要在手机上玩，这条路对他们比阅读包更直接，优先级不低。
 */
export const stBackupZipSource: Pick<DataSource, 'kind' | 'label' | 'isAvailable'> = {
  kind: 'st-backup-zip',
  label: 'SillyTavern 备份包（未实现）',
  isAvailable: () => false,
};

/** 全部来源，含未实现的（界面可以灰掉显示，让用户知道路线图） */
export const DATA_SOURCES: { kind: DataSourceKind; label: string; available: boolean }[] = [
  { kind: readingPackSource.kind, label: readingPackSource.label, available: readingPackSource.isAvailable() },
  { kind: cloudSyncSource.kind, label: cloudSyncSource.label, available: cloudSyncSource.isAvailable() },
  { kind: stBackupZipSource.kind, label: stBackupZipSource.label, available: stBackupZipSource.isAvailable() },
];
