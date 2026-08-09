/**
 * VaultFs 的 Tauri 实现 + 客户端环境探测 + 库根/应用配置读写。
 * 仅此文件 import @tauri-apps/*；网页版打包也会带上这些模块但永不调用（isTauri 短路）。
 */
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { VaultEntry, VaultFs, VaultStat } from './fs';

/** 是否运行在 Tauri 客户端里（网页版为 false） */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface RawEntry {
  name: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
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
      return entries.map((e) => ({ name: e.name, isDir: e.is_dir, isSymlink: e.is_symlink, size: e.size }));
    },
    readText: (path) => invoke('vault_read_text', args(path)),
    writeText: (path, content) => invoke('vault_write_text', { ...args(path), content }),
    readBinary: (path) => invoke('vault_read_binary', args(path)),
    writeBinary: (path, base64) => invoke('vault_write_binary', { ...args(path), base64 }),
    removeFile: (path) => invoke('vault_remove_file', args(path)),
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

/** 按绝对路径写文本（7.5 写回 ST 用；Rust 侧临时文件+rename 原子写） */
export function writeAbsText(path: string, content: string): Promise<void> {
  return invoke('vault_write_abs_text', { path, content });
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

/** 弹系统目录选择器；用户取消返回 null */
export async function pickDirectory(title: string): Promise<string | null> {
  const picked = await openDialog({ directory: true, multiple: false, title });
  return typeof picked === 'string' ? picked : null;
}
