/**
 * IndexedDB storage management utilities
 */

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
 * Export entire IndexedDB as a JSON file for backup
 */
export async function exportFullBackup(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('books', 'readonly');
  const store = tx.objectStore('books');

  const allBooks = await new Promise<any[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'silly-tavern-explorer',
    books: allBooks,
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
 * Import a backup JSON file into IndexedDB
 */
export async function importFullBackup(file: File): Promise<number> {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data.app || data.app !== 'silly-tavern-explorer' || !Array.isArray(data.books)) {
    throw new Error('无效的备份文件格式');
  }

  const db = await openDB();
  const tx = db.transaction('books', 'readwrite');
  const store = tx.objectStore('books');

  let count = 0;
  for (const book of data.books) {
    if (book.id && book.session) {
      await new Promise<void>((resolve, reject) => {
        const req = store.put(book);
        req.onsuccess = () => { count++; resolve(); };
        req.onerror = () => reject(req.error);
      });
    }
  }

  return count;
}

/**
 * Clear all data from IndexedDB
 */
export async function clearAllData(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('books', 'readwrite');
  const store = tx.objectStore('books');
  await new Promise<void>((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('books')) {
        const store = db.createObjectStore('books', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('title', 'title', { unique: false });
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
