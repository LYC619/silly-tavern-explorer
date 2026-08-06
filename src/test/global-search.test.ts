import { describe, expect, it } from 'vitest';
import { buildSearchEntries, searchEntries, groupByKind, flattenSearchGroups } from '@/lib/global-search';

const entries = buildSearchEntries({
  characters: [
    { id: 'c1', name: '奏枝' },
    { id: 'c2', name: 'Vesper' },
  ],
  stories: [
    { id: 's1', title: '奏枝 · 夏日祭', characterId: 'c1' },
    { id: 's2', title: '深空调度员' },
  ],
  worldbooks: [{ id: 'w1', title: '通用设定集' }],
  presets: [{ id: 'p1', title: '默认预设' }],
  regexes: [{ id: 'r1', title: '奏枝专用正则' }],
});

describe('global-search', () => {
  it('拍平各库并给出跳转路径与次要说明', () => {
    expect(entries.find((e) => e.id === 'c1')?.path).toBe('/character/c1');
    expect(entries.find((e) => e.id === 's1')?.sub).toBe('奏枝');
    expect(entries.find((e) => e.id === 's2')?.sub).toBe('未绑定');
    expect(entries.find((e) => e.id === 'w1')?.path).toBe('/worldbook?assetId=w1');
  });

  it('大小写不敏感子串匹配，前缀命中排前', () => {
    const res = searchEntries(entries, 'vesp');
    expect(res.map((r) => r.id)).toEqual(['c2']);
    const res2 = searchEntries(entries, '奏枝');
    // 前缀命中：角色奏枝、故事「奏枝 · 夏日祭」、正则「奏枝专用正则」都以查询开头，保持入参顺序
    expect(res2.map((r) => r.id)).toEqual(['c1', 's1', 'r1']);
  });

  it('包含命中排在前缀命中之后', () => {
    const res = searchEntries(entries, '设');
    // 前缀无命中；「通用设定集」「默认预设」为包含命中
    expect(res.map((r) => r.id)).toEqual(['w1', 'p1']);
  });

  it('空查询返回空；perKind/total 截断生效', () => {
    expect(searchEntries(entries, '  ')).toEqual([]);
    const many = buildSearchEntries({
      characters: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `角色${i}` })),
      stories: [], worldbooks: [], presets: [], regexes: [],
    });
    expect(searchEntries(many, '角色', { perKind: 3 })).toHaveLength(3);
    expect(searchEntries(many, '角色', { perKind: 10, total: 4 })).toHaveLength(4);
  });

  it('groupByKind 按固定类目顺序分组且不出空组', () => {
    const groups = groupByKind(searchEntries(entries, '奏枝'));
    expect(groups.map((g) => g.kind)).toEqual(['character', 'story', 'regex']);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it('展示名用于显示且原名与展示名都可搜索', () => {
    const displayEntries = buildSearchEntries({
      characters: [{ id: 'c-display', name: '原始名', displayName: '展示名' }],
      stories: [{ id: 's-display', title: '故事', characterId: 'c-display' }],
      worldbooks: [], presets: [], regexes: [],
    });

    expect(displayEntries.find((e) => e.id === 'c-display')).toMatchObject({
      title: '展示名',
      sub: '原始名',
    });
    expect(searchEntries(displayEntries, '原始名').map((e) => e.id)).toEqual(['c-display']);
    expect(searchEntries(displayEntries, '展示名').map((e) => e.id)).toEqual(['c-display']);
    expect(displayEntries.find((e) => e.id === 's-display')?.sub).toBe('展示名');
  });

  it('键盘导航使用分组后的视觉顺序，而不是拍平前的库顺序', () => {
    const groups = groupByKind([
      { kind: 'story', id: 's1', title: '故事', path: '/story/s1' },
      { kind: 'character', id: 'c1', title: '角色', path: '/character/c1' },
      { kind: 'regex', id: 'r1', title: '正则', path: '/regex?assetId=r1' },
    ]);
    expect(flattenSearchGroups(groups).map((e) => e.id)).toEqual(['c1', 's1', 'r1']);
  });
});
