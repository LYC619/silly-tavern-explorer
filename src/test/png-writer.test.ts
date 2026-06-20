import { describe, it, expect } from 'vitest';
import { embedCharaInPng, __test } from '@/lib/png-writer';

const { extractChunks, crc32, textChunkKeyword } = __test;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** 用最小 chunk 拼一个合法 PNG 骨架（IHDR + IDAT + IEND），仅供测试 round-trip */
function makeMinimalPng(extraTextChunks: { keyword: string; value: string }[] = []): ArrayBuffer {
  const writeU32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  const strBytes = (s: string) => Array.from(s).map((c) => c.charCodeAt(0) & 0xff);
  const bytes: number[] = [...PNG_SIGNATURE];

  const pushChunk = (type: string, data: number[]) => {
    bytes.push(...writeU32(data.length));
    const typeBytes = strBytes(type);
    const crcInput = new Uint8Array([...typeBytes, ...data]);
    bytes.push(...typeBytes, ...data, ...writeU32(crc32(crcInput)));
  };

  pushChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]); // 1x1 RGBA
  pushChunk('IDAT', [0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01]); // 占位
  for (const t of extraTextChunks) {
    pushChunk('tEXt', [...strBytes(t.keyword), 0, ...strBytes(t.value)]);
  }
  pushChunk('IEND', []);

  return new Uint8Array(bytes).buffer;
}

/** 从写出的 PNG 里读回 chara JSON（对称解码：base64 → UTF-8） */
function readChara(png: Uint8Array): unknown {
  const chunks = extractChunks(png);
  const chara = chunks.find((c) => textChunkKeyword(c) === 'chara');
  if (!chara) return null;
  const sep = chara.data.indexOf(0);
  let v = '';
  for (let i = sep + 1; i < chara.data.length; i++) v += String.fromCharCode(chara.data[i]);
  const binary = atob(v);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

describe('embedCharaInPng', () => {
  it('embeds chara and reads back identical JSON', () => {
    const card = { spec: 'chara_card_v2', data: { name: 'Seraphina', description: 'hello' } };
    const out = embedCharaInPng(makeMinimalPng(), card);
    expect(readChara(out)).toEqual(card);
  });

  it('preserves UTF-8 / Chinese without corruption', () => {
    const card = { data: { name: '赛拉菲娜', description: '你好，旅行者。', personality: '温柔🌸' } };
    const out = embedCharaInPng(makeMinimalPng(), card);
    expect(readChara(out)).toEqual(card);
  });

  it('strips old chara AND ccv3 chunks (no stale data left)', () => {
    const png = makeMinimalPng([
      { keyword: 'chara', value: btoa('{"old":"chara"}') },
      { keyword: 'ccv3', value: btoa('{"old":"ccv3"}') },
    ]);
    const out = embedCharaInPng(png, { data: { name: 'New' } });
    const chunks = extractChunks(out);
    expect(chunks.filter((c) => textChunkKeyword(c) === 'chara')).toHaveLength(1);
    expect(chunks.filter((c) => textChunkKeyword(c) === 'ccv3')).toHaveLength(0);
    expect(readChara(out)).toEqual({ data: { name: 'New' } });
  });

  it('keeps IHDR/IDAT and IEND last', () => {
    const out = embedCharaInPng(makeMinimalPng(), { data: { name: 'X' } });
    const chunks = extractChunks(out);
    expect(chunks[0].type).toBe('IHDR');
    expect(chunks.some((c) => c.type === 'IDAT')).toBe(true);
    expect(chunks[chunks.length - 1].type).toBe('IEND');
  });

  it('produces valid CRCs (re-extract does not throw, signature intact)', () => {
    const out = embedCharaInPng(makeMinimalPng(), { data: { name: 'X' } });
    for (let i = 0; i < 8; i++) expect(out[i]).toBe(PNG_SIGNATURE[i]);
    expect(() => extractChunks(out)).not.toThrow();
  });

  it('throws on non-PNG input', () => {
    expect(() => embedCharaInPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer, {})).toThrow();
  });
});
