import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bootVault: vi.fn(),
  chooseVaultRoot: vi.fn(),
  repairAppConfig: vi.fn(),
}));

vi.mock('@/lib/vault/bootstrap', () => ({
  bootVault: mocks.bootVault,
  chooseVaultRoot: mocks.chooseVaultRoot,
}));

vi.mock('@/lib/vault/tauri-fs', () => ({
  isInvalidAppConfigError: (error: unknown) => String(error).includes('STE_CONFIG_INVALID:'),
  repairAppConfig: mocks.repairAppConfig,
}));

import { VaultGate } from '@/components/vault/VaultGate';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.bootVault.mockResolvedValue('repair');
  mocks.repairAppConfig.mockResolvedValue('C:/AppData/config.invalid-1.json');
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('VaultGate config recovery', () => {
  it('backs up the damaged config before returning to library selection', async () => {
    await act(async () => {
      root.render(<VaultGate><span>应用内容</span></VaultGate>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('应用配置需要修复');
    const repairButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('备份并修复配置'));
    expect(repairButton).toBeDefined();

    await act(async () => {
      repairButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.repairAppConfig).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('选择你的 STE 库文件夹');
    expect(container.textContent).toContain('config.invalid-1.json');
    expect(container.textContent).not.toContain('应用内容');
  });

  it('does not expose the internal config error prefix when choosing a library fails', async () => {
    mocks.bootVault.mockResolvedValue('unset');
    mocks.chooseVaultRoot.mockRejectedValueOnce(new Error('STE_CONFIG_INVALID:配置文件损坏'));

    await act(async () => {
      root.render(<VaultGate><span>应用内容</span></VaultGate>);
      await Promise.resolve();
    });

    const chooseButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('选择文件夹'));
    expect(chooseButton).toBeDefined();

    await act(async () => {
      chooseButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('应用配置需要修复');
    expect(container.textContent).toContain('应用配置仍然损坏');
    expect(container.textContent).not.toContain('STE_CONFIG_INVALID:');
  });
});
