import { describe, expect, it } from 'vitest';
import { buildAssetLibraryRows } from '@/lib/asset-library-rows';
import type { WorldBookItem } from '@/types/worldbook';
import type { PresetItem } from '@/types/preset';

const worldbook = (id: string, updatedAt: number, sourceModifiedAt: number): WorldBookItem => ({
  id,
  title: id,
  worldbook: { entries: {} },
  sourcePath: `D:/${id}.json`,
  sourceModifiedAt,
  createdAt: 1,
  updatedAt,
});

const preset = (id: string, updatedAt: number, sourceModifiedAt: number): PresetItem => ({
  id,
  title: id,
  preset: { prompts: [], promptOrder: [], regexRules: [], hasRegexExtension: false, originalData: {} },
  sourcePath: `D:/${id}.json`,
  sourceModifiedAt,
  createdAt: 1,
  updatedAt,
});

describe('附属库资产日期语义', () => {
  it('按 STE updatedAt 排序，并把源文件时间保留为独立溯源字段', () => {
    const rows = buildAssetLibraryRows({
      worldbooks: [worldbook('new-ste', 300, 10), worldbook('old-ste', 200, 999)],
      presets: [preset('preset-1', 250, 20)],
      regexes: [],
    });

    expect(rows.worldbook.map((row) => row.id)).toEqual(['new-ste', 'old-ste']);
    expect(rows.worldbook[0]).toMatchObject({ updatedAt: 300, sourceModifiedAt: 10 });
    expect(rows.worldbook[1]).toMatchObject({ updatedAt: 200, sourceModifiedAt: 999 });
    expect(rows.preset[0]).toMatchObject({ updatedAt: 250, sourceModifiedAt: 20 });
  });
});
