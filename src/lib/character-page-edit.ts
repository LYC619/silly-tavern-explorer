import { applyEditsToCard, type CardEdits } from '@/lib/card-export';
import type { ArchiveCharacter, DisplayMeta } from '@/types/archive';
import { normalizeCharacterCard } from '@/lib/png-parser';
import { embedCharaInPng } from '@/lib/png-writer';

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function arrayBufferToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 详情页保存 ST 卡字段：实际名称是卡片与 STE 档案的共同主名称。 */
export function applyCharacterPageCardEdits(
  character: ArchiveCharacter,
  edits: CardEdits,
): ArchiveCharacter {
  const name = edits.name.trim();
  if (!name) throw new Error('实际名称不能为空');
  const card = applyEditsToCard(character.card, { ...edits, name });
  const normalized = normalizeCharacterCard(card);
  return {
    ...character,
    name,
    subtitle: normalized.creatorNotes.split('\n')[0]?.trim().slice(0, 80) || undefined,
    card,
    pngBase64: character.pngBase64
      ? arrayBufferToBase64(embedCharaInPng(base64ToArrayBuffer(character.pngBase64), card).buffer as ArrayBuffer)
      : character.pngBase64,
    updatedAt: Date.now(),
  };
}

/** 详情页保存 STE 展示覆盖，不改写角色卡原始字段。 */
export function applyCharacterPageDisplayMeta(
  character: ArchiveCharacter,
  patch: Pick<DisplayMeta, 'name'>,
): ArchiveCharacter {
  const displayName = patch.name?.trim() || undefined;
  return {
    ...character,
    displayMeta: {
      ...character.displayMeta,
      name: displayName,
    },
    updatedAt: Date.now(),
  };
}
