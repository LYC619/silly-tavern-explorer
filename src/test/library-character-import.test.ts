import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLibraryImportTags,
  applyLibraryImportType,
  createBlankImageCard,
  prepareLibraryCharacterFile,
  registerLibraryImportCustomTag,
} from '@/lib/library-character-import';
import { extractCharacterFromPngBuffer } from '@/lib/png-parser';
import { embedCharaInPng, __test } from '@/lib/png-writer';
import { normalizeLibraryTagPreferences } from '@/lib/library-tag-preferences';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function makeMinimalPng(): ArrayBuffer {
  const writeU32 = (value: number) => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
  const bytes: number[] = [...PNG_SIGNATURE];
  const pushChunk = (type: string, data: number[]) => {
    const typeBytes = [...type].map((char) => char.charCodeAt(0));
    bytes.push(
      ...writeU32(data.length),
      ...typeBytes,
      ...data,
      ...writeU32(__test.crc32(new Uint8Array([...typeBytes, ...data]))),
    );
  };
  pushChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  pushChunk('IDAT', [0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01]);
  pushChunk('IEND', []);
  return new Uint8Array(bytes).buffer;
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('library character import preparation', () => {
  it('用文件名创建字段完整的最小 V2 空白卡', () => {
    expect(createBlankImageCard('  演示角色.png  ')).toEqual({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: '演示角色',
        description: '',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        creator_notes: '',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        tags: [],
        creator: '',
        character_version: '1.0',
        extensions: {},
        character_book: null,
      },
    });
  });

  it('普通 PNG 自动写入 V2 元数据，并保存生成后的真角色卡图片', async () => {
    const prepared = await prepareLibraryCharacterFile(
      new File([makeMinimalPng()], '测试封面.png', { type: 'image/png' }),
    );

    expect(prepared.kind).toBe('blank-image');
    expect(prepared.character.name).toBe('测试封面');
    expect(prepared.character.pngBase64).toBeTruthy();
    expect(extractCharacterFromPngBuffer(decodeBase64(prepared.character.pngBase64!))).toMatchObject({
      spec: 'chara_card_v2',
      data: { name: '测试封面' },
    });
  });

  it('扩展名为 PNG 但实际为 JPEG 的图片会先转为 PNG，再创建空白卡', async () => {
    const convertedPng = makeMinimalPng();
    const originalCreateElement = document.createElement.bind(document);
    const drawImage = vi.fn();
    vi.stubGlobal('Image', class {
      naturalWidth = 1;
      naturalHeight = 1;
      src = '';
      decode = vi.fn().mockResolvedValue(undefined);
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:converted-image'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: BlobCallback) => callback(
          new Blob([convertedPng], { type: 'image/png' }),
        ),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);

    const jpegBytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
    ]);
    const prepared = await prepareLibraryCharacterFile(
      new File([jpegBytes.buffer as ArrayBuffer], 'card_03_conquer.png', { type: 'image/png' }),
    );

    expect(prepared.kind).toBe('blank-image');
    expect(prepared.character.name).toBe('card_03_conquer');
    expect(drawImage).toHaveBeenCalledOnce();
    expect(extractCharacterFromPngBuffer(decodeBase64(prepared.character.pngBase64!))).toMatchObject({
      spec: 'chara_card_v2',
      data: { name: 'card_03_conquer' },
    });
  });

  it('扩展名为 PNG 的未知或损坏内容仍拒绝导入', async () => {
    const broken = new File(
      [new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer as ArrayBuffer],
      '损坏.png',
      { type: 'image/png' },
    );

    await expect(prepareLibraryCharacterFile(broken)).rejects.toThrow('不是有效的 PNG 文件');
  });

  it('已有角色元数据的 PNG 保持原卡，不误判为空白图片', async () => {
    const card = createBlankImageCard('已有卡.png');
    const png = embedCharaInPng(makeMinimalPng(), card);
    const prepared = await prepareLibraryCharacterFile(
      new File([new Uint8Array(png).buffer as ArrayBuffer], '已有卡.png', { type: 'image/png' }),
    );

    expect(prepared.kind).toBe('character-card');
    expect(prepared.character.card).toEqual(card);
  });

  it('自定义“一级/二级”标签会注册新分类，未分类标签保持扁平格式', () => {
    const base = normalizeLibraryTagPreferences(undefined);
    const nested = registerLibraryImportCustomTag(base, '历史/三国');
    expect(nested.raw).toBe('历史/三国');
    expect(nested.preferences.customCategories).toContain('历史');
    expect(nested.preferences.customTags).toContain('历史/三国');

    const loose = registerLibraryImportCustomTag(nested.preferences, '收藏');
    expect(loose.raw).toBe('收藏');
    expect(loose.preferences.customTags).toContain('收藏');
  });

  it('自定义标签拒绝「类型」保留字与评价档位，非档位的评价标签放行', () => {
    const base = normalizeLibraryTagPreferences(undefined);
    expect(() => registerLibraryImportCustomTag(base, '类型/男性向')).toThrow('类型');
    expect(() => registerLibraryImportCustomTag(base, '类型')).toThrow('类型');
    expect(() => registerLibraryImportCustomTag(base, '评价/神作')).toThrow('评分');

    const custom = registerLibraryImportCustomTag(base, '评价/补档');
    expect(custom.raw).toBe('评价/补档');
    expect(custom.preferences.customTags).toContain('评价/补档');
  });

  it('导入标签写入 STE 本地标签并去重，不改角色卡内嵌 tags', () => {
    const card = createBlankImageCard('卡.png');
    const prepared = applyLibraryImportTags({
      id: 'c1',
      name: '卡',
      card,
      tags: ['人物/少女'],
      status: '未开始',
      createdAt: 1,
      updatedAt: 1,
    }, ['人物/少女', '剧情/历史']);

    expect(prepared.tags).toEqual(['人物/少女', '剧情/历史']);
    expect(prepared.card.data?.tags).toEqual([]);
  });

  it('导入类型写入互斥字段，并清理旧版类型标签', () => {
    const card = createBlankImageCard('卡.png');
    const prepared = applyLibraryImportType({
      id: 'c1',
      name: '卡',
      card,
      tags: ['类型/人物', '剧情/历史'],
      status: '未开始',
      createdAt: 1,
      updatedAt: 1,
    }, '剧情');

    expect(prepared.type).toBe('剧情');
    expect(prepared.tags).toEqual(['剧情/历史']);
  });
});
