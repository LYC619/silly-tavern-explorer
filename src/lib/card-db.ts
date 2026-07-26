import type { CardItem } from '@/types/character-card';
import { createIdbRepo, pruneAutoSaved } from '@/lib/repo/idb-repo';

const repo = createIdbRepo<CardItem>('cards');

export async function getAllCards(): Promise<CardItem[]> {
  return repo.list();
}

export async function getCard(id: string): Promise<CardItem | undefined> {
  return repo.get(id);
}

export async function saveCard(item: CardItem): Promise<void> {
  return repo.put(item);
}

export async function deleteCard(id: string): Promise<void> {
  return repo.remove(id);
}

/**
 * 只保留最近 `keep` 份「自动保留」(autoSaved) 的角色卡，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSavedCards(keep = 5): Promise<string[]> {
  return pruneAutoSaved(repo, keep);
}
