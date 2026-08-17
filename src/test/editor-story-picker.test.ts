import { describe, expect, it } from 'vitest';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import * as pickerModule from '@/lib/home-layout';

type StoryPickerApi = typeof pickerModule & {
  buildEditorStoryPickerItems: (
    stories: ArchiveStory[],
    characters: ArchiveCharacter[],
    query?: string,
  ) => Array<{
    story: ArchiveStory;
    characterName: string;
    floorCount: number;
    startedAt?: number;
    endedAt?: number;
  }>;
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
  it('无搜索词只展示最近十个故事，并用角色上下文区分重名条目', () => {
    const stories = [
      makeStory('s1', 'New Chat', 'alice', 1),
      makeStory('s2', 'New Chat', 'bob', 4),
      makeStory('s3', '旧故事', undefined, 3),
      makeStory('s4', '更早故事', 'alice', 2),
      ...Array.from({ length: 8 }, (_, index) => makeStory(`extra-${index}`, `额外故事 ${index}`, undefined, 10 + index)),
      makeStory('oldest', '最早但可搜索', undefined, 0),
    ];

    const items = picker.buildEditorStoryPickerItems(stories, characters);

    expect(items).toHaveLength(10);
    expect(items.map((item) => item.story.id)).toEqual([
      'extra-7', 'extra-6', 'extra-5', 'extra-4', 'extra-3', 'extra-2', 'extra-1', 'extra-0', 's2', 's3',
    ]);
    expect(items.find((item) => item.story.id === 's3')?.characterName).toBe('未绑定角色');
    expect(picker.buildEditorStoryPickerItems(stories, characters, '爱丽丝').find((item) => item.story.id === 's1')?.characterName)
      .toBe('爱丽丝');
    expect(picker.buildEditorStoryPickerItems(stories, characters, '爱丽丝').find((item) => item.story.id === 's1'))
      .toMatchObject({ floorCount: 0 });
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
    expect(picker.buildEditorStoryPickerItems(stories, characters, '另一段').map((item) => item.story.id))
      .toEqual(['s3']);
  });

  it('故事条目提供消息数和开始/结束时间', () => {
    const story = makeStory('timed', '有时间的故事', 'alice', 1);
    story.session.messages = [
      { id: 'm1', content: 'a', timestamp: 100 } as never,
      { id: 'm2', content: 'b', timestamp: 300 } as never,
      { id: 'm3', content: 'c', timestamp: 200 } as never,
    ];

    const item = picker.buildEditorStoryPickerItems([story], characters)[0];
    expect(item).toMatchObject({ floorCount: 3, startedAt: 100, endedAt: 300 });
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
