/**
 * VaultFs 的 Tauri 实现 + 客户端环境探测 + 库根/应用配置读写。
 * 仅此文件 import @tauri-apps/*；网页版打包也会带上这些模块但永不调用（isTauri 短路）。
 */
import { invoke } from '@tauri-apps/api/core';
import type { VaultEntry, VaultFs, VaultStat } from './fs';

/**
 * 是否运行在 Tauri 客户端里（网页版、Android 客户端均为 false）。
 *
 * 实现搬到了 @/lib/runtime（那里还有 isCapacitor / detectRuntime）。这里保留转发：
 * 二十多个文件从本模块导入它，为了换个导入路径去动那些文件不值得。
 */
export { isTauri } from '@/lib/runtime';
import { isTauri } from '@/lib/runtime';

interface RawEntry {
  name: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  modified_at: number | null;
}

interface RawStat {
  exists: boolean;
  is_dir: boolean;
}

function safeRelativePath(path: string): string {
  if (path.includes('\\') || path.startsWith('/')) throw new Error(`不安全的相对路径: ${path}`);
  const parts = path.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) throw new Error(`不安全的相对路径: ${path}`);
  return parts.join('/');
}

/** 以 root 为库根的真实磁盘实现；root 为绝对路径（来自目录选择器） */
export function createTauriFs(root: string): VaultFs {
  const args = (path: string) => ({ root, path: safeRelativePath(path) });
  return {
    async list(dir): Promise<VaultEntry[]> {
      const entries = await invoke<RawEntry[]>('vault_list_dir', args(dir));
      return entries.map((e) => ({
        name: e.name,
        isDir: e.is_dir,
        isSymlink: e.is_symlink,
        size: e.size,
        ...(e.modified_at == null ? {} : { modifiedAt: e.modified_at }),
      }));
    },
    readText: (path) => invoke('vault_read_text', args(path)),
    writeText: (path, content) => invoke('vault_write_text', { ...args(path), content }),
    readBinary: (path) => invoke('vault_read_binary', args(path)),
    writeBinary: (path, base64) => invoke('vault_write_binary', { ...args(path), base64 }),
    removeFile: (path) => invoke('vault_remove_file', args(path)),
    trashFile: (path) => invoke('vault_trash_file', args(path)),
    openPath: (path, reveal = false) => invoke('vault_open_path', { ...args(path), reveal }),
    removeEmptyDir: (path) => invoke('vault_remove_empty_dir', args(path)),
    rename: (from, to) => invoke('vault_rename', { root, from: safeRelativePath(from), to: safeRelativePath(to) }),
    mkdir: (path) => invoke('vault_mkdir', args(path)),
    async stat(path): Promise<VaultStat> {
      const value = await invoke<RawStat>('vault_stat', args(path));
      return { exists: value.exists, isDir: value.is_dir };
    },
  };
}

/** 按绝对路径读文本（库外文件，如 ST 目录里的聊天；7.4 检查更新用） */
export function readAbsText(path: string): Promise<string> {
  return invoke('vault_read_abs_text', { path });
}

export interface PickedChatFile {
  name: string;
  base64: string;
}

/**
 * 客户端原生「选一个聊天文件」；网页版和 Android 客户端返回 null，
 * 由调用方回退到隐藏 <input type=file>。
 *
 * TODO(capacitor): Android 上隐藏 input 其实能用（系统文件选择器会弹），
 * 所以这条回退是通的，不必急着接 @capacitor/filesystem。真要改的是导入之后往哪写
 * ——那部分卡在库后端上，见 vault/bootstrap.ts 的 TODO。
 */
export async function pickChatFile(): Promise<PickedChatFile | null> {
  if (!isTauri()) return null;
  return (await invoke<{ name: string; base64: string } | null>('pick_chat_file')) ?? null;
}

/** 客户端原生文件选择器；网页版和 Android 客户端返回 null，由调用方回退隐藏 input。 */
export async function pickFile(filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ multiple: false, directory: false, filters });
  return typeof selected === 'string' ? selected : null;
}

/** 按绝对路径写文本（7.5 写回 ST 用；Rust 侧临时文件+rename 原子写） */
export function writeAbsText(path: string, content: string): Promise<void> {
  return invoke('vault_write_abs_text', { path, content });
}

/** 按绝对路径写二进制（阅读包导出用）。载荷走 base64——zip 塞不进 String。 */
export function writeAbsBytes(path: string, bytes: Uint8Array): Promise<void> {
  let bin = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return invoke('vault_write_abs_binary', { path, base64: btoa(bin) });
}

// ---- 应用配置（系统配置目录 config.json，不进库；API Key 后续同通道）----

export async function getAppConfig<T>(key: string): Promise<T | null> {
  return (await invoke<T | null>('config_get', { key })) ?? null;
}

export async function setAppConfig(key: string, value: unknown): Promise<void> {
  await invoke('config_set', { key, value });
}

const INVALID_APP_CONFIG_PREFIX = 'STE_CONFIG_INVALID:';

export function isInvalidAppConfigError(error: unknown): boolean {
  return String(error).includes(INVALID_APP_CONFIG_PREFIX);
}

/** 仅在配置无法解析时调用：Rust 侧先生成同目录备份，再把 config.json 重置为空对象。 */
export async function repairAppConfig(): Promise<string | null> {
  return (await invoke<string | null>('config_repair')) ?? null;
}

const VAULT_ROOT_KEY = 'vaultRoot';

export function getVaultRoot(): Promise<string | null> {
  return getAppConfig<string>(VAULT_ROOT_KEY);
}

export async function setVaultRoot(path: string): Promise<void> {
  await setAppConfig(VAULT_ROOT_KEY, path);
}

export interface PreparedSTBackup {
  root: string;
  displayName: string;
}

/** 选择并解压一个 SillyTavern zip；返回只在本次导入期间有效的临时根目录。 */
export async function pickSTBackupImport(): Promise<PreparedSTBackup | null> {
  const value = await invoke<{ root: string; display_name: string } | null>('prepare_st_backup_import');
  return value ? { root: value.root, displayName: value.display_name } : null;
}

/** 清理 pickSTBackupImport 创建的一次性临时根目录。 */
export function cleanupSTBackupImport(root: string): Promise<void> {
  return invoke('cleanup_st_backup_import', { root });
}

/** 弹系统目录选择器；用户取消返回 null */
export async function pickDirectory(
  title: string,
  options: { persistAuthorization?: boolean } = {},
): Promise<string | null> {
  return (await invoke<string | null>('vault_pick_authorized_directory', {
    title,
    persistent: options.persistAuthorization ?? false,
  })) ?? null;
}
