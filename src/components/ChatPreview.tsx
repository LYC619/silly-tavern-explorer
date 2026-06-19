import { forwardRef, useMemo, useState, useEffect, useRef, useImperativeHandle, memo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { User, Bot, Bookmark, BookmarkPlus } from 'lucide-react';
import type { ChatSession, ThemeStyle, RegexRule, ChapterMarker } from '@/types/chat';
import { applyRegexRules, parseRegex } from '@/lib/regex-processor';
import { parseSTDate } from '@/components/ChatImporter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * ChatPreview 暴露给父组件的命令式句柄：跳转条/收藏列表通过它驱动滚动。
 * 因为 ChatPreview 内部才知道「过滤空消息后的楼层 → 虚拟索引」的映射，所以跳转解析放在这里。
 */
export interface ChatPreviewHandle {
  /** 跳到第 floor 楼（1-based，与界面 #N 一致） */
  scrollToFloor: (floor: number) => void;
  /** 按 messageId 跳转（收藏列表用，id 稳定不受空消息过滤影响） */
  scrollToMessageId: (messageId: string) => void;
  /** 过滤空消息后的总楼层数，供跳转条做边界 */
  getFloorCount: () => number;
  /** 跳到下一个/上一个搜索命中（循环），无命中时无操作 */
  nextMatch: () => void;
  prevMatch: () => void;
}

interface ChatPreviewProps {
  session: ChatSession;
  theme: ThemeStyle;
  showTimestamp: boolean;
  showAvatar: boolean;
  fontSize: number;
  regexRules: RegexRule[];
  markers?: ChapterMarker[];
  onMessageClick?: (messageId: string, messageIndex: number) => void;
  editMode?: boolean;
  fontFamily?: string;
  /** 正在预览的规则：命中的内容会在正文中用红色删除线高亮标出（所见即所得） */
  previewRule?: RegexRule | null;
  /** 顶部可见楼层变化回调：floor 为 1-based 楼层号，messageId 为该楼 id */
  onVisibleFloorChange?: (floor: number, messageId: string | null) => void;
  /** 过滤后楼层顺序变化时上报 messageId→楼层号(1-based) 映射，供收藏列表显示楼层 */
  onFloorMapChange?: (map: Map<string, number>) => void;
  /** 全文搜索词（纯字符串，大小写不敏感） */
  searchQuery?: string;
  /** 搜索结果变化回调：命中楼层数 + 当前定位到第几个命中(1-based，0 表示无) */
  onSearchResult?: (total: number, current: number) => void;
}

/**
 * 把一段文本按某条规则的匹配位置切分渲染：命中部分用红色删除线、替换内容用绿色标出。
 * 用于主界面原地预览正则效果，替代侧边栏的小框对比。
 */
function renderPreviewHighlight(content: string, rule: RegexRule): React.ReactNode {
  const regex = parseRegex(rule.findRegex);
  if (!regex) return content;
  const g = regex.flags.includes('g') ? regex : new RegExp(regex.source, regex.flags + 'g');
  g.lastIndex = 0;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  let count = 0;
  while ((m = g.exec(content)) !== null && count < 2000) {
    count++;
    if (m.index > last) nodes.push(content.slice(last, m.index));
    const matched = m[0];
    if (matched.length === 0) { g.lastIndex++; continue; }
    nodes.push(
      <span key={`d${key}`} className="bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 line-through rounded-sm px-0.5">
        {matched}
      </span>
    );
    if (rule.replaceString) {
      nodes.push(
        <span key={`r${key}`} className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 rounded-sm px-0.5">
          {rule.replaceString}
        </span>
      );
    }
    last = m.index + matched.length;
    key++;
  }
  if (last < content.length) nodes.push(content.slice(last));
  return nodes.length > 0 ? nodes : content;
}

/** 把文本里命中搜索词的部分用 <mark> 标黄（大小写不敏感，纯字符串匹配，非正则）。 */
function renderTextWithSearch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let from = 0;
  let key = 0;
  let idx = lowerText.indexOf(lowerQuery, from);
  while (idx !== -1) {
    if (idx > from) nodes.push(text.slice(from, idx));
    nodes.push(
      <mark key={`s${key}`} className="rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/40">
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    from = idx + query.length;
    key++;
    idx = lowerText.indexOf(lowerQuery, from);
  }
  if (from < text.length) nodes.push(text.slice(from));
  return nodes.length > 0 ? nodes : text;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** processedMessages 的单条形态：原始消息 + 派生的渲染字段（自包含，不依赖相邻行） */
interface ProcessedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  name?: string;
  timestamp?: number;
  rawData?: unknown;
  paragraphs: string[];
  /** 是否与上一条不同说话人——预算进 memo，虚拟化后行不连续渲染也正确 */
  isNewSpeaker: boolean;
}

type ThemeClasses = ReturnType<typeof getThemeClasses>;

function getThemeClasses(theme: ThemeStyle) {
  switch (theme) {
    case 'novel':
      return {
        container: 'paper-bg p-8 font-serif',
        title: 'text-center mb-8 pb-4 border-b-2 border-primary/30',
        message: 'mb-5',
        userBubble: '',
        charBubble: '',
        content: 'reading-flow',
        name: 'font-display text-primary/70 text-sm mb-1',
        separator: 'hidden',
      };
    case 'social':
      return {
        container: 'bg-background p-6',
        title: 'text-left mb-6 pb-3 border-b border-border',
        message: 'mb-4 flex gap-3',
        userBubble: 'flex-row-reverse',
        charBubble: 'flex-row',
        content: 'rounded-2xl px-4 py-2.5 max-w-[80%]',
        name: 'text-xs text-muted-foreground mb-1',
        separator: 'hidden',
      };
    case 'minimal':
      return {
        container: 'bg-background p-8',
        title: 'mb-8 pb-2 border-b border-border',
        message: 'mb-4 py-2',
        userBubble: 'border-l-2 border-primary pl-4',
        charBubble: 'border-l-2 border-muted-foreground/30 pl-4',
        content: '',
        name: 'font-medium text-sm mb-1',
        separator: 'hidden',
      };
    case 'elegant':
    default:
      return {
        container: 'paper-bg p-10 decorative-border',
        title: 'text-center mb-10 space-y-2',
        message: 'mb-5',
        userBubble: '',
        charBubble: '',
        content: 'reading-flow',
        name: 'font-display text-base text-primary/70 mb-1',
        separator: 'hidden',
      };
  }
}

interface MessageRowProps {
  message: ProcessedMessage;
  marker?: ChapterMarker;
  index: number;
  theme: ThemeStyle;
  classes: ThemeClasses;
  showTimestamp: boolean;
  showAvatar: boolean;
  editMode: boolean;
  previewRule: RegexRule | null;
  /** 全文搜索词，命中处标黄；与 previewRule 互斥（预览优先） */
  searchQuery: string;
  /** 本行是否为当前选中的搜索命中（高亮整行 + 滚动定位目标） */
  isActiveMatch: boolean;
  userName: string;
  charName: string;
  onMessageClick?: (messageId: string, messageIndex: number) => void;
}

/**
 * 单条消息的渲染单元。从原 map body 抽出并用 memo 包裹，
 * 虚拟化滚动时只重渲染进出可视区的行，无关行不动。
 * 章节标记横幅留在行内（作为该行第一个子元素），高度随行一起被动态测量。
 */
const MessageRow = memo(function MessageRow({
  message, marker, index, theme, classes, showTimestamp, showAvatar,
  editMode, previewRule, searchQuery, isActiveMatch, userName, charName, onMessageClick,
}: MessageRowProps) {
  const isUser = message.role === 'user';
  const isNewSpeaker = message.isNewSpeaker;
  const hasMarker = !!marker;

  return (
    <div>
      {/* Chapter marker display */}
      {hasMarker && (
        <div className="my-6 py-4 border-y border-primary/30 bg-primary/5 text-center">
          {marker.volume && (
            <div className="text-xs text-muted-foreground tracking-widest uppercase mb-1">
              {marker.volume}
            </div>
          )}
          <div className="font-display text-lg text-primary">
            {marker.title}
          </div>
          {marker.summary && (
            <div className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              {marker.summary}
            </div>
          )}
        </div>
      )}

      <div
        className={`${classes.message} ${isUser ? classes.userBubble : classes.charBubble} animate-fade-in group relative ${
          editMode ? 'cursor-pointer hover:bg-primary/5 rounded-lg transition-colors pt-9 px-2' : ''
        } ${isActiveMatch ? 'rounded-lg ring-2 ring-primary/60 ring-offset-2 ring-offset-background' : ''}`}
        onClick={() => editMode && onMessageClick?.(message.id, index)}
      >
        {/* 章节标记模式：每条消息左上角常驻楼层号+书签按钮，清晰可点 */}
        {editMode && (
          <div className="absolute left-1 top-1 flex items-center gap-1 z-10">
            <span className="text-xs text-muted-foreground font-mono">
              #{index}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-xs transition-colors ${
                  hasMarker
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}>
                  {hasMarker ? (
                    <Bookmark className="w-3.5 h-3.5 fill-primary" />
                  ) : (
                    <BookmarkPlus className="w-3.5 h-3.5" />
                  )}
                  <span>{hasMarker ? '已标记' : '设章节'}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                {hasMarker ? '点击编辑章节标记' : '点击此楼设为章节起点'}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        {/* 非编辑模式：左侧外侧常驻楼层号（像行号），与名字/正文首行对齐，醒目易认，方便和左侧跳转条对照 */}
        {!editMode && (
          <span
            className="pointer-events-none absolute -left-12 top-0.5 hidden w-9 select-none text-right font-mono text-sm font-semibold tabular-nums text-primary/50 md:block"
            aria-hidden="true"
          >
            {index}
          </span>
        )}
        {theme === 'social' ? (
          <>
            {showAvatar && (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isUser ? 'bubble-user' : 'bubble-char'
              }`}>
                {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
            )}
            <div className={isUser ? 'text-right' : 'text-left'}>
              <div className={classes.name}>
                {message.name || (isUser ? userName : charName)}
              </div>
              <div className={`inline-block ${classes.content} ${
                isUser ? 'bubble-user' : 'bubble-char'
              } whitespace-pre-wrap`}>
                {previewRule
                  ? renderPreviewHighlight(message.content, previewRule)
                  : searchQuery
                    ? renderTextWithSearch(message.content, searchQuery)
                    : message.content}
              </div>
              {showTimestamp && (
                <div className="text-xs text-muted-foreground mt-1">
                  {formatTime(message.timestamp)}
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            {/* 阅读流主题(elegant/novel)下，同一说话人连续发言时省略重复名字，
                让正文更连贯，贴近小说阅读体验；minimal 仍每条都标名 */}
            {(theme === 'minimal' || isNewSpeaker) && (
              <div className={classes.name}>
                {message.name || (isUser ? userName : charName)}
                {(() => {
                  // 优先用导入时解析好的 timestamp；旧数据(timestamp 为空)则从 rawData.send_date 兜底实时解析，
                  // 这样无需重新导入也能显示时间戳。
                  const ts = message.timestamp ?? parseSTDate((message.rawData as { send_date?: unknown } | undefined)?.send_date);
                  return showTimestamp && ts ? (
                    <span className="text-muted-foreground font-normal ml-2 text-xs">
                      {formatTime(ts)}
                    </span>
                  ) : null;
                })()}
              </div>
            )}
            <div className={`${classes.content} whitespace-pre-wrap`}>
              {previewRule
                ? renderPreviewHighlight(message.content, previewRule)
                : (theme === 'elegant' || theme === 'novel')
                  ? message.paragraphs.map((p, i) => (
                      <p key={i} className="reading-paragraph">
                        {searchQuery ? renderTextWithSearch(p, searchQuery) : p}
                      </p>
                    ))
                  : (searchQuery ? renderTextWithSearch(message.content, searchQuery) : message.content)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export const ChatPreview = memo(forwardRef<ChatPreviewHandle, ChatPreviewProps>(
  ({ session, theme, showTimestamp, showAvatar, fontSize, regexRules, markers = [], onMessageClick, editMode = false, fontFamily, previewRule = null, onVisibleFloorChange, onFloorMapChange, searchQuery = '', onSearchResult }, ref) => {
    const markerMap = useMemo(() => {
      const map = new Map<string, ChapterMarker>();
      markers.forEach(m => map.set(m.messageId, m));
      return map;
    }, [markers]);
    // 防抖正则规则：编辑规则时频繁触发会导致大文本(数十万字)全量重算卡顿，
    // 延迟 300ms 再应用，输入过程中不阻塞 UI。
    const [debouncedRules, setDebouncedRules] = useState(regexRules);
    useEffect(() => {
      const t = setTimeout(() => setDebouncedRules(regexRules), 300);
      return () => clearTimeout(t);
    }, [regexRules]);
    // 预处理消息，应用正则规则
    const processedMessages = useMemo<ProcessedMessage[]>(() => {
      // 预览某规则时，把该规则从应用列表中排除，这样它本该删除的内容仍保留在正文里，
      // 再由 renderPreviewHighlight 用红色删除线标出——所见即所得。
      const activeRules = previewRule
        ? debouncedRules.filter(r => r.id !== previewRule.id)
        : debouncedRules;
      const out: ProcessedMessage[] = [];
      let prevRole: string | null = null; // 记录上一条已保留消息的 role，预算 isNewSpeaker
      for (const msg of session.messages) {
        const isUser = msg.role === 'user';
        // 去除首尾空白：正则删除开头/结尾的标签块后常残留换行，
        // 否则 text-indent 会缩进到这条残留空行上，导致正文看起来没缩进、缩进忽有忽无。
        const processedContent = applyRegexRules(msg.content, activeRules, isUser).trim();
        if (!processedContent) continue; // 过滤掉空消息
        // 预切段落（仅在此 memo 里算一次），render 时直接 map 成 <p>，
        // 避免每次重渲染都对全部消息重跑 split。
        const paragraphs = processedContent.split(/\n+/).map(s => s.trim()).filter(Boolean);
        // isNewSpeaker 预算进 memo：虚拟化后行不连续渲染，不能在 render 里读 [index-1]。
        out.push({
          ...msg,
          content: processedContent,
          paragraphs,
          isNewSpeaker: prevRole !== msg.role,
        });
        prevRole = msg.role;
      }
      return out;
    }, [session.messages, debouncedRules, previewRule]);

    const classes = useMemo(() => getThemeClasses(theme), [theme]);

    // 窗口虚拟化：沿用整页滚动，只渲染可视区±overscan 的消息行。
    // scrollMargin = 列表容器相对文档顶部的偏移，让虚拟坐标对齐整页滚动。
    const listRef = useRef<HTMLDivElement>(null);
    // 容器挂载/布局变化后测量 offsetTop（首帧 ref 仍为 null，故用 state 兜住）。
    const [scrollMargin, setScrollMargin] = useState(0);
    useEffect(() => {
      const el = listRef.current;
      if (!el) return;
      const measure = () => setScrollMargin(el.offsetTop);
      measure();
      // 标题块高度随主题变化、字体加载会改变 offsetTop，用 ResizeObserver 跟随
      const ro = new ResizeObserver(measure);
      if (el.parentElement) ro.observe(el.parentElement);
      return () => ro.disconnect();
    }, [theme, session.title]);

    const virtualizer = useWindowVirtualizer({
      count: processedMessages.length,
      estimateSize: () => 200, // 估计行高；measureElement 会逐行校正
      overscan: 6,
      // 行用 message.id 做稳定 key，正则预览/排序变化时复用 DOM、保留测量
      getItemKey: (i) => processedMessages[i]?.id ?? i,
      scrollMargin,
    });

    const virtualItems = virtualizer.getVirtualItems();

    // messageId → 过滤后楼层索引，供 scrollToMessageId 解析
    const idToIndex = useMemo(() => {
      const m = new Map<string, number>();
      processedMessages.forEach((msg, i) => m.set(msg.id, i));
      return m;
    }, [processedMessages]);

    // 楼层顺序变化时上报 messageId→楼层号(1-based)，收藏列表用它显示楼层
    useEffect(() => {
      if (!onFloorMapChange) return;
      const m = new Map<string, number>();
      idToIndex.forEach((i, id) => m.set(id, i));
      onFloorMapChange(m);
    }, [idToIndex, onFloorMapChange]);

    // 全文搜索：命中的楼层索引列表（对过滤后正文做大小写不敏感匹配）
    const matchIndices = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return [] as number[];
      const out: number[] = [];
      processedMessages.forEach((msg, i) => {
        if (msg.content.toLowerCase().includes(q)) out.push(i);
      });
      return out;
    }, [searchQuery, processedMessages]);

    // 当前定位到第几个命中（matchIndices 里的下标）。搜索词变化时重置到第一个。
    const [matchPos, setMatchPos] = useState(0);
    useEffect(() => {
      setMatchPos(0);
      // 上报命中总数与当前序号（1-based）
      onSearchResult?.(matchIndices.length, matchIndices.length > 0 ? 1 : 0);
      // 首个命中时滚过去
      if (matchIndices.length > 0) {
        virtualizer.scrollToIndex(matchIndices[0], { align: 'center' });
      }
      // 仅在搜索词/命中集合变化时触发，virtualizer 不入依赖避免重复滚动
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchIndices]);

    const activeMatchIndex = matchIndices.length > 0 ? matchIndices[matchPos] : -1;

    // 暴露命令式句柄给跳转条/收藏列表
    useImperativeHandle(ref, () => ({
      scrollToFloor: (floor: number) => {
        const idx = Math.min(Math.max(floor, 0), processedMessages.length - 1);
        if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'start' });
      },
      scrollToMessageId: (messageId: string) => {
        const idx = idToIndex.get(messageId);
        if (idx !== undefined) virtualizer.scrollToIndex(idx, { align: 'start' });
      },
      getFloorCount: () => processedMessages.length,
      nextMatch: () => {
        if (matchIndices.length === 0) return;
        setMatchPos(p => {
          const next = (p + 1) % matchIndices.length;
          virtualizer.scrollToIndex(matchIndices[next], { align: 'center' });
          onSearchResult?.(matchIndices.length, next + 1);
          return next;
        });
      },
      prevMatch: () => {
        if (matchIndices.length === 0) return;
        setMatchPos(p => {
          const prev = (p - 1 + matchIndices.length) % matchIndices.length;
          virtualizer.scrollToIndex(matchIndices[prev], { align: 'center' });
          onSearchResult?.(matchIndices.length, prev + 1);
          return prev;
        });
      },
    }), [virtualizer, idToIndex, processedMessages.length, matchIndices, onSearchResult]);

    // 上报顶部可见楼层：用 virtualizer.range.startIndex（已排除 overscan，
    // 是真正的首个可见行；virtualItems[0] 含 overscan 会偏上约 6 楼）。
    const lastReportedFloorRef = useRef(-1);
    const topVisibleIndex = virtualizer.range?.startIndex ?? -1;
    useEffect(() => {
      if (!onVisibleFloorChange) return;
      if (topVisibleIndex < 0 || topVisibleIndex === lastReportedFloorRef.current) return;
      lastReportedFloorRef.current = topVisibleIndex;
      const msg = processedMessages[topVisibleIndex];
      onVisibleFloorChange(topVisibleIndex, msg?.id ?? null);
    }, [topVisibleIndex, processedMessages, onVisibleFloorChange]);

    return (
      <div
        className={`min-h-[400px] ${classes.container}`}
        style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily || undefined }}
      >
        {/* Title */}
        <div className={classes.title}>
          {theme === 'elegant' ? (
            <>
              <div className="text-xs text-muted-foreground tracking-widest uppercase">
                对话记录
              </div>
              <h2 className="font-display text-2xl text-gradient">{session.title}</h2>
              <div className="text-sm text-muted-foreground">
                {session.character.name} & {session.user.name}
              </div>
            </>
          ) : (
            <h2 className="font-display text-xl">{session.title}</h2>
          )}
        </div>

        {/* Messages（窗口虚拟化） */}
        <TooltipProvider>
          <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualItems.map((vItem) => {
              const message = processedMessages[vItem.index];
              if (!message) return null;
              return (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    // flow-root 建立 BFC，让 MessageRow 内部子元素的 margin(mb-5 等)被算进
                    // 本 wrapper 的测量高度，避免 measureElement 量短导致行重叠。
                    display: 'flow-root',
                    transform: `translateY(${vItem.start - virtualizer.options.scrollMargin}px)`,
                  }}
                >
                  <MessageRow
                    message={message}
                    marker={markerMap.get(message.id)}
                    index={vItem.index}
                    theme={theme}
                    classes={classes}
                    showTimestamp={showTimestamp}
                    showAvatar={showAvatar}
                    editMode={editMode}
                    previewRule={previewRule}
                    searchQuery={searchQuery}
                    isActiveMatch={vItem.index === activeMatchIndex}
                    userName={session.user.name}
                    charName={session.character.name}
                    onMessageClick={onMessageClick}
                  />
                </div>
              );
            })}
          </div>
        </TooltipProvider>


        {/* Footer for elegant theme */}
        {theme === 'elegant' && (
          <div className="mt-12 pt-6 border-t border-border text-center text-sm text-muted-foreground">
            <div className="mb-2">— 完 —</div>
            <div className="text-xs">
              共 {processedMessages.length} 条消息
            </div>
          </div>
        )}
      </div>
    );
  }
));

ChatPreview.displayName = 'ChatPreview';
