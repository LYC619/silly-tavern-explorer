import { describe, expect, it } from 'vitest';
import {
  buildCharacterExportFile,
  exportCharactersToDirectory,
} from '@/lib/character-batch-export';
import { createMemFs, type VaultFs } from '@/lib/vault/fs';
import type { ArchiveCharacter } from '@/types/archive';
import type { STCharacterCard } from '@/lib/png-parser';

const card = (name: string) => ({
  spec: 'chara_card_v2',
  data: { name },
}) as unknown as STCharacterCard;

function character(id: string, name: string, pngBase64?: string): ArchiveCharacter {
  return {
    id,
    name,
    card: card(name),
    pngBase64,
    tags: [],
    status: '未开始',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('character batch export', () => {
  it('原样导出 PNG 字节和 JSON 角色卡', async () => {
    const fs = createMemFs();
    const png = character('png', '卡面角色', 'aW1hZ2U=');
    const json = character('json', '文本角色');

    expect(buildCharacterExportFile(png)).toMatchObject({ extension: 'png', binaryBase64: 'aW1hZ2U=' });
    expect(buildCharacterExportFile(json)).toMatchObject({ extension: 'json' });

    const result = await exportCharactersToDirectory([png, json], fs);

    expect(result.failed).toEqual([]);
    expect(result.exported.map((item) => item.fileName)).toEqual(['卡面角色.png', '文本角色.json']);
    await expect(fs.readBinary('卡面角色.png')).resolves.toBe('aW1hZ2U=');
    await expect(fs.readText('文本角色.json')).resolves.toContain('"name": "文本角色"');
  });

  it('清理 Windows 非法字符，并避让已有文件与批内重名', async () => {
    const fs = createMemFs();
    await fs.writeText('角色.json', '已有');
    const result = await exportCharactersToDirectory([
      character('1', '角色', 'YQ=='),
      character('2', '角色'),
      character('3', '坏:/?*<>|"\u0001名'),
      character('4', 'CON'),
    ], fs);

    expect(result.failed).toEqual([]);
    expect(result.exported.map((item) => item.fileName)).toEqual([
      '角色·2.png',
      '角色·3.json',
      '坏________名.json',
      '未命名.json',
    ]);
  });

  it('单个写入失败时继续导出其余角色，并返回真实结果', async () => {
    const memory = createMemFs();
    const fs: VaultFs = {
      ...memory,
      writeText: async (path, content) => {
        if (path.startsWith('坏角色')) throw new Error('磁盘已满');
        await memory.writeText(path, content);
      },
    };

    const result = await exportCharactersToDirectory([
      character('bad', '坏角色'),
      character('good', '好角色'),
    ], fs);

    expect(result.exported).toEqual([{ id: 'good', fileName: '好角色.json' }]);
    expect(result.failed).toEqual([
      { id: 'bad', fileName: '坏角色.json', error: '磁盘已满' },
    ]);
    await expect(memory.readText('好角色.json')).resolves.toContain('好角色');
  });
});
