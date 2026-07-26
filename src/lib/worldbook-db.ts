import type { WorldBookItem } from '@/types/worldbook';
import { createRepo, pruneAutoSaved } from '@/lib/repo';

const repo = createRepo<WorldBookItem>('worldbooks');

export async function getAllWorldBooks(): Promise<WorldBookItem[]> {
  return repo.list();
}

export async function getWorldBook(id: string): Promise<WorldBookItem | undefined> {
  return repo.get(id);
}

export async function saveWorldBook(item: WorldBookItem): Promise<void> {
  return repo.put(item);
}

export async function deleteWorldBook(id: string): Promise<void> {
  return repo.remove(id);
}

/**
 * 只保留最近 `keep` 份「自动保留」(autoSaved) 的世界书，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSavedWorldBooks(keep = 5): Promise<string[]> {
  return pruneAutoSaved(repo, keep);
}
