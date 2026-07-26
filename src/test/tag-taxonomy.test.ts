/** 分级标签分类法（阶段9.4）：解析/组合/选项聚合 */
import { describe, expect, it } from 'vitest';
import { parseTag, makeTag, tagOptionsByCategory, BUILTIN_TAGS } from '@/lib/tag-taxonomy';

describe('parseTag', () => {
  it('「类别/子标签」解析出类别与子标签', () => {
    expect(parseTag('人物/女性')).toEqual({ category: '人物', label: '女性', raw: '人物/女性' });
    expect(parseTag('其他/自留')).toEqual({ category: '其他', label: '自留', raw: '其他/自留' });
  });

  it('无前缀旧标签与未知类别归入「其他」，label 保持原文', () => {
    expect(parseTag('女性')).toEqual({ category: '其他', label: '女性', raw: '女性' });
    expect(parseTag('未知类/xx')).toEqual({ category: '其他', label: '未知类/xx', raw: '未知类/xx' });
  });

  it('空子标签兜底回原文', () => {
    expect(parseTag('玩法/').label).toBe('玩法/');
  });
});

describe('makeTag', () => {
  it('普通类别带前缀；「其他」不带前缀（与旧平铺标签同形）', () => {
    expect(makeTag('玩法', '养成')).toBe('玩法/养成');
    expect(makeTag('其他', '自留')).toBe('自留');
  });
});

describe('tagOptionsByCategory', () => {
  it('内置打底 + 库内自建合并去重，平铺标签进「其他」', () => {
    const opts = tagOptionsByCategory(['人物/女性', '玩法/快节奏', 'MyTag', '玩法/剧情']);
    expect(opts['人物'].map((o) => o.label)).toEqual(
      expect.arrayContaining([...BUILTIN_TAGS['人物']]),
    );
    // 自建子标签进对应类别；内置重复不翻倍
    expect(opts['玩法'].filter((o) => o.label === '剧情')).toHaveLength(1);
    expect(opts['玩法'].some((o) => o.label === '快节奏')).toBe(true);
    expect(opts['其他'].map((o) => o.raw)).toEqual(['MyTag']);
  });
});
