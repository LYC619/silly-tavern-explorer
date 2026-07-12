import { describe, it, expect } from 'vitest';
import {
  findById, childrenOf, collectSubtreeIds, addNode, removeNode,
  updateNode, moveNode, toForest, buildOutline, nodePath, searchNodes,
} from '@/lib/story-tree-model';
import { storyTreeToJSON, parseStoryTreeJSON } from '@/lib/story-tree-io';
import type { StoryNode, StoryTree } from '@/types/story-tree';

/** 构造固定 id 的树，便于断言（绕过随机 id 生成器） */
function fixture(): StoryNode[] {
  const mk = (id: string, parentId: string | null, title: string, order: number): StoryNode => ({
    id, parentId, title, hint: '', content: '', tags: [], pinned: false, archived: false, order,
  });
  // 根A(0) → 子A1(0), 子A2(1); 根B(1)
  return [
    mk('A', null, '角色', 0),
    mk('A1', 'A', '爱丽丝', 0),
    mk('A2', 'A', '鲍勃', 1),
    mk('B', null, '事件', 1),
  ];
}

describe('story-tree-model 查询', () => {
  it('findById / childrenOf', () => {
    const n = fixture();
    expect(findById(n, 'A1')?.title).toBe('爱丽丝');
    expect(childrenOf(n, 'A').map((c) => c.id)).toEqual(['A1', 'A2']);
    expect(childrenOf(n, null).map((c) => c.id)).toEqual(['A', 'B']);
  });

  it('collectSubtreeIds 含自身与后代', () => {
    expect(collectSubtreeIds(fixture(), 'A').sort()).toEqual(['A', 'A1', 'A2']);
  });
});

describe('story-tree-model 增删改', () => {
  it('addNode 追加到父下末尾，order 递增', () => {
    const { nodes, node } = addNode(fixture(), 'A', { title: '卡萝' });
    expect(node.parentId).toBe('A');
    expect(node.order).toBe(2); // A 下已有 order 0,1
    expect(childrenOf(nodes, 'A').map((c) => c.title)).toEqual(['爱丽丝', '鲍勃', '卡萝']);
  });

  it('removeNode 级联删后代', () => {
    const nodes = removeNode(fixture(), 'A');
    expect(nodes.map((n) => n.id).sort()).toEqual(['B']);
  });

  it('updateNode 改字段不动结构', () => {
    const nodes = updateNode(fixture(), 'A1', { content: '主角', pinned: true });
    const n = findById(nodes, 'A1')!;
    expect(n.content).toBe('主角');
    expect(n.pinned).toBe(true);
    expect(n.parentId).toBe('A');
  });
});

describe('story-tree-model moveNode', () => {
  it('移动到新父并规范化 order', () => {
    const nodes = moveNode(fixture(), 'A2', 'B', 0); // 鲍勃 移到 事件 下第0位
    expect(findById(nodes, 'A2')?.parentId).toBe('B');
    expect(childrenOf(nodes, 'B').map((c) => c.id)).toEqual(['A2']);
    expect(childrenOf(nodes, 'A').map((c) => c.id)).toEqual(['A1']);
  });

  it('拒绝移到自己后代下（防环）', () => {
    const before = fixture();
    const after = moveNode(before, 'A', 'A1', 0); // 把父 A 移到自己子 A1 下
    expect(after).toBe(before); // 原样返回
  });

  it('同级重排', () => {
    const nodes = moveNode(fixture(), 'A2', 'A', 0); // 鲍勃 移到爱丽丝之前
    expect(childrenOf(nodes, 'A').map((c) => c.id)).toEqual(['A2', 'A1']);
  });
});

describe('story-tree-model 转换/大纲', () => {
  it('toForest 嵌套结构', () => {
    const forest = toForest(fixture());
    expect(forest.map((r) => r.id)).toEqual(['A', 'B']);
    expect(forest[0].children.map((c) => c.id)).toEqual(['A1', 'A2']);
  });

  it('toForest 可排除归档', () => {
    const n = updateNode(fixture(), 'A1', { archived: true });
    const forest = toForest(n, false);
    expect(forest[0].children.map((c) => c.id)).toEqual(['A2']);
  });

  it('buildOutline 缩进大纲，默认排除归档', () => {
    let n = fixture();
    n = updateNode(n, 'A', { hint: '登场人物' });
    const outline = buildOutline(n);
    expect(outline).toContain('- 角色 | 登场人物');
    expect(outline).toContain('  - 爱丽丝');
    expect(outline).toContain('  - 鲍勃');
    expect(outline).toContain('- 事件');
  });

  it('buildOutline 归档节点默认不出现', () => {
    const n = updateNode(fixture(), 'A2', { archived: true });
    expect(buildOutline(n)).not.toContain('鲍勃');
  });

  it('nodePath 派生全路径', () => {
    expect(nodePath(fixture(), 'A1')).toBe('角色/爱丽丝');
  });
});

describe('searchNodes 搜索', () => {
  it('空查询返回 null', () => {
    expect(searchNodes(fixture(), '')).toBeNull();
    expect(searchNodes(fixture(), '   ')).toBeNull();
  });

  it('命中标题/提示/正文/标签（大小写不敏感）', () => {
    let n = fixture();
    n = updateNode(n, 'A1', { content: '药剂师，来自 River Valley' });
    n = updateNode(n, 'A2', { tags: ['铁匠'] });
    expect([...searchNodes(n, '爱丽丝')!.hitIds]).toEqual(['A1']);
    expect([...searchNodes(n, 'river')!.hitIds]).toEqual(['A1']); // 正文、忽略大小写
    expect([...searchNodes(n, '铁匠')!.hitIds]).toEqual(['A2']); // 标签
  });

  it('expandIds 收集命中节点的全部祖先', () => {
    // 加一层：A1 下再挂孙节点
    const { nodes } = addNode(fixture(), 'A1', { title: '童年经历' });
    const r = searchNodes(nodes, '童年')!;
    expect(r.hitIds.size).toBe(1);
    expect(r.expandIds.has('A1')).toBe(true);
    expect(r.expandIds.has('A')).toBe(true);
    expect(r.expandIds.has('B')).toBe(false);
  });
});

describe('story-tree-io JSON 导入导出', () => {
  const mkTree = (): StoryTree => ({
    id: 't1', bookId: null, bookTitle: '书', title: '我的树',
    nodes: fixture(), createdAt: 1, updatedAt: 2,
  });

  it('round-trip：导出再导入还原节点与标题', () => {
    const json = storyTreeToJSON(mkTree());
    const parsed = parseStoryTreeJSON(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.title).toBe('我的树');
      expect(parsed.nodes).toHaveLength(4);
      expect(parsed.nodes.find((n) => n.id === 'A1')?.parentId).toBe('A');
    }
  });

  it('拒绝坏数据：非 JSON / 缺 nodes / id 重复', () => {
    expect(parseStoryTreeJSON('not json').ok).toBe(false);
    expect(parseStoryTreeJSON('{"title":"x"}').ok).toBe(false);
    const dup = JSON.stringify({ title: 'x', nodes: [
      { id: 'a', title: '1' }, { id: 'a', title: '2' },
    ] });
    expect(parseStoryTreeJSON(dup).ok).toBe(false);
  });

  it('字段兜底：缺省字段补默认值，悬空 parentId 归根', () => {
    const raw = JSON.stringify({ nodes: [
      { id: 'a', title: '甲', parentId: 'ghost', tags: ['x', 1] },
    ] });
    const parsed = parseStoryTreeJSON(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const n = parsed.nodes[0];
      expect(n.parentId).toBeNull(); // ghost 不存在 → 归根
      expect(n.tags).toEqual(['x']); // 非字符串标签剔除
      expect(n.hint).toBe('');
      expect(n.archived).toBe(false);
      expect(n.order).toBe(0);
      expect(parsed.title).toBe('导入的故事树');
    }
  });
});
