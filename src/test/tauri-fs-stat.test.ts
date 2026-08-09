import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriMocks.invoke,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

import { createTauriFs } from '@/lib/vault/tauri-fs';

describe('Tauri 文件系统状态转换', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把 Rust 的 is_dir 字段转换为前端使用的 isDir', async () => {
    tauriMocks.invoke.mockResolvedValue({ exists: true, is_dir: true });

    const stat = await createTauriFs('D:/vault').stat('');

    expect(tauriMocks.invoke).toHaveBeenCalledWith('vault_stat', {
      root: 'D:/vault',
      path: '',
    });
    expect(stat).toEqual({ exists: true, isDir: true });
  });
});
