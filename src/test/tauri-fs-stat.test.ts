import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriMocks.invoke,
}));

import { createTauriFs, pickDirectory } from '@/lib/vault/tauri-fs';

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

  it('把 Rust 的修改时间毫秒值映射到目录项', async () => {
    tauriMocks.invoke.mockResolvedValue([{
      name: '世界书.json',
      is_dir: false,
      is_symlink: false,
      size: 12,
      modified_at: 1_725_000_000_123,
    }]);

    const entries = await createTauriFs('D:/ST').list('worlds');

    expect(entries).toEqual([{
      name: '世界书.json',
      isDir: false,
      isSymlink: false,
      size: 12,
      modifiedAt: 1_725_000_000_123,
    }]);
  });

  it('目录选择由 Rust 完成，并只返回已加入授权集合的路径', async () => {
    tauriMocks.invoke.mockResolvedValue('D:/vaults/demo');

    await expect(pickDirectory('选择 STE 库')).resolves.toBe('D:/vaults/demo');

    expect(tauriMocks.invoke).toHaveBeenCalledWith('vault_pick_authorized_directory', {
      title: '选择 STE 库',
      persistent: false,
    });
  });
});
