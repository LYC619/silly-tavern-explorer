import type { StoryTree } from '@/types/story-tree';
import { openDB } from '@/lib/idb';

const STORE = 'stories';

export async function getAllStoryTrees(): Promise<StoryTree[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoryTree[]).sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function getStoryTree(id: string): Promise<StoryTree | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveStoryTree(item: StoryTree): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteStoryTree(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * 只保留最近 `keep` 份「自动暂存」(autoSaved) 的故事树，超出的按 updatedAt 由旧到新删除。
 * 手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSavedStoryTrees(keep = 5): Promise<string[]> {
  const all = await getAllStoryTrees();
  const auto = all.filter((i) => i.autoSaved);
  const toDelete = auto.slice(keep);
  await Promise.all(toDelete.map((i) => deleteStoryTree(i.id)));
  return toDelete.map((i) => i.id);
}
