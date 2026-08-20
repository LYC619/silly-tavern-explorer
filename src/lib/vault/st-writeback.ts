/**
 * 写回 ST（2.0 阶段7.5，定稿：仅已绑定故事；写前自动备份 .ste/ 保留 N 版可恢复；
 * 摘要确认在 UI 层；写回历史记在 ArchiveStory.writebacks）。
 * IO 全部注入（库内走 VaultFs、ST 侧走绝对路径读写），vitest 用内存实现即可全覆盖。
 */
import { parseJsonl, serializeChatJsonl } from '@/lib/adapters/st';
import type { VaultFs } from './fs';
import type { ArchiveStory, WritebackRecord } from '@/types/archive';

/** 每个故事保留的备份版数（超出删最旧） */
export const WRITEBACK_KEEP = 5;
/** 恢复前的保护备份单独计一池：与普通备份互不挤占，但同样修剪，否则整库备份只增不减 */
export const RESTORE_KEEP = 3;
/** 历史条数上限（story.writebacks） */
export const WRITEBACK_HISTORY_MAX = 10;
const BACKUP_ROOT = '.ste/写回备份';
const RESTORE_SUFFIX = '-restore.jsonl';

/** ST 侧（库外绝对路径）的读写注入点 */
export interface AbsIO {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
}

/** 跨浏览器/桌面端错误适配：只有明确的“文件不存在”才允许首写继续。 */
export function isMissingFileError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; name?: unknown };
    if (value.code === 'ENOENT' || value.name === 'NotFoundError') return true;
  }
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return /enoent|not found|no such file|cannot find|找不到|不存在/.test(message);
}

/** 备份文件名：可按字典序排出时间序（本地时区） */
export function backupFileName(at: number): string {
  const d = new Date(at);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jsonl`;
}

/** 确认对话框的摘要文案 */
export function writebackSummary(story: ArchiveStory): string {
  return [
    `将把主线 ${story.session.messages.length} 楼写回：`,
    story.sourcePath ?? '',
    `写回前自动备份当前 ST 文件到库内 ${BACKUP_ROOT}/（每故事保留最近 ${WRITEBACK_KEEP} 版，可恢复）。`,
  ].join('\n');
}

export interface WritebackOutcome {
  story: ArchiveStory;
  /** false = 源文件当时不存在，没有产生备份（首写场景） */
  backedUp: boolean;
  /** 备份已成功但修剪旧版本失败时返回；不会阻止本次写回。 */
  warning?: string;
}

/**
 * 两类备份各留各的版数：普通写回备份 WRITEBACK_KEEP 版、恢复保护备份 RESTORE_KEEP 版。
 * 文件名前缀是可字典序排序的时间戳，因此同类里排在前面的就是最旧的。
 * 返回被删掉的库内相对路径，供调用方同步历史里的恢复入口。
 * 抛错由调用方转成警告：备份文件已经落地，清理失败不该反过来推翻已完成的写入。
 */
async function pruneBackups(vaultFs: VaultFs, dir: string): Promise<string[]> {
  const names = (await vaultFs.list(dir))
    .filter((entry) => !entry.isDir && entry.name.endsWith('.jsonl'))
    .map((entry) => entry.name)
    .sort();
  const pools: Array<[string[], number]> = [
    [names.filter((name) => !name.endsWith(RESTORE_SUFFIX)), WRITEBACK_KEEP],
    [names.filter((name) => name.endsWith(RESTORE_SUFFIX)), RESTORE_KEEP],
  ];
  const removed: string[] = [];
  for (const [pool, keep] of pools) {
    for (const name of pool.slice(0, Math.max(0, pool.length - keep))) {
      await vaultFs.removeFile(`${dir}/${name}`);
      removed.push(`${dir}/${name}`);
    }
  }
  return removed;
}

/**
 * 历史留 WRITEBACK_HISTORY_MAX 条，文件只留 WRITEBACK_KEEP + RESTORE_KEEP 份，两者必然对不齐。
 * 修剪掉文件的记录保留时间与楼数（写回历史本身有价值），但去掉指向已删文件的恢复入口，
 * 免得界面给出一个点了必然报错的按钮。
 */
function dropPrunedBackups(records: WritebackRecord[] | undefined, pruned: string[]): WritebackRecord[] {
  if (!records?.length || !pruned.length) return records ?? [];
  const gone = new Set(pruned);
  return records.map((record) => (record.backupFile && gone.has(record.backupFile)
    ? { ...record, backupFile: undefined, backupPruned: true }
    : record));
}

/** 执行写回：备份 → 修剪旧备份 → 序列化主线写 ST → 记历史。抛错即整体失败，不半途落历史 */
export async function performWriteback(
  vaultFs: VaultFs,
  abs: AbsIO,
  story: ArchiveStory,
  now = Date.now(),
): Promise<WritebackOutcome> {
  if (!story.characterId || !story.sourcePath) throw new Error('仅已绑定 ST 原路径的故事可写回');
  const dir = `${BACKUP_ROOT}/${story.id}`;
  let backupFile: string | undefined;
  let warning: string | undefined;
  let pruned: string[] = [];
  let currentST: string | undefined;
  try {
    currentST = await abs.readText(story.sourcePath);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw new Error(`读取 ST 源文件失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (currentST !== undefined) {
    backupFile = `${dir}/${backupFileName(now)}`;
    await vaultFs.writeText(backupFile, currentST);
    try {
      pruned = await pruneBackups(vaultFs, dir);
    } catch (error) {
      warning = `备份已保存，但清理旧备份失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  await abs.writeText(story.sourcePath, serializeChatJsonl(story.session));
  const rec: WritebackRecord = {
    at: now,
    kind: 'write',
    floors: story.session.messages.length,
    backupFile,
  };
  const history = [rec, ...dropPrunedBackups(story.writebacks, pruned)].slice(0, WRITEBACK_HISTORY_MAX);
  return {
    story: { ...story, writebacks: history },
    backedUp: backupFile !== undefined,
    warning,
  };
}

export function restoreProtectionFileName(at: number): string {
  return backupFileName(at).replace(/\.jsonl$/, RESTORE_SUFFIX);
}

/** 把一次恢复的结果落到故事上：保护备份进历史，被修剪掉的旧备份撤下恢复入口。 */
export function applyRestoreOutcome(story: ArchiveStory, outcome: RestoreOutcome): ArchiveStory {
  const history = dropPrunedBackups(story.writebacks, outcome.prunedFiles);
  return {
    ...story,
    writebacks: (outcome.protection ? [outcome.protection, ...history] : history).slice(0, WRITEBACK_HISTORY_MAX),
  };
}

export interface RestoreOutcome {
  /** 恢复前当前 ST 内容的保护备份记录；当时没有可读文件则无 */
  protection?: WritebackRecord;
  /** 本次顺带修剪掉的旧备份（库内相对路径），历史里指向它们的恢复入口要撤下 */
  prunedFiles: string[];
  /** 恢复已完成但修剪旧备份失败时返回；不影响本次恢复。 */
  warning?: string;
}

/** 把某版备份恢复回 ST 原路径（覆盖 ST 侧；STE 库内数据不动） */
export async function restoreBackup(
  vaultFs: VaultFs,
  abs: AbsIO,
  story: ArchiveStory,
  backupFile: string,
  now = Date.now(),
): Promise<RestoreOutcome> {
  if (!story.sourcePath) throw new Error('故事未绑定 ST 原路径');
  const backup = await vaultFs.readText(backupFile);
  let currentST: string | undefined;
  try {
    currentST = await abs.readText(story.sourcePath);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw new Error(`读取当前 ST 文件失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const dir = `${BACKUP_ROOT}/${story.id}`;
  let protection: WritebackRecord | undefined;
  if (currentST !== undefined) {
    const protectionFile = `${dir}/${restoreProtectionFileName(now)}`;
    await vaultFs.writeText(protectionFile, currentST);
    // 楼数取保护文件里 ST 侧的实际内容，不能用库内故事的楼数——两边可能早就不一样了
    protection = { at: now, kind: 'restore', floors: parseJsonl(currentST).messages.length, backupFile: protectionFile };
  }
  await abs.writeText(story.sourcePath, backup);
  let warning: string | undefined;
  let prunedFiles: string[] = [];
  if (protection) {
    try {
      prunedFiles = await pruneBackups(vaultFs, dir);
    } catch (error) {
      warning = `已恢复，但清理旧备份失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return { protection, prunedFiles, warning };
}
