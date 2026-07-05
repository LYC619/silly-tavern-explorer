import type { ChatSession, ChapterMarker, ExportSettings } from '@/types/chat';
import { openDB } from '@/lib/idb';

export interface BookItem {
  id: string;
  title: string;
  cover?: string; // base64 image
  session: ChatSession;
  markers: ChapterMarker[];
  settings?: ExportSettings;
  /** 收藏的楼层（messageId 列表，轻量书签，不进导出） */
  favorites?: string[];
  createdAt: number;
  updatedAt: number;
}

const STORE_NAME = 'books';

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
