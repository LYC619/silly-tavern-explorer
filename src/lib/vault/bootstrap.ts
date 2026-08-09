/**
 * 客户端文件库启动接线（2.0 阶段7.2c）。
 * 网页版：什么都不做，保持 IndexedDB。
 * 客户端：读系统配置里的库根 → createTauriFs + createVault → setActiveVault。
 * 库根未配置时由 VaultGate 引导用户选目录。
 */
import { setActiveVault } from './active';
import { createVault } from './vault-backend';
import { createTauriFs, isInvalidAppConfigError, isTauri } from './tauri-fs';
import { hydrateApiProfilesFromSystem } from './sensitive-config';
import {
  chooseAndActivateVault,
  loadVaultRegistry,
} from './vault-registry-runtime';

export type VaultBootState = 'web' | 'ready' | 'unset' | 'repair';

/** 启动时调用一次：返回 'web'(非客户端) / 'ready'(库已激活) / 'unset'(需要引导选库) */
export async function bootVault(): Promise<VaultBootState> {
  if (!isTauri()) return 'web';
  try {
    // API Key 等敏感配置先从系统配置目录恢复到 localStorage（7.6），再放行页面；
    // 恢复失败也回到可重试的选库引导，避免门卫卡在 booting。
    await hydrateApiProfilesFromSystem();
    const registry = await loadVaultRegistry();
    const active = registry.activeId ? registry.vaults.find((item) => item.id === registry.activeId) : undefined;
    if (!active) return 'unset';
    const fs = createTauriFs(active.path);
    // canonicalize(root) 在这里提前验证库目录仍存在且确实是目录；
    // 失效路径回到 VaultGate，不把一个稍后才会失败的后端放行给页面。
    const stat = await fs.stat('');
    if (!stat.exists || !stat.isDir) {
      throw new Error(`文件库根目录无效：${active.path}`);
    }
    setActiveVault(createVault(fs));
    return 'ready';
  } catch (err) {
    if (isInvalidAppConfigError(err)) {
      console.warn('应用配置损坏，需要先备份并修复', err);
      return 'repair';
    }
    // 配置读取失败（文件损坏等）：回引导页让用户重选，而不是卡在加载态
    console.warn('文件库启动失败，回到选库引导', err);
    return 'unset';
  }
}

/** 引导流程：弹目录选择器 → 存配置 → 激活。用户取消返回 null，成功返回所选路径 */
export async function chooseVaultRoot(): Promise<string | null> {
  const profile = await chooseAndActivateVault();
  return profile?.path ?? null;
}
