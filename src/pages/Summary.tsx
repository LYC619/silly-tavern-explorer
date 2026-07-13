import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotebookText, AlertCircle, Sparkles, Square, Loader2, BookOpen, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { GuidedTour } from '@/components/GuidedTour';
import { SUMMARY_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { useToast } from '@/hooks/use-toast';
import { loadAPIConfig } from '@/components/ai-tools';
import { ApiStatusLine } from '@/components/ai-tools/ApiStatusLine';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import { loadActiveSession, loadSessionPointer } from '@/lib/session-storage';
import type { ChatSession, ChapterMarker } from '@/types/chat';
import type { NormalizedPreset } from '@/types/preset';
import type { WorldBook } from '@/types/worldbook';
import type { SummaryKind, SummaryItem } from '@/types/summary';
import { SUMMARY_KIND_LABELS, generateSummaryId } from '@/types/summary';
import {
  listTemplatesForKind,
  defaultTemplateIdForKind,
  getBuiltinTemplate,
  type AnySummaryTemplate,
} from '@/lib/summary-templates';
import { getSummaryTemplate, saveSummary, pruneAutoSavedSummaries, getAllSummaries } from '@/lib/summary-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { buildSummaryMessages, extractTitle, inferVolumeNumber } from '@/lib/summary-engine';
import { FloorRangePicker, type FloorAnchor } from '@/components/summary/FloorRangePicker';
import { TemplatePicker } from '@/components/summary/TemplatePicker';
import { SummaryResultEditor } from '@/components/summary/SummaryResultEditor';
import { AttachPanel, type AttachState } from '@/components/summary/AttachPanel';
import { PriorVolumesPanel } from '@/components/summary/PriorVolumesPanel';
import { SavedSummaryList } from '@/components/summary/SavedSummaryList';
import { SummaryGallery } from '@/components/summary/SummaryGallery';
import { BatchProcessor } from '@/components/summary/BatchProcessor';
import { substituteVars } from '@/lib/preset-parser';
import { DemoData, demoSession } from '@/components/DemoData';
import { Badge } from '@/components/ui/badge';

const KINDS: SummaryKind[] = ['volume', 'diary', 'diy'];

/** 跨页轻量态（sessionStorage）：记住楼层区间/类型/日记主角——修复「切到聊天页确认范围再回来，改过的楼层变回默认」 */
const UI_STATE_KEY = 'st-summary-ui-state';
interface SummaryUiState {
  bookId: string | null;
  kind?: SummaryKind;
  floorStart?: number;
  floorEnd?: number;
  diaryOwner?: string;
}

const Summary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [session, setSession] = useState<ChatSession | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);

  // 顶层视图：生成工作台 / 展示页（阅读向，生成与阅读分离）
  const [view, setView] = useState<'workshop' | 'gallery'>('workshop');

  const [kind, setKind] = useState<SummaryKind>('volume');
  const [floorStart, setFloorStart] = useState(0);
  const [floorEnd, setFloorEnd] = useState(0);
  // 书签锚点（章节标记 + 收藏楼层），供楼层选择器快捷填入
  const [anchors, setAnchors] = useState<FloorAnchor[]>([]);
  // 日记专用：「生成谁的日记」，非空时自动附加进提示词
  const [diaryOwner, setDiaryOwner] = useState('');

  const [templates, setTemplates] = useState<AnySummaryTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>(defaultTemplateIdForKind('volume'));
  const [templateContent, setTemplateContent] = useState<string>(getBuiltinTemplate('builtin-volume')?.content ?? '');

  const [resultTitle, setResultTitle] = useState('');
  const [resultContent, setResultContent] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [currentSummaryId, setCurrentSummaryId] = useState<string | null>(null);
  const [savedPermanent, setSavedPermanent] = useState(false);
  // 当前编辑器里这份结果所属的卷号（生成时盖章 / 载入已存条目时回填）。
  // 保存必须用它而非实时的 nextVolumeNumber——否则生成完自动落库后 priors 变化，保存时卷号被顶到下一卷。
  const [resultVolume, setResultVolume] = useState<number | null>(null);
  // 手动添加：让空内容的结果编辑器也展开
  const [manualDraft, setManualDraft] = useState(false);

  // 挂载预设/世界书
  const [attach, setAttach] = useState<AttachState>({
    presetId: null, worldbookId: null, worldbookMode: 'constant', worldbookUids: [],
  });

  // 分卷连贯性：当前书已有分卷 + 勾选带入的卷
  const [priorVolumes, setPriorVolumes] = useState<SummaryItem[]>([]);
  const [priorSelectedIds, setPriorSelectedIds] = useState<string[]>([]);

  // 已存列表刷新信号
  const [savedRefresh, setSavedRefresh] = useState(0);

  const [showTour, setShowTour] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef('');
  const editorRef = useRef<HTMLDivElement | null>(null);

  // 结果编辑器在列表下方就地展开：等条件渲染提交后再滚到可视区（双 rAF）
  const scrollEditorIntoView = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
  }, []);

  // 示例会话：纯内存注入（不入书架/不落库），空态下保证引导锚点存在
  const loadDemo = useCallback(() => {
    setIsDemo(true);
    setSession(demoSession);
    setFloorStart(0);
    setFloorEnd(demoSession.messages.length - 1);
  }, []);

  // 引导结束：示例只为引导服务，结束后让位（有真实会话时不会注入示例）
  const handleTourEnd = () => {
    setTourCompleted('summary');
    setShowTour(false);
    if (isDemo) {
      setIsDemo(false);
      setSession(null);
    }
  };

  // 初始加载：活跃会话（API 配置统一在 AI 工具页维护，生成时即时读取）
  useEffect(() => {
    let cancelled = false;
    const ptr = loadSessionPointer();
    setBookId(ptr?.currentBookId ?? null);
    const firstVisit = !isTourCompleted('summary');
    loadActiveSession().then((active) => {
      if (cancelled) return;
      if (active) {
        setSession(active);
        const maxIdx = Math.max(0, active.messages.length - 1);
        // 恢复跨页轻量态（同一本书才恢复；楼层夹到合法区间）
        let s = 0, e = maxIdx;
        try {
          const saved = JSON.parse(sessionStorage.getItem(UI_STATE_KEY) ?? 'null') as SummaryUiState | null;
          if (saved && saved.bookId === (ptr?.currentBookId ?? null)) {
            if (typeof saved.floorStart === 'number') s = Math.max(0, Math.min(maxIdx, saved.floorStart));
            if (typeof saved.floorEnd === 'number') e = Math.max(0, Math.min(maxIdx, saved.floorEnd));
            if (saved.kind && KINDS.includes(saved.kind)) setKind(saved.kind);
            if (saved.diaryOwner) setDiaryOwner(saved.diaryOwner);
          }
        } catch { /* 坏数据按默认处理 */ }
        setFloorStart(Math.min(s, e));
        setFloorEnd(Math.max(s, e));
        // 书签锚点：聊天页的章节标记 + 收藏楼层 → 楼层号（供楼层选择器快捷填入）
        const indexById = new Map(active.messages.map((m, i) => [m.id, i]));
        const anchorList: FloorAnchor[] = [];
        (ptr?.markers ?? []).forEach((mk: ChapterMarker) => {
          const idx = indexById.get(mk.messageId);
          if (idx != null) anchorList.push({ floor: idx, label: `章节 · ${mk.title}` });
        });
        (ptr?.favorites ?? []).forEach((id) => {
          const idx = indexById.get(id);
          if (idx != null) {
            const snippet = active.messages[idx].content.replace(/\s+/g, ' ').trim().slice(0, 24);
            anchorList.push({ floor: idx, label: `收藏 · ${snippet}` });
          }
        });
        anchorList.sort((a, b) => a.floor - b.floor);
        setAnchors(anchorList);
      } else if (firstVisit) {
        loadDemo();
      }
    });
    if (firstVisit) {
      setTimeout(() => setShowTour(true), 500);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 楼层/类型/日记主角变化时写入跨页轻量态（示例数据不记）
  useEffect(() => {
    if (!session || isDemo) return;
    const state: SummaryUiState = { bookId, kind, floorStart, floorEnd, diaryOwner };
    try { sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(state)); } catch { /* 极小，不会失败 */ }
  }, [session, isDemo, bookId, kind, floorStart, floorEnd, diaryOwner]);

  // 切换 kind → 重载模板列表并选中默认模板
  const reloadTemplates = useCallback(async (k: SummaryKind, keepSelected?: string) => {
    const list = await listTemplatesForKind(k);
    setTemplates(list);
    const pick = keepSelected && list.some((t) => t.id === keepSelected)
      ? keepSelected
      : defaultTemplateIdForKind(k);
    setTemplateId(pick);
    const tpl = list.find((t) => t.id === pick);
    setTemplateContent(tpl?.content ?? '');
  }, []);

  useEffect(() => { reloadTemplates(kind); }, [kind, reloadTemplates]);

  // 加载当前书已有分卷（用于连贯性 + 卷号/起点建议）
  const reloadVolumes = useCallback(async () => {
    if (!bookId) { setPriorVolumes([]); return; }
    const all = await getAllSummaries();
    const vols = all
      .filter((s) => s.bookId === bookId && s.kind === 'volume')
      .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
    setPriorVolumes(vols);
    setPriorSelectedIds(vols.map((v) => v.id)); // 默认全选（连贯性关键）
  }, [bookId]);

  useEffect(() => { reloadVolumes(); }, [reloadVolumes, savedRefresh]);

  // 下一卷卷号按实际情况推断（见 inferVolumeNumber：重做同起点的卷沿用其卷号，否则 = 最大 + 1）；
  // 起点建议 = 已有卷最大 floorEnd + 1
  const nextVolumeNumber = useMemo(
    () => inferVolumeNumber(priorVolumes, floorStart),
    [priorVolumes, floorStart]
  );
  const suggestedStart = useMemo(
    () => (priorVolumes.length ? Math.max(...priorVolumes.map((v) => v.floorEnd)) + 1 : undefined),
    [priorVolumes]
  );

  // 选择模板 → 载入正文
  const handleSelectTemplate = async (id: string) => {
    setTemplateId(id);
    const builtin = getBuiltinTemplate(id);
    if (builtin) { setTemplateContent(builtin.content); return; }
    const custom = await getSummaryTemplate(id);
    if (custom) setTemplateContent(custom.content);
  };

  const floorCount = useMemo(
    () => (session ? Math.max(0, Math.min(floorEnd, session.messages.length - 1) - Math.max(0, floorStart) + 1) : 0),
    [session, floorStart, floorEnd]
  );

  // 缓存挂载对象（预设/世界书本体），供引擎组装
  const [presetMap, setPresetMap] = useState<Map<string, NormalizedPreset>>(new Map());
  const [worldbookMap, setWorldbookMap] = useState<Map<string, WorldBook>>(new Map());
  useEffect(() => {
    getAllPresets().then((ps) => setPresetMap(new Map(ps.map((p) => [p.id, p.preset])))).catch(() => {});
    getAllWorldBooks().then((ws) => setWorldbookMap(new Map(ws.map((w) => [w.id, w.worldbook])))).catch(() => {});
  }, []);

  // 日记主角非空时，自动在模板末尾附加定向指令（生成与批量共用）
  const effectiveTemplate = useMemo(() => {
    const owner = diaryOwner.trim();
    if (kind === 'diary' && owner) {
      return `${templateContent.trimEnd()}\n\n请根据以上故事内容，以「${owner}」的第一人称视角生成${owner}的日记。`;
    }
    return templateContent;
  }, [kind, diaryOwner, templateContent]);

  // 组装引擎输入（token 估算与生成共用）
  const buildEngineInput = useCallback(() => {
    if (!session) return null;
    const priors = kind === 'volume'
      ? priorVolumes.filter((v) => priorSelectedIds.includes(v.id))
      : [];
    return {
      session,
      floorStart,
      floorEnd,
      template: effectiveTemplate,
      preset: attach.presetId ? presetMap.get(attach.presetId) : undefined,
      worldbook: attach.worldbookId ? worldbookMap.get(attach.worldbookId) : undefined,
      worldbookMode: attach.worldbookMode,
      worldbookUids: attach.worldbookUids,
      priorSummaries: priors,
      volumeNumber: kind === 'volume' ? nextVolumeNumber : undefined,
      options: { speakerPrefix: true },
    };
  }, [session, kind, priorVolumes, priorSelectedIds, floorStart, floorEnd, effectiveTemplate,
      attach, presetMap, worldbookMap, nextVolumeNumber]);

  // 实时 token 估算
  const tokenEstimate = useMemo(() => {
    const input = buildEngineInput();
    if (!input) return 0;
    try { return buildSummaryMessages(input).tokenEstimate; } catch { return 0; }
  }, [buildEngineInput]);

  // 批量分段的系统提示词：当前模板正文做宏替换（轻量直调，不走完整引擎）
  const batchSystemPrompt = useMemo(() => {
    if (!session) return '';
    const base = substituteVars(effectiveTemplate, session.character?.name || '角色', session.user?.name || '用户');
    return base.replace(/\{\{volume\}\}/gi, String(nextVolumeNumber));
  }, [session, effectiveTemplate, nextVolumeNumber]);

  // 批量分段（挂载模式）：对某段楼层用完整引擎组装 messages（预设/世界书与左栏一致；不带前情/卷号，避免逐段重复）
  const buildSegmentMessages = useCallback((s: number, e: number) => {
    const input = buildEngineInput();
    if (!input) return null;
    try {
      return buildSummaryMessages({ ...input, floorStart: s, floorEnd: e, priorSummaries: [], volumeNumber: undefined }).messages;
    } catch {
      return null;
    }
  }, [buildEngineInput]);

  // 批量合并结果送入右栏编辑器（走既有编辑/保存/导出流）
  const handleBatchMerge = (text: string) => {
    setResultTitle(`${SUMMARY_KIND_LABELS[kind]} · 批量合并 ${new Date().toLocaleDateString()}`);
    setResultContent(text);
    setCurrentSummaryId(null);
    setSavedPermanent(false);
    setResultVolume(null); // 保存时按当前楼层现算卷号
    setManualDraft(false);
    scrollEditorIntoView();
    toast({ title: '已送入结果编辑器', description: '可继续编辑后保存' });
  };

  const handleGenerate = async () => {
    if (!session) return;
    const config = loadAPIConfig(); // 生成时即时读取（配置在 AI 工具页维护）
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 配置」页配置后回来生成', variant: 'destructive' });
      return;
    }
    const input = buildEngineInput();
    if (!input) return;
    const { messages, warnings } = buildSummaryMessages(input);
    if (messages.length === 0) {
      toast({ title: '没有可总结的内容', variant: 'destructive' });
      return;
    }
    warnings.forEach((w) => toast({ title: '提示', description: w }));

    // 盖章本次生成的卷号：保存时用它，不再受 priors 变化影响（修复生成/保存各 +1 的卷号乱跳）
    const vol = kind === 'volume' ? nextVolumeNumber : undefined;
    setResultVolume(vol ?? null);
    setManualDraft(false);

    setStreaming(true);
    setResultContent('');
    setResultTitle('');
    outputRef.current = '';
    const controller = new AbortController();
    abortRef.current = controller;
    scrollEditorIntoView();

    try {
      await callOpenAIMessages(config, messages, {
        onChunk: (chunk) => {
          outputRef.current += chunk;
          setResultContent(outputRef.current);
        },
        signal: controller.signal,
      });
      const finalText = outputRef.current;
      const autoTitle = extractTitle(kind, finalText) || `${SUMMARY_KIND_LABELS[kind]} · ${new Date().toLocaleDateString()}`;
      setResultTitle(autoTitle);
      // 自动落库（autoSaved:true）
      await autoSave(finalText, autoTitle, vol);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast({ title: '已停止生成' });
      } else {
        toast({ title: '生成失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const buildItem = (content: string, title: string, autoSaved: boolean, id: string, volume?: number): SummaryItem => ({
    id,
    bookId,
    bookTitle: session?.title ?? '(未命名)',
    kind,
    title,
    volumeNumber: kind === 'volume' ? volume : undefined,
    floorStart,
    floorEnd,
    content,
    genParams: {
      model: loadAPIConfig().model,
      presetId: attach.presetId ?? undefined,
      worldbookId: attach.worldbookId ?? undefined,
      worldbookMode: attach.worldbookId ? attach.worldbookMode : undefined,
      worldbookUids: attach.worldbookMode === 'manual' ? attach.worldbookUids : undefined,
      priorSummaryIds: kind === 'volume' ? priorSelectedIds : undefined,
      templateId,
      templateSnapshot: templateContent,
      speakerPrefix: true,
      diaryOwner: kind === 'diary' && diaryOwner.trim() ? diaryOwner.trim() : undefined,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    autoSaved,
  });

  const autoSave = async (content: string, title: string, volume?: number) => {
    const id = generateSummaryId();
    await saveSummary(buildItem(content, title, true, id, volume));
    await pruneAutoSavedSummaries();
    setCurrentSummaryId(id);
    setSavedPermanent(false);
    setSavedRefresh((n) => n + 1);
  };

  // 手动保存 → 永久（autoSaved:false）。卷号沿用本结果的盖章卷号（无盖章才现算）
  const handleSave = async () => {
    if (!resultContent) return;
    const id = currentSummaryId ?? generateSummaryId();
    await saveSummary(buildItem(resultContent, resultTitle || SUMMARY_KIND_LABELS[kind], false, id, resultVolume ?? nextVolumeNumber));
    setCurrentSummaryId(id);
    setSavedPermanent(true);
    setSavedRefresh((n) => n + 1);
    toast({ title: '已永久保存', description: resultTitle || SUMMARY_KIND_LABELS[kind] });
  };

  // 用户编辑结果 → 标记未永久保存
  const handleContentEdit = (c: string) => {
    setResultContent(c);
    if (savedPermanent) setSavedPermanent(false);
  };

  // 从已存列表载入一条到编辑区（切到对应 kind + 楼层，便于继续编辑/保存）
  const handleViewSaved = (item: SummaryItem) => {
    setKind(item.kind);
    setFloorStart(item.floorStart);
    setFloorEnd(item.floorEnd);
    setResultTitle(item.title);
    setResultContent(item.content);
    setCurrentSummaryId(item.id);
    setSavedPermanent(!item.autoSaved);
    setResultVolume(item.volumeNumber ?? null); // 保存时沿用原卷号
    setManualDraft(false);
    if (item.genParams?.templateSnapshot) setTemplateContent(item.genParams.templateSnapshot);
    if (item.kind === 'diary') setDiaryOwner(item.genParams?.diaryOwner ?? '');
    scrollEditorIntoView();
  };

  // 用相同设置重新生成：回填挂载/楼层/模板/kind，再触发生成
  const handleRegenerate = (item: SummaryItem) => {
    setKind(item.kind);
    setFloorStart(item.floorStart);
    setFloorEnd(item.floorEnd);
    const gp = item.genParams;
    if (gp) {
      setAttach({
        presetId: gp.presetId ?? null,
        worldbookId: gp.worldbookId ?? null,
        worldbookMode: gp.worldbookMode ?? 'constant',
        worldbookUids: gp.worldbookUids ?? [],
      });
      if (gp.templateSnapshot) setTemplateContent(gp.templateSnapshot);
      if (item.kind === 'diary') setDiaryOwner(gp.diaryOwner ?? '');
    }
    setCurrentSummaryId(null); // 生成为新条目（卷号由起始楼层匹配自动沿用原卷）
    setSavedPermanent(false);
    toast({ title: '已回填设置', description: '楼层/挂载/模板已按原条目填好，点「生成」即可重做' });
    document.querySelector('[data-tour="summary-template"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // 手动添加一条总结：展开空白编辑器，写完点「保存」即入库（不经 AI）
  const handleManualCreate = () => {
    setResultTitle('');
    setResultContent('');
    setCurrentSummaryId(null);
    setSavedPermanent(false);
    setResultVolume(null);
    setManualDraft(true);
    scrollEditorIntoView();
  };

  // 展示页点「去编辑」：切回工作台并载入该条
  const handleGalleryEdit = (item: SummaryItem) => {
    setView('workshop');
    handleViewSaved(item);
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-5">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* 头部：标题 + 会话信息（右） */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg gold-gradient flex items-center justify-center shadow-card">
                <NotebookText className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <h1 className="font-display text-xl font-semibold">总结</h1>
                  <HelpCard>
                    左侧配置：选类型、楼层范围、可选挂载预设/世界书、选择并可编辑提示词模板，点「生成」；楼层很多时用「批量分段生成」。右侧管理：已存总结与小总结提取，点「查看」在列表下方展开编辑。API 配置在「AI 配置」页统一维护。
                  </HelpCard>
                </div>
                <p className="text-xs text-muted-foreground">把聊天记录沉淀为可归档的总结</p>
              </div>
            </div>
            {session && (
              <div className="text-xs text-muted-foreground text-right pt-1">
                {isDemo && <Badge variant="outline" className="font-normal mr-2">示例数据 · 不会保存</Badge>}
                <span className="font-medium text-foreground">{session.title}</span>
                <span> · {session.messages.length} 楼</span>
              </div>
            )}
          </div>

          {/* 顶层视图切换：生成工作台 / 展示页（生成与阅读分离） */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={view} onValueChange={(v) => setView(v as 'workshop' | 'gallery')}>
              <TabsList className="flex">
                <TabsTrigger value="workshop" className="gap-1.5 whitespace-nowrap">
                  <Wrench className="w-3.5 h-3.5" />生成工作台
                </TabsTrigger>
                <TabsTrigger value="gallery" className="gap-1.5 whitespace-nowrap">
                  <BookOpen className="w-3.5 h-3.5" />展示页
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {view === 'workshop' && <ApiStatusLine />}

          {view === 'gallery' ? (
            <SummaryGallery
              currentBookId={bookId}
              refreshKey={savedRefresh}
              charName={session?.character?.name}
              onEdit={handleGalleryEdit}
            />
          ) : !session ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground mb-3">尚未载入聊天记录</p>
                <p className="text-sm text-muted-foreground mb-4">
                  请先在「聊天处理」页导入并处理聊天，或从「书架」打开一本书，再回到这里总结。
                </p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button variant="outline" onClick={() => navigate('/')}>前往聊天处理</Button>
                  <Button variant="outline" onClick={() => navigate('/bookshelf')}>打开书架</Button>
                  <DemoData onLoad={loadDemo} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-4 items-start">
              {/* 分栏不再用视口断点（sm:/md: 已在用户环境三次失效——高缩放/高分屏下媒体查询与预期不符）。
                  改为 flex-wrap + 行内 flex-basis：容器放得下两栏(240+260+gap)就 5:7 分栏，放不下自动换行成单列；
                  行内样式不走 Tailwind 生成/清除链，也不受注入式插件的类覆盖影响。世界书页同款思路（其两栏从未出过问题）。 */}
              {/* 左栏：生成配置 */}
              <div className="min-w-0 space-y-4" style={{ flex: '5 1 240px' }}>
                <Tabs value={kind} onValueChange={(v) => setKind(v as SummaryKind)} data-tour="summary-kind">
                  <TabsList className="flex w-full">
                    {KINDS.map((k) => (
                      <TabsTrigger key={k} value={k} className="flex-1 whitespace-nowrap">
                        {SUMMARY_KIND_LABELS[k]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                <div data-tour="summary-floors">
                  <FloorRangePicker
                    total={session.messages.length}
                    start={floorStart}
                    end={floorEnd}
                    onChange={(s, e) => { setFloorStart(s); setFloorEnd(e); }}
                    suggestedStart={kind === 'volume' ? suggestedStart : undefined}
                    anchors={anchors}
                  />
                </div>

                <div data-tour="summary-attach">
                  <AttachPanel value={attach} onChange={setAttach} tokenEstimate={tokenEstimate} />
                </div>

                {kind === 'volume' && (
                  <PriorVolumesPanel
                    volumes={priorVolumes}
                    selectedIds={priorSelectedIds}
                    onChange={setPriorSelectedIds}
                  />
                )}

                <Card data-tour="summary-template">
                  <CardContent className="p-4 space-y-3">
                    {kind === 'diary' && (
                      <div className="space-y-1">
                        <Label htmlFor="diary-owner" className="text-xs text-muted-foreground">
                          生成谁的日记（自动附加到提示词，留空则按模板默认视角）
                        </Label>
                        <Input
                          id="diary-owner"
                          value={diaryOwner}
                          onChange={(e) => setDiaryOwner(e.target.value)}
                          placeholder={session.character?.name || '角色名'}
                          className="h-8"
                        />
                      </div>
                    )}
                    <TemplatePicker
                      kind={kind}
                      templates={templates}
                      selectedId={templateId}
                      onSelect={handleSelectTemplate}
                      content={templateContent}
                      onContentChange={setTemplateContent}
                      onTemplatesChanged={() => reloadTemplates(kind, templateId)}
                    />
                    <div className="flex items-center gap-2">
                      {!streaming ? (
                        <Button className="w-full gap-2" onClick={handleGenerate} disabled={floorCount === 0}>
                          <Sparkles className="w-4 h-4" />
                          {kind === 'volume' ? `生成第 ${nextVolumeNumber} 卷（${floorCount} 楼）` : `生成（${floorCount} 楼）`}
                        </Button>
                      ) : (
                        <Button variant="destructive" className="w-full gap-2" onClick={handleStop}>
                          <Square className="w-4 h-4" />停止生成
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div data-tour="summary-batch">
                  <BatchProcessor
                    session={session}
                    floorStart={floorStart}
                    floorEnd={floorEnd}
                    systemPrompt={batchSystemPrompt}
                    buildFullMessages={buildSegmentMessages}
                    onMergeToEditor={handleBatchMerge}
                  />
                </div>
              </div>

              {/* 右栏：成果区（列表总控在上，结果编辑器在列表下方就地展开） */}
              <div className="min-w-0 space-y-4" style={{ flex: '7 1 260px' }}>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleManualCreate}>
                    <NotebookText className="w-3.5 h-3.5" />手动添加总结
                  </Button>
                </div>
                <div data-tour="summary-saved">
                  <SavedSummaryList
                    currentBookId={bookId}
                    refreshKey={savedRefresh}
                    session={session}
                    onView={handleViewSaved}
                    onRegenerate={handleRegenerate}
                    onChanged={() => setSavedRefresh((n) => n + 1)}
                  />
                </div>

                {(streaming || resultContent || manualDraft) && (
                  <div ref={editorRef}>
                    <SummaryResultEditor
                      kind={kind}
                      title={resultTitle}
                      onTitleChange={setResultTitle}
                      content={resultContent}
                      onContentChange={handleContentEdit}
                      streaming={streaming}
                      onSave={handleSave}
                      savedPermanent={savedPermanent}
                      charName={session.character?.name}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showTour && (
        <GuidedTour
          steps={SUMMARY_TOUR_STEPS}
          module="summary"
          onComplete={handleTourEnd}
          onSkip={handleTourEnd}
        />
      )}
    </AppLayout>
  );
};

export default Summary;
