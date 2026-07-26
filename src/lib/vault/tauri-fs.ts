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
  size: number;
}

/** 以 root 为库根的真实磁盘实现；root 为绝对路径（来自目录选择器） */
export function createTauriFs(root: string): VaultFs {
  const abs = (rel: string) => (rel ? `${root}/${rel}` : root);
  return {
    async list(dir): Promise<VaultEntry[]> {
      try {
        const entries = await invoke<RawEntry[]>('vault_list_dir', { path: abs(dir) });
        return entries.map((e) => ({ name: e.name, isDir: e.is_dir, size: e.size }));
      } catch {
        return []; // 目录不存在
      }
    },
    readText: (path) => invoke('vault_read_text', { path: abs(path) }),
    writeText: (path, content) => invoke('vault_write_text', { path: abs(path), content }),
    readBinary: (path) => invoke('vault_read_binary', { path: abs(path) }),
    writeBinary: (path, base64) => invoke('vault_write_binary', { path: abs(path), base64 }),
    removeFile: (path) => invoke('vault_remove_file', { path: abs(path) }),
    removeEmptyDir: (path) => invoke('vault_remove_empty_dir', { path: abs(path) }),
    rename: (from, to) => invoke('vault_rename', { from: abs(from), to: abs(to) }),
    mkdir: (path) => invoke('vault_mkdir', { path: abs(path) }),
    stat: (path) => invoke<VaultStat>('vault_stat', { path: abs(path) }),
  };
}

/** 按绝对路径读文本（库外文件，如 ST 目录里的聊天；7.4 检查更新用） */
export function readAbsText(path: string): Promise<string> {
  return invoke('vault_read_text', { path });
}

// ---- 应用配置（系统配置目录 config.json，不进库；API Key 后续同通道）----

export async function getAppConfig<T>(key: string): Promise<T | null> {
  return (await invoke<T | null>('config_get', { key })) ?? null;
}

export async function setAppConfig(key: string, value: unknown): Promise<void> {
  await invoke('config_set', { key, value });
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
