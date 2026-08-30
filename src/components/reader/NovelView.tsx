/**
 * 小说视图（2.0 阶段6，定稿 5.1「小说视图」三层管道，阅读增强非独立功能）。
 * 覆盖层：按章节和楼层边界分页的小说排版正文。
 * 1. 纯文本层：lib/novel-view 管道（清洗+楼内拆句重排+用户楼层三档位+场景分隔符）。
 * 2. 章节层：沿用章节标记；「AI 建议章节」只看分卷总结/抽样定边界，结果为可编辑草稿。
 * 3. AI 润色层：按章走自定义记录的「小说化」模板重写（复用 summary-engine），
 *    成果存为该故事的自定义记录（整理与记录里可见可编辑）。
 * 2026-07 整理确认：与 ReaderView（沉浸分页阅读）双轨保留，有进一步发展空间。
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X, Settings, List, Sparkles, Loader2, Square, EyeOff, Eye, Feather, BookOpenCheck,
  ChevronLeft, ChevronRight, Bookmark, BookmarkCheck, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  normalizeNovelSpreadStart, novelPageCapacity,
  DEFAULT_NOVEL_OPTIONS,
  type UserFloorMode, type NovelChapter, type NovelPage, type ChapterSuggestion, type NovelBookmark,
} from '@/lib/novel-view';
import { buildSummaryMessages } from '@/lib/summary-engine';
import { listTemplatesForKind, type AnySummaryTemplate } from '@/lib/summary-templates';
import { saveSummary, pruneAutoSavedSummaries, getAllSummaries, deleteSummary } from '@/lib/summary-db';
import { generateSummaryId, type SummaryItem } from '@/types/summary';
import type { ChatSession, ChapterMarker, RegexRule } from '@/types/chat';
import type { ArchiveStory } from '@/types/archive';

const OPTS_STORAGE_KEY = 'novel-view-options';
const PROGRESS_STORAGE_KEY = 'novel-view-progress';

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
}

function loadStoredOptions(): StoredOptions {
  try {
    const raw = localStorage.getItem(OPTS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_NOVEL_OPTIONS, fontSize: 18, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_NOVEL_OPTIONS, fontSize: 18 };
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
  const [stored] = useState(loadStoredOptions);
  const [userMode, setUserMode] = useState<UserFloorMode>(stored.userMode);
  const [showHidden, setShowHidden] = useState(stored.showHidden);
  const [sceneGap, setSceneGap] = useState(stored.sceneGapMinutes);
  const [fontSize, setFontSize] = useState(stored.fontSize);
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(OPTS_STORAGE_KEY, JSON.stringify({ userMode, showHidden, sceneGapMinutes: sceneGap, fontSize }));
    } catch { /* ignore */ }
  }, [userMode, showHidden, sceneGap, fontSize]);

  const chapters = useMemo(
    () => buildNovelDocument(session.messages, markers, { userMode, showHidden, sceneGapMinutes: sceneGap, regexRules }),
    [session.messages, markers, userMode, showHidden, sceneGap, regexRules],
  );
  // 一页能放多少字按书页实测尺寸算，不用常数（0830 反馈 9：拆得特别碎）。
  // 书页是定高的（h-full + max-h-[720px]），量到的尺寸不随内容变，不会和分页互相拉扯。
  const [pageBox, setPageBox] = useState({ width: 0, height: 0 });
  const pageBoxRef = useRef<HTMLElement | null>(null);
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
    const el = pageBoxRef.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = el;
      setPageBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pages.length, embedded]);

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
    const next = normalizeNovelSpreadStart(
      findNovelPageIndex(pages, initialFloor ?? readStoredFloor()),
      pages.length,
    );
    currentPageRef.current = next;
    setCurrentPage(next);
  }, [initialFloor, pages, readStoredFloor]);

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
    const next = normalizeNovelSpreadStart(pageIndex, pages.length);
    currentPageRef.current = next;
    setCurrentPage(next);
    const floor = pages[next].startFloor;
    onFloorChange?.(floor);
    saveProgress(floor);
  }, [onFloorChange, pages, saveProgress]);

  const current = pages[currentPage];
  const facing = pages[currentPage + 1];
  const lastSpreadStart = normalizeNovelSpreadStart(pages.length - 1, pages.length);
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
        goToPage(currentPageRef.current);
        onClose();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goToPage(currentPageRef.current - 2);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goToPage(currentPageRef.current + 2);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [chapterDialogOpen, polishChapter, onClose, goToPage]);

  const chapterNav = chapters.map((c, i) => ({
    title: c.title ?? '（开篇）',
    index: pages.findIndex((page) => page.chapterIndex === i),
  })).filter((item) => item.index >= 0);

  const handleSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, [role="slider"], [role="dialog"]')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    goToPage(event.clientX < bounds.left + bounds.width / 2 ? currentPage - 2 : currentPage + 2);
  };

  const renderNovelPage = (page: NovelPage | undefined, pageIndex: number, side: 'left' | 'right') => (
    <section
      data-novel-page={side}
      className={cn(
        'relative min-w-0 overflow-hidden bg-card px-7 pb-10 pt-7 text-card-foreground sm:px-10',
        side === 'left' ? 'rounded-l-md border-r border-border/70' : 'rounded-r-md',
      )}
    >
      {page ? (
        <article
          // 左页量尺寸（两页等宽，右页在末尾可能是空的）；h-full 让它正好等于书页内容区
          ref={side === 'left' ? pageBoxRef : undefined}
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
            {side === 'left' && !readOnly && polish && polishTarget && (
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
            )}
          </div>
          {page.blocks.map((block, blockIndex) => {
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
          })}
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
      className={embedded
        ? 'relative z-0 flex h-[min(78vh,900px)] min-h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-canvas text-[color:var(--text-body)] shadow-sm'
        // 从窗口栏下方开始：外壳 chrome 是 z-[60]，盖住它就等于盖掉退出按钮
        // （0830 反馈 9：小说视图没有返回键），而把覆盖层提到 60 以上又会挡住
        // 客户端的窗口控制按钮和拖拽区。--app-chrome-h 由 AppLayout 写到 :root。
        : 'fixed inset-x-0 bottom-0 top-[var(--app-chrome-h,0px)] z-50 flex flex-col bg-canvas text-[color:var(--text-body)]'}
      onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 48) return;
        goToPage(end < start ? currentPage + 2 : currentPage - 2);
      }}
    >
      {/* ===== 顶栏 ===== */}
      <div className="shrink-0 border-b border-border/60 bg-card/70 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => { goToPage(currentPage); onClose(); }} aria-label="退出小说视图">
            <X className="w-4 h-4" />
          </Button>
          <span className="font-display font-semibold text-sm truncate max-w-[16rem]" title={session.title || '未命名作品'}>{session.title || '未命名作品'}</span>
          <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-muted-foreground font-normal gap-1">
            <BookOpenCheck className="w-3 h-3" />小说视图
          </Badge>
          {userMode === 'hide' && hiddenUserFloors > 0 && (
            <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-muted-foreground font-normal gap-1">
              <EyeOff className="w-3 h-3" />已隐藏 {hiddenUserFloors} 个用户楼层
            </Badge>
          )}
          {hiddenFloors > 0 && (
            <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-muted-foreground font-normal gap-1">
              {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showHidden ? `含 ${hiddenFloors} 个隐藏楼层` : `已隐藏 ${hiddenFloors} 个隐藏楼层`}
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {/* 用户楼层档位 */}
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

            {/* 章节目录 */}
            {chapterNav.length > 1 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <List className="w-3.5 h-3.5" />目录
                  </Button>
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
                <Button variant="outline" size="icon" aria-label="书签列表" title="书签列表">
                  <Bookmark className="w-3.5 h-3.5" />
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

            {/* AI 章节建议 */}
            {onMarkersChange && !readOnly && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setChapterDialogOpen(true)}>
                <Sparkles className="w-3.5 h-3.5" />AI 章节
              </Button>
            )}

            {/* 外观 */}
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
          </div>
        </div>
      </div>

      {/* ===== 分页正文 ===== */}
      <div data-novel-surface className="relative flex-1 min-h-0 overflow-hidden" onClick={handleSurfaceClick}>
        {pages.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-muted-foreground text-sm">
            没有可显示的内容（可能全部楼层被隐藏或清洗）。
          </p>
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
      </div>

      <div className="shrink-0 border-t border-border/60 bg-card/70 px-4 py-2">
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
            step={2}
            disabled={pages.length <= 2}
            aria-label="小说阅读进度"
            className="flex-1"
          />
          <span data-novel-progress className="min-w-20 text-right text-xs text-muted-foreground">
            {pages.length
              ? `${currentPage + 1}${facing ? `–${currentPage + 2}` : ''} / ${pages.length}`
              : '0 / 0'}
          </span>
        </div>
      </div>

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
