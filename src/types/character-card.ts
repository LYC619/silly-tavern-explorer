import type { STCharacterCard } from '@/lib/png-parser';

/**
 * 持久化的角色卡记录（IndexedDB cards store）。
 * 仿 WorldBookItem/PresetItem 的 autoSaved 双轨设计。
 * pngBase64 存原图（不含 data: 前缀的纯 base64），以便保存后仍能导出 PNG；
 * 从 JSON 导入的卡无原图，该字段为空，只能导出 JSON。
 */
export interface CardItem {
  id: string;
  title: string;
  card: STCharacterCard;
  /** 原始 PNG 的 base64（纯数据，无 data:image/png;base64, 前缀）；JSON 导入的卡为 undefined */
  pngBase64?: string;
  createdAt: number;
  updatedAt: number;
  /** true=自动保留的导入历史(最近5份)；false/undefined=手动保存，永久留存 */
  autoSaved?: boolean;
}

export function generateCardId(): string {
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
