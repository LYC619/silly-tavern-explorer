/**
 * 故事树 JSON 导入/导出（备份、跨设备/好友间分享）。
 * 导出包一层格式头便于识别；导入做防御性校验与逐字段兜底，
 * parentId 指向不存在节点时归为根，绝不让坏数据进树。
 */

import type { StoryNode, StoryTree } from '@/types/story-tree';
import { isStoryNodeType } from '@/types/story-tree';

export const STORY_TREE_JSON_FORMAT = 'st-explorer-story-tree';

export function storyTreeToJSON(tree: StoryTree): string {
  return JSON.stringify(
    {
      format: STORY_TREE_JSON_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      title: tree.title,
      nodes: tree.nodes,
    },
    null,
    2
  );
}

export type ParsedTreeImport =
  | { ok: true; title: string; nodes: StoryNode[] }
  | { ok: false; error: string };

function sanitizeNode(raw: Record<string, unknown>): StoryNode {
  return {
    id: String(raw.id),
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    title: typeof raw.title === 'string' ? raw.title : '(未命名)',
    hint: typeof raw.hint === 'string' ? raw.hint : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 0,
    ...(isStoryNodeType(raw.type) ? { type: raw.type } : {}),
  };
}

export function parseStoryTreeJSON(text: string): ParsedTreeImport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是有效的 JSON 文件' };
  }
  if (!json || typeof json !== 'object') return { ok: false, error: 'JSON 结构不正确' };
  const o = json as Record<string, unknown>;
  // 兼容两种来源：本工具导出的 {format, nodes} 包装，或直接的 StoryTree 对象（含 nodes）
  const rawNodes = o.nodes;
  if (!Array.isArray(rawNodes)) return { ok: false, error: '缺少 nodes 数组，不是故事树导出文件' };

  const seen = new Set<string>();
  for (const rn of rawNodes) {
    if (!rn || typeof rn !== 'object') return { ok: false, error: '存在非法节点条目' };
    const r = rn as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) return { ok: false, error: '存在缺少 id 的节点' };
    if (typeof r.title !== 'string') return { ok: false, error: `节点 ${r.id} 缺少标题` };
    if (seen.has(r.id)) return { ok: false, error: `节点 id 重复：${r.id}` };
    seen.add(r.id);
  }

  const nodes = rawNodes.map((rn) => sanitizeNode(rn as Record<string, unknown>));
  // parentId 指向不存在的节点 → 归为根，防止整棵子树凭空消失
  for (const n of nodes) {
    if (n.parentId !== null && !seen.has(n.parentId)) n.parentId = null;
  }
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : '导入的故事树';
  return { ok: true, title, nodes };
}
