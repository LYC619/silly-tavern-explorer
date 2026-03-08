import type { ChatSession, ChapterMarker, ExportSettings } from '@/types/chat';

export interface BookItem {
  id: string;
  title: string;
  cover?: string; // base64 image
  session: ChatSession;
  markers: ChapterMarker[];
  settings?: ExportSettings;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'st-chat-beautifier';
const DB_VERSION = 2;
const STORE_NAME = 'books';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('title', 'title', { unique: false });
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('worldbooks')) {
          const wbStore = db.createObjectStore('worldbooks', { keyPath: 'id' });
          wbStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          wbStore.createIndex('title', 'title', { unique: false });
        }
      }
    };
  });
}

export async function getAllBooks(): Promise<BookItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('updatedAt');
    const request = index.getAll();

    request.onsuccess = () => {
      // Sort by updatedAt descending
      const books = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(books);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getBook(id: string): Promise<BookItem | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBook(book: BookItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(book);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function generateBookId(): string {
  return `book_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
