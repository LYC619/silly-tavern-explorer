import { describe, expect, it, vi } from 'vitest';
import { exportTextFile, type TextFileExportAdapters } from '@/lib/text-file-export';

describe('文本文件导出结果', () => {
  it('Web 模式触发下载并返回 downloaded', async () => {
    const download = vi.fn();
    const adapters: TextFileExportAdapters = { tauri: false, download };
    await expect(exportTextFile({ suggestedName: '卷:一.md', content: '正文' }, adapters)).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledWith('卷_一.md', '正文');
  });

  it('Tauri 模式区分保存和用户取消', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(exportTextFile({ suggestedName: '总结', content: '正文' }, {
      tauri: true,
      selectPath: vi.fn().mockResolvedValue('D:/out/总结.md'),
      writeText,
    })).resolves.toBe('saved');
    expect(writeText).toHaveBeenCalledWith('D:/out/总结.md', '正文');

    writeText.mockClear();
    await expect(exportTextFile({ suggestedName: '总结', content: '正文' }, {
      tauri: true,
      selectPath: vi.fn().mockResolvedValue(null),
      writeText,
    })).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('底层保存失败时返回 failed', async () => {
    await expect(exportTextFile({ suggestedName: '总结', content: '正文' }, {
      tauri: true,
      selectPath: vi.fn().mockResolvedValue('D:/out/总结.md'),
      writeText: vi.fn().mockRejectedValue(new Error('disk full')),
    })).resolves.toBe('failed');
  });
});
