import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  exportTextFile,
  routeTextFileExportResult,
  type TextFileExportAdapters,
} from '@/lib/text-file-export';

describe('文本文件导出结果', () => {
  it('Tauri 客户端同时允许保存导出文件和打开 ZIP 导入选择器', () => {
    const capability = JSON.parse(readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'));
    expect(capability.permissions).toContain('dialog:allow-save');
    expect(capability.permissions).toContain('dialog:allow-open');
  });

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

  it('只把真实写入或下载视为完成，取消不产生任何反馈', () => {
    const onComplete = vi.fn();
    const onFailure = vi.fn();

    routeTextFileExportResult('cancelled', { onComplete, onFailure });
    expect(onComplete).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();

    routeTextFileExportResult('failed', { onComplete, onFailure });
    expect(onFailure).toHaveBeenCalledTimes(1);

    routeTextFileExportResult('saved', { onComplete, onFailure });
    routeTextFileExportResult('downloaded', { onComplete, onFailure });
    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});
