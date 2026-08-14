import { describe, expect, it } from 'vitest';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import * as pickerModule from '@/lib/home-layout';

type StoryPickerApi = typeof pickerModule & {
  buildEditorStoryPickerItems: (
    stories: ArchiveStory[],
    characters: ArchiveCharacter[],
    query?: string,
  ) => Array<{ story: ArchiveStory; characterName: string }>;
  pickRecentlyViewedStories: (stories: ArchiveStory[], limit?: number) => ArchiveStory[];
};

const picker = pickerModule as StoryPickerApi;

const makeStory = (id: string, title: string, characterId?: string, lastViewedAt = 0) => ({
  id,
  title,
  characterId,
  lastViewedAt,
  updatedAt: lastViewedAt,
  session: { messages: [] },
} as unknown as ArchiveStory);

const characters = [
  { id: 'alice', name: '爱丽丝' },
  { id: 'bob', name: '鲍勃' },
] as unknown as ArchiveCharacter[];

describe('编辑区故事选择器模型', () => {
  it('保留全部故事并用角色上下文区分重名条目', () => {
    const stories = [
      makeStory('s1', 'New Chat', 'alice', 1),
      makeStory('s2', 'New Chat', 'bob', 4),
      makeStory('s3', '旧故事', undefined, 3),
      makeStory('s4', '更早故事', 'alice', 2),
    ];

    const items = picker.buildEditorStoryPickerItems(stories, characters);

    expect(items).toHaveLength(4);
    expect(items.map((item) => item.story.id)).toEqual(['s2', 's3', 's4', 's1']);
    expect(items.find((item) => item.story.id === 's1')?.characterName).toBe('爱丽丝');
    expect(items.find((item) => item.story.id === 's3')?.characterName).toBe('未绑定角色');
  });

  it('按故事标题或角色名过滤，同时保留可滚动列表的数据全集', () => {
    const stories = [
      makeStory('s1', 'New Chat', 'alice', 1),
      makeStory('s2', '森林线', 'bob', 2),
      makeStory('s3', '另一段', undefined, 3),
    ];

    expect(picker.buildEditorStoryPickerItems(stories, characters, '爱丽丝').map((item) => item.story.id))
      .toEqual(['s1']);
    expect(picker.buildEditorStoryPickerItems(stories, characters, '森林').map((item) => item.story.id))
      .toEqual(['s2']);
    expect(picker.buildEditorStoryPickerItems(stories, characters, '').map((item) => item.story.id))
      .toHaveLength(3);
  });

  it('最近故事只取真正查看过的条目，不把新导入故事冒充最近记录', () => {
    const stories = [
      makeStory('new', '刚导入', undefined, 0),
      makeStory('viewed-1', '看过一', undefined, 5),
      makeStory('never', '未查看', undefined, 0),
      makeStory('viewed-2', '看过二', undefined, 4),
    ].map((story) => story.id === 'new' || story.id === 'never'
      ? { ...story, lastViewedAt: undefined }
      : story);

    expect(picker.pickRecentlyViewedStories(stories, 3).map((story) => story.id))
      .toEqual(['viewed-1', 'viewed-2']);
  });

  it('首页最近故事默认保留十二条可滚动内容', () => {
    const stories = Array.from({ length: 13 }, (_, index) =>
      makeStory(`s${index}`, `故事 ${index}`, undefined, index + 1));

    expect(picker.pickRecentlyViewedStories(stories)).toHaveLength(12);
  });
});
