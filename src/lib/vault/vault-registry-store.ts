import { getAppConfig, getVaultRoot, isTauri, setAppConfig, setVaultRoot } from './tauri-fs';
import {
  activateVaultProfile,
  createEmptyVaultRegistry,
  normalizeVaultRegistry,
  upsertVaultProfile,
  type VaultRegistry,
} from './vault-registry';

const REGISTRY_KEY = 'vaultRegistry';
export const VAULT_CHANGED_EVENT = 'ste-vault-changed';

async function saveRegistry(registry: VaultRegistry): Promise<void> {
  if (isTauri()) await setAppConfig(REGISTRY_KEY, registry);
}

/** 读取并修复旧版单 vaultRoot 配置；本模块不加载文件库后端，适合轻量 UI 使用。 */
export async function loadVaultRegistry(): Promise<VaultRegistry> {
  if (!isTauri()) return createEmptyVaultRegistry();
  const [raw, legacyRootValue] = await Promise.all([
    getAppConfig<unknown>(REGISTRY_KEY),
    getVaultRoot(),
  ]);
  // config.json 的根对象虽然合法，旧版本字段也可能被手工编辑成数字、数组等类型。
  // 迁移前先做运行时校验，避免 normalizeVaultPath 对非字符串调用 trim 导致选库页死循环。
  const legacyRoot = typeof legacyRootValue === 'string' && legacyRootValue.trim()
    ? legacyRootValue
    : null;
  let registry = normalizeVaultRegistry(raw);
  let changed = JSON.stringify(raw) !== JSON.stringify(registry);
  if (legacyRoot && registry.vaults.length === 0) {
    const upserted = upsertVaultProfile(registry, legacyRoot);
    registry = activateVaultProfile(upserted.registry, upserted.profile.id);
    changed = true;
  } else if (registry.activeId) {
    const active = registry.vaults.find((item) => item.id === registry.activeId);
    if (active) await setVaultRoot(active.path).catch(() => {});
  }
  if (changed) await saveRegistry(registry);
  return registry;
}

export async function persistVaultRegistry(registry: VaultRegistry): Promise<void> {
  await saveRegistry(registry);
}
