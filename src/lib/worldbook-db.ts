import type { WorldBookItem } from '@/types/worldbook';
import { openDB } from '@/lib/idb';

const STORE_NAME = 'worldbooks';

export async function getAllWorldBooks(): Promise<WorldBookItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result.sort((a: WorldBookItem, b: WorldBookItem) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getWorldBook(id: string): Promise<WorldBookItem | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWorldBook(item: WorldBookItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteWorldBook(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 只保留最近 `keep` 份「自动保留」(autoSaved) 的世界书，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSavedWorldBooks(keep = 5): Promise<string[]> {
  const all = await getAllWorldBooks(); // 已按 updatedAt 降序
  const auto = all.filter(i => i.autoSaved);
  const toDelete = auto.slice(keep); // 第 keep 份之后的（更旧的）
  await Promise.all(toDelete.map(i => deleteWorldBook(i.id)));
  return toDelete.map(i => i.id);
}
