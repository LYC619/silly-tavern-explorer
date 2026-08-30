import { updateArchiveStory } from '@/lib/archive-db';
import { getAllSummaries, saveSummary } from '@/lib/summary-db';
import { getAllStoryTrees, saveStoryTree } from '@/lib/story-tree-db';
import type { ArchiveStory } from '@/types/archive';

/** Normalize a user-entered archive story title before passing it to the queued writer. */
export function normalizeStoryTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error('故事名称不能为空');
  return title;
}

/**
 * 改名是一个动作，一次改到位：故事标题 + 主线 session.title + 关联记录的反范式化 bookTitle。
 *
 * 必须连主线 session.title 一起写，否则故事工作区的「主线标题跟随」
 * （StoryWorkspace.handleSessionChange）会在下一次任意会话变更时把旧的 session.title
 * 当成用户新改的名字写回 story.title，改名被静默回滚。
 *
 * bookTitle 只改标题不动 updatedAt——否则改个故事名会让它名下所有总结/故事树
 * 都跳到「最近更新」顶部、时间显示成今天。
 */
export async function renameArchiveStory(id: string, rawTitle: string): Promise<void> {
  const title = normalizeStoryTitle(rawTitle);
  await updateArchiveStory(id, (current) => {
    const patch: Partial<ArchiveStory> = { title, updatedAt: Date.now() };
    // session 带上就会重写派生的 ST 工作版（聊天.jsonl），这是对的：导出文件名用的就是标题。
    if (current.session.title !== title) patch.session = { ...current.session, title };
    return patch;
  });
  const [summaries, trees] = await Promise.all([getAllSummaries(), getAllStoryTrees()]);
  await Promise.all([
    ...summaries
      .filter((summary) => summary.bookId === id && summary.bookTitle !== title)
      .map((summary) => saveSummary({ ...summary, bookTitle: title })),
    ...trees
      .filter((tree) => tree.bookId === id && tree.bookTitle !== title)
      .map((tree) => saveStoryTree({ ...tree, bookTitle: title })),
  ]);
}
