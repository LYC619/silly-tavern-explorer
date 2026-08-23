import type { PresetItem } from '@/types/preset';
import type { WorldBookItem } from '@/types/worldbook';

/**
 * 构造普通保存记录时以库内旧记录为基底，确保来源与关系元数据随编辑保留。
 * COW 的新副本另有意不继承来源字段；这里只服务于同一资产的普通更新。
 */
export function buildWorldBookSaveItem(params: {
  base?: WorldBookItem;
  id: string;
  title: string;
  worldbook: WorldBookItem['worldbook'];
  now: number;
}): WorldBookItem {
  const { base, id, title, worldbook, now } = params;
  return {
    ...(base ?? {}),
    id,
    title,
    worldbook,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    autoSaved: false,
  };
}

export function buildPresetSaveItem(params: {
  base?: PresetItem;
  id: string;
  title: string;
  preset: PresetItem['preset'];
  now: number;
}): PresetItem {
  const { base, id, title, preset, now } = params;
  return {
    ...(base ?? {}),
    id,
    title,
    preset,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    autoSaved: false,
  };
}
