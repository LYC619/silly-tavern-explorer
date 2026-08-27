import { createTauriFs, isTauri, pickDirectory, setVaultRoot } from './tauri-fs';
import type { VaultStat } from './fs';
import { createVault } from './vault-backend';
import { setActiveVault } from './active';
import {
  activateVaultProfile,
  removeVaultProfile,
  upsertVaultProfile,
  type VaultProfile,
} from './vault-registry';
import { loadVaultRegistry, persistVaultRegistry, VAULT_CHANGED_EVENT } from './vault-registry-store';

export { VAULT_CHANGED_EVENT } from './vault-registry-store';

function emitChanged(profile: VaultProfile): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VAULT_CHANGED_EVENT, { detail: profile }));
  }
}

export { loadVaultRegistry } from './vault-registry-store';

async function assertVaultDirectory(path: string): Promise<void> {
  if (!path.trim()) throw new Error('库路径不能为空');
  let stat: VaultStat;
  try {
    stat = await createTauriFs(path).stat('');
  } catch {
    throw new Error(`无法访问文件库目录：${path}`);
  }
  if (!stat.exists) throw new Error(`文件库目录不存在：${path}`);
  if (!stat.isDir) throw new Error(`文件库路径不是文件夹：${path}`);
}

export async function registerAndActivateVault(path: string, name?: string): Promise<VaultProfile> {
  if (!isTauri()) throw new Error('网页版不支持本机文件库切换');
  await assertVaultDirectory(path);
  const current = await loadVaultRegistry();
  const upserted = upsertVaultProfile(current, path, name);
  const registry = activateVaultProfile(upserted.registry, upserted.profile.id);
  await setVaultRoot(upserted.profile.path);
  await persistVaultRegistry(registry);
  setActiveVault(createVault(createTauriFs(upserted.profile.path)));
  emitChanged(upserted.profile);
  return upserted.profile;
}

/** 运行中切换：只写入下一次启动目标，调用方随后必须 reload。 */
export async function selectRegisteredVaultForNextBoot(id: string): Promise<VaultProfile | null> {
  if (!isTauri()) return null;
  const current = await loadVaultRegistry();
  const profile = current.vaults.find((item) => item.id === id);
  if (!profile) return null;
  await assertVaultDirectory(profile.path);
  const registry = activateVaultProfile(current, id);
  await setVaultRoot(profile.path);
  await persistVaultRegistry(registry);
  return profile;
}

export async function chooseAndActivateVault(): Promise<VaultProfile | null> {
  const path = await pickDirectory(
    '选择 STE 库文件夹（可新增演示库或打开已有库）',
    { persistAuthorization: true },
  );
  return path ? registerAndActivateVault(path) : null;
}

/** 运行中新增/打开库：注册为下一次启动目标，不替换当前页面后端。 */
export async function registerVaultForNextBoot(path: string, name?: string): Promise<VaultProfile> {
  if (!isTauri()) throw new Error('网页版不支持本机文件库切换');
  await assertVaultDirectory(path);
  const current = await loadVaultRegistry();
  const upserted = upsertVaultProfile(current, path, name);
  const registry = activateVaultProfile(upserted.registry, upserted.profile.id);
  await setVaultRoot(upserted.profile.path);
  await persistVaultRegistry(registry);
  return upserted.profile;
}

export async function chooseVaultForNextBoot(): Promise<VaultProfile | null> {
  const path = await pickDirectory(
    '选择 STE 库文件夹（可新增演示库或打开已有库）',
    { persistAuthorization: true },
  );
  return path ? registerVaultForNextBoot(path) : null;
}

/**
 * 从注册表里移除一条库记录（对齐 Obsidian「从仓库列表中移除」）：
 * 只忘掉这个路径，磁盘上的库文件夹一个字节都不动。
 * 当前正在用的库不能移除——应用整个跑在它上面，先切到别的库再来。
 */
export async function unregisterVault(id: string): Promise<VaultProfile> {
  if (!isTauri()) throw new Error('网页版没有本机库列表');
  const current = await loadVaultRegistry();
  const profile = current.vaults.find((item) => item.id === id);
  if (!profile) throw new Error('该库已不在列表中，刷新设置页即可');
  if (current.activeId === id) throw new Error('这是当前正在使用的库，先切换到别的库再移除');
  await persistVaultRegistry(removeVaultProfile(current, id));
  return profile;
}
