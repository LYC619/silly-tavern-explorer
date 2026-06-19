/**
 * IndexedDB storage management utilities
 */

import type { BookItem } from '@/lib/bookshelf-db';
import type { WorldBookItem } from '@/types/worldbook';

const DB_NAME = 'st-chat-beautifier';

/**
 * Estimate IndexedDB storage usage
 */
export async function estimateStorageUsage(): Promise<{
  used: number;
  quota: number;
  percentage: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
      percentage: estimate.quota ? Math.round(((estimate.usage || 0) / estimate.quota) * 100) : 0,
    };
  }
  return { used: 0, quota: 0, percentage: 0 };
}

/**
 * Export entire IndexedDB as a JSON file for backup.
 * 同时备份 books（聊天作品）和 worldbooks（世界书）两个 store，
 * 二者是独立的 object store，少备份任何一个都会造成"完整备份"名不副实的数据丢失。
 */
export async function exportFullBackup(): Promise<void> {
  const db = await openDB();

  const readAll = <T>(storeName: string) =>
    new Promise<T[]>((resolve, reject) => {
      // 某些旧库可能尚未建出 worldbooks store，缺失时返回空数组而非抛错
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });

  const [allBooks, allWorldbooks] = await Promise.all([
    readAll<BookItem>('books'),
    readAll<WorldBookItem>('worldbooks'),
  ]);

  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'silly-tavern-explorer',
    books: allBooks,
    worldbooks: allWorldbooks,
  };

  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stcb-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a backup JSON file into IndexedDB.
 * 兼容 v1 备份（只有 books）与 v2 备份（books + worldbooks）。
 * 返回写入的书籍数与世界书数。
 */
export async function importFullBackup(file: File): Promise<{ books: number; worldbooks: number }> {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data.app || data.app !== 'silly-tavern-explorer' || !Array.isArray(data.books)) {
    throw new Error('无效的备份文件格式');
  }

  const db = await openDB();

  const putAll = (storeName: string, items: unknown[], isValid: (item: Record<string, unknown>) => boolean) =>
    new Promise<number>((resolve, reject) => {
      if (!Array.isArray(items) || items.length === 0) {
        resolve(0);
        return;
      }
      if (!db.objectStoreNames.contains(storeName)) {
        resolve(0);
        return;
      }
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let count = 0;
      for (const item of items) {
        if (item && typeof item === 'object' && isValid(item as Record<string, unknown>)) {
          store.put(item);
          count++;
        }
      }
      tx.oncomplete = () => resolve(count);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

  const books = await putAll('books', data.books, (b) => !!b.id && !!b.session);
  // v1 备份没有 worldbooks 字段，putAll 会安全地返回 0
  const worldbooks = await putAll('worldbooks', data.worldbooks ?? [], (w) => !!w.id);

  return { books, worldbooks };
}

/**
 * Clear all data from IndexedDB（books + worldbooks 一并清空）
 */
export async function clearAllData(): Promise<void> {
  const db = await openDB();
  const clearStore = (storeName: string) =>
    new Promise<void>((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve();
        return;
      }
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  await Promise.all([clearStore('books'), clearStore('worldbooks')]);
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('books')) {
        const store = db.createObjectStore('books', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('title', 'title', { unique: false });
      }
      if (!db.objectStoreNames.contains('worldbooks')) {
        const wbStore = db.createObjectStore('worldbooks', { keyPath: 'id' });
        wbStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        wbStore.createIndex('title', 'title', { unique: false });
      }
    };
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
