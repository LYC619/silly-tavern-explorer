/**
 * 故事树 AI 辅助：从选定聊天楼层生成/更新事实节点。
 * 借鉴 st-memory-wizzard 的「现有树大纲 → LLM 输出 JSON ops → 幂等 apply」链路，
 * 但节点用稳定 id 主键，AI 只用人类可读 path 定位，apply 时把 path 解析成 id。
 * 纯逻辑（组装 messages / 解析 ops / apply），不触网、无副作用，便于单测。
 */

import type { ChatSession } from '@/types/chat';
import type { StoryNode } from '@/types/story-tree';
import type { ChatCompletionMessage } from '@/components/ai-tools/useOpenAI';
import { addNode, updateNode, childrenOf, buildOutline, findById } from '@/lib/story-tree-model';

export interface TreeOp {
  op: 'insert' | 'update' | 'archive';
  /** insert: 父节点路径（斜杠分隔，空/缺省=根） */
  parent?: string;
  /** insert: 新节点标题 */
  title?: string;
  /** insert: 提示/别名 */
  hint?: string;
  /** insert: 正文；update: 追加到现有正文的文本 */
  content?: string;
  /** insert/update: 标签（逗号分隔或数组） */
  keywords?: string | string[];
  /** update/archive: 目标节点路径 */
  path?: string;
}

const SYSTEM_PROMPT = `你是一个「故事事实树」整理助手。用户会给你一段角色扮演聊天记录，以及当前已有的事实树结构。
你的任务：从聊天记录中提炼**客观事实**（人物、事件、关系、地点、物品等），整理成对树的增量操作。

规则：
- **一个实体 = 一个节点**，绝不把多个角色/事件塞进一个节点。
- 同类节点归到共享父类目下（如「角色/爱丽丝」「事件/初次相遇」）。
- **优先 update 已有节点**（在其正文追加新事实），而非重复 insert。
- 只记录聊天中确实发生/提及的事实，不虚构、不脑补。
- archive 仅用于明确被推翻/废弃的旧事实。

严格输出如下 JSON（不要输出任何其它文字、不要 markdown 围栏）：
{
  "ops": [
    {"op":"insert","parent":"角色","title":"爱丽丝","hint":"女主","content":"……","keywords":"人物,主角"},
    {"op":"update","path":"角色/爱丽丝","content":"追加的新事实","keywords":"新标签"},
    {"op":"archive","path":"事件/旧设定"}
  ]
}
insert 用 parent(父路径)+title 定位；update/archive 用 path(全路径)定位。父类目不存在时会自动创建。`;

/** 组装 AI 填树请求的 messages */
export function buildTreeFillMessages(
  nodes: StoryNode[],
  floorText: string,
  extraInstruction?: string
): ChatCompletionMessage[] {
  const outline = buildOutline(nodes, { includeArchived: false }) || '（当前树为空）';
  const instr = extraInstruction?.trim() ? `\n\n【额外要求】\n${extraInstruction.trim()}` : '';
  const userContent = `【当前事实树】\n${outline}\n\n【聊天记录】\n${floorText}${instr}`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/** 从 AI 输出解析 ops（去 markdown 围栏，容错） */
export function parseTreeOps(output: string): TreeOp[] {
  let text = output.trim();
  // 去 ```json ... ``` 围栏
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // 若前后有杂物，尝试截取第一个 { 到最后一个 }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first > 0 || last < text.length - 1) {
    if (first >= 0 && last > first) text = text.slice(first, last + 1);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return []; }
  const ops = (parsed as { ops?: unknown })?.ops;
  if (!Array.isArray(ops)) return [];
  return ops.filter((o): o is TreeOp =>
    !!o && typeof o === 'object' && typeof (o as TreeOp).op === 'string'
  );
}

const toTags = (kw: string | string[] | undefined): string[] => {
  if (!kw) return [];
  const arr = Array.isArray(kw) ? kw : kw.split(',');
  return arr.map((s) => s.trim()).filter(Boolean);
};

/** 按 path 找节点 id（沿路径逐段匹配 title；找不到返回 undefined） */
function findIdByPath(nodes: StoryNode[], path: string): string | undefined {
  const segs = path.split('/').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return undefined;
  let parentId: string | null = null;
  let curId: string | undefined;
  for (const seg of segs) {
    const match = childrenOf(nodes, parentId).find((n) => n.title === seg);
    if (!match) return undefined;
    curId = match.id;
    parentId = match.id;
  }
  return curId;
}

/** 确保父路径存在（逐段创建缺失类目），返回末段 id（parent 为空=根，返回 null） */
function ensureParentPath(nodes: StoryNode[], parentPath: string | undefined): { nodes: StoryNode[]; parentId: string | null } {
  const segs = (parentPath ?? '').split('/').map((s) => s.trim()).filter(Boolean);
  let cur = nodes;
  let parentId: string | null = null;
  for (const seg of segs) {
    const existing = childrenOf(cur, parentId).find((n) => n.title === seg);
    if (existing) { parentId = existing.id; continue; }
    const { nodes: next, node } = addNode(cur, parentId, { title: seg });
    cur = next;
    parentId = node.id;
  }
  return { nodes: cur, parentId };
}

export interface ApplyResult {
  nodes: StoryNode[];
  inserted: number;
  updated: number;
  archived: number;
  skipped: number;
}

/**
 * 幂等地把 ops 应用到 nodes（不改入参）。
 * - insert：确保父路径存在；若父下已有同名节点则合并（正文追加、标签并集）而非重复建。
 * - update：按 path 定位（找不到跳过），正文追加、标签并集。
 * - archive：按 path 定位，置 archived=true。
 */
export function applyTreeOps(nodes: StoryNode[], ops: TreeOp[]): ApplyResult {
  let cur = nodes;
  let inserted = 0, updated = 0, archived = 0, skipped = 0;

  const mergeInto = (id: string, content: string | undefined, tags: string[]) => {
    const node = findById(cur, id)!;
    const newContent = content?.trim()
      ? (node.content.trim() ? `${node.content.trim()}\n${content.trim()}` : content.trim())
      : node.content;
    const newTags = Array.from(new Set([...node.tags, ...tags]));
    cur = updateNode(cur, id, { content: newContent, tags: newTags });
  };

  for (const op of ops) {
    if (op.op === 'insert') {
      const title = op.title?.trim();
      if (!title) { skipped++; continue; }
      const ensured = ensureParentPath(cur, op.parent);
      cur = ensured.nodes;
      const twin = childrenOf(cur, ensured.parentId).find((n) => n.title === title);
      if (twin) {
        // 同名已存在 → 合并而非重复插入
        mergeInto(twin.id, op.content, toTags(op.keywords));
        updated++;
      } else {
        const { nodes: next, node } = addNode(cur, ensured.parentId, {
          title, hint: op.hint ?? '', content: op.content ?? '', tags: toTags(op.keywords),
        });
        cur = next;
        void node;
        inserted++;
      }
    } else if (op.op === 'update') {
      const id = op.path ? findIdByPath(cur, op.path) : undefined;
      if (!id) { skipped++; continue; }
      mergeInto(id, op.content, toTags(op.keywords));
      updated++;
    } else if (op.op === 'archive') {
      const id = op.path ? findIdByPath(cur, op.path) : undefined;
      if (!id) { skipped++; continue; }
      cur = updateNode(cur, id, { archived: true });
      archived++;
    } else {
      skipped++;
    }
  }

  return { nodes: cur, inserted, updated, archived, skipped };
}

/** 楼层区间 → 文本（与总结引擎同款说话人前缀格式） */
export function floorsToText(session: ChatSession, start: number, end: number): string {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(session.messages.length - 1, Math.max(start, end));
  const lines: string[] = [];
  for (let i = lo; i <= hi; i++) {
    const m = session.messages[i];
    if (!m) continue;
    const isUser = m.role === 'user' || m.is_user === true;
    const name = isUser ? (session.user?.name || 'User') : (session.character?.name || 'Character');
    lines.push(`${name}: ${m.content}`);
  }
  return lines.join('\n\n');
}

/** 预览用：把 ops 渲染成人类可读摘要行 */
export function describeOps(ops: TreeOp[]): string[] {
  return ops.map((o) => {
    if (o.op === 'insert') return `+ 新增「${o.parent ? o.parent + '/' : ''}${o.title ?? '?'}」`;
    if (o.op === 'update') return `~ 更新「${o.path ?? '?'}」`;
    if (o.op === 'archive') return `⊘ 归档「${o.path ?? '?'}」`;
    return `? 未知操作`;
  });
}
