import { buildCharacterFromCard } from '@/lib/archive-db';
import { applyCharacterTagPatch, applyCharacterTypePatch } from '@/lib/character-tag-domain';
import {
  addCustomCategory,
  addCustomTagDefinition,
  buildManagedTagOptions,
  type LibraryTagPreferences,
} from '@/lib/library-tag-preferences';
import {
  extractCharacterFromPngBuffer,
  parseCharacterCardJson,
  type STCharacterCard,
} from '@/lib/png-parser';
import { embedCharaInPng } from '@/lib/png-writer';
import { TAG_CATEGORIES, makeTag, validateUserTagInput, type TagCategory } from '@/lib/tag-taxonomy';
import type { ArchiveCharacter, CharacterType } from '@/types/archive';

export interface PreparedLibraryCharacterImport {
  fileName: string;
  kind: 'character-card' | 'blank-image';
  character: ArchiveCharacter;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function detectRasterImageMime(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
    || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

function stem(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.replace(/\.[^.]+$/, '').trim();
  return withoutExtension || '未命名角色';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  const direct = (file as File & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer;
  if (typeof direct === 'function') return direct.call(file);
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`无法读取文件：${file.name}`));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error(`无法读取文件：${file.name}`));
    };
    reader.readAsArrayBuffer(file);
  });
}

async function readFileText(file: File): Promise<string> {
  const direct = (file as File & { text?: () => Promise<string> }).text;
  if (typeof direct === 'function') return direct.call(file);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`无法读取文件：${file.name}`));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  });
}

async function readBlobBuffer(blob: Blob): Promise<ArrayBuffer> {
  const direct = (blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer;
  if (typeof direct === 'function') return direct.call(blob);
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('无法读取转换后的 PNG 图片'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('无法读取转换后的 PNG 图片'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function rasterImageToPng(buffer: ArrayBuffer, mime: string): Promise<ArrayBuffer> {
  const objectUrl = URL.createObjectURL(new Blob([buffer], { type: mime }));
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效');

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图片转换画布');
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('无法生成 PNG 图片'))),
        'image/png',
      );
    });
    return readBlobBuffer(png);
  } catch (error) {
    const reason = error instanceof Error ? `：${error.message}` : '';
    throw new Error(`图片内容无法转换为 PNG${reason}`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function createBlankImageCard(fileName: string): STCharacterCard {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: stem(fileName),
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
  };
}

function isMissingCardMetadata(error: unknown): boolean {
  return error instanceof Error && error.message.includes('缺少 chara / ccv3');
}

export async function prepareLibraryCharacterFile(file: File): Promise<PreparedLibraryCharacterImport> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.png')) {
    let buffer = await readFileBuffer(file);
    const actualMime = detectRasterImageMime(buffer);
    if (actualMime && actualMime !== 'image/png') {
      buffer = await rasterImageToPng(buffer, actualMime);
      const card = createBlankImageCard(file.name);
      const embedded = embedCharaInPng(buffer, card);
      return {
        fileName: file.name,
        kind: 'blank-image',
        character: buildCharacterFromCard(card, bytesToBase64(embedded)),
      };
    }
    try {
      const card = extractCharacterFromPngBuffer(buffer);
      return {
        fileName: file.name,
        kind: 'character-card',
        character: buildCharacterFromCard(card, bytesToBase64(new Uint8Array(buffer))),
      };
    } catch (error) {
      if (!isMissingCardMetadata(error)) throw error;
      const card = createBlankImageCard(file.name);
      const embedded = embedCharaInPng(buffer, card);
      return {
        fileName: file.name,
        kind: 'blank-image',
        character: buildCharacterFromCard(card, bytesToBase64(embedded)),
      };
    }
  }

  if (lowerName.endsWith('.json')) {
    const card = parseCharacterCardJson(await readFileText(file));
    return { fileName: file.name, kind: 'character-card', character: buildCharacterFromCard(card) };
  }

  throw new Error(`不支持的角色卡文件：${file.name}`);
}

export function registerLibraryImportCustomTag(
  preferences: LibraryTagPreferences,
  input: string,
): { preferences: LibraryTagPreferences; raw: string } {
  const value = input.trim();
  if (!value) throw new Error('自定义标签不能为空');

  const slash = value.indexOf('/');
  if (slash !== -1 && value.indexOf('/', slash + 1) !== -1) {
    throw new Error('自定义标签只支持“一级/二级”两层');
  }

  let category: TagCategory = '未分类';
  let label = value;
  if (slash > 0) {
    category = value.slice(0, slash).trim();
    label = value.slice(slash + 1).trim();
    if (!category || !label) throw new Error('请使用“一级/二级”格式填写自定义标签');
  }

  const raw = makeTag(category, label);
  const rejected = validateUserTagInput(raw);
  if (rejected) throw new Error(rejected);

  let next = preferences;
  if (category !== '未分类'
    && !(TAG_CATEGORIES as readonly string[]).includes(category)
    && !next.customCategories.includes(category)) {
    next = addCustomCategory(next, category);
  }

  const exists = buildManagedTagOptions([], next).some((option) => option.raw === raw);
  if (!exists) next = addCustomTagDefinition(next, category, label);
  return { preferences: next, raw };
}

export function applyLibraryImportTags(
  character: ArchiveCharacter,
  tags: Iterable<string>,
): ArchiveCharacter {
  const merged = [...new Set([...character.tags, ...tags])];
  return { ...character, ...applyCharacterTagPatch(character, { tags: merged }) };
}

export function applyLibraryImportType(
  character: ArchiveCharacter,
  type: CharacterType,
): ArchiveCharacter {
  return { ...character, ...applyCharacterTypePatch(character, type) };
}
