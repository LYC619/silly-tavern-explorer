import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultProfile, VaultRegistry } from '@/lib/vault/vault-registry';

const bootMocks = vi.hoisted(() => ({
  createTauriFs: vi.fn(),
  createVault: vi.fn((fs: unknown) => ({ fs })),
  hydrateApiProfilesFromSystem: vi.fn(),
  isTauri: vi.fn(() => true),
  loadVaultRegistry: vi.fn(),
  setActiveVault: vi.fn(),
  setCurrentVaultId: vi.fn(),
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
vi.mock('@/lib/vault/vault-scope', () => ({ setCurrentVaultId: bootMocks.setCurrentVaultId }));
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

    expect(bootMocks.setActiveVault).not.toHaveBeenCalled();
  });

  it('应用配置损坏时进入显式修复状态，而不是回到无法保存的选库死路', async () => {
    bootMocks.hydrateApiProfilesFromSystem.mockRejectedValueOnce(
      new Error('STE_CONFIG_INVALID:配置文件损坏'),
    );

    await expect(bootVault()).resolves.toBe('repair');

    expect(bootMocks.setActiveVault).not.toHaveBeenCalled();
  });
});

describe('按库作用域的启动接线', () => {
  it('先认库再恢复敏感配置：hydrate 要能读到「本库单独配置」', async () => {
    bootMocks.stat.mockResolvedValue({ exists: true, isDir: true });
    const order: string[] = [];
    bootMocks.setCurrentVaultId.mockImplementation(() => { order.push('scope'); });
    bootMocks.hydrateApiProfilesFromSystem.mockImplementation(async () => { order.push('hydrate'); });

    await expect(bootVault()).resolves.toBe('ready');

    expect(bootMocks.setCurrentVaultId).toHaveBeenCalledWith(profile.id);
    // 反过来的话 hydrate 拿不到库 id，只能读共享槽，「本库单独配置」永远不生效。
    expect(order).toEqual(['scope', 'hydrate']);
  });

  it('没有已激活的库时把作用域清空，不让偏好落到上一个库的键上', async () => {
    bootMocks.loadVaultRegistry.mockResolvedValue({ version: 1, activeId: null, vaults: [] });

    await expect(bootVault()).resolves.toBe('unset');

    expect(bootMocks.setCurrentVaultId).toHaveBeenCalledWith(null);
  });
});
