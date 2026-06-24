/**
 * 把角色卡 JSON 写回 PNG 的 tEXt chunk（PNG 回写）。
 *
 * 纯浏览器实现，零依赖：手写 PNG chunk extract/encode + CRC32。
 * 参考 _reference/projects/CardForge/web/src/utils/png-utils.js，并修正其只删 `chara`
 * 的疏漏——本实现剥离旧的 `chara` 和 `ccv3` 两种 keyword，避免新旧数据并存被读卡端读到旧的。
 *
 * 与 png-parser.ts 的读取对称：读用 readPngTextChunks(DataView)，写用本文件 encodeChunks。
 * UTF-8 安全：btoa(unescape(encodeURIComponent(...))) 写、TextDecoder('utf-8') 读，中文不乱码。
 */

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

interface PngChunk {
  type: string;
  data: Uint8Array;
}

function readUint32(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function writeUint32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function latin1ToBytes(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
  return arr;
}

function bytesToLatin1(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return s;
}

/** CRC32（标准 0xEDB88320 查表法） */
const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 从 PNG 二进制提取所有 chunk（不校验签名长度，调用方保证是 PNG） */
function extractChunks(data: Uint8Array): PngChunk[] {
  for (let i = 0; i < 8; i++) {
    if (data[i] !== PNG_SIGNATURE[i]) throw new Error('不是有效的 PNG 文件');
  }
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < data.length) {
    const length = readUint32(data, offset);
    const type = bytesToLatin1(data.slice(offset + 4, offset + 8));
    const chunkData = data.slice(offset + 8, offset + 8 + length);
    chunks.push({ type, data: chunkData });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

/** 把 chunk 列表编码回 PNG 二进制（每个 chunk 重算 CRC） */
function encodeChunks(chunks: PngChunk[]): Uint8Array {
  const parts: Uint8Array[] = [PNG_SIGNATURE];
  for (const chunk of chunks) {
    const typeBytes = latin1ToBytes(chunk.type);
    const crcInput = new Uint8Array(4 + chunk.data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(chunk.data, 4);
    parts.push(writeUint32(chunk.data.length), typeBytes, chunk.data, writeUint32(crc32(crcInput)));
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

/** 取 tEXt chunk 的 keyword（null 分隔前半段） */
function textChunkKeyword(chunk: PngChunk): string | null {
  if (chunk.type !== 'tEXt') return null;
  const sep = chunk.data.indexOf(0);
  if (sep === -1) return null;
  return bytesToLatin1(chunk.data.slice(0, sep));
}

/**
 * 把角色卡 JSON 写回 PNG，返回新的 PNG 字节。
 * 剥离原有 chara/ccv3 tEXt，写入新的 chara（V2 keyword，ST/V3 客户端均可读）。
 */
export function embedCharaInPng(originalPng: ArrayBuffer, cardJson: unknown): Uint8Array {
  const chunks = extractChunks(new Uint8Array(originalPng));

  // 移除旧的 chara / ccv3
  const filtered = chunks.filter((c) => {
    const kw = textChunkKeyword(c);
    return kw !== 'chara' && kw !== 'ccv3';
  });

  // 构造新 chara tEXt：keyword + \0 + base64(UTF-8 JSON)
  const jsonStr = JSON.stringify(cardJson);
  const base64Value = btoa(unescape(encodeURIComponent(jsonStr)));
  const keyword = latin1ToBytes('chara');
  const value = latin1ToBytes(base64Value);
  const charaData = new Uint8Array(keyword.length + 1 + value.length);
  charaData.set(keyword, 0);
  charaData[keyword.length] = 0;
  charaData.set(value, keyword.length + 1);

  // 插到 IEND 之前
  const iendIdx = filtered.findIndex((c) => c.type === 'IEND');
  const charaChunk: PngChunk = { type: 'tEXt', data: charaData };
  if (iendIdx !== -1) filtered.splice(iendIdx, 0, charaChunk);
  else filtered.push(charaChunk);

  return encodeChunks(filtered);
}

/** 生成可下载的 PNG Blob */
export function embedCharaInPngBlob(originalPng: ArrayBuffer, cardJson: unknown): Blob {
  return new Blob([embedCharaInPng(originalPng, cardJson) as BlobPart], { type: 'image/png' });
}

// 测试用导出（验证 round-trip）
export const __test = { extractChunks, encodeChunks, crc32, textChunkKeyword };
