/**
 * 小说视图（2.0 阶段6，定稿 5.1「小说视图」三层管道，阅读增强非独立功能）。
 * 覆盖层：连续滚动的小说排版正文。
 * 1. 纯文本层：lib/novel-view 管道（清洗+楼内拆句重排+用户楼层三档位+场景分隔符）。
 * 2. 章节层：沿用章节标记；「AI 建议章节」只看分卷总结/抽样定边界，结果为可编辑草稿。
 * 3. AI 润色层：按章走自定义记录的「小说化」模板重写（复用 summary-engine），
 *    成果存为该故事的自定义记录（整理与记录里可见可编辑）。
 * 2026-07 整理确认：与 ReaderView（沉浸分页阅读）双轨保留，有进一步发展空间。
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X, Settings, List, Sparkles, Loader2, Square, EyeOff, Feather, BookOpenCheck,
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
import { MarkdownLite } from '@/components/MarkdownLite';
import { loadAPIConfig } from '@/components/ai-tools';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import {
  buildNovelDocument, buildChapterSuggestMessages, parseChapterSuggestions,
  DEFAULT_NOVEL_OPTIONS,
  type UserFloorMode, type NovelChapter, type ChapterSuggestion,
} from '@/lib/novel-view';
import { buildSummaryMessages } from '@/lib/summary-engine';
import { listTemplatesForKind, type AnySummaryTemplate } from '@/lib/summary-templates';
import { saveSummary, pruneAutoSavedSummaries, getAllSummaries } from '@/lib/summary-db';
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
  /** 滚动进度记忆键（故事+脉络） */
  progressKey?: string;
  /** 按章 AI 润色的保存上下文（不传则隐藏润色按钮；未绑定聊天也可传自身归档故事） */
  polish?: { story: ArchiveStory; branchId: string | null };
}

interface StoredOptions {
  userMode: UserFloorMode;
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

const NovelView = ({ session, markers, regexRules, onClose, onMarkersChange, progressKey, polish }: NovelViewProps) => {
  const { toast } = useToast();
  const [stored] = useState(loadStoredOptions);
  const [userMode, setUserMode] = useState<UserFloorMode>(stored.userMode);
  const [sceneGap, setSceneGap] = useState(stored.sceneGapMinutes);
  const [fontSize, setFontSize] = useState(stored.fontSize);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(OPTS_STORAGE_KEY, JSON.stringify({ userMode, sceneGapMinutes: sceneGap, fontSize }));
    } catch { /* ignore */ }
  }, [userMode, sceneGap, fontSize]);

  const chapters = useMemo(
    () => buildNovelDocument(session.messages, markers, { userMode, sceneGapMinutes: sceneGap, regexRules }),
    [session.messages, markers, userMode, sceneGap, regexRules],
  );
  const hiddenUserFloors = useMemo(
    () => session.messages.filter((m) => m.role === 'user').length,
    [session.messages],
  );

  // 滚动进度记忆（按故事+脉络）
  useEffect(() => {
    if (!progressKey || !scrollRef.current) return;
    try {
      const map = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '{}');
      const top = map[progressKey];
      if (typeof top === 'number') scrollRef.current.scrollTop = top;
    } catch { /* ignore */ }
  }, [progressKey]);
  const saveProgress = useCallback(() => {
    if (!progressKey || !scrollRef.current) return;
    try {
      const map = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '{}');
      map[progressKey] = scrollRef.current.scrollTop;
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
    } catch { /* ignore */ }
  }, [progressKey]);
  useEffect(() => saveProgress, [saveProgress]); // 卸载时存一次

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
    if (!suggestions || !onMarkersChange) return;
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
    if (!polish || !polishChapter || !polishTemplate) return;
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
    if (!polishResult || !polish || !polishChapter) return;
    const id = polishSavedId ?? generateSummaryId();
    await saveSummary(buildPolishItem(polishResult, false, id));
    setPolishSavedId(id);
    toast({ title: '已永久保存为自定义记录' });
  };

  // Esc 关闭（无弹窗时）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !chapterDialogOpen && !polishChapter) {
        saveProgress();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [chapterDialogOpen, polishChapter, onClose, saveProgress]);

  const chapterNav = chapters.map((c, i) => ({
    title: c.title ?? '（开篇）',
    index: i,
  }));

  return (
    <div className="fixed inset-0 z-50 bg-[#f8f5ec] dark:bg-[#1a1a1a] flex flex-col">
      {/* ===== 顶栏 ===== */}
      <div className="shrink-0 border-b border-border/60 bg-card/70 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { saveProgress(); onClose(); }} aria-label="退出小说视图">
            <X className="w-4 h-4" />
          </Button>
          <span className="font-display font-semibold text-sm truncate max-w-[16rem]">{session.title || '未命名作品'}</span>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground font-normal gap-1">
            <BookOpenCheck className="w-3 h-3" />小说视图
          </Badge>
          {userMode === 'hide' && hiddenUserFloors > 0 && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground font-normal gap-1">
              <EyeOff className="w-3 h-3" />已隐藏 {hiddenUserFloors} 个用户楼层
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
                  <Button variant="outline" size="sm" className="h-8 gap-1">
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
                          onClick={() => document.getElementById(`novel-ch-${c.index}`)?.scrollIntoView({ behavior: 'smooth' })}
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}

            {/* AI 章节建议 */}
            {onMarkersChange && (
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setChapterDialogOpen(true)}>
                <Sparkles className="w-3.5 h-3.5" />AI 章节
              </Button>
            )}

            {/* 外观 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8" aria-label="外观设置">
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
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* ===== 正文 ===== */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={saveProgress}>
        <div
          className="max-w-2xl mx-auto px-6 py-10 font-serif text-foreground/90"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.9 }}
        >
          {chapters.length === 0 && (
            <p className="text-center text-muted-foreground text-sm">没有可显示的内容（可能全部楼层被隐藏或清洗）。</p>
          )}
          {chapters.map((ch, ci) => (
            <section key={ci} id={`novel-ch-${ci}`} className="mb-10">
              {(ch.title || polish) && (
                <div className="mb-6">
                  {ch.title && (
                    <div className="text-center">
                      <h2 className="font-display text-xl font-semibold text-primary/80">{ch.title}</h2>
                      <div className="w-16 h-0.5 bg-primary/30 mx-auto mt-2" />
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="text-[11px] text-muted-foreground">#{ch.startFloor}–{ch.endFloor} 楼</span>
                    {polish && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-primary"
                        onClick={() => { setPolishChapter(ch); setPolishResult(''); setPolishSavedId(null); }}
                        title="用自定义记录的「小说化」模板重写本章（调用 AI，需要 API 配置）"
                      >
                        <Feather className="w-3 h-3" />AI 润色本章
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {ch.blocks.map((b, bi) => {
                if (b.type === 'scene-break') {
                  return <div key={bi} className="text-center text-muted-foreground/70 my-8 tracking-[0.5em] text-sm">✦ ✦ ✦</div>;
                }
                return (
                  <p
                    key={bi}
                    className={cn(
                      'mb-4 whitespace-pre-wrap',
                      b.type === 'narration' && 'indent-8',
                      b.type === 'user' && 'text-muted-foreground/70 text-[0.9em] border-l-2 border-border pl-3 indent-0',
                    )}
                  >
                    {b.text}
                  </p>
                );
              })}
            </section>
          ))}
          <p className="text-center text-xs text-muted-foreground/60 pt-4 pb-10">—— 完 ——</p>
        </div>
      </div>

      {/* ===== AI 章节建议对话框 ===== */}
      <Dialog open={chapterDialogOpen} onOpenChange={(v) => { if (!suggesting) { setChapterDialogOpen(v); if (!v) setSuggestions(null); } }}>
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
                  <Input
                    value={s.title}
                    onChange={(e) => setSuggestions((prev) => prev!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className="h-7 text-sm"
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
      <Dialog open={!!polishChapter} onOpenChange={(v) => { if (!polishStreaming && !v) setPolishChapter(null); }}>
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
            <Button disabled={polishStreaming || !polishResult} onClick={handlePolishPermanent}>
              永久保存为自定义记录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NovelView;
