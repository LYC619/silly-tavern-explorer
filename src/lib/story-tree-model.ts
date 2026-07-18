/**
 * 故事树纯函数操作（不触存储、无副作用，便于单测）。
 * 节点以扁平数组 + parentId 组织；这里提供增删改移与「扁平↔嵌套/大纲」转换。
 * 所有变更函数返回新的 nodes 数组，不改入参。
 */

import type { StoryNode, StoryNodeTree } from '@/types/story-tree';
import { generateStoryNodeId } from '@/types/story-tree';

export function findById(nodes: StoryNode[], id: string): StoryNode | undefined {
  return nodes.find((n) => n.id === id);
}

export function childrenOf(nodes: StoryNode[], parentId: string | null): StoryNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

/** 收集某节点的全部后代 id（含自身） */
export function collectSubtreeIds(nodes: StoryNode[], id: string): string[] {
  const out = [id];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of nodes) {
      if (n.parentId === cur) { out.push(n.id); stack.push(n.id); }
    }
  }
  return out;
}

/** 新增节点：追加到 parentId 下的末尾（order = 现有最大 + 1） */
export function addNode(
  nodes: StoryNode[],
  parentId: string | null,
  fields: Partial<Pick<StoryNode, 'title' | 'hint' | 'content' | 'tags' | 'type'>> = {}
): { nodes: StoryNode[]; node: StoryNode } {
  const siblings = childrenOf(nodes, parentId);
  const maxOrder = siblings.length ? Math.max(...siblings.map((s) => s.order)) : -1;
  const node: StoryNode = {
    id: generateStoryNodeId(),
    parentId,
    title: fields.title ?? '新节点',
    hint: fields.hint ?? '',
    content: fields.content ?? '',
    tags: fields.tags ?? [],
    pinned: false,
    archived: false,
    order: maxOrder + 1,
    ...(fields.type ? { type: fields.type } : {}),
  };
  return { nodes: [...nodes, node], node };
}

/** 删除节点及其全部后代 */
export function removeNode(nodes: StoryNode[], id: string): StoryNode[] {
  const toRemove = new Set(collectSubtreeIds(nodes, id));
  return nodes.filter((n) => !toRemove.has(n.id));
}

/** 更新节点字段（不改 id/parentId/order，那些走专门函数） */
export function updateNode(
  nodes: StoryNode[],
  id: string,
  patch: Partial<Omit<StoryNode, 'id' | 'parentId' | 'order'>>
): StoryNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

/**
 * 移动节点到新父节点下的指定位置（index）。
 * 拒绝把节点移动到自己的后代下（会形成环）；index 越界则夹到端点。
 * 重排后规范化目标父下所有子节点的 order 为 0,1,2,…
 */
export function moveNode(
  nodes: StoryNode[],
  id: string,
  newParentId: string | null,
  index: number
): StoryNode[] {
  if (id === newParentId) return nodes;
  const subtree = new Set(collectSubtreeIds(nodes, id));
  if (newParentId !== null && subtree.has(newParentId)) return nodes; // 不能移到自己后代下

  const moving = findById(nodes, id);
  if (!moving) return nodes;

  // 目标父下的现有子节点（排除被移动节点自身），按 order 排好
  const targetSiblings = childrenOf(nodes, newParentId).filter((n) => n.id !== id);
  const clampedIndex = Math.max(0, Math.min(index, targetSiblings.length));
  const reordered = [
    ...targetSiblings.slice(0, clampedIndex),
    { ...moving, parentId: newParentId },
    ...targetSiblings.slice(clampedIndex),
  ];
  const orderMap = new Map(reordered.map((n, i) => [n.id, i]));

  return nodes.map((n) => {
    if (n.id === id) return { ...n, parentId: newParentId, order: orderMap.get(id)! };
    if (orderMap.has(n.id)) return { ...n, order: orderMap.get(n.id)! };
    return n;
  });
}

/** 扁平数组 → 嵌套森林（供 UI 递归渲染），可选是否含归档节点 */
export function toForest(nodes: StoryNode[], includeArchived = true): StoryNodeTree[] {
  const build = (parentId: string | null): StoryNodeTree[] =>
    childrenOf(nodes, parentId)
      .filter((n) => includeArchived || !n.archived)
      .map((n) => ({ ...n, children: build(n.id) }));
  return build(null);
}

/**
 * 树 → 缩进文本大纲（喂 AI 当「现有树参考」用；借鉴参考项目 getTreePathIndex）。
 * 默认排除归档节点。行格式：`  - 标题 | 提示`。
 */
export function buildOutline(nodes: StoryNode[], opts: { includeArchived?: boolean } = {}): string {
  const includeArchived = opts.includeArchived ?? false;
  const lines: string[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const n of childrenOf(nodes, parentId)) {
      if (!includeArchived && n.archived) continue;
      const hint = n.hint?.trim();
      lines.push(`${'  '.repeat(depth)}- ${n.title}${hint ? ` | ${hint}` : ''}`);
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join('\n');
}

/** 节点全路径（由 id 链派生，仅用于展示/AI 定位，不作主键） */
export function nodePath(nodes: StoryNode[], id: string): string {
  const parts: string[] = [];
  let cur = findById(nodes, id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.title);
    cur = cur.parentId ? findById(nodes, cur.parentId) : undefined;
  }
  return parts.join('/');
}

export interface TreeSearchResult {
  /** 直接命中的节点 */
  hitIds: Set<string>;
  /** 需要展开才能看到命中节点的祖先 */
  expandIds: Set<string>;
}

/**
 * 全文搜索：标题/提示/正文/标签 小写包含匹配。
 * 返回命中集合与「命中节点的全部祖先」（供树视图自动展开定位）；query 为空返回 null。
 */
export function searchNodes(nodes: StoryNode[], query: string): TreeSearchResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const hitIds = new Set<string>();
  for (const n of nodes) {
    const haystack = `${n.title}\n${n.hint}\n${n.content}\n${n.tags.join(',')}`.toLowerCase();
    if (haystack.includes(q)) hitIds.add(n.id);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const expandIds = new Set<string>();
  for (const id of hitIds) {
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      expandIds.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
  }
  return { hitIds, expandIds };
}
