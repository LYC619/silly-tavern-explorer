import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultProfile, VaultRegistry } from '@/lib/vault/vault-registry';

const storeMocks = vi.hoisted(() => ({
  getAppConfig: vi.fn(),
  getVaultRoot: vi.fn(),
  isTauri: vi.fn(() => true),
  setAppConfig: vi.fn(),
  setVaultRoot: vi.fn(),
}));

vi.mock('@/lib/vault/tauri-fs', () => storeMocks);

import { loadVaultRegistry } from '@/lib/vault/vault-registry-store';

const oldVault: VaultProfile = {
  id: 'old',
  name: '旧库',
  path: 'D:/vaults/old',
  createdAt: 1,
  lastUsedAt: 1,
};

const activeVault: VaultProfile = {
  id: 'active',
  name: '演示库',
  path: 'D:/vaults/demo',
  createdAt: 2,
  lastUsedAt: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.setVaultRoot.mockResolvedValue(undefined);
  storeMocks.setAppConfig.mockResolvedValue(undefined);
});

describe('文件库注册表兼容迁移', () => {
  it('已有有效注册表时以 activeId 为准，不被陈旧 vaultRoot 回滚', async () => {
    const registry: VaultRegistry = {
      version: 1,
      activeId: activeVault.id,
      vaults: [oldVault, activeVault],
    };
    storeMocks.getAppConfig.mockResolvedValue(registry);
    storeMocks.getVaultRoot.mockResolvedValue(oldVault.path);

    const loaded = await loadVaultRegistry();

    expect(loaded.activeId).toBe(activeVault.id);
    expect(loaded.vaults).toHaveLength(2);
    expect(storeMocks.setVaultRoot).toHaveBeenCalledWith(activeVault.path);
    expect(storeMocks.setAppConfig).not.toHaveBeenCalled();
  });

  it('没有可用注册表时才迁移旧版 vaultRoot', async () => {
    storeMocks.getAppConfig.mockResolvedValue(null);
    storeMocks.getVaultRoot.mockResolvedValue(oldVault.path);

    const loaded = await loadVaultRegistry();

    expect(loaded.vaults).toHaveLength(1);
    expect(loaded.activeId).toBe(loaded.vaults[0].id);
    expect(loaded.vaults[0].path).toBe(oldVault.path);
    expect(storeMocks.setAppConfig).toHaveBeenCalledWith('vaultRegistry', loaded);
  });

  it('旧版 vaultRoot 不是字符串时忽略并重建空注册表，而不是让选库页崩溃', async () => {
    storeMocks.getAppConfig.mockResolvedValue(null);
    storeMocks.getVaultRoot.mockResolvedValue(123);

    await expect(loadVaultRegistry()).resolves.toMatchObject({
      activeId: null,
      vaults: [],
    });
    expect(storeMocks.setAppConfig).toHaveBeenCalledWith('vaultRegistry', expect.objectContaining({
      activeId: null,
      vaults: [],
    }));
  });
});
