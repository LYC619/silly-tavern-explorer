import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotebookText, AlertCircle, Sparkles, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { useToast } from '@/hooks/use-toast';
import {
  APIConfigCard,
  loadAPIConfig,
  DEFAULT_API_URL,
  DEFAULT_MODEL,
  type APIConfig,
} from '@/components/ai-tools';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import { loadActiveSession, loadSessionPointer } from '@/lib/session-storage';
import type { ChatSession } from '@/types/chat';
import type { SummaryKind, SummaryItem } from '@/types/summary';
import { SUMMARY_KIND_LABELS, generateSummaryId } from '@/types/summary';
import {
  listTemplatesForKind,
  defaultTemplateIdForKind,
  getBuiltinTemplate,
  type AnySummaryTemplate,
} from '@/lib/summary-templates';
import { getSummaryTemplate, saveSummary, pruneAutoSavedSummaries } from '@/lib/summary-db';
import { buildSummaryMessages, extractTitle } from '@/lib/summary-engine';
import { FloorRangePicker } from '@/components/summary/FloorRangePicker';
import { TemplatePicker } from '@/components/summary/TemplatePicker';
import { SummaryResultEditor } from '@/components/summary/SummaryResultEditor';

const KINDS: SummaryKind[] = ['volume', 'diary', 'diy'];

const Summary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [config, setConfig] = useState<APIConfig>({ apiKey: '', apiUrl: DEFAULT_API_URL, model: DEFAULT_MODEL });
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

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef('');

  // 初始加载：API 配置 + 活跃会话
  useEffect(() => {
    setConfig(loadAPIConfig());
    let cancelled = false;
    const ptr = loadSessionPointer();
    setBookId(ptr?.currentBookId ?? null);
    loadActiveSession().then((active) => {
      if (cancelled || !active) return;
      setSession(active);
      setFloorStart(0);
      setFloorEnd(Math.max(0, active.messages.length - 1));
    });
    return () => { cancelled = true; };
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

  // 选择模板 → 载入正文
  const handleSelectTemplate = async (id: string) => {
    setTemplateId(id);
    const builtin = getBuiltinTemplate(id);
    if (builtin) { setTemplateContent(builtin.content); return; }
    const custom = await getSummaryTemplate(id);
    if (custom) setTemplateContent(custom.content);
  };

  const handleConfigSave = (c: APIConfig) => setConfig(c);
  const handleConfigClear = () => setConfig({ apiKey: '', apiUrl: DEFAULT_API_URL, model: DEFAULT_MODEL });

  const floorCount = useMemo(
    () => (session ? Math.max(0, Math.min(floorEnd, session.messages.length - 1) - Math.max(0, floorStart) + 1) : 0),
    [session, floorStart, floorEnd]
  );

  const handleGenerate = async () => {
    if (!session) return;
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '在上方展开 API 配置填入密钥', variant: 'destructive' });
      return;
    }
    const { messages, warnings } = buildSummaryMessages({
      session,
      floorStart,
      floorEnd,
      template: templateContent,
      volumeNumber: kind === 'volume' ? 1 : undefined,
      options: { speakerPrefix: true },
    });
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
    volumeNumber: kind === 'volume' ? 1 : undefined,
    floorStart,
    floorEnd,
    content,
    genParams: {
      model: config.model,
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
  };

  // 手动保存 → 永久（autoSaved:false）
  const handleSave = async () => {
    if (!resultContent) return;
    const id = currentSummaryId ?? generateSummaryId();
    await saveSummary(buildItem(resultContent, resultTitle || SUMMARY_KIND_LABELS[kind], false, id));
    setCurrentSummaryId(id);
    setSavedPermanent(true);
    toast({ title: '已永久保存', description: resultTitle || SUMMARY_KIND_LABELS[kind] });
  };

  // 用户编辑结果 → 标记未永久保存
  const handleContentEdit = (c: string) => {
    setResultContent(c);
    if (savedPermanent) setSavedPermanent(false);
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* 标题 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
              <NotebookText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <h1 className="font-display text-xl font-semibold">总结</h1>
                <HelpCard>
                  从当前书选楼层范围，用提示词模板经 AI 生成分卷总结、角色日记或 DIY 内容。结果可编辑、可保存，永不丢失。需要在下方配置 OpenAI 兼容的 API Key。
                </HelpCard>
              </div>
              <p className="text-xs text-muted-foreground">把聊天记录沉淀为可归档的总结</p>
            </div>
          </div>

          <APIConfigCard savedConfig={config} onConfigSave={handleConfigSave} onConfigClear={handleConfigClear} />

          {!session ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground mb-3">尚未载入聊天记录</p>
                <p className="text-sm text-muted-foreground mb-4">
                  请先在「聊天处理」页导入并处理聊天，或从「书架」打开一本书，再回到这里总结。
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={() => navigate('/')}>前往聊天处理</Button>
                  <Button variant="outline" onClick={() => navigate('/bookshelf')}>打开书架</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <span className="font-medium text-foreground">{session.title}</span>
                <span>· {session.messages.length} 楼</span>
                <span>· {session.character?.name} & {session.user?.name}</span>
              </div>

              {/* 呈现类型 */}
              <Tabs value={kind} onValueChange={(v) => setKind(v as SummaryKind)}>
                <TabsList className="grid w-full grid-cols-3">
                  {KINDS.map((k) => (
                    <TabsTrigger key={k} value={k}>{SUMMARY_KIND_LABELS[k]}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <FloorRangePicker
                total={session.messages.length}
                start={floorStart}
                end={floorEnd}
                onChange={(s, e) => { setFloorStart(s); setFloorEnd(e); }}
              />

              <Card>
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
                      <Button className="gap-2" onClick={handleGenerate} disabled={floorCount === 0}>
                        <Sparkles className="w-4 h-4" />生成（{floorCount} 楼）
                      </Button>
                    ) : (
                      <Button variant="destructive" className="gap-2" onClick={handleStop}>
                        <Square className="w-4 h-4" />停止
                      </Button>
                    )}
                    {streaming && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  </div>
                </CardContent>
              </Card>

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
                />
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Summary;
