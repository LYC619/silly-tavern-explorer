/**
 * IndexedDB storage management utilities
 */

import type { BookItem } from '@/lib/bookshelf-db';
import type { WorldBookItem } from '@/types/worldbook';
import type { PresetItem } from '@/types/preset';
import type { CardItem } from '@/types/character-card';
import type { SummaryItem, SummaryTemplate } from '@/types/summary';
import type { StoryTree } from '@/types/story-tree';
import { openDB, ALL_STORES, DB_VERSION } from '@/lib/idb';

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
 * 同时备份 books（聊天作品）、worldbooks（世界书）、presets（预设）、cards（角色卡）、
 * summaries（总结）、summaryTemplates（总结模板）六个 store，
 * 它们是独立的 object store，少备份任何一个都会造成"完整备份"名不副实的数据丢失。
 */
export async function exportFullBackup(): Promise<void> {
  const db = await openDB();

  const readAll = <T>(storeName: string) =>
    new Promise<T[]>((resolve, reject) => {
      // 某些旧库可能尚未建出 worldbooks/presets/cards/summaries store，缺失时返回空数组而非抛错
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });

  const [allBooks, allWorldbooks, allPresets, allCards, allSummaries, allSummaryTemplates, allStories] = await Promise.all([
    readAll<BookItem>('books'),
    readAll<WorldBookItem>('worldbooks'),
    readAll<PresetItem>('presets'),
    readAll<CardItem>('cards'),
    readAll<SummaryItem>('summaries'),
    readAll<SummaryTemplate>('summaryTemplates'),
    readAll<StoryTree>('stories'),
  ]);

  const backup = {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'silly-tavern-explorer',
    books: allBooks,
    worldbooks: allWorldbooks,
    presets: allPresets,
    cards: allCards,
    summaries: allSummaries,
    summaryTemplates: allSummaryTemplates,
    stories: allStories,
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
 * 兼容 v1(books)/v2(+worldbooks)/v3(+presets)/v4(+cards)/v5(+summaries/summaryTemplates) 备份。
 * 返回各类数据的写入条数。
 */
export async function importFullBackup(file: File): Promise<{
  books: number;
  worldbooks: number;
  presets: number;
  cards: number;
  summaries: number;
  summaryTemplates: number;
  stories: number;
}> {
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
  // v1/v2 备份没有 presets 字段，putAll 会安全地返回 0
  const presets = await putAll('presets', data.presets ?? [], (p) => !!p.id);
  // v1/v2/v3 备份没有 cards 字段，putAll 会安全地返回 0
  const cards = await putAll('cards', data.cards ?? [], (c) => !!c.id && !!c.card);
  // v1~v4 备份没有 summaries/summaryTemplates 字段，putAll 会安全地返回 0
  const summaries = await putAll('summaries', data.summaries ?? [], (s) => !!s.id && typeof s.content === 'string');
  const summaryTemplates = await putAll('summaryTemplates', data.summaryTemplates ?? [], (t) => !!t.id && typeof t.content === 'string');
  // v1~v5 备份没有 stories 字段，putAll 会安全地返回 0
  const stories = await putAll('stories', data.stories ?? [], (s) => !!s.id && Array.isArray(s.nodes));

  return { books, worldbooks, presets, cards, summaries, summaryTemplates, stories };
}

/**
 * Clear all data from IndexedDB（books + worldbooks + presets + cards + summaries + summaryTemplates 一并清空）
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
  await Promise.all(ALL_STORES.map((name) => clearStore(name)));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
