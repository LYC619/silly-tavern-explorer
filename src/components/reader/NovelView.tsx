/**
 * 小说视图（2.0 阶段6，定稿 5.1「小说视图」三层管道，阅读增强非独立功能）。
 * 覆盖层：按章节和楼层边界分页的小说排版正文。
 * 1. 纯文本层：lib/novel-view 管道（清洗+楼内拆句重排+用户楼层三档位+场景分隔符）。
 * 2. 章节层：沿用章节标记；「AI 建议章节」只看分卷总结/抽样定边界，结果为可编辑草稿。
 * 3. AI 润色层：按章走自定义记录的「小说化」模板重写（复用 summary-engine），
 *    成果存为该故事的自定义记录（整理与记录里可见可编辑）。
 * 2026-07 整理确认：与 ReaderView（沉浸分页阅读）双轨保留，有进一步发展空间。
 */
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import {
  X, Settings, List, Sparkles, Loader2, Square, EyeOff, Eye, Feather, BookOpenCheck,
  ChevronLeft, ChevronRight, Bookmark, BookmarkCheck, Trash2, ArrowLeft, Share as ShareIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { shouldIgnoreGlobalShortcut } from '@/lib/keyboard-shortcuts';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { MarkdownLite } from '@/components/MarkdownLite';
import { loadAPIConfig } from '@/components/ai-tools';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import {
  buildNovelDocument, buildChapterSuggestMessages, parseChapterSuggestions,
  buildNovelBookmarks, findNovelPageIndex, paginateNovelDocument,
  normalizeNovelSpreadStart, clampNovelPageIndex, novelPageCapacity,
  DEFAULT_NOVEL_OPTIONS,
  type UserFloorMode, type NovelChapter, type NovelPage, type ChapterSuggestion, type NovelBookmark,
} from '@/lib/novel-view';
import { useViewport } from '@/hooks/use-viewport';
import { useImmersiveLock } from '@/lib/immersive-mode';
import { MobileReaderSettings, ReaderZoneHint, type ReadingMode } from './MobileReaderSettings';
import { ShareImage } from './ShareImage';
import { buildSummaryMessages } from '@/lib/summary-engine';
import { listTemplatesForKind, type AnySummaryTemplate } from '@/lib/summary-templates';
import { saveSummary, pruneAutoSavedSummaries, getAllSummaries, deleteSummary } from '@/lib/summary-db';
import { generateSummaryId, type SummaryItem } from '@/types/summary';
import type { ChatSession, ChapterMarker, RegexRule } from '@/types/chat';
import type { ArchiveStory } from '@/types/archive';

const OPTS_STORAGE_KEY = 'novel-view-options';
const PROGRESS_STORAGE_KEY = 'novel-view-progress';
/** 分区操作提示只在首次进入时出现，看过就记住 */
const ZONE_HINT_STORAGE_KEY = 'novel-view-zone-hint-seen';
/** 工具栏出现后多久自动收起（jm-mobile 阅读器同款手感） */
const TOOLBAR_AUTO_HIDE_MS = 3000;
/** 滚动模式正文栏宽上限，等于容器的 max-w-2xl（42rem × 16px）。 */
const SCROLL_TEXT_MAX_WIDTH = 672;

interface NovelViewProps {
  session: ChatSession;
  markers: ChapterMarker[];
  regexRules: RegexRule[];
  onClose: () => void;
  /** 应用 AI 章节建议（不传则隐藏该功能） */
  onMarkersChange?: (next: ChapterMarker[]) => void;
  /** 本地进度记忆键；已绑定故事优先通过 onFloorChange 写入归档 */
  progressKey?: string;
  initialFloor?: number;
  onFloorChange?: (floor: number) => void;
  /** 与工作区现有书签（messageId）联动 */
  favorites?: string[];
  onFavoritesChange?: (next: string[]) => void;
  /** 按章 AI 润色的保存上下文（不传则隐藏润色按钮；未绑定聊天也可传自身归档故事） */
  polish?: { story: ArchiveStory; branchId: string | null };
  /** 只读查看：隐藏会写入章节标记或自定义记录的 AI 操作。 */
  readOnly?: boolean;
  /** 嵌入角色卡页时使用内部阅读面板，不脱离当前页面进入全屏层。 */
  embedded?: boolean;
}

interface StoredOptions {
  userMode: UserFloorMode;
  showHidden: boolean;
  sceneGapMinutes: number;
  fontSize: number;
  /** 移动端阅读方式；桌面端不读这个字段，始终是双页翻页 */
  readingMode: ReadingMode;
}

const STORED_DEFAULTS: StoredOptions = {
  ...DEFAULT_NOVEL_OPTIONS,
  fontSize: 18,
  readingMode: 'scroll',
};

function loadStoredOptions(): StoredOptions {
  try {
    const raw = localStorage.getItem(OPTS_STORAGE_KEY);
    if (raw) return { ...STORED_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return STORED_DEFAULTS;
}

const NovelView = ({
  session,
  markers,
  regexRules,
  onClose,
  onMarkersChange,
  progressKey,
  initialFloor,
  onFloorChange,
  favorites = [],
  onFavoritesChange,
  polish,
  readOnly = false,
  embedded = false,
}: NovelViewProps) => {
  const { toast } = useToast();
  const { isMobile } = useViewport();
  const [stored] = useState(loadStoredOptions);
  const [userMode, setUserMode] = useState<UserFloorMode>(stored.userMode);
  const [showHidden, setShowHidden] = useState(stored.showHidden);
  const [sceneGap, setSceneGap] = useState(stored.sceneGapMinutes);
  const [fontSize, setFontSize] = useState(stored.fontSize);
  const [readingMode, setReadingMode] = useState<ReadingMode>(stored.readingMode);
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  const touchStartX = useRef<number | null>(null);

  /**
   * 手机上一屏就是一页：不沿用双页的偶数对齐，否则「下一页」一次跳两页，
   * 中间那页永远读不到。桌面端 step 恒为 2，翻页行为与适配前一致。
   */
  const step = isMobile ? 1 : 2;
  const normalizePage = isMobile ? clampNovelPageIndex : normalizeNovelSpreadStart;
  /** 滚动阅读只在手机上给；桌面的实体书跨页排版本身就是这个视图的卖点 */
  const scrolling = isMobile && readingMode === 'scroll';

  useEffect(() => {
    try {
      localStorage.setItem(OPTS_STORAGE_KEY, JSON.stringify({
        userMode, showHidden, sceneGapMinutes: sceneGap, fontSize, readingMode,
      }));
    } catch { /* ignore */ }
  }, [userMode, showHidden, sceneGap, fontSize, readingMode]);

  // ---- 沉浸工具栏（仅移动端；桌面端顶栏底栏常驻，不读 chromeVisible）----
  /** 进来先给一眼工具栏（里面有返回键），3 秒后自己收走 */
  const [chromeVisible, setChromeVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoneHintOpen, setZoneHintOpen] = useState(false);
  const [shareImageOpen, setShareImageOpen] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  // 沉浸态与返回键的接线在 exitReader 定义之后（搜 useImmersiveLock）。

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  // 工具栏出现 3 秒后自己收起；设置弹层或首次提示挡在上面时暂停计时，关掉再续。
  useEffect(() => {
    if (!isMobile || !chromeVisible || settingsOpen || zoneHintOpen || shareImageOpen) {
      clearHideTimer();
      return;
    }
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), TOOLBAR_AUTO_HIDE_MS);
    return clearHideTimer;
  }, [isMobile, chromeVisible, settingsOpen, zoneHintOpen, shareImageOpen, clearHideTimer]);

  useEffect(() => {
    if (!isMobile) return;
    try {
      if (!localStorage.getItem(ZONE_HINT_STORAGE_KEY)) setZoneHintOpen(true);
    } catch { /* ignore */ }
  }, [isMobile]);

  const dismissZoneHint = useCallback(() => {
    setZoneHintOpen(false);
    try { localStorage.setItem(ZONE_HINT_STORAGE_KEY, '1'); } catch { /* ignore */ }
  }, []);

  const chapters = useMemo(
    () => buildNovelDocument(session.messages, markers, { userMode, showHidden, sceneGapMinutes: sceneGap, regexRules }),
    [session.messages, markers, userMode, showHidden, sceneGap, regexRules],
  );
  // 一页能放多少字按书页实测尺寸算，不用常数（0830 反馈 9：拆得特别碎）。
  // 书页是定高的（h-full + max-h-[720px]），量到的尺寸不随内容变，不会和分页互相拉扯。
  //
  // 「不随内容变」是这套算法的前提。滚动模式一度把这个 ref 挂在第 0 段的
  // <article> 上，而那个 article 是内容高度——量到的高度就等于上一次排版的结果，
  // 于是形成负反馈：段落越短 → 量到越矮 → 容量算得越小 → 段落更短。实测从任何
  // 起点出发都收敛到 90 字的下限（655 → 476 → … → 90），千楼故事被切成三千多段，
  // 手机上就是这么卡的。所以滚动模式改量滚动视口：它是定高的，满足同一个前提。
  const [pageBox, setPageBox] = useState({ width: 0, height: 0 });
  const pageBoxRef = useRef<HTMLElement | null>(null);
  /** 滚动模式的滚动容器。声明在这儿是因为上面那个测量 effect 要用它。 */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageWeight = useMemo(() => novelPageCapacity(pageBox, fontSize), [pageBox, fontSize]);
  const pages = useMemo(() => paginateNovelDocument(chapters, pageWeight), [chapters, pageWeight]);
  const hiddenUserFloors = useMemo(
    () => session.messages.filter((m) => m.role === 'user').length,
    [session.messages],
  );
  const hiddenFloors = useMemo(
    () => session.messages.filter((m) => m.hidden).length,
    [session.messages],
  );

  // 书页尺寸：首帧用常数档排一次版把书页画出来，量到真实尺寸后重排一次即收敛。
  // 窗口缩放、字号档位、嵌入/全屏切换都会改尺寸，所以挂 ResizeObserver。
  useEffect(() => {
    // 滚动模式量滚动视口（定高），翻页模式量书页本身。见 pageBox 声明处的说明。
    const el = scrolling ? scrollRef.current : pageBoxRef.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth, clientHeight } = el;
      // 滚动视口比书页宽：正文限在 max-w-2xl(42rem) 里，按视口宽算会高估每行字数。
      const width = scrolling ? Math.min(clientWidth, SCROLL_TEXT_MAX_WIDTH) : clientWidth;
      setPageBox((prev) => (prev.width === width && prev.height === clientHeight
        ? prev
        : { width, height: clientHeight }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pages.length, embedded, scrolling]);

  const readStoredFloor = useCallback((): number | undefined => {
    if (!progressKey) return undefined;
    try {
      const map = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '{}') as Record<string, unknown>;
      return typeof map[progressKey] === 'number' ? map[progressKey] : undefined;
    } catch {
      return undefined;
    }
  }, [progressKey]);

  useEffect(() => {
    const next = normalizePage(
      findNovelPageIndex(pages, initialFloor ?? readStoredFloor()),
      pages.length,
    );
    currentPageRef.current = next;
    setCurrentPage(next);
  }, [initialFloor, normalizePage, pages, readStoredFloor]);

  const saveProgress = useCallback((floor: number) => {
    if (!progressKey || onFloorChange) return;
    try {
      const map = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '{}') as Record<string, number>;
      map[progressKey] = floor;
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
    } catch { /* ignore */ }
  }, [onFloorChange, progressKey]);

  const goToPage = useCallback((pageIndex: number) => {
    if (pages.length === 0) return;
    const next = normalizePage(pageIndex, pages.length);
    currentPageRef.current = next;
    setCurrentPage(next);
    const floor = pages[next].startFloor;
    onFloorChange?.(floor);
    saveProgress(floor);
  }, [normalizePage, onFloorChange, pages, saveProgress]);

  /**
   * 退出小说视图。Esc 和 Android 返回键共用这一个：先把当前页存下来再关，
   * 否则下次进来回到的是上一次保存的位置。两条路径分别写一遍迟早会漂。
   */
  const exitReader = useCallback(() => {
    goToPage(currentPageRef.current);
    onClose();
  }, [goToPage, onClose]);

  // 全屏阅读时让外壳收掉窗口栏和底部标签栏；嵌入模式不算沉浸。
  // 第二个参数接 Android 返回键，复用 exitReader——沉浸阅读中按返回该退沉浸，
  // 而不是把整个角色页退掉（回来还得重新找位置）。
  // 放在这里而不是组件开头：exitReader 是 const，提前引用会踩 TDZ。
  useImmersiveLock(isMobile && !embedded, exitReader);

  /**
   * 翻页动作（点分区、滑动、方向键）；进度条拖动不走这里——
   * 那是在工具栏上操作，顺手把工具栏收掉等于把手指底下的控件抽走。
   */
  const turnPage = useCallback((pageIndex: number) => {
    goToPage(pageIndex);
    if (isMobile) setChromeVisible(false);
  }, [goToPage, isMobile]);

  const current = pages[currentPage];
  const facing = isMobile ? undefined : pages[currentPage + 1];
  const lastSpreadStart = normalizePage(pages.length - 1, pages.length);
  const polishTarget = current ? chapters[current.chapterIndex] : undefined;
  const novelBookmarks = useMemo<NovelBookmark[]>(
    () => buildNovelBookmarks(session.messages, favorites, pages),
    [favorites, pages, session.messages],
  );
  const currentMessageId = current ? session.messages[current.startFloor]?.id : undefined;
  const currentIsBookmarked = !!currentMessageId && favorites.includes(currentMessageId);
  const toggleCurrentBookmark = useCallback(() => {
    if (!currentMessageId || !onFavoritesChange) return;
    onFavoritesChange(
      favorites.includes(currentMessageId)
        ? favorites.filter((id) => id !== currentMessageId)
        : [...favorites, currentMessageId],
    );
  }, [currentMessageId, favorites, onFavoritesChange]);

  // ---- AI 章节建议 ----
  const [chapterDialogOpen, setChapterDialogOpen] = useState(false);
  const [volumeSummaries, setVolumeSummaries] = useState<SummaryItem[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<(ChapterSuggestion & { picked: boolean })[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!chapterDialogOpen || !polish) return;
    getAllSummaries()
      .then((all) => setVolumeSummaries(
        all.filter((s) => s.bookId === polish.story.id && s.kind === 'volume')
          .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0)),
      ))
      .catch(() => setVolumeSummaries([]));
  }, [chapterDialogOpen, polish]);

  const handleSuggestChapters = async () => {
    if (readOnly) return;
    const config = loadAPIConfig();
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 配置」页配置后回来生成', variant: 'destructive' });
      return;
    }
    setSuggesting(true);
    setSuggestions(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const messages = buildChapterSuggestMessages({ session, volumeSummaries });
      const text = await callOpenAIMessages(config, messages, { signal: controller.signal });
      const parsed = parseChapterSuggestions(text, session.messages.length);
      if (!parsed || parsed.length === 0) {
        toast({ title: '没有解析到章节建议', description: '可重试或换模型', variant: 'destructive' });
      } else {
        setSuggestions(parsed.map((s) => ({ ...s, picked: true })));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') toast({ title: '已停止' });
      else toast({ title: '生成失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSuggesting(false);
      abortRef.current = null;
    }
  };

  const handleApplySuggestions = () => {
    if (readOnly || !suggestions || !onMarkersChange) return;
    const existingFloors = new Set(markers.map((m) => m.messageIndex));
    const additions: ChapterMarker[] = suggestions
      .filter((s) => s.picked && !existingFloors.has(s.floor) && session.messages[s.floor])
      .map((s) => ({
        messageId: session.messages[s.floor].id,
        messageIndex: s.floor,
        title: s.title,
        createdAt: Date.now(),
      }));
    if (additions.length === 0) {
      toast({ title: '没有可应用的建议', description: '勾选的楼层可能已有章节标记' });
      return;
    }
    onMarkersChange([...markers, ...additions].sort((a, b) => a.messageIndex - b.messageIndex));
    setChapterDialogOpen(false);
    setSuggestions(null);
    toast({ title: `已添加 ${additions.length} 个章节标记`, description: '可在章节标记对话框里继续编辑' });
  };

  // ---- 按章 AI 润色 ----
  const [polishChapter, setPolishChapter] = useState<NovelChapter | null>(null);
  const [polishTemplates, setPolishTemplates] = useState<AnySummaryTemplate[]>([]);
  const [polishTemplateId, setPolishTemplateId] = useState('builtin-novelize');
  const [polishStreaming, setPolishStreaming] = useState(false);
  const [polishResult, setPolishResult] = useState('');
  const [polishSavedId, setPolishSavedId] = useState<string | null>(null);
  /** 结果已转永久保存（按钮转态；丢弃弹窗文案更重） */
  const [polishPermanent, setPolishPermanent] = useState(false);
  const [polishDiscardAsk, setPolishDiscardAsk] = useState(false);
  const polishOutputRef = useRef('');
  const polishAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!polishChapter) return;
    listTemplatesForKind('diy').then(setPolishTemplates).catch(() => {});
  }, [polishChapter]);

  const polishTemplate = polishTemplates.find((t) => t.id === polishTemplateId);

  const buildPolishItem = (content: string, autoSaved: boolean, id: string): SummaryItem => ({
    id,
    bookId: polish!.story.id,
    bookTitle: polish!.story.title,
    kind: 'diy',
    title: `小说化 · ${polishChapter!.title ?? `第 ${polishChapter!.startFloor}~${polishChapter!.endFloor} 楼`}`,
    branchId: polish!.branchId ?? undefined,
    floorStart: polishChapter!.startFloor,
    floorEnd: polishChapter!.endFloor,
    content,
    genParams: {
      model: loadAPIConfig().model,
      templateId: polishTemplateId,
      templateTitle: polishTemplate?.title,
      templateSnapshot: polishTemplate?.content,
      speakerPrefix: true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    autoSaved,
  });

  const handlePolish = async () => {
    if (readOnly || !polish || !polishChapter || !polishTemplate) return;
    const config = loadAPIConfig();
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 配置」页配置后回来生成', variant: 'destructive' });
      return;
    }
    const { messages } = buildSummaryMessages({
      session,
      floorStart: polishChapter.startFloor,
      floorEnd: polishChapter.endFloor,
      template: polishTemplate.content,
    });
    setPolishStreaming(true);
    setPolishResult('');
    setPolishSavedId(null);
    setPolishPermanent(false);
    polishOutputRef.current = '';
    const controller = new AbortController();
    polishAbortRef.current = controller;
    try {
      await callOpenAIMessages(config, messages, {
        onChunk: (chunk) => {
          polishOutputRef.current += chunk;
          setPolishResult(polishOutputRef.current);
        },
        signal: controller.signal,
      });
      // 生成完自动暂存（与整理与记录一致，防丢）
      const id = generateSummaryId();
      await saveSummary(buildPolishItem(polishOutputRef.current, true, id));
      await pruneAutoSavedSummaries();
      setPolishSavedId(id);
      toast({ title: '已自动暂存', description: '在「整理与记录」里可继续编辑；点「永久保存」防自动清理' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') toast({ title: '已停止生成' });
      else toast({ title: '生成失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setPolishStreaming(false);
      polishAbortRef.current = null;
    }
  };

  const handlePolishPermanent = async () => {
    if (readOnly || !polishResult || !polish || !polishChapter) return;
    const id = polishSavedId ?? generateSummaryId();
    await saveSummary(buildPolishItem(polishResult, false, id));
    setPolishSavedId(id);
    setPolishPermanent(true);
    toast({ title: '已永久保存为自定义记录' });
  };

  // 「不要了」：结果一生成就自动暂存了，只清屏那条记录还在库里，得连库里一起删
  const handlePolishDiscard = async () => {
    setPolishDiscardAsk(false);
    if (polishSavedId) await deleteSummary(polishSavedId);
    setPolishResult('');
    setPolishSavedId(null);
    setPolishPermanent(false);
    polishOutputRef.current = '';
    toast({ title: '已丢弃', description: '这条润色记录已从库里删除' });
  };

  // Esc 关闭（无弹窗时）；不接管交互控件与上层弹窗的按键（弹窗 Esc 只关弹窗、滑块方向键自步进、按钮空格应触发点击）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalShortcut(e) || chapterDialogOpen || polishChapter) return;
      if (e.key === 'Escape') {
        exitReader();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        turnPage(currentPageRef.current - step);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        turnPage(currentPageRef.current + step);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // exitReader 取代了原来的 goToPage+onClose 两步，依赖跟着换掉
  }, [chapterDialogOpen, polishChapter, exitReader, turnPage, step]);

  const chapterNav = chapters.map((c, i) => ({
    title: c.title ?? '（开篇）',
    index: pages.findIndex((page) => page.chapterIndex === i),
  })).filter((item) => item.index >= 0);

  // ---- 滚动模式的进度 ⇄ 滚动位置同步 ----
  /** 程序化滚动期间忽略 scroll 事件，否则「跳过去」会被自己的回读打回来 */
  const scrollSyncRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);

  /**
   * 滚动模式的虚拟化：只渲染可视区 ±overscan 的段落。
   *
   * 每段现在约等于一屏正文（见 pageBox 的说明），所以 estimateSize 拿视口高度当
   * 估值就已经很准，滚动条不会明显跳动。scrollMargin 是内层容器相对滚动容器的
   * 偏移（顶部那圈 padding + 安全区），不给它虚拟坐标就会整体错位，「跳到某章」
   * 会差出一个 padding。
   */
  const [scrollHost, setScrollHost] = useState<HTMLDivElement | null>(null);
  const attachScrollHost = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollHost(node);
  }, []);
  const [scrollMargin, setScrollMargin] = useState(0);
  const scrollInnerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!scrolling) return;
    const host = scrollRef.current;
    const inner = scrollInnerRef.current;
    if (!host || !inner) return;
    const measure = () => setScrollMargin(inner.offsetTop);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [scrolling, scrollHost]);

  const pageVirtualizer = useVirtualizer({
    count: scrolling ? pages.length : 0,
    getScrollElement: () => scrollHost,
    estimateSize: () => Math.max(240, pageBox.height || 480),
    overscan: 2,
    scrollMargin,
  });

  const scrollToPage = useCallback((pageIndex: number) => {
    if (!scrollRef.current || pages.length === 0) return;
    scrollSyncRef.current = true;
    pageVirtualizer.scrollToIndex(clampNovelPageIndex(pageIndex, pages.length), { align: 'start' });
    // 动态测量下 scrollToIndex 会分几帧收敛（先按估值跳，量完再补），
    // 一帧就解锁的话补位那次滚动会被当成用户在读，把进度冲掉。
    window.setTimeout(() => { scrollSyncRef.current = false; }, 120);
  }, [pageVirtualizer, pages.length]);

  // 目录/书签/进度条改页码后把正文滚过去；切进滚动模式、重排版（改字号）时也要重新对位。
  useEffect(() => {
    if (!scrolling) return;
    scrollToPage(currentPageRef.current);
  }, [scrolling, pages, scrollToPage]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  /** 滚动读到哪算哪：只更新进度，不反过来触发滚动 */
  const syncScrollProgress = useCallback((pageIndex: number) => {
    if (pages.length === 0) return;
    const next = clampNovelPageIndex(pageIndex, pages.length);
    if (next === currentPageRef.current) return;
    currentPageRef.current = next;
    setCurrentPage(next);
    const floor = pages[next].startFloor;
    onFloorChange?.(floor);
    saveProgress(floor);
  }, [onFloorChange, pages, saveProgress]);

  const handleBodyScroll = useCallback(() => {
    if (scrollSyncRef.current) return;
    setChromeVisible(false);
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const host = scrollRef.current;
      if (!host) return;
      // 顶边往下 8px 处落在哪一段就算读到哪一段。
      // 虚拟化之后不能再问 DOM：段落是绝对定位的，offsetTop 全是 0，而且没渲染的
      // 段根本不在 DOM 里。改问虚拟器自己的几何——它的 start 已经含 scrollMargin，
      // 所以探针也要加上，两边同一套坐标。
      const probe = host.scrollTop + scrollMargin + 8;
      const items = pageVirtualizer.getVirtualItems();
      let index = items[0]?.index ?? 0;
      for (const item of items) {
        if (item.start <= probe) index = item.index;
      }
      syncScrollProgress(index);
    });
  }, [syncScrollProgress, pageVirtualizer, scrollMargin]);

  const handleSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, [role="slider"], [role="dialog"]')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (isMobile) {
      // 三分区：左 1/3 上一页、中 1/3 开关工具栏、右 1/3 下一页。
      // 滚动模式下左右两块也只管工具栏——滚动时点着翻页会把人读到的位置弄丢。
      const zone = (event.clientX - bounds.left) / Math.max(1, bounds.width);
      if (scrolling || (zone >= 1 / 3 && zone < 2 / 3)) {
        setChromeVisible((visible) => !visible);
        return;
      }
      turnPage(currentPage + (zone < 1 / 3 ? -step : step));
      return;
    }
    goToPage(event.clientX < bounds.left + bounds.width / 2 ? currentPage - 2 : currentPage + 2);
  };

  /**
   * 正文块。返回数组而不是包一层容器：<p> 必须是 <article> 的直接子元素，
   * 排版契约（首行缩进、段间不留 margin）就靠这个结构。
   */
  const renderBlocks = (blocks: NovelPage['blocks']) => blocks.map((block, blockIndex) => {
    if (block.type === 'scene-break') {
      return <div key={blockIndex} className="my-5 text-center text-xs tracking-[0.45em] text-muted-foreground/70">✦ ✦ ✦</div>;
    }
    return (
      <p
        key={blockIndex}
        className={cn(
          'mb-0 whitespace-pre-wrap',
          block.type !== 'user' && !block.continuedFromPrevious && 'indent-[2em]',
          block.type === 'user' && 'border-l-2 border-border pl-3 text-[0.9em] text-muted-foreground/75 indent-0',
          block.hidden && 'border-l-2 border-dashed border-primary/40 pl-3',
        )}
      >
        {block.text}
      </p>
    );
  });

  const polishButton = !readOnly && polish && polishTarget ? (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 px-2 text-[11px] text-muted-foreground hover:text-primary"
      onClick={() => {
        setPolishChapter(polishTarget);
        setPolishResult('');
        setPolishSavedId(null);
        setPolishPermanent(false);
      }}
      title="用自定义记录的「小说化」模板重写本章（调用 AI，需要 API 配置）"
    >
      <Feather className="h-3 w-3" />AI 润色本章
    </Button>
  ) : null;

  const renderNovelPage = (page: NovelPage | undefined, pageIndex: number, side: 'left' | 'right' | 'single') => (
    <section
      data-novel-page={side}
      className={cn(
        'relative min-w-0 overflow-hidden bg-card text-card-foreground',
        side === 'single' ? 'h-full px-5 pb-9 pt-5' : 'px-7 pb-10 pt-7 sm:px-10',
        side === 'left' && 'rounded-l-md border-r border-border/70',
        side === 'right' && 'rounded-r-md',
      )}
    >
      {page ? (
        <article
          // 左页量尺寸（两页等宽，右页在末尾可能是空的）；h-full 让它正好等于书页内容区
          ref={side === 'right' ? undefined : pageBoxRef}
          className="h-full font-serif text-foreground/90"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.75 }}
        >
          {page.title && (
            <div className="mb-4 text-center">
              <h2 className="font-display text-lg font-semibold text-primary/90">{page.title}</h2>
              <div className="mx-auto mt-2 h-px w-14 bg-primary/30" />
            </div>
          )}
          <div className="mb-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <span>#{page.startFloor}–{page.endFloor} 楼</span>
            {side !== 'right' && polishButton}
          </div>
          {renderBlocks(page.blocks)}
          {pageIndex === pages.length - 1 && (
            <p className="pt-3 text-center text-xs text-muted-foreground/60">—— 完 ——</p>
          )}
        </article>
      ) : (
        <div className="h-full" aria-hidden="true" />
      )}
      <span className={cn(
        'absolute bottom-4 text-xs tabular-nums text-muted-foreground/70',
        side === 'left' ? 'left-7 sm:left-10' : 'right-7 sm:right-10',
      )}>
        {page ? pageIndex + 1 : ''}
      </span>
    </section>
  );

  return (
    <div
      className={cn(
        embedded
          ? 'relative z-0 flex h-[min(78vh,900px)] min-h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-canvas text-[color:var(--text-body)] shadow-sm'
          : isMobile
            // 手机上真沉浸：外壳的窗口栏和底部标签栏由 useImmersiveLock 收掉，
            // 这里可以铺满整屏，返回键在自己的顶栏上。
            ? 'fixed inset-0 z-50 flex flex-col bg-canvas text-[color:var(--text-body)]'
            // 从窗口栏下方开始：外壳 chrome 是 z-[60]，盖住它就等于盖掉退出按钮
            // （0830 反馈 9：小说视图没有返回键），而把覆盖层提到 60 以上又会挡住
            // 客户端的窗口控制按钮和拖拽区。--app-chrome-h 由 AppLayout 写到 :root。
            : 'fixed inset-x-0 bottom-0 top-[var(--app-chrome-h,0px)] z-50 flex flex-col bg-canvas text-[color:var(--text-body)]',
      )}
      onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 48) return;
        // 滚动模式不接横滑：上下读的时候手指斜着划一下就跳页太容易误触
        if (scrolling) return;
        turnPage(end < start ? currentPage + step : currentPage - step);
      }}
    >
      {/* ===== 顶栏（移动端沉浸时整条滑走）===== */}
      <div
        data-reader-top-bar
        className={cn(
          'shrink-0 border-b border-border/60 bg-card/70 backdrop-blur-sm',
          isMobile && 'absolute inset-x-0 top-0 z-20 transition-transform duration-200',
          isMobile && !chromeVisible && '-translate-y-full',
        )}
      >
        <div className={cn('flex items-center gap-2 flex-wrap', isMobile ? 'gap-1 px-1.5 py-1' : 'px-4 py-2')}>
          <Button variant="ghost" size="icon" onClick={() => { goToPage(currentPage); onClose(); }} aria-label="退出小说视图">
            {isMobile ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </Button>
          <span
            className={cn(
              'font-display font-semibold text-sm truncate',
              isMobile ? 'min-w-0 flex-1' : 'max-w-[16rem]',
            )}
            title={session.title || '未命名作品'}
          >
            {session.title || '未命名作品'}
          </span>
          {/* 徽标在手机上一律不给：一行放不下，信息在阅读设置里都能查到 */}
          {!isMobile && (
          <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-muted-foreground font-normal gap-1">
            <BookOpenCheck className="w-3 h-3" />小说视图
          </Badge>
          )}
          {!isMobile && userMode === 'hide' && hiddenUserFloors > 0 && (
            <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-muted-foreground font-normal gap-1">
              <EyeOff className="w-3 h-3" />已隐藏 {hiddenUserFloors} 个用户楼层
            </Badge>
          )}
          {!isMobile && hiddenFloors > 0 && (
            <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-muted-foreground font-normal gap-1">
              {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showHidden ? `含 ${hiddenFloors} 个隐藏楼层` : `已隐藏 ${hiddenFloors} 个隐藏楼层`}
            </Badge>
          )}

          <div className={cn('flex items-center flex-wrap', isMobile ? 'gap-0.5' : 'ml-auto gap-1.5')}>
            {/* 用户楼层档位（手机上在阅读设置弹层里） */}
            {!isMobile && (
            <Select value={userMode} onValueChange={(v) => setUserMode(v as UserFloorMode)}>
              <SelectTrigger className="h-8 w-32 text-xs" title="用户楼层处理：AI 楼通常会复述你的动作，隐藏几乎不丢信息">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weaken">用户楼：弱化</SelectItem>
                <SelectItem value="hide">用户楼：隐藏</SelectItem>
                <SelectItem value="keep">用户楼：保留</SelectItem>
              </SelectContent>
            </Select>
            )}

            {/* 章节目录 */}
            {chapterNav.length > 1 && (
              <Popover>
                <PopoverTrigger asChild>
                  {isMobile ? (
                    <Button variant="ghost" size="icon" aria-label="章节目录" title="章节目录">
                      <List className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1">
                      <List className="w-3.5 h-3.5" />目录
                    </Button>
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end">
                  <div className="p-3 border-b font-medium text-sm">章节目录</div>
                  <ScrollArea className="max-h-72">
                    <div className="p-2 space-y-0.5">
                      {chapterNav.map((c) => (
                        <button
                          key={c.index}
                          className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                          onClick={() => goToPage(c.index)}
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant={isMobile ? 'ghost' : 'outline'} size="icon" aria-label="书签列表" title="书签列表">
                  <Bookmark className={isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="end">
                <div className="p-3 border-b font-medium text-sm">书签</div>
                {novelBookmarks.length === 0 ? (
                  <p className="px-3 py-5 text-center text-xs text-muted-foreground">还没有书签</p>
                ) : (
                  <ScrollArea className="max-h-72">
                    <div className="py-1">
                      {novelBookmarks.map((bookmark) => (
                        <button
                          key={bookmark.messageId}
                          type="button"
                          className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
                          onClick={() => goToPage(bookmark.pageIndex)}
                        >
                          <span className="shrink-0 font-mono text-xs text-primary">#{bookmark.floor}</span>
                          <span className="line-clamp-2 text-xs text-muted-foreground" title={bookmark.snippet}>{bookmark.snippet}</span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </PopoverContent>
            </Popover>

            {/* AI 章节建议。手机上不给入口：顶栏一行放不下，而且它是写入动作，
                在手机上顺手点开一个付费 AI 操作不是好设计（AI 功能页本轮不适配）。 */}
            {onMarkersChange && !readOnly && !isMobile && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setChapterDialogOpen(true)}>
                <Sparkles className="w-3.5 h-3.5" />AI 章节
              </Button>
            )}

            {/* 外观：手机上是底部弹层（拇指够得着），桌面保持顶栏 Popover */}
            {isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="阅读设置"
                title="阅读设置"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="w-4 h-4" />
              </Button>
            ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" aria-label="外观设置">
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-4" align="end">
                <div>
                  <div className="text-sm font-medium mb-2">字号</div>
                  <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={14} max={26} step={1} />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">场景分隔符</div>
                  <p className="text-[11px] text-muted-foreground mb-2">楼层时间间隔超过阈值时插入 ✦ ✦ ✦</p>
                  <Select value={String(sceneGap)} onValueChange={(v) => setSceneGap(parseInt(v, 10))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">关闭</SelectItem>
                      <SelectItem value="15">间隔 15 分钟</SelectItem>
                      <SelectItem value="30">间隔 30 分钟</SelectItem>
                      <SelectItem value="60">间隔 60 分钟</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="novel-show-hidden" className="text-sm">显示隐藏楼层</Label>
                  <Checkbox id="novel-show-hidden" checked={showHidden} onCheckedChange={(checked) => setShowHidden(Boolean(checked))} />
                </div>
              </PopoverContent>
            </Popover>
            )}
          </div>
        </div>
      </div>

      {/* ===== 正文 ===== */}
      <div
        data-novel-surface
        className="relative flex-1 min-h-0 overflow-hidden"
        onClick={handleSurfaceClick}
      >
        {pages.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-muted-foreground text-sm">
            没有可显示的内容（可能全部楼层被隐藏或清洗）。
          </p>
        ) : scrolling ? (
          /* 滚动模式：一路往下读，章节之间插分隔。段落虚拟化，只渲染可视区附近。 */
          <div
            ref={attachScrollHost}
            data-novel-scroll
            onScroll={handleBodyScroll}
            className="relative h-full overflow-y-auto overscroll-y-contain scrollbar-thin"
          >
            <div
              ref={scrollInnerRef}
              className="mx-auto max-w-2xl px-5 pb-24 pt-[calc(env(safe-area-inset-top)+2.75rem)]"
            >
              <div className="relative w-full" style={{ height: pageVirtualizer.getTotalSize() }}>
                {pageVirtualizer.getVirtualItems().map((item) => {
                  const page = pages[item.index];
                  if (!page) return null;
                  return (
                    <section
                      key={item.key}
                      data-index={item.index}
                      data-novel-scroll-page={item.index}
                      ref={pageVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full"
                      style={{
                        // flow-root 建立 BFC，让内部 margin 算进本段的测量高度
                        // （否则量短了，段与段会叠在一起）。同 ChatPreview。
                        display: 'flow-root',
                        transform: `translateY(${item.start - pageVirtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      {page.title && (
                        <div className={cn('text-center', item.index === 0 ? 'mb-4' : 'mb-4 mt-8 border-t border-border pt-8')}>
                          <h2 className="font-display text-lg font-semibold text-primary/90">{page.title}</h2>
                          <div className="mx-auto mt-2 h-px w-14 bg-primary/30" />
                        </div>
                      )}
                      <article
                        className="font-serif text-foreground/90"
                        style={{ fontSize: `${fontSize}px`, lineHeight: 1.75 }}
                      >
                        {renderBlocks(page.blocks)}
                        {item.index === pages.length - 1 && (
                          <p className="pt-3 text-center text-xs text-muted-foreground/60">—— 完 ——</p>
                        )}
                      </article>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        ) : isMobile ? (
          /* 翻页模式：手机一屏一页，不做跨页 */
          <div className="h-full px-2 pb-2 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
            <div
              data-novel-spread="single"
              key={`${currentPage}:${current?.startFloor}`}
              className="h-full overflow-hidden rounded-md border border-border bg-card shadow-lg"
            >
              {renderNovelPage(current, currentPage, 'single')}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-12 py-5 sm:px-16 sm:py-7">
            <div
              data-novel-spread="true"
              key={`${currentPage}:${current?.startFloor}`}
              className="relative grid h-full max-h-[720px] w-full max-w-5xl grid-cols-2 overflow-hidden rounded-md border border-border bg-card shadow-xl"
            >
              {renderNovelPage(current, currentPage, 'left')}
              {renderNovelPage(facing, currentPage + 1, 'right')}
              <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-6 -translate-x-1/2 bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
            </div>
          </div>
        )}

        {/* 翻页箭头：手机上让位给三分区点击，不占正文宽度 */}
        {!isMobile && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2"
              onClick={(event) => { event.stopPropagation(); goToPage(currentPage - 2); }}
              disabled={currentPage <= 0 || pages.length === 0}
              aria-label="上一页"
              title="上一页"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={(event) => { event.stopPropagation(); goToPage(currentPage + 2); }}
              disabled={currentPage >= lastSpreadStart || pages.length === 0}
              aria-label="下一页"
              title="下一页"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}

        {isMobile && zoneHintOpen && pages.length > 0 && (
          <ReaderZoneHint mode={readingMode} onDismiss={dismissZoneHint} />
        )}
      </div>

      <div
        data-reader-bottom-bar
        className={cn(
          'shrink-0 border-t border-border/60 bg-card/70 px-4 py-2',
          isMobile && 'absolute inset-x-0 bottom-0 z-20 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm transition-transform duration-200',
          isMobile && !chromeVisible && 'translate-y-full',
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCurrentBookmark}
            disabled={!currentMessageId || !onFavoritesChange}
            aria-label={currentIsBookmarked ? '移除当前页书签' : '收藏当前页楼层'}
            title={currentIsBookmarked ? '移除当前页书签' : '收藏当前页楼层'}
          >
            {currentIsBookmarked ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
          </Button>
          <Slider
            value={[currentPage]}
            onValueChange={([value]) => goToPage(value)}
            min={0}
            max={lastSpreadStart}
            step={step}
            disabled={pages.length <= step}
            aria-label="小说阅读进度"
            className="flex-1"
          />
          <span data-novel-progress className={cn('text-right text-xs text-muted-foreground', isMobile ? 'min-w-14' : 'min-w-20')}>
            {pages.length
              ? `${currentPage + 1}${facing ? `–${currentPage + 2}` : ''} / ${pages.length}`
              : '0 / 0'}
          </span>
          <ShareImage
            storyTitle={session.title || session.character.name || '未命名故事'}
            characterName={session.character.name}
            currentFloor={pages[currentPage]?.startFloor ?? 1}
            currentText={pages[currentPage]?.blocks.map(b => b.text).join('\n') ?? ''}
            triggerLabel="生成分享图"
            onOpenChange={setShareImageOpen}
          />
        </div>
      </div>

      {isMobile && (
        <MobileReaderSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          readingMode={readingMode}
          onReadingModeChange={setReadingMode}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          userMode={userMode}
          onUserModeChange={setUserMode}
          sceneGap={sceneGap}
          onSceneGapChange={setSceneGap}
          showHidden={showHidden}
          onShowHiddenChange={setShowHidden}
        />
      )}

      {/* ===== AI 章节建议对话框 ===== */}
      <Dialog open={!readOnly && chapterDialogOpen} onOpenChange={(v) => { if (!suggesting) { setChapterDialogOpen(v); if (!v) setSuggestions(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI 建议章节边界</DialogTitle>
            <DialogDescription>
              AI 不读全文：{volumeSummaries.length > 0
                ? `以本故事的 ${volumeSummaries.length} 卷分卷总结为主要依据，辅以抽样楼层`
                : '本故事还没有分卷总结，将只按抽样楼层判断（先做分卷总结效果更好）'}。
              结果是草稿，勾选确认后才写入章节标记。
            </DialogDescription>
          </DialogHeader>

          {!suggestions && (
            !suggesting ? (
              <Button className="gap-1" onClick={handleSuggestChapters}>
                <Sparkles className="w-4 h-4" />生成章节建议
              </Button>
            ) : (
              <Button variant="destructive" className="gap-1" onClick={() => abortRef.current?.abort()}>
                <Square className="w-4 h-4" />停止<Loader2 className="w-4 h-4 animate-spin" />
              </Button>
            )
          )}

          {suggestions && (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={`${s.floor}`} className="flex items-center gap-2">
                  <Checkbox
                    checked={s.picked}
                    onCheckedChange={(c) => setSuggestions((prev) => prev!.map((x, j) => (j === i ? { ...x, picked: !!c } : x)))}
                  />
                  <span className="text-xs text-muted-foreground w-16 shrink-0">#{s.floor} 楼</span>
                  <Input size="sm"
                    value={s.title}
                    onChange={(e) => setSuggestions((prev) => prev!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className="text-sm"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={handleSuggestChapters}>重新生成</Button>
                <Button size="sm" onClick={handleApplySuggestions}>
                  应用 {suggestions.filter((s) => s.picked).length} 个章节标记
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== 按章 AI 润色对话框 ===== */}
      <Dialog open={!readOnly && !!polishChapter} onOpenChange={(v) => { if (!polishStreaming && !v) setPolishChapter(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>AI 润色本章（{polishChapter?.title ?? `#${polishChapter?.startFloor}–${polishChapter?.endFloor} 楼`}）</DialogTitle>
            <DialogDescription>
              按所选模板把本章重写为小说正文；成果存为本故事的自定义记录，在「整理与记录」里可编辑导出。
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs text-muted-foreground shrink-0">模板</Label>
            <Select value={polishTemplateId} onValueChange={setPolishTemplateId}>
              <SelectTrigger className="h-8 text-sm flex-1 min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {polishTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!polishStreaming ? (
              <Button size="sm" className="gap-1" onClick={handlePolish} disabled={!polishTemplate}>
                <Feather className="w-3.5 h-3.5" />{polishResult ? '重新生成' : '生成'}
              </Button>
            ) : (
              <Button size="sm" variant="destructive" className="gap-1" onClick={() => polishAbortRef.current?.abort()}>
                <Square className="w-3.5 h-3.5" />停止<Loader2 className="w-3.5 h-3.5 animate-spin" />
              </Button>
            )}
          </div>

          <div className="flex-1 min-h-32 overflow-y-auto rounded-md border border-border bg-card p-3 text-sm">
            {polishResult ? <MarkdownLite text={polishResult} /> : (
              <span className="text-xs text-muted-foreground">
                生成结果会流式出现在这里。此为付费动作：点「生成」才调用 API。
              </span>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={polishStreaming} onClick={() => setPolishChapter(null)}>关闭</Button>
            <Button
              variant="ghost"
              className="gap-1 text-muted-foreground hover:text-destructive"
              disabled={polishStreaming || !polishResult}
              onClick={() => setPolishDiscardAsk(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />不要了
            </Button>
            <Button disabled={polishStreaming || !polishResult || polishPermanent} onClick={handlePolishPermanent}>
              {polishPermanent ? '已永久保存' : '永久保存为自定义记录'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={polishDiscardAsk}
        onOpenChange={setPolishDiscardAsk}
        title="丢弃这份润色结果？"
        description={polishPermanent
          ? '这份已永久保存，丢弃会把它从库里删掉，不可撤销。'
          : '结果已自动暂存，丢弃会把它从库里删掉，不可撤销。'}
        onConfirm={() => void handlePolishDiscard()}
        confirmLabel="丢弃"
      />
    </div>
  );
};

export default NovelView;
