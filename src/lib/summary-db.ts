import type { SummaryItem, SummaryTemplate } from '@/types/summary';
import { createRepo, pruneAutoSaved } from '@/lib/repo';

// ---------- summaries ----------

const summaryRepo = createRepo<SummaryItem>('summaries');

export async function getAllSummaries(): Promise<SummaryItem[]> {
  return summaryRepo.list();
}

export async function getSummary(id: string): Promise<SummaryItem | undefined> {
  return summaryRepo.get(id);
}

export async function saveSummary(item: SummaryItem): Promise<void> {
  return summaryRepo.put(item);
}

export async function deleteSummary(id: string): Promise<void> {
  return summaryRepo.remove(id);
}

/**
 * 只保留最近 `keep` 份「自动落库」(autoSaved) 的总结，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 * keep 默认 10（生成成本高，比 presets/cards 的 5 多留）。
 */
export async function pruneAutoSavedSummaries(keep = 10): Promise<string[]> {
  return pruneAutoSaved(summaryRepo, keep);
}

// ---------- summaryTemplates（自定义提示词模板；内置模板是常量见 summary-templates.ts） ----------

const templateRepo = createRepo<SummaryTemplate>('summaryTemplates');

export async function getAllSummaryTemplates(): Promise<SummaryTemplate[]> {
  return templateRepo.list();
}

export async function getSummaryTemplate(id: string): Promise<SummaryTemplate | undefined> {
  return templateRepo.get(id);
}

export async function saveSummaryTemplate(item: SummaryTemplate): Promise<void> {
  return templateRepo.put(item);
}

export async function deleteSummaryTemplate(id: string): Promise<void> {
  return templateRepo.remove(id);
}
