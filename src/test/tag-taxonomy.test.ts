/** 分级标签分类法 v2（10.0）：解析/组合/选项聚合/NSFW 同步/评分档位联动/v1 迁移 */
import { describe, expect, it } from 'vitest';
import {
  parseTag, makeTag, tagOptionsByCategory, BUILTIN_TAGS,
  syncNsfwTag, NSFW_TAG, SFW_TAG,
  ratingTier, RATING_TIER_PREFILL, applyRatingTierTag,
  migrateLegacyTag, migrateLegacyTags,
} from '@/lib/tag-taxonomy';

describe('parseTag (v2)', () => {
  it('识别「类别/子标签」', () => {
    expect(parseTag('人物/少女')).toEqual({ category: '人物', label: '少女', raw: '人物/少女' });
    expect(parseTag('世界观/古风')).toEqual({ category: '世界观', label: '古风', raw: '世界观/古风' });
  });

  it('无前缀与未知类别归入「未分类」，label 保持原文', () => {
    expect(parseTag('女性')).toEqual({ category: '未分类', label: '女性', raw: '女性' });
    expect(parseTag('未知类/xx')).toEqual({ category: '未分类', label: '未知类/xx', raw: '未知类/xx' });
  });

  it('空子标签容错', () => {
    expect(parseTag('玩法/').label).toBe('玩法/');
  });
});

describe('makeTag (v2)', () => {
  it('普通类别带前缀；「未分类」不带前缀（与旧平铺标签同形）', () => {
    expect(makeTag('玩法', '养成')).toBe('玩法/养成');
    expect(makeTag('未分类', '自留')).toBe('自留');
  });
});

describe('tagOptionsByCategory (v2)', () => {
  it('内置打底 + 库内自建合并去重，平铺标签进「未分类」', () => {
    const opts = tagOptionsByCategory(['人物/少女', '人物/魔女', 'MyTag']);
    expect(opts['人物'].map((o) => o.label)).toEqual(
      expect.arrayContaining([...BUILTIN_TAGS['人物'], '魔女']),
    );
    expect(opts['人物'].filter((o) => o.raw === '人物/少女')).toHaveLength(1);
    expect(opts['未分类'].map((o) => o.raw)).toEqual(['MyTag']);
  });
});

describe('NSFW 开关同步', () => {
  it('开=加 NSFW 去 SFW；关=去 NSFW 不自动加 SFW', () => {
    expect(syncNsfwTag(['人物/少女', SFW_TAG], true)).toEqual(['人物/少女', NSFW_TAG]);
    expect(syncNsfwTag(['人物/少女', NSFW_TAG], false)).toEqual(['人物/少女']);
  });

  it('幂等：重复开关不重复添加', () => {
    const on = syncNsfwTag(syncNsfwTag([], true), true);
    expect(on).toEqual([NSFW_TAG]);
  });
});

describe('评分档位联动', () => {
  it('档位边界：<6 低创、6~7.5 及格、7.5~9 精品、9~10 神作', () => {
    expect(ratingTier(5.5)).toBe('低创');
    expect(ratingTier(6)).toBe('及格');
    expect(ratingTier(7.5)).toBe('精品');
    expect(ratingTier(9)).toBe('神作');
    expect(ratingTier(10)).toBe('神作');
  });

  it('预填值为档区间中值取 0.5 步进', () => {
    expect(RATING_TIER_PREFILL['低创']).toBe(3);
    expect(RATING_TIER_PREFILL['及格']).toBe(7);
    expect(RATING_TIER_PREFILL['精品']).toBe(8.5);
    expect(RATING_TIER_PREFILL['神作']).toBe(9.5);
  });

  it('applyRatingTierTag 换档保留自定义评价标签；undefined 清档', () => {
    const tags = ['评价/低创', '评价/我的备注', '人物/少女'];
    expect(applyRatingTierTag(tags, 9.5)).toEqual(['评价/我的备注', '人物/少女', '评价/神作']);
    expect(applyRatingTierTag(tags, undefined)).toEqual(['评价/我的备注', '人物/少女']);
  });
});

describe('v1→v2 迁移', () => {
  it('内置映射表：评价五档并档、玩法题材词挪剧情', () => {
    expect(migrateLegacyTag('评价/优秀')).toBe('评价/精品');
    expect(migrateLegacyTag('评价/踩雷')).toBe('评价/低创');
    expect(migrateLegacyTag('玩法/恋爱')).toBe('剧情/恋爱');
    expect(migrateLegacyTag('评价/神作')).toBe('评价/神作');
  });

  it('只转换精确命中的旧内置标签，未知前缀和自由标签原样保留', () => {
    expect(migrateLegacyTag('人物/男性')).toBe('人物/男性');
    expect(migrateLegacyTag('玩法/日常')).toBe('玩法/日常');
    expect(migrateLegacyTag('其他/自留')).toBe('其他/自留');
    expect(migrateLegacyTag('作者/A')).toBe('作者/A');
    expect(migrateLegacyTag('人物/自定义')).toBe('人物/自定义');
    expect(migrateLegacyTag('https://example.com/a')).toBe('https://example.com/a');
    expect(migrateLegacyTag('自留')).toBe('自留');
  });

  it('整组迁移：无冲突时转换；v2 形态输入零变化（幂等）', () => {
    const r = migrateLegacyTags(['评价/优秀', '玩法/恋爱', '人物/男性']);
    expect(r.tags).toEqual(['评价/精品', '剧情/恋爱', '人物/男性']);
    expect(r.changed).toBe(true);
    const r2 = migrateLegacyTags(r.tags);
    expect(r2.changed).toBe(false);
    expect(r2.tags).toEqual(r.tags);
  });

  it('转换结果与现有标签或另一转换结果撞车时保留原文，不静默合并', () => {
    expect(migrateLegacyTags(['评价/优秀', '评价/精品'])).toEqual({
      tags: ['评价/优秀', '评价/精品'],
      changed: false,
    });
    expect(migrateLegacyTags(['评价/不错', '评价/一般'])).toEqual({
      tags: ['评价/不错', '评价/一般'],
      changed: false,
    });
  });
});
