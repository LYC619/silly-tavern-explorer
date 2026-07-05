import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotebookText, AlertCircle, Sparkles, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { GuidedTour } from '@/components/GuidedTour';
import { SUMMARY_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { useToast } from '@/hooks/use-toast';
import { loadAPIConfig } from '@/components/ai-tools';
import { ApiStatusLine } from '@/components/ai-tools/ApiStatusLine';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import { loadActiveSession, loadSessionPointer } from '@/lib/session-storage';
import type { ChatSession } from '@/types/chat';
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
import { buildSummaryMessages, extractTitle } from '@/lib/summary-engine';
import { FloorRangePicker } from '@/components/summary/FloorRangePicker';
import { TemplatePicker } from '@/components/summary/TemplatePicker';
import { SummaryResultEditor } from '@/components/summary/SummaryResultEditor';
import { AttachPanel, type AttachState } from '@/components/summary/AttachPanel';
import { PriorVolumesPanel } from '@/components/summary/PriorVolumesPanel';
import { SavedSummaryList } from '@/components/summary/SavedSummaryList';
import { MiniSummaryPanel } from '@/components/summary/MiniSummaryPanel';
import { DemoData, demoSession } from '@/components/DemoData';
import { Badge } from '@/components/ui/badge';

const KINDS: SummaryKind[] = ['volume', 'diary', 'diy'];

const Summary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [session, setSession] = useState<ChatSession | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);

  const [kind, setKind] = useState<SummaryKind>('volume');
  const [floorStart, setFloorStart] = useState(0);
  const [floorEnd, setFloorEnd] = useState(0);

  const [templates, setTemplates] = useState<AnySummaryTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>(defaultTemplateIdForKind('volume'));
  const [templateContent, setTemplateContent] = useState<string>(getBuiltinTemplate('builtin-volume')?.content ?? '');

  const [resultTitle, setResultTitle] = useState('');
  const [resultContent, setResultContent] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [currentSummaryId, setCurrentSummaryId] = useState<string | null>(null);
  const [savedPermanent, setSavedPermanent] = useState(false);

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
        setFloorStart(0);
        setFloorEnd(Math.max(0, active.messages.length - 1));
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

  // 下一卷卷号 = 已有最大卷号 + 1；起点建议 = 已有卷最大 floorEnd + 1
  const nextVolumeNumber = useMemo(
    () => (priorVolumes.length ? Math.max(...priorVolumes.map((v) => v.volumeNumber ?? 0)) + 1 : 1),
    [priorVolumes]
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
      template: templateContent,
      preset: attach.presetId ? presetMap.get(attach.presetId) : undefined,
      worldbook: attach.worldbookId ? worldbookMap.get(attach.worldbookId) : undefined,
      worldbookMode: attach.worldbookMode,
      worldbookUids: attach.worldbookUids,
      priorSummaries: priors,
      volumeNumber: kind === 'volume' ? nextVolumeNumber : undefined,
      options: { speakerPrefix: true },
    };
  }, [session, kind, priorVolumes, priorSelectedIds, floorStart, floorEnd, templateContent,
      attach, presetMap, worldbookMap, nextVolumeNumber]);

  // 实时 token 估算
  const tokenEstimate = useMemo(() => {
    const input = buildEngineInput();
    if (!input) return 0;
    try { return buildSummaryMessages(input).tokenEstimate; } catch { return 0; }
  }, [buildEngineInput]);

  const handleGenerate = async () => {
    if (!session) return;
    const config = loadAPIConfig(); // 生成时即时读取（配置在 AI 工具页维护）
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 工具」页配置后回来生成', variant: 'destructive' });
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

    setStreaming(true);
    setResultContent('');
    setResultTitle('');
    outputRef.current = '';
    const controller = new AbortController();
    abortRef.current = controller;

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
      await autoSave(finalText, autoTitle);
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

  const buildItem = (content: string, title: string, autoSaved: boolean, id: string): SummaryItem => ({
    id,
    bookId,
    bookTitle: session?.title ?? '(未命名)',
    kind,
    title,
    volumeNumber: kind === 'volume' ? nextVolumeNumber : undefined,
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
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    autoSaved,
  });

  const autoSave = async (content: string, title: string) => {
    const id = generateSummaryId();
    await saveSummary(buildItem(content, title, true, id));
    await pruneAutoSavedSummaries();
    setCurrentSummaryId(id);
    setSavedPermanent(false);
    setSavedRefresh((n) => n + 1);
  };

  // 手动保存 → 永久（autoSaved:false）
  const handleSave = async () => {
    if (!resultContent) return;
    const id = currentSummaryId ?? generateSummaryId();
    await saveSummary(buildItem(resultContent, resultTitle || SUMMARY_KIND_LABELS[kind], false, id));
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
    if (item.genParams?.templateSnapshot) setTemplateContent(item.genParams.templateSnapshot);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    }
    setCurrentSummaryId(null); // 生成为新条目
    setSavedPermanent(false);
    toast({ title: '已回填设置', description: '楼层/挂载/模板已按原条目填好，点「生成」即可重做' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
                    左侧配置：选类型、楼层范围、可选挂载预设/世界书、选择并可编辑提示词模板，点「生成」。右侧管理：生成结果编辑保存、已存总结与小总结提取。API 配置在「AI 工具」页统一维护。
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

          <ApiStatusLine />

          {!session ? (
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* 左栏：生成配置 */}
              <div className="lg:col-span-5 space-y-4">
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
              </div>

              {/* 右栏：成果区（结果编辑 + 已存/小总结） */}
              <div className="lg:col-span-7 space-y-4">
                {(streaming || resultContent) && (
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
                )}

                <Tabs defaultValue="saved" data-tour="summary-saved">
                  <TabsList className="flex w-full">
                    <TabsTrigger value="saved" className="flex-1 whitespace-nowrap">已存总结</TabsTrigger>
                    <TabsTrigger value="mini" className="flex-1 whitespace-nowrap">小总结提取</TabsTrigger>
                  </TabsList>
                  <TabsContent value="saved" className="mt-3">
                    <SavedSummaryList
                      currentBookId={bookId}
                      refreshKey={savedRefresh}
                      onView={handleViewSaved}
                      onRegenerate={handleRegenerate}
                    />
                  </TabsContent>
                  <TabsContent value="mini" className="mt-3">
                    <MiniSummaryPanel session={session} />
                  </TabsContent>
                </Tabs>
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
