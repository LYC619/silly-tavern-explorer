import type { SummaryItem, SummaryTemplate } from '@/types/summary';

const DB_NAME = 'st-chat-beautifier';
const DB_VERSION = 5;
const SUMMARY_STORE = 'summaries';
const TEMPLATE_STORE = 'summaryTemplates';

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
        if (!db.objectStoreNames.contains('cards')) {
          const cStore = db.createObjectStore('cards', { keyPath: 'id' });
          cStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          cStore.createIndex('title', 'title', { unique: false });
        }
      }

      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
          const sStore = db.createObjectStore(SUMMARY_STORE, { keyPath: 'id' });
          sStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          sStore.createIndex('title', 'title', { unique: false });
        }
        if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
          const tStore = db.createObjectStore(TEMPLATE_STORE, { keyPath: 'id' });
          tStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          tStore.createIndex('title', 'title', { unique: false });
        }
      }
    };
  });
}

// ---------- summaries ----------

export async function getAllSummaries(): Promise<SummaryItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUMMARY_STORE, 'readonly');
    const request = tx.objectStore(SUMMARY_STORE).getAll();
    request.onsuccess = () => {
      const items = request.result.sort((a: SummaryItem, b: SummaryItem) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getSummary(id: string): Promise<SummaryItem | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUMMARY_STORE, 'readonly');
    const request = tx.objectStore(SUMMARY_STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSummary(item: SummaryItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUMMARY_STORE, 'readwrite');
    const request = tx.objectStore(SUMMARY_STORE).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSummary(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUMMARY_STORE, 'readwrite');
    const request = tx.objectStore(SUMMARY_STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 只保留最近 `keep` 份「自动落库」(autoSaved) 的总结，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 * keep 默认 10（生成成本高，比 presets/cards 的 5 多留）。
 */
export async function pruneAutoSavedSummaries(keep = 10): Promise<string[]> {
  const all = await getAllSummaries(); // 已按 updatedAt 降序
  const auto = all.filter((i) => i.autoSaved);
  const toDelete = auto.slice(keep);
  await Promise.all(toDelete.map((i) => deleteSummary(i.id)));
  return toDelete.map((i) => i.id);
}

// ---------- summaryTemplates（自定义提示词模板；内置模板是常量见 summary-templates.ts） ----------

export async function getAllSummaryTemplates(): Promise<SummaryTemplate[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readonly');
    const request = tx.objectStore(TEMPLATE_STORE).getAll();
    request.onsuccess = () => {
      const items = request.result.sort((a: SummaryTemplate, b: SummaryTemplate) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getSummaryTemplate(id: string): Promise<SummaryTemplate | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readonly');
    const request = tx.objectStore(TEMPLATE_STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSummaryTemplate(item: SummaryTemplate): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readwrite');
    const request = tx.objectStore(TEMPLATE_STORE).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSummaryTemplate(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readwrite');
    const request = tx.objectStore(TEMPLATE_STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
