import type { StoryTree } from '@/types/story-tree';
import { createIdbRepo, pruneAutoSaved } from '@/lib/repo/idb-repo';

const repo = createIdbRepo<StoryTree>('stories');

export async function getAllStoryTrees(): Promise<StoryTree[]> {
  return repo.list();
}

export async function getStoryTree(id: string): Promise<StoryTree | undefined> {
  return repo.get(id);
}

export async function saveStoryTree(item: StoryTree): Promise<void> {
  return repo.put(item);
}

export async function deleteStoryTree(id: string): Promise<void> {
  return repo.remove(id);
}

/**
 * 只保留最近 `keep` 份「自动暂存」(autoSaved) 的故事树，超出的按 updatedAt 由旧到新删除。
 * 手动保存(autoSaved 非 true)的不受影响。返回被删除的 id 数组。
 */
export async function pruneAutoSavedStoryTrees(keep = 5): Promise<string[]> {
  return pruneAutoSaved(repo, keep);
}
