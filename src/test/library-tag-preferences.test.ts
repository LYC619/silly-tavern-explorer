import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIBRARY_TAG_PREFERENCES,
  addCustomTagDefinition,
  addCustomCategory,
  buildLibraryFilterSections,
  buildManagedTagOptions,
  getTagCategories,
  moveCategory,
  moveTag,
  normalizeLibraryTagPreferences,
  removeCustomTagDefinition,
  setTagVisibility,
} from '@/lib/library-tag-preferences';

describe('library tag preferences', () => {
  it('首次使用默认隐藏卡面与评价，已保存的显式空隐藏列表不会被重置', () => {
    expect(DEFAULT_LIBRARY_TAG_PREFERENCES.hidden).toEqual([
      '卡面/SFW',
      '卡面/NSFW',
      '评价/低创',
      '评价/及格',
      '评价/精品',
      '评价/神作',
    ]);

    expect(normalizeLibraryTagPreferences(undefined).hidden).toEqual(
      DEFAULT_LIBRARY_TAG_PREFERENCES.hidden,
    );
    expect(normalizeLibraryTagPreferences({ version: 1, customTags: [], order: [], hidden: [] }).hidden).toEqual([]);
  });

  it('清理损坏、空白和重复配置，同时保留未使用的自定义定义', () => {
    expect(normalizeLibraryTagPreferences({
      version: 1,
      customTags: [' 世界观/蒸汽朋克 ', '世界观/蒸汽朋克', '', 42],
      order: ['世界观/蒸汽朋克', '世界观/蒸汽朋克', null],
      hidden: ['人物/少女', '人物/少女', false],
    })).toEqual({
      version: 1,
      customCategories: [],
      customTags: ['世界观/蒸汽朋克'],
      categoryOrder: [],
      order: ['世界观/蒸汽朋克'],
      hidden: ['人物/少女'],
    });
  });

  it('「类型」保留字不能建为自定义标签组，持久化坏数据在 normalize 时被剔除', () => {
    expect(() => addCustomCategory(DEFAULT_LIBRARY_TAG_PREFERENCES, '类型')).toThrow('内置分类');

    const cleaned = normalizeLibraryTagPreferences({
      version: 1,
      customCategories: ['类型', '作者'],
      customTags: ['类型/男性向', '剧情/双男主'],
      categoryOrder: ['类型', '作者'],
      order: [],
      hidden: [],
    });
    expect(cleaned.customCategories).toEqual(['作者']);
    expect(cleaned.customTags).toEqual(['剧情/双男主']);
    expect(cleaned.categoryOrder).toEqual(['作者']);
  });

  it('合并内置、定义和已分配标签，并按用户顺序优先排列', () => {
    const preferences = normalizeLibraryTagPreferences({
      version: 1,
      customTags: ['世界观/蒸汽朋克', '我的收藏'],
      order: ['世界观/蒸汽朋克', '人物/少女'],
      hidden: ['人物/成女'],
    });
    const options = buildManagedTagOptions(
      ['人物/少女', '人物/少女', '剧情/悬疑', '旧标签'],
      preferences,
    );

    expect(options.slice(0, 2).map((option) => option.raw)).toEqual(['世界观/蒸汽朋克', '人物/少女']);
    expect(options.find((option) => option.raw === '世界观/蒸汽朋克')).toMatchObject({
      builtIn: false,
      count: 0,
      visible: true,
    });
    expect(options.find((option) => option.raw === '人物/成女')?.visible).toBe(false);
    expect(options.find((option) => option.raw === '旧标签')).toMatchObject({
      category: '未分类',
      count: 1,
    });
  });

  it('筛选栏保留定义项，并将未分类折叠为三行双列', () => {
    const assigned = [
      '人物/少女',
      '剧情/悬疑',
      '标签1',
      '标签2',
      '标签3',
      '标签4',
      '标签5',
      '标签6',
      '标签7',
    ];
    const options = buildManagedTagOptions(assigned, normalizeLibraryTagPreferences(undefined));
    const collapsed = buildLibraryFilterSections(options, false);
    const expanded = buildLibraryFilterSections(options, true);

    expect(collapsed.categories.flatMap((section) => section.options).map((option) => option.raw))
      .toContain('人物/成女');
    expect(collapsed.uncategorized.options).toHaveLength(6);
    expect(collapsed.uncategorized.hasMore).toBe(true);
    expect(expanded.uncategorized.options).toHaveLength(7);
    expect(expanded.uncategorized.hasMore).toBe(false);
  });

  it('开启隐藏未使用后只保留有角色使用的标签和非空分组', () => {
    const preferences = addCustomCategory(normalizeLibraryTagPreferences(undefined), '历史');
    const options = buildManagedTagOptions(['人物/少女'], preferences);
    const sections = buildLibraryFilterSections(options, false, preferences, true);

    expect(sections.categories.map((section) => section.category)).toEqual(['人物']);
    expect(sections.categories[0].options.map((option) => option.raw)).toEqual(['人物/少女']);
  });

  it('新增、显隐、排序和移除定义都返回不可变配置', () => {
    const base = normalizeLibraryTagPreferences(undefined);
    const added = addCustomTagDefinition(base, '世界观', '蒸汽朋克');
    const shownCardFace = setTagVisibility(added, '卡面/NSFW', true);
    const orderedRaws = ['人物/少女', '剧情/悬疑', '世界观/蒸汽朋克'];
    const moved = moveTag(shownCardFace, orderedRaws, '世界观/蒸汽朋克', 0);
    const removed = removeCustomTagDefinition(moved, '世界观/蒸汽朋克');

    expect(base.customTags).toEqual([]);
    expect(added.customTags).toContain('世界观/蒸汽朋克');
    expect(shownCardFace.hidden).not.toContain('卡面/NSFW');
    expect(moved.order.slice(0, 3)).toEqual(['世界观/蒸汽朋克', '人物/少女', '剧情/悬疑']);
    expect(removed.customTags).not.toContain('世界观/蒸汽朋克');
    expect(removed.order).not.toContain('世界观/蒸汽朋克');
  });

  it('拒绝空名称和与内置标签重复的自定义定义', () => {
    const base = normalizeLibraryTagPreferences(undefined);
    expect(() => addCustomTagDefinition(base, '人物', '   ')).toThrow('标签名称不能为空');
    expect(() => addCustomTagDefinition(base, '人物', '少女')).toThrow('标签已存在');
  });

  it('支持自定义一级标签、子标签和一级标签排序', () => {
    const base = normalizeLibraryTagPreferences(undefined);
    const withCategory = addCustomCategory(base, '历史');
    const withChildren = addCustomTagDefinition(withCategory, '历史', '三国');
    const withSecondChild = addCustomTagDefinition(withChildren, '历史', '明朝');

    expect(withSecondChild.customCategories).toContain('历史');
    expect(withSecondChild.customTags).toEqual(['历史/三国', '历史/明朝']);
    expect(buildManagedTagOptions([], withSecondChild).filter((option) => option.category === '历史'))
      .toHaveLength(2);

    const moved = moveCategory(withSecondChild, getTagCategories(withSecondChild), '历史', 0);
    expect(getTagCategories(moved)[0]).toBe('历史');
  });

  it('新建但尚未添加子标签的一级标签仍保留在筛选栏分组中', () => {
    const preferences = addCustomCategory(normalizeLibraryTagPreferences(undefined), '历史');
    const sections = buildLibraryFilterSections(buildManagedTagOptions([], preferences), false, preferences);
    expect(sections.categories.map((section) => section.category)).toContain('历史');
  });

  it('自定义一级标签不能与内置分类或空白重名', () => {
    const base = normalizeLibraryTagPreferences(undefined);
    expect(() => addCustomCategory(base, '  ')).toThrow('标签组名称不能为空');
    expect(() => addCustomCategory(base, '人物')).toThrow('标签组已存在');
  });
});
