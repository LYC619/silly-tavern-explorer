import type { ChatSession, ChapterMarker, ExportSettings } from '@/types/chat';
import { createIdbRepo } from '@/lib/repo/idb-repo';

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

const repo = createIdbRepo<BookItem>('books');

export async function getAllBooks(): Promise<BookItem[]> {
  return repo.list();
}

export async function getBook(id: string): Promise<BookItem | undefined> {
  return repo.get(id);
}

export async function saveBook(book: BookItem): Promise<void> {
  return repo.put(book);
}

export async function deleteBook(id: string): Promise<void> {
  return repo.remove(id);
}

export function generateBookId(): string {
  return `book_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
