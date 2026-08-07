/**
 * 独立资产写时复制（Copy-on-Write，2.0 阶段5，定稿第七章）。
 *
 * 规则：在某角色上下文中修改引用资产时——原资产不变；生成派生副本，命名
 * `原资产名_角色卡名`；记录 derivedFrom / characterId / 时间；该角色的引用切到
 * 副本；后续修改更新同一副本，不重复新建。其他引用者不受影响。
 *
 * 本模块只做纯决策与数据变换，不碰存储；世界书/预设/正则三类资产共用。
 */
import type { AssetKind, AssetRef, DerivedAssetMeta } from '@/types/archive';

/** 三类资产条目的公共形状（WorldBookItem / PresetItem / RegexCollectionItem 均满足） */
export interface CowAssetLike {
  id: string;
  title: string;
  derived?: DerivedAssetMeta;
}

export type CowPlan =
  /** 原地更新：无角色上下文，或该资产本就是当前角色的派生副本 */
  | { action: 'update'; targetId: string }
  /** 该角色此前已为这份原资产建过副本 → 更新那个副本（不重复新建） */
  | { action: 'redirect'; targetId: string; targetTitle: string }
  /** 首次在该角色上下文修改共享资产 → 生成派生副本 */
  | { action: 'copy'; copyTitle: string; derivedFrom: string };

/**
 * 决定「在角色上下文里保存这份资产」应该落到哪里。
 * @param asset 正在编辑的资产（保存前的库内版本）
 * @param characterId 角色上下文；空 = 独立编辑，直接原地保存
 * @param characterName 用于副本命名
 * @param allAssets 同类资产全集（查找既有派生副本）
 */
export function planCowSave(
  asset: CowAssetLike,
  characterId: string | undefined,
  characterName: string,
  allAssets: CowAssetLike[],
): CowPlan {
  if (!characterId) {
    return { action: 'update', targetId: asset.id };
  }
  // 本就是该角色的派生副本 → 继续更新同一副本
  if (asset.derived?.characterId === characterId) {
    return { action: 'update', targetId: asset.id };
  }
  // 该角色此前已从这份原资产派生过副本 → 更新那个副本
  const existingCopy = allAssets.find(
    (a) => a.derived?.derivedFrom === asset.id && a.derived.characterId === characterId,
  );
  if (existingCopy) {
    return { action: 'redirect', targetId: existingCopy.id, targetTitle: existingCopy.title };
  }
  // 首次修改共享资产 → 派生副本
  return {
    action: 'copy',
    copyTitle: `${asset.title}_${characterName}`,
    derivedFrom: asset.id,
  };
}

/** 生成派生副本的元数据 */
export function buildDerivedMeta(derivedFrom: string, characterId: string): DerivedAssetMeta {
  const now = Date.now();
  return { derivedFrom, characterId, diverged: true, createdAt: now, updatedAt: now };
}

/**
 * 把角色的某条资产引用从 fromId 切到 toId（写时复制后的引用切换）。
 * fromId 不在引用里时追加 toId（角色第一次通过工具处理该资产）；已指向 toId 则原样返回。
 */
export function switchAssetRef(
  refs: AssetRef[] | undefined,
  kind: AssetKind,
  fromId: string,
  toId: string,
): AssetRef[] {
  const list = refs ?? [];
  const source = list.find((r) => r.kind === kind && r.assetId === fromId);
  const target = list.find((r) => r.kind === kind && r.assetId === toId);
  if (target) {
    const relations = [...new Set([...(target.relations ?? []), ...(source?.relations ?? [])])];
    return list
      .filter((r) => !(r.kind === kind && r.assetId === fromId && fromId !== toId))
      .map((r) => (r === target && relations.length > 0 ? { ...r, relations } : r));
  }
  const idx = list.findIndex((r) => r.kind === kind && r.assetId === fromId);
  if (idx === -1) return [...list, { kind, assetId: toId }];
  return list.map((r, i) => (i === idx ? { ...r, assetId: toId } : r));
}

/** 资产引用的增删（角色页关联资产区用） */
export function addAssetRef(refs: AssetRef[] | undefined, kind: AssetKind, assetId: string): AssetRef[] {
  const list = refs ?? [];
  if (list.some((r) => r.kind === kind && r.assetId === assetId)) return list;
  return [...list, { kind, assetId }];
}

export function removeAssetRef(refs: AssetRef[] | undefined, kind: AssetKind, assetId: string): AssetRef[] {
  return (refs ?? []).filter((r) => !(r.kind === kind && r.assetId === assetId));
}
