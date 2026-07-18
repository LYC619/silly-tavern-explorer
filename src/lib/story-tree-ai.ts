/**
 * 故事树 AI 辅助：从选定聊天楼层生成/更新事实节点。
 * 借鉴 st-memory-wizzard 的「现有树大纲 → LLM 输出 JSON ops → 幂等 apply」链路，
 * 但节点用稳定 id 主键，AI 只用人类可读 path 定位，apply 时把 path 解析成 id。
 * 纯逻辑（组装 messages / 解析 ops / apply），不触网、无副作用，便于单测。
 */

import type { ChatSession } from '@/types/chat';
import type { StoryNode } from '@/types/story-tree';
import { isStoryNodeType } from '@/types/story-tree';
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
  /** insert: 节点类型（character/location/item/event，非法值忽略） */
  type?: string;
}

/** 默认填树 system prompt（UI 允许用户查看/修改，改后仍需保持 JSON ops 输出约定） */
export const DEFAULT_TREE_FILL_PROMPT = `你是「SillyTavern 聊天记录归档工具」的故事树整理助手。故事树是一份长期档案：把角色扮演聊天里的客观设定与剧情事实按 角色/地点/物品/事件 分类沉淀，供玩家回顾与续写时查阅。
用户会给你：当前故事树大纲 + 一段楼层聊天记录（可能是全书中段，前文事实多半已在树里）。
你的任务：输出对树的**增量操作**——只补新信息，绝不复述树里已有的事实。

各类节点的整理方式不同：
- 角色(character)：一个角色 = 一个节点，挂在「角色」类目下。正文只写这段楼层里**新发生**的身份/关系/心境变化，写成一到三句凝练的事实句。系统会自动把内容按卷次归档到该角色名下、逐卷呈现成长轨迹，所以不要重复旧卷内容，也不要自己写"第X卷"之类的标题。
- 事件(event)：一个关键剧情节点 = 一个**独立**节点，按发生顺序挂在「事件」类目下，标题用短句概括（如「初次相遇」「别墅夜谈」）。每个事件写成完整独立的一段，不要往旧事件节点追加内容。日常琐事不记，只记推动剧情或关系的关键转折。
- 地点(location)/物品(item)：客观设定描述；已有节点出现新信息时用 update 追加一句即可。
- 世界观等背景设定可用 custom 类型或挂到合适类目。

通用规则：
- 只记录聊天中确实发生/明确提及的客观事实；不虚构、不推测、不加评价。
- 一个实体 = 一个节点；树里已有的实体用 update（按路径定位），绝不重复 insert。
- archive 仅用于被剧情明确推翻的旧事实节点。
- 全部用简体中文。

严格输出如下 JSON（不要输出任何其它文字、不要 markdown 围栏）：
{
  "ops": [
    {"op":"insert","parent":"角色","title":"爱丽丝","hint":"银发女佣","content":"与主角缔结契约，搬入别墅同住。","keywords":"女佣,契约","type":"character"},
    {"op":"insert","parent":"事件","title":"契约之夜","content":"月圆之夜，爱丽丝与主角在地下室缔结血契，条件是三年内不得离开别墅。","keywords":"转折","type":"event"},
    {"op":"update","path":"地点/别墅","content":"地下室藏有先代主人留下的封印阵。"},
    {"op":"archive","path":"事件/旧设定"}
  ]
}
insert 用 parent(父路径)+title 定位；update/archive 用 path(完整路径，如「角色/爱丽丝」)定位；父类目不存在会自动创建。每个 insert 都必须带 type，可选值：character(角色)/location(地点)/item(物品)/event(事件)/custom(其他)。`;

/** 组装 AI 填树请求的 messages（systemPrompt 缺省用内置默认，UI 可传用户改过的版本） */
export function buildTreeFillMessages(
  nodes: StoryNode[],
  floorText: string,
  extraInstruction?: string,
  systemPrompt?: string
): ChatCompletionMessage[] {
  const outline = buildOutline(nodes, { includeArchived: false }) || '（当前树为空）';
  const instr = extraInstruction?.trim() ? `\n\n【额外要求】\n${extraInstruction.trim()}` : '';
  const userContent = `【当前事实树】\n${outline}\n\n【聊天记录】\n${floorText}${instr}`;
  return [
    { role: 'system', content: systemPrompt?.trim() || DEFAULT_TREE_FILL_PROMPT },
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

/** 卷/阶段小节标题前缀：节点正文里用 `## <label>` 分段，切视图时按卷展现状态变化 */
const SECTION_PREFIX = '## ';

export interface ContentSection {
  /** 小节标题（不含 `## ` 前缀）；null = 小节标题之前的引言部分 */
  label: string | null;
  body: string;
}

/**
 * 把节点正文按 `## <标题>` 切成小节（供分卷展示）。
 * 无任何小节标题时返回单个 {label:null, body:全文}。纯函数，便于单测与渲染复用。
 */
export function splitContentSections(content: string): ContentSection[] {
  const text = content ?? '';
  const lines = text.split('\n');
  const sections: ContentSection[] = [];
  let cur: ContentSection = { label: null, body: '' };
  const buf: string[] = [];
  const flush = () => { cur.body = buf.join('\n').trim(); if (cur.body || cur.label) sections.push(cur); buf.length = 0; };
  for (const line of lines) {
    if (line.startsWith(SECTION_PREFIX)) {
      flush();
      cur = { label: line.slice(SECTION_PREFIX.length).trim(), body: '' };
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ label: null, body: text.trim() }];
}

/**
 * 把新事实并入正文：给定卷/阶段 label 时，追加到该卷小节下（小节已存在则续写，不存在则新建 `## label` 段）；
 * 无 label 时退化为整体追加（保持旧行为）。返回新正文，不改入参。
 */
export function appendToSection(content: string, label: string | undefined, addition: string): string {
  const add = addition.trim();
  if (!add) return content;
  const base = (content ?? '').trim();
  if (!label?.trim()) {
    return base ? `${base}\n${add}` : add;
  }
  const heading = `${SECTION_PREFIX}${label.trim()}`;
  const sections = splitContentSections(base);
  const hit = sections.find((s) => s.label === label.trim());
  if (hit) {
    hit.body = hit.body ? `${hit.body}\n${add}` : add;
    return sections
      .map((s) => (s.label == null ? s.body : `${SECTION_PREFIX}${s.label}\n${s.body}`))
      .filter(Boolean)
      .join('\n\n');
  }
  return base ? `${base}\n\n${heading}\n${add}` : `${heading}\n${add}`;
}

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
 * - opts.sectionLabel：给定时，**仅角色(character)节点**的新增/追加正文归到 `## <label>` 小节下
 *   （如「第2卷 · 楼层 50~99」）——角色需要逐卷呈现变化过程；事件/地点/物品等
 *   保持平文追加，避免一条事实被卷标题切碎、时间轴/卡片显示乱序。
 */
export function applyTreeOps(
  nodes: StoryNode[],
  ops: TreeOp[],
  opts: { sectionLabel?: string } = {}
): ApplyResult {
  let cur = nodes;
  let inserted = 0, updated = 0, archived = 0, skipped = 0;

  const mergeInto = (id: string, content: string | undefined, tags: string[]) => {
    const node = findById(cur, id)!;
    // 分卷小节只给角色节点用；其余类型平文追加
    const label = node.type === 'character' ? opts.sectionLabel : undefined;
    const newContent = content?.trim()
      ? appendToSection(node.content, label, content)
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
        // 同名已存在 → 合并而非重复插入；顺带补上缺失的类型标注（影响分卷判定）
        const type = isStoryNodeType(op.type) ? op.type : undefined;
        if (type && !twin.type) cur = updateNode(cur, twin.id, { type });
        mergeInto(twin.id, op.content, toTags(op.keywords));
        updated++;
      } else {
        const type = isStoryNodeType(op.type) ? op.type : undefined;
        const { nodes: next, node } = addNode(cur, ensured.parentId, {
          title,
          hint: op.hint ?? '',
          content: appendToSection('', type === 'character' ? opts.sectionLabel : undefined, op.content ?? ''),
          tags: toTags(op.keywords),
          ...(type ? { type } : {}),
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
