/**
 * 「未绑定 → 绑定到角色」升级流程（2.0 阶段2，定稿第六章）。
 * 聊天处理页里的临时记录随时可绑定角色卡：原地升级为归档故事，
 * 未绑定期间生成的总结/故事树成果带走（重指到新故事 id），书架副本删除。
 */
import type { ArchiveStory } from '@/types/archive';
import type { ChatSession, ChapterMarker, ExportSettings } from '@/types/chat';
import { buildStoryFromSession, saveArchiveStory, repointForBind } from '@/lib/archive-db';
import { getAllSummaries, saveSummary } from '@/lib/summary-db';
import { getAllStoryTrees, saveStoryTree } from '@/lib/story-tree-db';
import { deleteBook } from '@/lib/bookshelf-db';

export interface BindArgs {
  characterId: string;
  session: ChatSession;
  markers: ChapterMarker[];
  favorites: string[];
  settings?: ExportSettings;
  /** 导入时自动存的书架书 id；有则迁移其总结/故事树并删除书架副本 */
  bookId: string | null;
}

/** 执行绑定，返回新建的归档故事。返回值里带上迁移条数，供 toast 用一句话交代。 */
export async function bindSessionToCharacter(args: BindArgs): Promise<{ story: ArchiveStory; carried: number }> {
  const story = buildStoryFromSession(args.session, args.characterId);
  story.markers = args.markers;
  story.favorites = args.favorites;
  story.settings = args.settings;
  await saveArchiveStory(story);

  let carried = 0;
  if (args.bookId) {
    const [summaries, trees] = await Promise.all([getAllSummaries(), getAllStoryTrees()]);
    const movedSummaries = repointForBind(summaries, args.bookId, story.id, story.title);
    const movedTrees = repointForBind(trees, args.bookId, story.id, story.title);
    await Promise.all([...movedSummaries.map(saveSummary), ...movedTrees.map(saveStoryTree)]);
    carried = movedSummaries.length + movedTrees.length;
    await deleteBook(args.bookId);
  }
  return { story, carried };
}
