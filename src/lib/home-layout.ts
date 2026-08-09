/** 首页首屏的空间约束，集中维护，避免 JSX 中散落难以复验的魔法数字。 */
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';

/**
 * 桌面端横向内容轨道的滚轮位移：鼠标滚轮使用 deltaY，触控板原生横向手势
 * 使用 deltaX。取主要轴可以避免斜向手势被重复累加。
 */
export function horizontalWheelDelta(
  deltaX: number,
  deltaY: number,
  deltaMode = 0,
  pageSize = 0,
): number {
  const rawDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (deltaMode === 1) return rawDelta * 32;
  if (deltaMode === 2) return rawDelta * Math.max(0, pageSize);
  return rawDelta;
}

export type StoryWorkspaceView = 'volume' | 'tree';

/** 编辑区的整理入口对应故事工作台中的固定子视图。 */
export function storyWorkspaceViewForEditorFocus(focus: string | null): StoryWorkspaceView | null {
  if (focus === 'summary') return 'volume';
  if (focus === 'story-tree') return 'tree';
  return null;
}

export interface EditorStoryPickerItem {
  story: ArchiveStory;
  characterName: string;
}

/**
 * 整理工作台的故事选择模型：保留全集，排序与筛选集中处理，避免页面把“最近三条”
 * 误用成唯一可达集合。角色名作为副标题，帮助用户区分常见的重名故事。
 */
export function buildEditorStoryPickerItems(
  stories: ArchiveStory[],
  characters: ArchiveCharacter[],
  query = '',
): EditorStoryPickerItem[] {
  const characterNames = new Map(characters.map((character) => [character.id, character.name]));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [...stories]
    .sort((a, b) => (b.lastViewedAt ?? b.updatedAt) - (a.lastViewedAt ?? a.updatedAt))
    .map((story) => ({
      story,
      characterName: story.characterId
        ? (characterNames.get(story.characterId) ?? '未知角色')
        : '未绑定角色',
    }))
    .filter(({ story, characterName }) => {
      if (!normalizedQuery) return true;
      return `${story.title} ${characterName}`.toLocaleLowerCase().includes(normalizedQuery);
    });
}

/** 只从有真实查看记录的故事中取最近条目；未查看的新导入内容留给完整选择器。 */
export function pickRecentlyViewedStories(
  stories: ArchiveStory[],
  limit = HOME_RECENT_STORY_VISIBLE_COUNT,
): ArchiveStory[] {
  const count = Math.max(0, Math.floor(limit));
  return [...stories]
    .filter((story) => story.lastViewedAt !== undefined)
    .sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0))
    .slice(0, count);
}

export const EDITOR_TOOL_COPY = {
  chat: '处理你的聊天文件，支持正则处理、txt 转换、瘦身导出',
  summary: '按楼层范围生成分卷总结、日记或自定义记录',
  storyTree: '把人物、事件和伏笔整理成可编辑的故事树',
  summaryAndTree: '生成分卷总结、日记，并把人物、事件和伏笔整理成故事树',
  worldbook: '编辑世界设定条目，并检查角色关联关系',
  card: '查看角色卡字段、内嵌资产与导入结果',
  preset: '调整提示词块、顺序和生成参数',
} as const;
