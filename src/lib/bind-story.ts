/**
 * 「未绑定 → 绑定到角色」升级流程（2.0 阶段2 建立，阶段5 随书架退役简化）。
 * 未绑定聊天导入时就已存为归档故事（characterId 为空），绑定 = 给这条故事补上
 * characterId 并把当前编辑态落库；未绑定期间生成的总结/故事树本就挂在故事 id 上，
 * 无需重指，原地带走。
 */
import type { ArchiveStory } from '@/types/archive';
import type { ChatSession, ChapterMarker, ExportSettings } from '@/types/chat';
import {
  buildStoryFromSession,
  getArchiveStory,
  saveArchiveStory,
  updateArchiveStory,
  updateBranchLine,
} from '@/lib/archive-db';
import { getAllSummaries } from '@/lib/summary-db';
import { getAllStoryTrees } from '@/lib/story-tree-db';

export interface BindArgs {
  characterId: string;
  /** 未绑定故事 id；null = 内存里的会话尚未落库（如示例数据），绑定时新建 */
  storyId: string | null;
  session: ChatSession;
  markers: ChapterMarker[];
  favorites: string[];
  settings?: ExportSettings;
}

/** 执行绑定，返回升级后的归档故事。carried = 一并带走的总结/故事树条数，供 toast 一句话交代。 */
export async function bindSessionToCharacter(args: BindArgs): Promise<{ story: ArchiveStory; carried: number }> {
  const existing = args.storyId ? await getArchiveStory(args.storyId) : undefined;
  let story: ArchiveStory;
  if (existing) {
    const saved = await updateArchiveStory(existing.id, (current) => {
      const updated = updateBranchLine(current, null, {
        session: args.session,
        markers: args.markers,
        favorites: args.favorites,
      });
      return {
        ...updated,
        characterId: args.characterId,
        ...(args.session.title ? { title: args.session.title } : {}),
        settings: args.settings ?? updated.settings,
        updatedAt: Date.now(),
      };
    });
    if (!saved) throw new Error('故事档案不存在');
    story = saved;
  } else {
    story = buildStoryFromSession(args.session);
    story.markers = args.markers;
    story.favorites = args.favorites;
    story = {
      ...story,
      characterId: args.characterId,
      ...(args.session.title ? { title: args.session.title } : {}),
      settings: args.settings ?? story.settings,
      updatedAt: Date.now(),
    };
    await saveArchiveStory(story);
  }

  let carried = 0;
  if (args.storyId) {
    const [summaries, trees] = await Promise.all([getAllSummaries(), getAllStoryTrees()]);
    carried =
      summaries.filter((s) => s.bookId === args.storyId).length +
      trees.filter((t) => t.bookId === args.storyId).length;
  }
  return { story, carried };
}
