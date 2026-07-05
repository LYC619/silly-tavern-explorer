import type { CardItem } from '@/types/character-card';
import { openDB } from '@/lib/idb';

const STORE_NAME = 'cards';

export async function getAllCards(): Promise<CardItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const items = request.result.sort((a: CardItem, b: CardItem) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getCard(id: string): Promise<CardItem | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCard(item: CardItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCard(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 只保留最近 `keep` 份「自动保留」(autoSaved) 的角色卡，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSavedCards(keep = 5): Promise<string[]> {
  const all = await getAllCards();
  const auto = all.filter((i) => i.autoSaved);
  const toDelete = auto.slice(keep);
  await Promise.all(toDelete.map((i) => deleteCard(i.id)));
  return toDelete.map((i) => i.id);
}
