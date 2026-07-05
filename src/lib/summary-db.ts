import type { SummaryItem, SummaryTemplate } from '@/types/summary';
import { openDB } from '@/lib/idb';

const SUMMARY_STORE = 'summaries';
const TEMPLATE_STORE = 'summaryTemplates';

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
