import { createTauriFs, isTauri, pickDirectory, setVaultRoot } from './tauri-fs';
import type { VaultStat } from './fs';
import { createVault } from './vault-backend';
import { setActiveVault } from './active';
import {
  activateVaultProfile,
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
  const path = await pickDirectory('选择 STE 库文件夹（可新增演示库或打开已有库）');
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
  const path = await pickDirectory('选择 STE 库文件夹（可新增演示库或打开已有库）');
  return path ? registerVaultForNextBoot(path) : null;
}
