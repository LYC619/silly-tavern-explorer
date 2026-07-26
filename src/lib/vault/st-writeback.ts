/**
 * 写回 ST（2.0 阶段7.5，定稿：仅已绑定故事；写前自动备份 .ste/ 保留 N 版可恢复；
 * 摘要确认在 UI 层；写回历史记在 ArchiveStory.writebacks）。
 * IO 全部注入（库内走 VaultFs、ST 侧走绝对路径读写），vitest 用内存实现即可全覆盖。
 */
import { serializeChatJsonl } from '@/lib/adapters/st';
import type { VaultFs } from './fs';
import type { ArchiveStory, WritebackRecord } from '@/types/archive';

/** 每个故事保留的备份版数（超出删最旧） */
export const WRITEBACK_KEEP = 5;
/** 历史条数上限（story.writebacks） */
export const WRITEBACK_HISTORY_MAX = 10;
const BACKUP_ROOT = '.ste/写回备份';

/** ST 侧（库外绝对路径）的读写注入点 */
export interface AbsIO {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
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
  /** false = 源文件当时不存在/读不到，没有产生备份（首写场景） */
  backedUp: boolean;
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
  try {
    const currentST = await abs.readText(story.sourcePath);
    backupFile = `${dir}/${backupFileName(now)}`;
    await vaultFs.writeText(backupFile, currentST);
    const names = (await vaultFs.list(dir))
      .filter((e) => !e.isDir && e.name.endsWith('.jsonl'))
      .map((e) => e.name)
      .sort();
    for (const name of names.slice(0, Math.max(0, names.length - WRITEBACK_KEEP))) {
      await vaultFs.removeFile(`${dir}/${name}`);
    }
  } catch {
    backupFile = undefined; // 源文件不存在（被移走/首次写出）：没有可备份的内容，直接写
  }
  await abs.writeText(story.sourcePath, serializeChatJsonl(story.session));
  const rec: WritebackRecord = { at: now, floors: story.session.messages.length, backupFile };
  return {
    story: { ...story, writebacks: [rec, ...(story.writebacks ?? [])].slice(0, WRITEBACK_HISTORY_MAX) },
    backedUp: backupFile !== undefined,
  };
}

/** 把某版备份恢复回 ST 原路径（覆盖 ST 侧；STE 库内数据不动） */
export async function restoreBackup(vaultFs: VaultFs, abs: AbsIO, story: ArchiveStory, backupFile: string): Promise<void> {
  if (!story.sourcePath) throw new Error('故事未绑定 ST 原路径');
  await abs.writeText(story.sourcePath, await vaultFs.readText(backupFile));
}
