import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultProfile, VaultRegistry } from '@/lib/vault/vault-registry';

const bootMocks = vi.hoisted(() => ({
  createTauriFs: vi.fn(),
  createVault: vi.fn((fs: unknown) => ({ fs })),
  hydrateApiProfilesFromSystem: vi.fn(),
  isTauri: vi.fn(() => true),
  loadVaultRegistry: vi.fn(),
  setActiveVault: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('@/lib/vault/active', () => ({ setActiveVault: bootMocks.setActiveVault }));
vi.mock('@/lib/vault/vault-backend', () => ({ createVault: bootMocks.createVault }));
vi.mock('@/lib/vault/tauri-fs', () => ({
  createTauriFs: bootMocks.createTauriFs,
  isInvalidAppConfigError: (error: unknown) => String(error).includes('STE_CONFIG_INVALID:'),
  isTauri: bootMocks.isTauri,
}));
vi.mock('@/lib/vault/sensitive-config', () => ({
  hydrateApiProfilesFromSystem: bootMocks.hydrateApiProfilesFromSystem,
}));
vi.mock('@/lib/vault/vault-registry-runtime', () => ({
  chooseAndActivateVault: vi.fn(),
  loadVaultRegistry: bootMocks.loadVaultRegistry,
}));

import { bootVault } from '@/lib/vault/bootstrap';

const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => consoleWarn.mockRestore());

const profile: VaultProfile = {
  id: 'demo',
  name: '演示库',
  path: 'D:/vaults/demo',
  createdAt: 1,
  lastUsedAt: 1,
};

const registry: VaultRegistry = { version: 1, activeId: profile.id, vaults: [profile] };

beforeEach(() => {
  vi.clearAllMocks();
  bootMocks.createTauriFs.mockReturnValue({ stat: bootMocks.stat });
  bootMocks.loadVaultRegistry.mockResolvedValue(registry);
});

describe('文件库启动校验', () => {
  it.each([
    ['目录已不存在', { exists: false, isDir: false }],
    ['路径已变成普通文件', { exists: true, isDir: false }],
  ])('%s时回到选库引导，不激活失效后端', async (_label, stat) => {
    bootMocks.stat.mockResolvedValue(stat);

    await expect(bootVault()).resolves.toBe('unset');

    expect(bootMocks.setActiveVault).not.toHaveBeenCalled();
    expect(bootMocks.createVault).not.toHaveBeenCalled();
  });

  it('敏感配置恢复失败时也回到选库引导，而不是让门卫永远加载', async () => {
    bootMocks.hydrateApiProfilesFromSystem.mockRejectedValueOnce(new Error('配置读取失败'));

    await expect(bootVault()).resolves.toBe('unset');

    expect(bootMocks.loadVaultRegistry).not.toHaveBeenCalled();
    expect(bootMocks.setActiveVault).not.toHaveBeenCalled();
  });

  it('应用配置损坏时进入显式修复状态，而不是回到无法保存的选库死路', async () => {
    bootMocks.hydrateApiProfilesFromSystem.mockRejectedValueOnce(
      new Error('STE_CONFIG_INVALID:配置文件损坏'),
    );

    await expect(bootVault()).resolves.toBe('repair');

    expect(bootMocks.loadVaultRegistry).not.toHaveBeenCalled();
    expect(bootMocks.setActiveVault).not.toHaveBeenCalled();
  });
});
