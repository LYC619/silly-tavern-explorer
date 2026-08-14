import { describe, expect, it } from 'vitest';
import { editsFromNormalized, type CardEdits } from '@/lib/card-export';
import { extractCharacterFromPngBuffer, normalizeCharacterCard, type STCharacterCard } from '@/lib/png-parser';
import {
  applyCharacterPageCardEdits,
  applyCharacterPageDisplayMeta,
} from '@/lib/character-page-edit';
import type { ArchiveCharacter } from '@/types/archive';
import { embedCharaInPng, __test } from '@/lib/png-writer';

const raw: STCharacterCard = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '原始名',
    description: '旧描述',
    first_mes: '旧开场白',
    alternate_greetings: ['旧备选'],
  },
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function minimalPng(): ArrayBuffer {
  const writeU32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  const bytes: number[] = [...PNG_SIGNATURE];
  const chunk = (type: string, data: number[]) => {
    const typeBytes = [...type].map((char) => char.charCodeAt(0));
    bytes.push(...writeU32(data.length), ...typeBytes, ...data, ...writeU32(__test.crc32(new Uint8Array([...typeBytes, ...data]))));
  };
  chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  chunk('IDAT', [0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01]);
  chunk('IEND', []);
  return new Uint8Array(bytes).buffer;
}

function base64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function character(overrides: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return {
    id: 'c1',
    name: '原始名',
    card: raw,
    tags: [],
    status: '未开始',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('Character Page card editing', () => {
  it('实际名同时更新 ST 卡字段和档案主名称，保留本地展示名', () => {
    const edits: CardEdits = {
      ...editsFromNormalized(normalizeCharacterCard(raw)),
      name: '新实际名',
    };
    const out = applyCharacterPageCardEdits(character({ displayMeta: { name: '我的别名' } }), edits);

    expect(out.name).toBe('新实际名');
    expect(out.card.data?.name).toBe('新实际名');
    expect(out.displayMeta?.name).toBe('我的别名');
  });

  it('清空实际名时拒绝保存', () => {
    const edits = { ...editsFromNormalized(normalizeCharacterCard(raw)), name: '   ' };
    expect(() => applyCharacterPageCardEdits(character(), edits)).toThrow('实际名称不能为空');
  });

  it('实际名首尾空格在档案和卡内字段中同步去除', () => {
    const edits = { ...editsFromNormalized(normalizeCharacterCard(raw)), name: '  新实际名  ' };
    const out = applyCharacterPageCardEdits(character(), edits);

    expect(out.name).toBe('新实际名');
    expect(out.card.data?.name).toBe('新实际名');
  });

  it('保存时过滤空白备选开场白，不把空串写入卡片', () => {
    const edits = {
      ...editsFromNormalized(normalizeCharacterCard(raw)),
      alternateGreetings: ['新备选', '   ', ''],
    };
    const out = applyCharacterPageCardEdits(character(), edits);

    expect(out.card.data?.alternate_greetings).toEqual(['新备选']);
  });

  it('保存带 PNG 原图的卡时同步回写 chara 元数据', () => {
    const source = embedCharaInPng(minimalPng(), raw);
    const edits = { ...editsFromNormalized(normalizeCharacterCard(raw)), name: '新实际名', firstMessage: '新开场白' };
    const out = applyCharacterPageCardEdits(character({ pngBase64: base64(source.buffer as ArrayBuffer) }), edits);
    const decoded = atob(out.pngBase64!);
    const png = Uint8Array.from(decoded, (char) => char.charCodeAt(0)).buffer;
    const decodedCard = extractCharacterFromPngBuffer(png);
    expect(normalizeCharacterCard(decodedCard).name).toBe('新实际名');
    expect(decodedCard.data?.first_mes).toBe('新开场白');
  });

  it('展示名只更新 STE 本地元数据，不改实际名和卡内容', () => {
    const out = applyCharacterPageDisplayMeta(character(), { name: '列表别名' });

    expect(out.displayMeta?.name).toBe('列表别名');
    expect(out.name).toBe('原始名');
    expect(out.card.data?.name).toBe('原始名');
  });
});
