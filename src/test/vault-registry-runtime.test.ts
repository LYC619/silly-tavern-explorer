import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultProfile, VaultRegistry } from '@/lib/vault/vault-registry';

const runtimeMocks = vi.hoisted(() => ({
  createTauriFs: vi.fn(),
  createVault: vi.fn((fs: unknown) => ({ fs })),
  isTauri: vi.fn(() => true),
  loadVaultRegistry: vi.fn(),
  persistVaultRegistry: vi.fn(),
  pickDirectory: vi.fn(),
  setActiveVault: vi.fn(),
  setVaultRoot: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('@/lib/vault/tauri-fs', () => ({
  createTauriFs: runtimeMocks.createTauriFs,
  isTauri: runtimeMocks.isTauri,
  pickDirectory: runtimeMocks.pickDirectory,
  setVaultRoot: runtimeMocks.setVaultRoot,
}));

vi.mock('@/lib/vault/vault-backend', () => ({
  createVault: runtimeMocks.createVault,
}));

vi.mock('@/lib/vault/active', () => ({
  setActiveVault: runtimeMocks.setActiveVault,
}));

vi.mock('@/lib/vault/vault-registry-store', () => ({
  loadVaultRegistry: runtimeMocks.loadVaultRegistry,
  persistVaultRegistry: runtimeMocks.persistVaultRegistry,
  VAULT_CHANGED_EVENT: 'ste-vault-changed',
}));

import * as runtime from '@/lib/vault/vault-registry-runtime';

type RuntimeHandoffApi = typeof runtime & {
  selectRegisteredVaultForNextBoot: (id: string) => Promise<VaultProfile | null>;
  chooseVaultForNextBoot: () => Promise<VaultProfile | null>;
};

const handoffRuntime = runtime as RuntimeHandoffApi;

const oldVault: VaultProfile = {
  id: 'old',
  name: '私人库',
  path: 'D:/vaults/private',
  createdAt: 1,
  lastUsedAt: 1,
};

const demoVault: VaultProfile = {
  id: 'demo',
  name: '演示库',
  path: 'D:/vaults/demo',
  createdAt: 2,
  lastUsedAt: 2,
};

function registry(vaults = [oldVault, demoVault], activeId: string | null = oldVault.id): VaultRegistry {
  return { version: 1, activeId, vaults };
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeMocks.createTauriFs.mockImplementation((path: string) => ({ path, stat: runtimeMocks.stat }));
  runtimeMocks.loadVaultRegistry.mockResolvedValue(registry());
  runtimeMocks.stat.mockResolvedValue({ exists: true, isDir: true });
});

describe('运行中切换文件库', () => {
  it('只持久化下一次启动目标，不改变旧页面正在使用的后端', async () => {
    const selectForNextBoot = handoffRuntime.selectRegisteredVaultForNextBoot;
    expect(selectForNextBoot).toBeTypeOf('function');

    const selected = await selectForNextBoot(demoVault.id);

    expect(selected).toMatchObject({ id: demoVault.id, path: demoVault.path });
    expect(runtimeMocks.createTauriFs).toHaveBeenCalledWith(demoVault.path);
    expect(runtimeMocks.stat).toHaveBeenCalledWith('');
    expect(runtimeMocks.setVaultRoot).toHaveBeenCalledWith(demoVault.path);
    expect(runtimeMocks.persistVaultRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ activeId: demoVault.id }),
    );
    expect(runtimeMocks.setVaultRoot.mock.invocationCallOrder[0])
      .toBeLessThan(runtimeMocks.persistVaultRegistry.mock.invocationCallOrder[0]);
    expect(runtimeMocks.setActiveVault).not.toHaveBeenCalled();
    expect(runtimeMocks.createVault).not.toHaveBeenCalled();
  });

  it.each([
    ['不存在', { exists: false, isDir: false }],
    ['不是文件夹', { exists: true, isDir: false }],
  ])('在已注册路径%s时拒绝切换且不修改配置', async (_label, stat) => {
    runtimeMocks.stat.mockResolvedValue(stat);
    const selectForNextBoot = handoffRuntime.selectRegisteredVaultForNextBoot;
    expect(selectForNextBoot).toBeTypeOf('function');

    await expect(selectForNextBoot(demoVault.id)).rejects.toThrow(/文件库|文件夹/);

    expect(runtimeMocks.setVaultRoot).not.toHaveBeenCalled();
    expect(runtimeMocks.persistVaultRegistry).not.toHaveBeenCalled();
    expect(runtimeMocks.setActiveVault).not.toHaveBeenCalled();
  });

  it('新增文件库时也只准备下一次启动，不污染当前页面', async () => {
    runtimeMocks.loadVaultRegistry.mockResolvedValue(registry([oldVault]));
    runtimeMocks.pickDirectory.mockResolvedValue(demoVault.path);
    const chooseForNextBoot = handoffRuntime.chooseVaultForNextBoot;
    expect(chooseForNextBoot).toBeTypeOf('function');

    const selected = await chooseForNextBoot();

    expect(selected?.path).toBe(demoVault.path);
    expect(runtimeMocks.persistVaultRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ activeId: selected?.id }),
    );
    expect(runtimeMocks.setActiveVault).not.toHaveBeenCalled();
  });
});

describe('首次选择文件库', () => {
  it('完成路径校验后仍立即激活后端供 VaultGate 放行', async () => {
    runtimeMocks.loadVaultRegistry.mockResolvedValue(registry([] , null));

    const selected = await runtime.registerAndActivateVault(demoVault.path, demoVault.name);

    expect(selected.path).toBe(demoVault.path);
    expect(runtimeMocks.stat).toHaveBeenCalledWith('');
    expect(runtimeMocks.createVault).toHaveBeenCalled();
    expect(runtimeMocks.setActiveVault).toHaveBeenCalled();
  });
});
