import type { AssetKind, ArchiveCharacter } from '@/types/archive';
import { switchAssetRef } from '@/lib/asset-cow';
import { updateCharacter } from '@/lib/archive-db';

/** 在角色写入队列内切换一条资产引用，避免 COW 保存用旧角色快照覆盖其他字段。 */
export async function updateCharacterAssetReference(
  characterId: string,
  kind: AssetKind,
  fromAssetId: string,
  toAssetId: string,
  updatedAt = Date.now(),
): Promise<ArchiveCharacter | undefined> {
  return updateCharacter(characterId, (current) => ({
    assets: switchAssetRef(current.assets, kind, fromAssetId, toAssetId),
    updatedAt,
  }));
}
