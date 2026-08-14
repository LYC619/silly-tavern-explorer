import { applyEditsToCard, type CardEdits } from '@/lib/card-export';
import type { ArchiveCharacter, DisplayMeta } from '@/types/archive';
import { embedCharaInPng, normalizeCharacterCard } from '@/lib/adapters/st';
import { base64ToBytes, bytesToBase64 } from '@/lib/utils';

/** 详情页保存 ST 卡字段：实际名称是卡片与 STE 档案的共同主名称。 */
export function applyCharacterPageCardEdits(
  character: ArchiveCharacter,
  edits: CardEdits,
): ArchiveCharacter {
  const name = edits.name.trim();
  if (!name) throw new Error('实际名称不能为空');
  const card = applyEditsToCard(character.card, {
    ...edits,
    name,
    // 空白备选开场白不写入卡片（编辑器里新增后未填写的行）。
    alternateGreetings: edits.alternateGreetings.filter((greeting) => greeting.trim() !== ''),
  });
  const normalized = normalizeCharacterCard(card);
  return {
    ...character,
    name,
    subtitle: normalized.creatorNotes.split('\n')[0]?.trim().slice(0, 80) || undefined,
    card,
    pngBase64: character.pngBase64
      ? bytesToBase64(embedCharaInPng(base64ToBytes(character.pngBase64).buffer as ArrayBuffer, card))
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
