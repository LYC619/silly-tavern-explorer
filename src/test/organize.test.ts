/**
 * 整理与记录·统一索引纯函数测试（2.0 阶段3）。
 */
import { describe, it, expect } from 'vitest';
import type { SummaryItem } from '@/types/summary';
import type { StoryTree } from '@/types/story-tree';
import {
  buildOrganizeIndex,
  pickDefaultEntry,
  resolveTemplateTitle,
  copyAsNewSummary,
  copyAsNewTree,
} from '@/lib/organize-index';

function sum(partial: Partial<SummaryItem> & { id: string }): SummaryItem {
  return {
    bookId: 'story1',
    bookTitle: '测试故事',
    kind: 'volume',
    title: `总结${partial.id}`,
    floorStart: 0,
    floorEnd: 10,
    content: '内容',
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

function tree(partial: Partial<StoryTree> & { id: string }): StoryTree {
  return {
    bookId: 'story1',
    bookTitle: '测试故事',
    title: `树${partial.id}`,
    nodes: [{ id: 'n1', parentId: null, title: '节点', hint: '', content: '', tags: [], pinned: false, archived: false, order: 0 }],
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

const ALL = { kind: 'all' as const, branch: 'all' as const, query: '' };

describe('buildOrganizeIndex', () => {
  it('合并总结与故事树并按 updatedAt 由新到旧排序', () => {
    const entries = buildOrganizeIndex(
      [sum({ id: 'a', updatedAt: 10 }), sum({ id: 'b', updatedAt: 30 })],
      [tree({ id: 't', updatedAt: 20 })],
      ALL,
    );
    expect(entries.map((e) => e.id)).toEqual(['b', 't', 'a']);
  });

  it('kind 筛选：tree 只留故事树，diary 只留日记', () => {
    const summaries = [sum({ id: 'a', kind: 'diary' }), sum({ id: 'b', kind: 'volume' })];
    const trees = [tree({ id: 't' })];
    expect(buildOrganizeIndex(summaries, trees, { ...ALL, kind: 'tree' }).map((e) => e.id)).toEqual(['t']);
    expect(buildOrganizeIndex(summaries, trees, { ...ALL, kind: 'diary' }).map((e) => e.id)).toEqual(['a']);
  });

  it('分支筛选：main 含无标注旧条目和旧故事树；具体分支只显该分支记录', () => {
    const summaries = [
      sum({ id: 'old' }), // 旧条目无 branchId = 主线
      sum({ id: 'br', branchId: 'branch1' }),
    ];
    const trees = [tree({ id: 'main-tree' }), tree({ id: 'branch-tree', branchId: 'branch1' })];
    expect(buildOrganizeIndex(summaries, trees, { ...ALL, branch: 'main' }).map((e) => e.id)).toEqual(['old', 'main-tree']);
    expect(buildOrganizeIndex(summaries, trees, { ...ALL, branch: 'branch1' }).map((e) => e.id)).toEqual(['br', 'branch-tree']);
    expect(buildOrganizeIndex(summaries, trees, { ...ALL, branch: 'all' }).map((e) => e.id)).toEqual(['old', 'br', 'main-tree', 'branch-tree']);
    expect(buildOrganizeIndex(summaries, trees, { ...ALL, branch: 'branch1' }).find((e) => e.id === 'branch-tree')?.branchId).toBe('branch1');
  });

  it('搜索命中标题或类型标签（不区分大小写）', () => {
    const summaries = [sum({ id: 'a', title: '第一卷 Alpha' }), sum({ id: 'b', title: '第二卷' })];
    expect(buildOrganizeIndex(summaries, [], { ...ALL, query: 'alpha' }).map((e) => e.id)).toEqual(['a']);
    expect(buildOrganizeIndex(summaries, [], { ...ALL, query: '分卷' }).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('空内容记录标草稿；空节点树标草稿', () => {
    const entries = buildOrganizeIndex(
      [sum({ id: 'a', content: '' })],
      [tree({ id: 't', nodes: [] })],
      ALL,
    );
    expect(entries.every((e) => e.draft)).toBe(true);
  });

  it('diy 记录的 kindLabel 用模板名快照，无快照回退「DIY 创作」', () => {
    const withName = sum({ id: 'a', kind: 'diy', genParams: { templateTitle: '史记型总结' } });
    const without = sum({ id: 'b', kind: 'diy' });
    const entries = buildOrganizeIndex([withName, without], [], ALL);
    expect(entries.find((e) => e.id === 'a')?.kindLabel).toBe('史记型总结');
    expect(entries.find((e) => e.id === 'b')?.kindLabel).toBe('DIY 创作');
  });
});

describe('resolveTemplateTitle', () => {
  it('优先 templateTitle 快照，其次内置模板查名，都没有为 undefined', () => {
    expect(resolveTemplateTitle({ templateTitle: '散文型', templateId: 'builtin-diy' })).toBe('散文型');
    expect(resolveTemplateTitle({ templateId: 'builtin-diy' })).toBe('DIY 创作起点（内置）');
    expect(resolveTemplateTitle({ templateId: 'stpl_gone' })).toBeUndefined();
    expect(resolveTemplateTitle(undefined)).toBeUndefined();
  });
});

describe('pickDefaultEntry', () => {
  it('取排序后的第一条（最近修改）；空索引 undefined', () => {
    const entries = buildOrganizeIndex([sum({ id: 'a', updatedAt: 5 }), sum({ id: 'b', updatedAt: 9 })], [], ALL);
    expect(pickDefaultEntry(entries)?.id).toBe('b');
    expect(pickDefaultEntry([])).toBeUndefined();
  });
});

describe('copyAsNewSummary / copyAsNewTree', () => {
  it('新 id、标题加副本、转手动条目、时间戳更新，其余字段保留', () => {
    const src = sum({ id: 'a', autoSaved: true, branchId: 'br1', createdAt: 1, updatedAt: 2 });
    const copy = copyAsNewSummary(src, 100);
    expect(copy.id).not.toBe(src.id);
    expect(copy.title).toBe('总结a（副本）');
    expect(copy.autoSaved).toBe(false);
    expect(copy.createdAt).toBe(100);
    expect(copy.updatedAt).toBe(100);
    expect(copy.branchId).toBe('br1');
    expect(copy.content).toBe(src.content);
  });

  it('复制故事树：新 id + 副本标题，节点保留', () => {
    const src = tree({ id: 't' });
    const copy = copyAsNewTree(src, 100);
    expect(copy.id).not.toBe(src.id);
    expect(copy.title).toBe('树t（副本）');
    expect(copy.nodes).toEqual(src.nodes);
    expect(copy.updatedAt).toBe(100);
  });
});
