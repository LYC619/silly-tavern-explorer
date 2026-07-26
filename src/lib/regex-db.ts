/**
 * 正则规则集资产（2.0 阶段5，定稿第六/七章「规则入资产库」）。
 * 一条资产 = 一套命名的规则集（RegexRule[]），与世界书/预设同级的独立资产，
 * 支持引用 + 写时复制（derived 字段）。当前编辑中的规则仍走 localStorage
 * （session-storage），资产库负责持久化收藏与跨角色共享。
 */
import type { RegexRule } from '@/types/chat';
import type { DerivedAssetMeta } from '@/types/archive';
import { createIdbRepo } from '@/lib/repo/idb-repo';

export interface RegexCollectionItem {
  id: string;
  title: string;
  rules: RegexRule[];
  /** 写时复制派生副本的元数据；无 = 原生资产 */
  derived?: DerivedAssetMeta;
  createdAt: number;
  updatedAt: number;
}

const repo = createIdbRepo<RegexCollectionItem>('regexes');

export async function getAllRegexCollections(): Promise<RegexCollectionItem[]> {
  return repo.list();
}

export async function getRegexCollection(id: string): Promise<RegexCollectionItem | undefined> {
  return repo.get(id);
}

export async function saveRegexCollection(item: RegexCollectionItem): Promise<void> {
  return repo.put(item);
}

export async function deleteRegexCollection(id: string): Promise<void> {
  return repo.remove(id);
}

export function generateRegexCollectionId(): string {
  return `regex_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 把当前规则集存为一条资产（深拷贝，后续编辑互不影响） */
export function buildRegexCollection(title: string, rules: RegexRule[]): RegexCollectionItem {
  const now = Date.now();
  return {
    id: generateRegexCollectionId(),
    title: title || '未命名规则集',
    rules: JSON.parse(JSON.stringify(rules)),
    createdAt: now,
    updatedAt: now,
  };
}
