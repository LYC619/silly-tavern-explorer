import { describe, expect, it } from 'vitest';
import { buildPresetSaveItem, buildWorldBookSaveItem } from '@/lib/asset-save-record';
import type { PresetItem } from '@/types/preset';
import type { WorldBookItem } from '@/types/worldbook';

const worldbook = { entries: { '1': { uid: 1, content: '旧' } } } as unknown as WorldBookItem['worldbook'];
const preset = {
  prompts: [], promptOrder: [], regexRules: [], hasRegexExtension: false, originalData: {},
} as PresetItem['preset'];

describe('普通资产保存记录', () => {
  it('世界书更新时保留完整来源与内嵌关系元数据', () => {
    const base = {
      id: 'wb-1', title: '旧名', worldbook, createdAt: 10, updatedAt: 20,
      sourcePath: 'D:/st/world.json', sourceModifiedAt: 30,
      embedded: { characterId: 'char-1', contentHash: 'hash', importedAt: 40 },
      stGlobal: true, stGlobalSources: ['D:/st/settings.json'],
    } satisfies WorldBookItem;

    const next = buildWorldBookSaveItem({ base, id: base.id, title: '新名', worldbook, now: 50 });

    expect(next).toMatchObject({
      id: 'wb-1', title: '新名', sourcePath: 'D:/st/world.json', sourceModifiedAt: 30,
      embedded: base.embedded, stGlobal: true, stGlobalSources: ['D:/st/settings.json'],
      createdAt: 10, updatedAt: 50, autoSaved: false,
    });
  });

  it('预设更新时保留来源路径与源文件修改时间', () => {
    const base = {
      id: 'preset-1', title: '旧名', preset, createdAt: 10, updatedAt: 20,
      sourcePath: 'D:/st/preset.json', sourceModifiedAt: 30,
    } satisfies PresetItem;

    const next = buildPresetSaveItem({ base, id: base.id, title: '新名', preset, now: 50 });

    expect(next).toMatchObject({
      id: 'preset-1', title: '新名', sourcePath: 'D:/st/preset.json', sourceModifiedAt: 30,
      createdAt: 10, updatedAt: 50, autoSaved: false,
    });
  });
});
