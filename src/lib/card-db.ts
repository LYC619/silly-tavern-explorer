import type { CardItem } from '@/types/character-card';

const DB_NAME = 'st-chat-beautifier';
const DB_VERSION = 6;
const STORE_NAME = 'cards';

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
        if (!db.objectStoreNames.contains('presets')) {
          const pStore = db.createObjectStore('presets', { keyPath: 'id' });
          pStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          pStore.createIndex('title', 'title', { unique: false });
        }
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const cStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          cStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          cStore.createIndex('title', 'title', { unique: false });
        }
      }
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains('summaries')) {
          const sStore = db.createObjectStore('summaries', { keyPath: 'id' });
          sStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          sStore.createIndex('title', 'title', { unique: false });
        }
        if (!db.objectStoreNames.contains('summaryTemplates')) {
          const stStore = db.createObjectStore('summaryTemplates', { keyPath: 'id' });
          stStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          stStore.createIndex('title', 'title', { unique: false });
        }
      }

      if (oldVersion < 6) {
        if (!db.objectStoreNames.contains('stories')) {
          const stoStore = db.createObjectStore('stories', { keyPath: 'id' });
          stoStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          stoStore.createIndex('title', 'title', { unique: false });
        }
      }
    };
  });
}

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
