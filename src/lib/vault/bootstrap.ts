/**
 * 客户端文件库启动接线（2.0 阶段7.2c）。
 * 网页版：什么都不做，保持 IndexedDB。
 * 客户端：读系统配置里的库根 → createTauriFs + createVault → setActiveVault。
 * 库根未配置时由 VaultGate 引导用户选目录。
 */
import { setActiveVault } from './active';
import { createVault } from './vault-backend';
import { createTauriFs, getVaultRoot, isTauri, pickDirectory, setVaultRoot } from './tauri-fs';
import { hydrateApiProfilesFromSystem } from './sensitive-config';

export type VaultBootState = 'web' | 'ready' | 'unset';

/** 启动时调用一次：返回 'web'(非客户端) / 'ready'(库已激活) / 'unset'(需要引导选库) */
export async function bootVault(): Promise<VaultBootState> {
  if (!isTauri()) return 'web';
  // API Key 等敏感配置先从系统配置目录恢复到 localStorage（7.6），再放行页面
  await hydrateApiProfilesFromSystem();
  try {
    const root = await getVaultRoot();
    if (!root) return 'unset';
    setActiveVault(createVault(createTauriFs(root)));
    return 'ready';
  } catch (err) {
    // 配置读取失败（文件损坏等）：回引导页让用户重选，而不是卡在加载态
    console.warn('文件库启动失败，回到选库引导', err);
    return 'unset';
  }
}

/** 引导流程：弹目录选择器 → 存配置 → 激活。用户取消返回 null，成功返回所选路径 */
export async function chooseVaultRoot(): Promise<string | null> {
  const picked = await pickDirectory('选择 STE 库文件夹（一个文件夹=整个库，可网盘同步）');
  if (!picked) return null;
  await setVaultRoot(picked);
  setActiveVault(createVault(createTauriFs(picked)));
  return picked;
}
