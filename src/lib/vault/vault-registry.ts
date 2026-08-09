/**
 * 多文件库注册表的纯数据层。
 * 路径是唯一身份；显示名可以随时改，切换不会复制、删除或改写任何库内容。
 */
export interface VaultProfile {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface VaultRegistry {
  version: 1;
  activeId: string | null;
  vaults: VaultProfile[];
}

export interface VaultUpsertResult {
  registry: VaultRegistry;
  profile: VaultProfile;
  created: boolean;
}

export function normalizeVaultPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/');
  if (!normalized) return '';
  const root = /^[A-Za-z]:\/$/.test(normalized) || normalized === '/';
  return root ? normalized : normalized.replace(/\/+$/, '');
}

function pathKey(path: string): string {
  return normalizeVaultPath(path).toLocaleLowerCase();
}

function stableId(path: string): string {
  let hash = 2166136261;
  for (const char of pathKey(path)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `vault-${(hash >>> 0).toString(36)}`;
}

export function vaultNameFromPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  const name = normalized.split('/').filter(Boolean).at(-1);
  return name || normalized || '未命名库';
}

export function createEmptyVaultRegistry(): VaultRegistry {
  return { version: 1, activeId: null, vaults: [] };
}

export function normalizeVaultRegistry(raw: unknown): VaultRegistry {
  const source = raw && typeof raw === 'object' ? raw as Partial<VaultRegistry> : {};
  const seen = new Set<string>();
  const vaults: VaultProfile[] = [];
  for (const candidate of Array.isArray(source.vaults) ? source.vaults : []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Partial<VaultProfile>;
    const path = normalizeVaultPath(typeof item.path === 'string' ? item.path : '');
    const key = pathKey(path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const now = Date.now();
    vaults.push({
      id: typeof item.id === 'string' && item.id ? item.id : stableId(path),
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : vaultNameFromPath(path),
      path,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
      lastUsedAt: typeof item.lastUsedAt === 'number' ? item.lastUsedAt : now,
    });
  }
  const activeId = typeof source.activeId === 'string' && vaults.some((item) => item.id === source.activeId)
    ? source.activeId
    : (vaults[0]?.id ?? null);
  return { version: 1, activeId, vaults };
}

export function upsertVaultProfile(
  input: VaultRegistry,
  path: string,
  name?: string,
  now = Date.now(),
): VaultUpsertResult {
  const registry = normalizeVaultRegistry(input);
  const normalized = normalizeVaultPath(path);
  if (!normalized) throw new Error('库路径不能为空');
  const existing = registry.vaults.find((item) => pathKey(item.path) === pathKey(normalized));
  if (existing) {
    const profile = {
      ...existing,
      path: normalized,
      name: name?.trim() || existing.name || vaultNameFromPath(normalized),
      lastUsedAt: now,
    };
    const next = {
      ...registry,
      activeId: registry.activeId ?? profile.id,
      vaults: registry.vaults.map((item) => item.id === profile.id ? profile : item),
    };
    return { registry: next, profile, created: false };
  }
  const profile: VaultProfile = {
    id: stableId(normalized),
    name: name?.trim() || vaultNameFromPath(normalized),
    path: normalized,
    createdAt: now,
    lastUsedAt: now,
  };
  return {
    registry: { ...registry, activeId: registry.activeId ?? profile.id, vaults: [...registry.vaults, profile] },
    profile,
    created: true,
  };
}

export function activateVaultProfile(input: VaultRegistry, id: string, now = Date.now()): VaultRegistry {
  const registry = normalizeVaultRegistry(input);
  const selected = registry.vaults.find((item) => item.id === id);
  if (!selected) return registry;
  return {
    ...registry,
    activeId: id,
    vaults: registry.vaults.map((item) => item.id === id ? { ...item, lastUsedAt: now } : item),
  };
}

export function removeVaultProfile(input: VaultRegistry, id: string): VaultRegistry {
  const registry = normalizeVaultRegistry(input);
  const vaults = registry.vaults.filter((item) => item.id !== id);
  const activeId = registry.activeId === id ? (vaults[0]?.id ?? null) : registry.activeId;
  return { ...registry, activeId, vaults };
}
