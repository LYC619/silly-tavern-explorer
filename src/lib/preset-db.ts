import type { PresetItem } from '@/types/preset';
import { createRepo, pruneAutoSaved } from '@/lib/repo';

const repo = createRepo<PresetItem>('presets');

export async function getAllPresets(): Promise<PresetItem[]> {
  return repo.list();
}

export async function getPreset(id: string): Promise<PresetItem | undefined> {
  return repo.get(id);
}

export async function savePreset(item: PresetItem): Promise<void> {
  return repo.put(item);
}

export async function deletePreset(id: string): Promise<void> {
  return repo.remove(id);
}

/**
 * 只保留最近 `keep` 份「自动保留」(autoSaved) 的预设，超出的按 updatedAt 由旧到新删除。
 * 用户手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSavedPresets(keep = 5): Promise<string[]> {
  return pruneAutoSaved(repo, keep);
}
