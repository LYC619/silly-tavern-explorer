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
  /** 本块是同一原始段落跨页后的续文；续文不重复首行缩进。 */
  continuedFromPrevious?: boolean;
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

const DEFAULT_PAGE_WEIGHT = 220;
const BLOCK_SPACING_WEIGHT = 2;

/** 正文行高倍数，与 NovelView 里 <article> 的 lineHeight 保持一致 */
const NOVEL_LINE_HEIGHT = 1.75;
/** 每页顶部「#12–15 楼」那一条占掉的行数 */
const PAGE_HEADER_LINES = 2;
/**
 * 每行末尾一般填不满（段落最后一行、标点比 1em 窄、user 楼层缩进）。
 * 页面是 overflow-hidden，宁可留白也不能溢出裁字，所以按 0.85 折。
 */
const PAGE_FILL_RATIO = 0.85;

/**
 * 按书页实际尺寸算一页能放多少字。
 *
 * 原来这里是个常数（18px 时 140 字），而一页实测能放 400 字上下，于是每页只填了
 * 三分之一、剩下大片空白，翻页密度是应有的三倍——用户报的「小说视图拆得特别碎」
 * 就是这个（0830 反馈 9）。
 *
 * 量不到尺寸（首帧、jsdom）时传 0，回退到原来的常数档。
 * ponytail: CJK 按 1em/字近似，纯英文正文会偏保守（一行能放的字母更多）。
 * 要更准就得拿 canvas measureText 按实际字体算，先不上。
 */
export function novelPageCapacity(box: { width: number; height: number }, fontSize: number): number {
  if (!(box.width > 0) || !(box.height > 0) || !(fontSize > 0)) {
    return Math.max(90, Math.round(140 * (18 / fontSize || 1)));
  }
  const charsPerLine = Math.floor(box.width / fontSize);
  const lines = Math.floor(box.height / (fontSize * NOVEL_LINE_HEIGHT)) - PAGE_HEADER_LINES;
  return Math.max(90, Math.round(charsPerLine * Math.max(1, lines) * PAGE_FILL_RATIO));
}

function blockWeight(block: NovelBlock): number {
  return block.type === 'scene-break'
    ? 18
    : Math.max(block.text.length, 1) + BLOCK_SPACING_WEIGHT;
}

const STRONG_PAGE_BREAK = /[。！？!?…]/u;
const WEAK_PAGE_BREAK = /[，、；：,;:]/u;
const TRAILING_PUNCTUATION = /[，。！？；：、,.!?）》】」』”’]/u;

interface TextPageSplit {
  head: string;
  tail: string;
  naturalBoundary: boolean;
}

/**
 * 在可用字符数内优先寻找句末，其次寻找逗号等短停顿；没有自然边界时才硬切。
 * 硬切后会把紧跟着的标点/闭引号留在前页，绝不让新页从孤立标点开始。
 */
function splitTextForPage(text: string, maxChars: number): TextPageSplit {
  if (text.length <= maxChars) return { head: text, tail: '', naturalBoundary: true };
  const safeMax = Math.max(1, maxChars);
  const preferredMin = Math.max(1, Math.floor(safeMax * 0.45));
  let strong = -1;
  let weak = -1;
  let whitespace = -1;

  for (let index = 0; index < Math.min(text.length, safeMax); index += 1) {
    const char = text[index];
    const end = index + 1;
    if (STRONG_PAGE_BREAK.test(char)) strong = end;
    else if (WEAK_PAGE_BREAK.test(char)) weak = end;
    else if (/\s/u.test(char)) whitespace = end;
  }

  let splitAt = strong >= preferredMin
    ? strong
    : weak >= preferredMin
      ? weak
      : whitespace >= preferredMin
        ? whitespace
        : safeMax;
  const naturalBoundary = splitAt !== safeMax || strong === safeMax || weak === safeMax || whitespace === safeMax;

  // 标点和闭引号属于前面的语句；允许页容量轻微超出，也不要让它成为下一页首字。
  while (splitAt < text.length && TRAILING_PUNCTUATION.test(text[splitAt])) splitAt += 1;

  return {
    head: text.slice(0, splitAt),
    tail: text.slice(splitAt),
    naturalBoundary,
  };
}

/**
 * 把章节切成稳定的实体书页。正文按阅读边界流入剩余空间；段落确实放不下时优先
 * 在句末续页，避免页面大块留白，也避免从标点或半句话的错误位置开页。
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

    for (const block of chapter.blocks) {
      if (block.type === 'scene-break') {
        const weight = blockWeight(block);
        if (pageBlocks.length > 0 && pageWeight + weight > limit) flush();
        pageBlocks.push(block);
        pageWeight += weight;
        continue;
      }

      let remaining = block.text;
      let continued = Boolean(block.continuedFromPrevious);
      while (remaining.length > 0) {
        let available = Math.max(0, limit - pageWeight - BLOCK_SPACING_WEIGHT);
        if (available <= 0) {
          if (pageBlocks.length > 0) {
            flush();
            continue;
          }
          // 极端的小容量参数仍需保证前进，不能在空页上反复 flush 形成死循环。
          available = 1;
        }

        if (remaining.length <= available) {
          const nextBlock = {
            ...block,
            text: remaining,
            continuedFromPrevious: continued || undefined,
          };
          pageBlocks.push(nextBlock);
          pageWeight += blockWeight(nextBlock);
          remaining = '';
          continue;
        }

        const split = splitTextForPage(remaining, available);
        const fullPageTextCapacity = Math.max(1, limit - BLOCK_SPACING_WEIGHT);
        // 小段能完整放到下一页、当前余量内又没有自然停顿时，宁可整段换页，
        // 不制造截图中那种莫名其妙的半句话断裂。
        if (pageBlocks.length > 0 && !split.naturalBoundary && remaining.length <= fullPageTextCapacity) {
          flush();
          continue;
        }

        const nextBlock = {
          ...block,
          text: split.head,
          continuedFromPrevious: continued || undefined,
        };
        pageBlocks.push(nextBlock);
        pageWeight += blockWeight(nextBlock);
        remaining = split.tail;
        continued = true;
        flush();
      }
    }
    flush();
  });

  return pages;
}

/** 双页书籍始终以偶数页作为左页，并把越界位置夹到最后一组跨页。 */
export function normalizeNovelSpreadStart(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  const clamped = Math.min(Math.max(Math.floor(pageIndex), 0), pageCount - 1);
  return clamped - (clamped % 2);
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
