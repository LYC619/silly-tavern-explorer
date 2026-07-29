import type { StoryTree } from '@/types/story-tree';
import { createRepo } from '@/lib/repo';

const repo = createRepo<StoryTree>('stories');

export async function getAllStoryTrees(): Promise<StoryTree[]> {
  return repo.list();
}

export async function saveStoryTree(item: StoryTree): Promise<void> {
  return repo.put(item);
}

export async function deleteStoryTree(id: string): Promise<void> {
  return repo.remove(id);
}
