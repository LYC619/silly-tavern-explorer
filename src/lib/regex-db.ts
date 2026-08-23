/**
 * 正则规则集资产的数据访问（2.0 阶段5，定稿第六/七章「规则入资产库」）。
 * 记录类型见 `@/types/regex`——放在那边是为了断开
 * regex-db → lib/repo → vault/active → vault-backend → regex-db 这条循环依赖。
 */
import type { RegexRule } from '@/types/chat';
import type { RegexCollectionItem } from '@/types/regex';
import { createRepo } from '@/lib/repo';

const repo = createRepo<RegexCollectionItem>('regexes');

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
