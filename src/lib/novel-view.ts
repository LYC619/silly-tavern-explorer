/**
 * 小说视图三层管道（2.0 阶段6，定稿 5.1「小说视图」）。
 *
 * 已实证的教训（定稿原文）：纯连排/缩进/按楼数分章效果差。病根 = 用户楼层文风不搭、
 * 楼内结构没拆开、按楼数切章切不到场景边界。因此：
 * 1. 纯文本层（免费、即时、主力）：清洗（正则/HTML/OOC/隐藏楼）→ 楼内拆句重排
 *    （引号对白独立成段、星号旁白合并为叙述段）→ 用户楼层三档位（弱化/隐藏/保留）
 *    → 时间戳楼间隔超长自动插场景分隔符。
 * 2. 章节层：沿用章节标记机制；AI 只看分卷总结/抽样定边界和标题，不读全文。
 * 3. AI 润色层：按章走自定义记录的「小说化」模板重写（UI 层复用 summary-engine），
 *    本文件只提供章节楼层范围。
 *
 * 纯函数、无副作用，便于单测。
 */
import type { ChatMessage, ChapterMarker, RegexRule } from '@/types/chat';
import { applyRegexRules } from '@/lib/regex-processor';
import { isOOCMessage } from '@/lib/chat-edit';
import { parseSTDate } from '@/lib/adapters/st/chat-jsonl';
import { extractFirstJson } from '@/lib/character-ai';
import type { ChatCompletionMessage } from '@/components/ai-tools/useOpenAI';
import type { ChatSession } from '@/types/chat';
import type { SummaryItem } from '@/types/summary';

// ---------- 类型 ----------

/** 用户楼层三档位：weaken=弱化显示（默认）；hide=隐藏；keep=保留为对白 */
export type UserFloorMode = 'weaken' | 'hide' | 'keep';

export interface NovelViewOptions {
  userMode: UserFloorMode;
  /** 是否显示 ST 标记为隐藏的真实楼层；默认显示，避免阅读视图静默丢内容 */
  showHidden: boolean;
  /** 楼间隔超过该分钟数插场景分隔符；0 = 关闭 */
  sceneGapMinutes: number;
  /** 显示前应用的正则规则（沿用聊天设置） */
  regexRules: RegexRule[];
}

export const DEFAULT_NOVEL_OPTIONS: Omit<NovelViewOptions, 'regexRules'> = {
  userMode: 'weaken',
  showHidden: true,
  sceneGapMinutes: 30,
};

export type NovelBlockType = 'narration' | 'dialogue' | 'user' | 'scene-break';

export interface NovelBlock {
  type: NovelBlockType;
  text: string;
  /** 来源楼层号（scene-break 取其后一楼） */
  floor: number;
  /** 来源楼层在 ST 中被标记为 Hide；仍显示时只做视觉标识 */
  hidden?: boolean;
}

export interface NovelChapter {
  /** 无标记的开头部分为 undefined */
  title?: string;
  startFloor: number;
  endFloor: number;
  blocks: NovelBlock[];
}

export interface NovelPage {
  /** 所属章节在文档中的索引 */
  chapterIndex: number;
  /** 仅章节第一页带标题，其余页沿用 chapterTitle 供 UI 显示上下文 */
  title?: string;
  chapterTitle?: string;
  startFloor: number;
  endFloor: number;
  blocks: NovelBlock[];
}

export interface NovelBookmark {
  messageId: string;
  floor: number;
  snippet: string;
  pageIndex: number;
}

// ---------- 楼内拆句重排 ----------

/** 中英引号对（开→闭）。直引号 " 成对出现按顺序配对 */
const QUOTE_PAIRS: [string, string][] = [
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['"', '"'],
];

interface Segment {
  type: 'narration' | 'dialogue';
  text: string;
}

/** 去 HTML 标签与 markdown 代码块（状态栏类内容主要靠用户正则，这里只兜底） */
function stripMarkup(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]{1,200}>/g, '')
    .replace(/&nbsp;/g, ' ');
}

/**
 * 把一段原始文本拆成 对白/叙述 分段：
 * - 引号包裹的内容 → dialogue（含引号）；
 * - 星号旁白 *...* → 去星号并入叙述；
 * - 相邻叙述碎片合并为一段。
 */
export function splitSegments(paragraph: string): Segment[] {
  const text = paragraph.trim();
  if (!text) return [];
  const segs: Segment[] = [];
  let narration = '';
  const flushNarration = () => {
    // 星号旁白去星号；碎片间已在累积时自然连接
    const cleaned = narration.replace(/\*+/g, '').replace(/[ \t]+/g, ' ').trim();
    if (cleaned) segs.push({ type: 'narration', text: cleaned });
    narration = '';
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const pair = QUOTE_PAIRS.find(([open]) => open === ch);
    if (pair) {
      const close = pair[1];
      const end = text.indexOf(close, i + 1);
      if (end !== -1) {
        flushNarration();
        segs.push({ type: 'dialogue', text: text.slice(i, end + 1).trim() });
        i = end + 1;
        continue;
      }
    }
    narration += ch;
    i++;
  }
  flushNarration();
  return segs;
}

/** 一楼正文 → 重排后的分段（先按空行分段，段内再拆对白/叙述） */
export function reflowContent(content: string): Segment[] {
  const cleaned = stripMarkup(content);
  const paragraphs = cleaned.split(/\n{2,}|\n(?=\S)/).map((p) => p.replace(/\n/g, ' '));
  const out: Segment[] = [];
  for (const p of paragraphs) {
    out.push(...splitSegments(p));
  }
  return out;
}

// ---------- 时间戳 ----------

/** 楼层时间戳（毫秒）：msg.timestamp 优先，回退 ST 原始 send_date/gen_started */
export function messageTimeMs(msg: ChatMessage): number | undefined {
  if (typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp)) return msg.timestamp;
  const raw = msg.rawData;
  if (!raw) return undefined;
  return parseSTDate(raw.gen_started) ?? parseSTDate(raw.send_date);
}

// ---------- 主管道：消息 → 章节化小说文档 ----------

export function buildNovelDocument(
  messages: ChatMessage[],
  markers: ChapterMarker[],
  options: NovelViewOptions,
): NovelChapter[] {
  const { userMode, showHidden, sceneGapMinutes, regexRules } = options;
  const markerByMsgId = new Map(markers.filter((m) => m.messageId).map((m) => [m.messageId, m]));
  const markerByIndex = new Map(markers.filter((m) => !m.messageId).map((m) => [m.messageIndex, m]));

  const chapters: NovelChapter[] = [];
  let current: NovelChapter | null = null;
  let lastTime: number | undefined;
  const ensureChapter = (floor: number, title?: string) => {
    current = { title, startFloor: floor, endFloor: floor, blocks: [] };
    chapters.push(current);
  };

  messages.forEach((msg, idx) => {
    if (msg.role === 'system' || isOOCMessage(msg) || (msg.hidden && !showHidden)) return;
    const isUser = msg.role === 'user';
    if (isUser && userMode === 'hide') return;

    const marker = markerByMsgId.get(msg.id) ?? markerByIndex.get(idx);
    if (marker) {
      const title = `${marker.volume ? `${marker.volume} · ` : ''}${marker.title}`;
      ensureChapter(idx, title);
      lastTime = undefined; // 章节头不再叠加场景分隔符
    } else if (!current) {
      ensureChapter(idx);
    }

    const text = applyRegexRules(msg.content, regexRules, isUser);
    const segments = reflowContent(text);
    if (segments.length === 0) return;

    // 场景分隔符：与上一included楼时间间隔超阈值
    const t = messageTimeMs(msg);
    if (
      sceneGapMinutes > 0 &&
      lastTime !== undefined &&
      t !== undefined &&
      t - lastTime > sceneGapMinutes * 60_000
    ) {
      current!.blocks.push({ type: 'scene-break', text: '✦ ✦ ✦', floor: idx });
    }
    if (t !== undefined) lastTime = t;

    for (const seg of segments) {
      current!.blocks.push({
        // 用户楼层弱化：整楼降为 user 块（UI 弱化渲染）；保留档按正常对白/叙述处理
        type: isUser && userMode === 'weaken' ? 'user' : seg.type,
        text: seg.text,
        floor: idx,
        ...(msg.hidden ? { hidden: true } : {}),
      });
    }
    current!.endFloor = idx;
  });

  return chapters.filter((c) => c.blocks.length > 0);
}

const DEFAULT_PAGE_WEIGHT = 1800;

function blockWeight(block: NovelBlock): number {
  return block.type === 'scene-break' ? 12 : Math.max(block.text.length, 1);
}

/**
 * 把章节按楼层边界切成稳定的翻页单元。单个超长楼层不会被静默丢弃，
 * 只会形成一个可滚动的长页；这样书签和楼层定位始终指向真实消息。
 */
export function paginateNovelDocument(
  chapters: NovelChapter[],
  maxWeight = DEFAULT_PAGE_WEIGHT,
): NovelPage[] {
  const limit = Math.max(1, maxWeight);
  const pages: NovelPage[] = [];

  chapters.forEach((chapter, chapterIndex) => {
    let pageBlocks: NovelBlock[] = [];
    let pageWeight = 0;
    let pageNumber = 0;
    const flush = () => {
      if (pageBlocks.length === 0) return;
      pages.push({
        chapterIndex,
        title: pageNumber === 0 ? chapter.title : undefined,
        chapterTitle: chapter.title,
        startFloor: pageBlocks[0].floor,
        endFloor: pageBlocks[pageBlocks.length - 1].floor,
        blocks: pageBlocks,
      });
      pageBlocks = [];
      pageWeight = 0;
      pageNumber += 1;
    };

    const floorGroups: NovelBlock[][] = [];
    for (const block of chapter.blocks) {
      const last = floorGroups[floorGroups.length - 1];
      if (!last || last[0].floor !== block.floor) floorGroups.push([block]);
      else last.push(block);
    }

    for (const group of floorGroups) {
      const groupWeight = group.reduce((sum, block) => sum + blockWeight(block), 0);
      if (pageBlocks.length > 0 && pageWeight + groupWeight > limit) flush();
      pageBlocks.push(...group);
      pageWeight += groupWeight;
    }
    flush();
  });

  return pages;
}

/** 根据持久化的真实楼层把阅读位置夹到可见页范围。 */
export function findNovelPageIndex(pages: NovelPage[], floor?: number): number {
  if (pages.length === 0 || floor === undefined || !Number.isFinite(floor)) return 0;
  if (floor <= pages[0].startFloor) return 0;
  const found = pages.findIndex((page) => floor <= page.endFloor);
  return found === -1 ? pages.length - 1 : found;
}

/** 把现有故事书签（messageId）映射到小说翻页，不创建第二套书签数据。 */
export function buildNovelBookmarks(
  messages: ChatMessage[],
  favoriteIds: string[],
  pages: NovelPage[],
): NovelBookmark[] {
  const byId = new Map(messages.map((message, floor) => [message.id, { message, floor }]));
  return favoriteIds
    .map((messageId) => {
      const hit = byId.get(messageId);
      if (!hit) return null;
      return {
        messageId,
        floor: hit.floor,
        snippet: hit.message.content.replace(/\s+/g, ' ').trim().slice(0, 80) || '（空消息）',
        pageIndex: findNovelPageIndex(pages, hit.floor),
      };
    })
    .filter((item): item is NovelBookmark => item !== null)
    .sort((a, b) => a.floor - b.floor);
}

// ---------- 章节层：AI 定边界（只看总结/抽样，不读全文） ----------

export interface ChapterSuggestInput {
  session: ChatSession;
  /** 本故事已有分卷总结（有则优先作为判断依据） */
  volumeSummaries?: SummaryItem[];
  /** 抽样：正文抽多少楼参与判断 */
  maxProbes?: number;
}

const CHAPTER_SYSTEM = `你是小说编辑。用户给你一段角色扮演故事的梗概资料（分卷总结或抽样楼层），请判断按剧情场景应该在哪些楼层开新章节，并为每章拟一个简洁有味道的标题。
规则：
- 只依据给出的资料判断，边界尽量落在场景/时间/地点切换处。
- 章节数量适度（一般每 30~80 楼一章，随剧情密度调整），第 0 楼不用标记（开头自然成章）。
- 只输出一个 JSON 数组，不要输出其他文字。结构：[{"floor":楼层号,"title":"章节标题"}]，floor 为数字且严格递增。`;

export function buildChapterSuggestMessages(input: ChapterSuggestInput): ChatCompletionMessage[] {
  const { session, volumeSummaries = [], maxProbes = 40 } = input;
  const total = session.messages.length;
  const parts: string[] = [`故事共 ${total} 楼（楼层号 0~${total - 1}）。`];

  if (volumeSummaries.length > 0) {
    const sums = volumeSummaries
      .map((s) => `【第${s.volumeNumber ?? '?'}卷（楼层 ${s.floorStart}~${s.floorEnd}）】\n${s.content.slice(0, 2000)}`)
      .join('\n\n');
    parts.push(`已有分卷总结如下（可作为主要依据）：\n\n${sums}`);
  }

  // 抽样楼层：均匀取，每楼截前 120 字，标楼层号，供 AI 对齐边界
  const step = Math.max(1, Math.ceil(total / maxProbes));
  const probes: string[] = [];
  for (let i = 0; i < total; i += step) {
    const m = session.messages[i];
    if (!m || m.role === 'system') continue;
    const text = m.content.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (text) probes.push(`#${i}：${text}`);
  }
  parts.push(`抽样楼层（#楼层号：开头文字）：\n${probes.join('\n')}`);

  return [
    { role: 'system', content: CHAPTER_SYSTEM },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

export interface ChapterSuggestion {
  floor: number;
  title: string;
}

/** 解析章节建议：夹到合法楼层、去重、升序；解析失败返回 null */
export function parseChapterSuggestions(text: string, floorCount: number): ChapterSuggestion[] | null {
  const parsed = extractFirstJson(text);
  if (!Array.isArray(parsed)) return null;
  const seen = new Set<number>();
  const out: ChapterSuggestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const { floor, title } = item as { floor?: unknown; title?: unknown };
    if (typeof floor !== 'number' || !Number.isFinite(floor)) continue;
    const f = Math.round(floor);
    if (f <= 0 || f >= floorCount || seen.has(f)) continue; // 第 0 楼不标记
    seen.add(f);
    out.push({ floor: f, title: typeof title === 'string' && title.trim() ? title.trim() : `第 ${out.length + 1} 章` });
  }
  return out.sort((a, b) => a.floor - b.floor);
}
