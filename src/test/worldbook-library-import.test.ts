import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readWorldBookUpload, worldBookItemFromUpload } from '@/lib/worldbook-file-import';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('世界书直接入库', () => {
  it('解析文件时保留源文件最后修改时间并用于新资产', async () => {
    const upload = await readWorldBookUpload({
      name: 'demo.json',
      lastModified: 1_725_000_000_123,
      text: async () => JSON.stringify({ entries: { 0: { uid: 0, content: '设定' } } }),
    });
    const item = worldBookItemFromUpload(upload, 2_000_000_000_000);

    expect(item.title).toBe('demo');
    expect(item.sourceModifiedAt).toBe(1_725_000_000_123);
    expect(item.createdAt).toBe(2_000_000_000_000);
    expect(item.updatedAt).toBe(2_000_000_000_000);
    expect(Object.keys(item.worldbook.entries)).toHaveLength(1);
  });

  it('附属库提供世界书直接导入，并显示源文件修改时间而非导入时间', () => {
    const library = read('src/pages/AssetLibrary.tsx');
    expect(library).toContain('导入世界书');
    expect(library).toContain('worldBookItemFromUpload');
    expect(library).toContain('sourceModifiedAt: w.sourceModifiedAt');
    expect(library).toContain("dateLabel: w.sourceModifiedAt !== undefined ? '源文件修改' : '最后修改'");
  });

  it('世界书编辑器继承应用可用高度，列表和编辑器各自滚动', () => {
    const page = read('src/pages/WorldBook.tsx');
    expect(page).toContain('bg-background flex h-full min-h-0 flex-col overflow-hidden');
    expect(page).toContain('flex-1 min-h-0 flex overflow-hidden');
    expect(page).not.toContain('h-[calc(100vh-3.5rem)]');
  });
});
