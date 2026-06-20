import type { PresetItem } from '@/types/preset';

const DB_NAME = 'st-chat-beautifier';
const DB_VERSION = 4;
const STORE_NAME = 'presets';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('books')) {
          const store = db.createObjectStore('books', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('title', 'title', { unique: false });
        }
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('worldbooks')) {
          const wbStore = db.createObjectStore('worldbooks', { keyPath: 'id' });
          wbStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          wbStore.createIndex('title', 'title', { unique: false });
        }
      }

      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const pStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          pStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          pStore.createIndex('title', 'title', { unique: false });
        }
      }

      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('cards')) {
          const cStore = db.createObjectStore('cards', { keyPath: 'id' });
          cStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          cStore.createIndex('title', 'title', { unique: false });
        }
      }
    };
  });
}

export async function getAllPresets(): Promise<PresetItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result.sort((a: PresetItem, b: PresetItem) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPreset(id: string): Promise<PresetItem | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePreset(item: PresetItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deletePreset(id: string): Promise<void> {
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
 * 只保留最近 `keep` 份「自动保留」(autoSaved) 的预设，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSavedPresets(keep = 5): Promise<string[]> {
  const all = await getAllPresets(); // 已按 updatedAt 降序
  const auto = all.filter(i => i.autoSaved);
  const toDelete = auto.slice(keep);
  await Promise.all(toDelete.map(i => deletePreset(i.id)));
  return toDelete.map(i => i.id);
}
