/**
 * 角色页 AI 引擎（2.0 阶段6：AI 简介 + AI 评分）。
 *
 * 纯函数：组装 messages / 解析 AI 回复，不触网不碰存储；
 * 实际请求由 UI 层用返回的 messages 调 callOpenAIMessages（配置走全局 AI 配置页）。
 *
 * 读取范围（定稿第四章）：每次由用户勾选——仅角色卡 / +世界书 / +指定故事，
 * 范围以字符串数组记录（'card' / 'worldbook:<id>' / 'story:<id>'），存进简介版本或评分记录。
 */
import type { ChatCompletionMessage } from '@/components/ai-tools/useOpenAI';
import type { NormalizedCharacterCard } from '@/lib/png-parser';
import type { WorldBook } from '@/types/worldbook';
import type { ChatSession } from '@/types/chat';
import type { RatingTemplateItem, RatingDimensionScore } from '@/types/rating';
import { collectWorldbookEntries } from '@/lib/summary-engine';

// ---------- 资料块组装 ----------

/** 角色卡核心字段拼成资料块（空字段跳过；单字段截断防超长卡爆上下文） */
export function buildCardBlock(norm: NormalizedCharacterCard, maxFieldChars = 4000): string {
  const cap = (s: string) => (s.length > maxFieldChars ? `${s.slice(0, maxFieldChars)}\n…（已截断）` : s);
  const parts: string[] = [`角色名：${norm.name}`];
  if (norm.tags.length) parts.push(`标签：${norm.tags.join('、')}`);
  const fields: [string, string][] = [
    ['Description（角色描述）', norm.description],
    ['Personality（性格）', norm.personality],
    ['Scenario（场景）', norm.scenario],
    ['First Message（开场白）', norm.firstMessage],
  ];
  for (const [label, value] of fields) {
    if (value.trim()) parts.push(`【${label}】\n${cap(value.trim())}`);
  }
  return parts.join('\n\n');
}

/** 世界书启用条目拼成资料块（全部启用条目，总量截断） */
export function buildWorldbookBlock(title: string, wb: WorldBook, maxChars = 8000): string {
  const entries = collectWorldbookEntries(wb, 'all');
  const body = entries
    .map((e) => {
      const name = e.comment?.trim() ? `${e.comment.trim()}：` : '';
      return `- ${name}${(e.content ?? '').trim()}`;
    })
    .filter((line) => line.length > 2)
    .join('\n');
  const capped = body.length > maxChars ? `${body.slice(0, maxChars)}\n…（已截断）` : body;
  return `【世界书：${title}】\n${capped}`;
}

/**
 * 故事抽样节选（AI 评分「+指定故事」用）：不塞全文，均匀抽楼层、每楼截前若干字。
 * 目的：让 AI 看到实际玩起来的文风与互动质量，而不是复述剧情。
 */
export function buildStoryExcerpt(
  title: string,
  session: ChatSession,
  opts: { maxMessages?: number; maxCharsPerMessage?: number } = {},
): string {
  const { maxMessages = 20, maxCharsPerMessage = 200 } = opts;
  const msgs = session.messages.filter((m) => m.role !== 'system' && !m.hidden);
  if (msgs.length === 0) return `【故事节选：${title}】\n（无可用消息）`;
  const step = Math.max(1, Math.ceil(msgs.length / maxMessages));
  const lines: string[] = [];
  for (let i = 0; i < msgs.length; i += step) {
    const m = msgs[i];
    const speaker = m.role === 'user' ? (session.user?.name || 'User') : (session.character?.name || 'Character');
    const text = m.content.replace(/\s+/g, ' ').trim().slice(0, maxCharsPerMessage);
    if (text) lines.push(`#${i} ${speaker}：${text}`);
  }
  return `【故事节选：${title}（共 ${msgs.length} 楼，均匀抽样）】\n${lines.join('\n')}`;
}

// ---------- AI 简介 ----------

export interface IntroEngineInput {
  norm: NormalizedCharacterCard;
  /** 勾选的世界书（已加载本体），生成资料块并记入 readScope */
  worldbooks?: { id: string; title: string; wb: WorldBook }[];
}

export interface IntroEngineResult {
  messages: ChatCompletionMessage[];
  /** 本次读取范围（存进 IntroVersion.readScope） */
  readScope: string[];
}

const INTRO_SYSTEM = `你是角色卡归档助手。用户会给你一张 SillyTavern 角色卡的原始字段（可能还有关联世界书），请为它写一份「档案简介」，给已经拥有这张卡的玩家在自己的收藏库里回看用。
要求：
- 用中文写，300~500 字左右，Markdown 格式（可用少量小标题或列表）。
- 内容覆盖：这是个什么角色（身份/性格核心）、故事发生的世界与处境、这张卡的玩法特点（开场情境、可能的发展方向）。
- 忠于原文：只整理与提炼，不虚构原文没有的设定；原文是外语时用中文转述。
- 不要输出「好的，以下是简介」之类的过场话，直接输出简介正文。`;

export function buildIntroMessages(input: IntroEngineInput): IntroEngineResult {
  const { norm, worldbooks = [] } = input;
  const readScope = ['card', ...worldbooks.map((w) => `worldbook:${w.id}`)];
  const blocks = [buildCardBlock(norm), ...worldbooks.map((w) => buildWorldbookBlock(w.title, w.wb))];
  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: INTRO_SYSTEM },
    { role: 'user', content: `以下是角色卡资料：\n\n${blocks.join('\n\n')}\n\n请生成档案简介。` },
  ];
  return { messages, readScope };
}

/** 读取范围的展示标签（'card' → 角色卡；worldbook:<id> → 世界书名，查不到给回退） */
export function describeReadScope(scope: string[] | undefined, names: Map<string, string> = new Map()): string {
  if (!scope || scope.length === 0) return '';
  return scope
    .map((s) => {
      if (s === 'card') return '角色卡';
      const [kind, id] = s.split(':', 2);
      if (kind === 'worldbook') return `世界书「${names.get(id) ?? '已删除'}」`;
      if (kind === 'story') return `故事「${names.get(id) ?? '已删除'}」`;
      return s;
    })
    .join(' + ');
}

// ---------- AI 评分 ----------

export interface RatingEngineInput {
  template: RatingTemplateItem;
  norm: NormalizedCharacterCard;
  worldbooks?: { id: string; title: string; wb: WorldBook }[];
  stories?: { id: string; title: string; session: ChatSession }[];
}

export interface RatingEngineResult {
  messages: ChatCompletionMessage[];
  readScope: string[];
}

export function buildRatingMessages(input: RatingEngineInput): RatingEngineResult {
  const { template, norm, worldbooks = [], stories = [] } = input;
  const readScope = [
    'card',
    ...worldbooks.map((w) => `worldbook:${w.id}`),
    ...stories.map((s) => `story:${s.id}`),
  ];
  const dimensionList = template.dimensions
    .map((d) => `- ${d.name}（权重 ${d.weight}${d.hint ? `；${d.hint}` : ''}）`)
    .join('\n');
  const system = `${template.prompt.trim()}

评分维度：
${dimensionList}

输出格式：只输出一个 JSON 对象，不要输出其他文字。结构：
{"dimensions":[{"name":"维度名","score":分数,"reason":"打分理由"}],"note":"一句话总评"}
其中 score 为 0~10 的数字（可含 0.5），dimensions 必须覆盖上面列出的每个维度，name 与维度名一致。`;
  const blocks = [
    buildCardBlock(norm),
    ...worldbooks.map((w) => buildWorldbookBlock(w.title, w.wb)),
    ...stories.map((s) => buildStoryExcerpt(s.title, s.session)),
  ];
  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: `以下是这张角色卡的资料，请按要求打分：\n\n${blocks.join('\n\n')}` },
  ];
  return { messages, readScope };
}

/** 从 AI 回复里抠出第一个平衡的 JSON 对象/数组并解析（容忍 ```json 围栏与前后废话） */
export function extractFirstJson(text: string): unknown | null {
  const src = text.replace(/```(?:json)?/gi, '');
  for (let i = 0; i < src.length; i++) {
    const open = src[i];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    for (let j = i; j < src.length; j++) {
      const ch = src[j];
      if (inStr) {
        if (ch === '\\') j++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(src.slice(i, j + 1));
          } catch {
            break; // 这个候选不合法，从下一个起点继续找
          }
        }
      }
    }
  }
  return null;
}

const clampScore = (n: number): number => Math.min(10, Math.max(0, Math.round(n * 2) / 2));

/** 加权总分：Σ(score×weight)/Σweight，0.5 步进。无有效权重时退化为算术平均 */
export function computeWeightedTotal(dims: { weight: number; score: number }[]): number {
  if (dims.length === 0) return 0;
  const weightSum = dims.reduce((s, d) => s + (d.weight > 0 ? d.weight : 0), 0);
  const raw = weightSum > 0
    ? dims.reduce((s, d) => s + d.score * (d.weight > 0 ? d.weight : 0), 0) / weightSum
    : dims.reduce((s, d) => s + d.score, 0) / dims.length;
  return clampScore(raw);
}

export interface ParsedRating {
  dimensions: RatingDimensionScore[];
  total: number;
  note?: string;
}

/**
 * 解析 AI 评分回复：按模板维度名对齐（名字精确匹配优先，回退按顺序），分数夹到 0~10。
 * AI 漏掉的维度以 score=0 占位（reason 标注缺失），保证维度结构与模板一致、用户可手工补。
 */
export function parseRatingResponse(text: string, template: RatingTemplateItem): ParsedRating | null {
  const parsed = extractFirstJson(text);
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as { dimensions?: unknown; note?: unknown };
  const rawDims = Array.isArray(obj.dimensions) ? obj.dimensions : [];
  type RawDim = { name?: unknown; score?: unknown; reason?: unknown };
  const items = rawDims.filter((d): d is RawDim => !!d && typeof d === 'object');
  if (items.length === 0) return null;

  // 两遍对齐：先让所有模板维度按名字认领（精确→包含），剩下没认领的维度再按顺序
  // 吃掉未被认领的项——一步做完会让顺序回退抢走本该按名匹配给后面维度的项。
  const used = new Set<number>();
  const hits: number[] = template.dimensions.map((td) => {
    let hit = items.findIndex((d, i) => !used.has(i) && typeof d.name === 'string' && d.name.trim() === td.name);
    if (hit === -1) hit = items.findIndex((d, i) => !used.has(i) && typeof d.name === 'string' && (d.name as string).includes(td.name));
    if (hit !== -1) used.add(hit);
    return hit;
  });
  for (let t = 0; t < hits.length; t++) {
    if (hits[t] !== -1) continue;
    const fallback = items.findIndex((_, i) => !used.has(i));
    if (fallback !== -1) {
      hits[t] = fallback;
      used.add(fallback);
    }
  }
  const dimensions: RatingDimensionScore[] = template.dimensions.map((td, tIdx) => {
    const hit = hits[tIdx];
    if (hit === -1) {
      return { name: td.name, weight: td.weight, score: 0, reason: '（AI 未给出该维度，请手工补分）' };
    }
    const d = items[hit];
    const score = typeof d.score === 'number' && Number.isFinite(d.score) ? clampScore(d.score) : 0;
    return {
      name: td.name,
      weight: td.weight,
      score,
      reason: typeof d.reason === 'string' ? d.reason : undefined,
    };
  });

  return {
    dimensions,
    total: computeWeightedTotal(dimensions),
    note: typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined,
  };
}
