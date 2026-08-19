/**
 * 记录工作台（2.0 阶段3，从 pages/Summary.tsx 拆出的生成+编辑流）。
 * 管一条总结/日记/DIY 记录：选脉络（主线/分支）和楼层范围 → 挂预设/世界书 → 选模板
 * → 生成草稿（流式，自动暂存）→ 编辑确认保存（永久）。每条记录存生成参数快照。
 * 卷号逻辑照旧：默认已有最大卷号+1，可手改；生成时盖章，保存用盖章值。
 * 父组件用 key 重挂来切换记录（key = record.id 或 'new-<kind>'）。
 */
import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react';
import { Sparkles, Square, Loader2, BookOpen, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { loadAPIConfig } from '@/components/ai-tools';
import { ApiStatusLine } from '@/components/ai-tools/ApiStatusLine';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import { MarkdownLite } from '@/components/MarkdownLite';
import { DiaryView } from '@/components/summary/DiaryView';
import type { ArchiveStory } from '@/types/archive';
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
import { buildSummaryMessages, extractTitle, inferVolumeNumber } from '@/lib/summary-engine';
import { getBranchLine } from '@/lib/archive-db';
import { FloorRangePicker, type FloorAnchor } from '@/components/summary/FloorRangePicker';
import { TemplatePicker } from '@/components/summary/TemplatePicker';
import { SummaryResultEditor } from '@/components/summary/SummaryResultEditor';
import { AttachPanel, type AttachState } from '@/components/summary/AttachPanel';
import { PriorVolumesPanel } from '@/components/summary/PriorVolumesPanel';
import { BatchProcessor } from '@/components/summary/BatchProcessor';
import { substituteVars } from '@/lib/preset-parser';
import { hasUnsavedSummaryDraft } from '@/lib/summary-draft-state';

const MAIN = '__main__';

interface RecordWorkbenchProps {
  story: ArchiveStory;
  kind: SummaryKind;
  /** null = 新建（保存后由父组件切到已存 id） */
  record: SummaryItem | null;
  /** 新建时默认脉络 = 工作区当前分支 */
  defaultBranchId: string | null;
  /** 保存/自动暂存落库后通知（父组件刷新索引并选中该条） */
  onSaved: (item: SummaryItem) => void;
  /** 旧版总结页右栏顶部的已存记录列表。 */
  sidePanel?: ReactNode;
  /** 旧版总结页左栏顶部的类型切换。 */
  configurationHeader?: ReactNode;
  /** 默认沿用整理面板行为；旧版总结页无结果时不渲染空编辑器。 */
  showEmptyEditor?: boolean;
  /** 上层把 API 状态并入紧凑标题栏时关闭本行。 */
  showApiStatus?: boolean;
}

export interface RecordWorkbenchHandle {
  /** 右栏「重新生成」：按记录的 genParams 回填挂载并转为生成新条目 */
  regenerate: () => void;
  /** 旧版总结页的“手动添加总结”：展开一份空白草稿。 */
  startManual: () => void;
  /** 切换类型/页面前判断当前编辑器是否有尚未落库的内容。 */
  hasUnsavedDraft: () => boolean;
}

export const RecordWorkbench = forwardRef<RecordWorkbenchHandle, RecordWorkbenchProps>(
  function RecordWorkbench({
    story,
    kind,
    record,
    defaultBranchId,
    onSaved,
    sidePanel,
    configurationHeader,
    showEmptyEditor = true,
    showApiStatus = true,
  }, ref) {
    const { toast } = useToast();

    // 脉络选择：记录带 branchId 用记录的；新建默认工作区当前分支。分支被删则回落主线
    const initialBranch = record ? (record.branchId ?? null) : defaultBranchId;
    const [branchId, setBranchId] = useState<string | null>(
      initialBranch && story.branches?.some((b) => b.id === initialBranch) ? initialBranch : null,
    );
    const line = getBranchLine(story, branchId) ?? getBranchLine(story, null)!;
    const session: ChatSession = line.session;
    const maxIdx = Math.max(0, session.messages.length - 1);

    const [floorStart, setFloorStart] = useState(() => Math.min(record?.floorStart ?? 0, maxIdx));
    const [floorEnd, setFloorEnd] = useState(() => Math.min(record?.floorEnd ?? maxIdx, maxIdx));
    const [diaryOwner, setDiaryOwner] = useState(record?.genParams?.diaryOwner ?? '');

    const [templates, setTemplates] = useState<AnySummaryTemplate[]>([]);
    const [templateId, setTemplateId] = useState<string>(record?.genParams?.templateId ?? defaultTemplateIdForKind(kind));
    const [templateContent, setTemplateContent] = useState<string>(
      record?.genParams?.templateSnapshot ?? getBuiltinTemplate(defaultTemplateIdForKind(kind))?.content ?? '',
    );

    const [resultTitle, setResultTitle] = useState(record?.title ?? '');
    const [resultContent, setResultContent] = useState(record?.content ?? '');
    const [streaming, setStreaming] = useState(false);
    const [currentSummaryId, setCurrentSummaryId] = useState<string | null>(record?.id ?? null);
    const [savedPermanent, setSavedPermanent] = useState(record ? !record.autoSaved : false);
    // 当前结果所属卷号（生成时盖章/载入回填）；保存用它而非实时 nextVolumeNumber，防 priors 变化顶号
    const [resultVolume, setResultVolume] = useState<number | null>(record?.volumeNumber ?? null);
    const [manualDraft, setManualDraft] = useState(false);
    // 预览模式：MD 排版阅读（日记用日记本）；编辑回 textarea
    const [preview, setPreview] = useState(false);

    const [attach, setAttach] = useState<AttachState>({
      presetId: null, worldbookId: null, worldbookMode: 'constant', worldbookUids: [],
    });

    const [priorVolumes, setPriorVolumes] = useState<SummaryItem[]>([]);
    const [priorSelectedIds, setPriorSelectedIds] = useState<string[]>([]);

    const abortRef = useRef<AbortController | null>(null);
    const outputRef = useRef('');
    const editorRef = useRef<HTMLDivElement | null>(null);

    const scrollEditorIntoView = useCallback(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }));
    }, []);

    // 换脉络后楼层范围夹到新会话的合法区间
    const switchBranch = (v: string) => {
      const next = v === MAIN ? null : v;
      setBranchId(next);
      const nl = getBranchLine(story, next) ?? getBranchLine(story, null)!;
      const m = Math.max(0, nl.session.messages.length - 1);
      setFloorStart((s) => Math.min(s, m));
      setFloorEnd((e) => Math.min(e, m));
    };

    // 模板列表
    const reloadTemplates = useCallback(async (keepSelected?: string) => {
      const list = await listTemplatesForKind(kind);
      setTemplates(list);
      if (keepSelected && !list.some((t) => t.id === keepSelected)) {
        setTemplateId(defaultTemplateIdForKind(kind));
      }
    }, [kind]);
    useEffect(() => { reloadTemplates(templateId); /* 首载保留记录里的模板选择 */ }, [reloadTemplates]); // eslint-disable-line react-hooks/exhaustive-deps

    // 本故事已有分卷（连贯性 + 卷号建议；全脉络共用一套卷号）
    const reloadVolumes = useCallback(async () => {
      const all = await getAllSummaries();
      const vols = all
        .filter((s) => s.bookId === story.id && s.kind === 'volume')
        .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
      setPriorVolumes(vols);
      setPriorSelectedIds(vols.map((v) => v.id)); // 默认全选（连贯性关键）
    }, [story.id]);
    useEffect(() => { reloadVolumes(); }, [reloadVolumes]);

    const nextVolumeNumber = useMemo(() => inferVolumeNumber(priorVolumes), [priorVolumes]);
    const [volumeOverride, setVolumeOverride] = useState<number | null>(null);
    const effectiveVolume = volumeOverride ?? (record?.volumeNumber ?? nextVolumeNumber);
    const suggestedStart = useMemo(
      () => (priorVolumes.length ? Math.max(...priorVolumes.map((v) => v.floorEnd)) + 1 : undefined),
      [priorVolumes]
    );

    // 书签锚点：当前脉络的章节标记 + 收藏楼层
    const anchors = useMemo(() => {
      const indexById = new Map(session.messages.map((m, i) => [m.id, i]));
      const list: FloorAnchor[] = [];
      line.markers.forEach((mk) => {
        const idx = indexById.get(mk.messageId);
        if (idx != null) list.push({ floor: idx, label: `章节 · ${mk.title}` });
      });
      (line.favorites ?? []).forEach((id) => {
        const idx = indexById.get(id);
        if (idx != null) {
          const snippet = session.messages[idx].content.replace(/\s+/g, ' ').trim().slice(0, 24);
          list.push({ floor: idx, label: `收藏 · ${snippet}` });
        }
      });
      return list.sort((a, b) => a.floor - b.floor);
    }, [session, line.markers, line.favorites]);

    const handleSelectTemplate = async (id: string) => {
      setTemplateId(id);
      const builtin = getBuiltinTemplate(id);
      if (builtin) { setTemplateContent(builtin.content); return; }
      const custom = await getSummaryTemplate(id);
      if (custom) setTemplateContent(custom.content);
    };

    const floorCount = useMemo(
      () => Math.max(0, Math.min(floorEnd, maxIdx) - Math.max(0, floorStart) + 1),
      [floorStart, floorEnd, maxIdx]
    );

    const [presetMap, setPresetMap] = useState<Map<string, NormalizedPreset>>(new Map());
    const [worldbookMap, setWorldbookMap] = useState<Map<string, WorldBook>>(new Map());
    useEffect(() => {
      getAllPresets().then((ps) => setPresetMap(new Map(ps.map((p) => [p.id, p.preset])))).catch(() => {});
      getAllWorldBooks().then((ws) => setWorldbookMap(new Map(ws.map((w) => [w.id, w.worldbook])))).catch(() => {});
    }, []);

    // 日记主角非空时，自动在模板末尾附加定向指令
    const effectiveTemplate = useMemo(() => {
      const owner = diaryOwner.trim();
      if (kind === 'diary' && owner) {
        return `${templateContent.trimEnd()}\n\n请根据以上故事内容，以「${owner}」的第一人称视角生成${owner}的日记。`;
      }
      return templateContent;
    }, [kind, diaryOwner, templateContent]);

    const buildEngineInput = useCallback(() => {
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
        volumeNumber: kind === 'volume' ? effectiveVolume : undefined,
        options: { speakerPrefix: true },
      };
    }, [session, kind, priorVolumes, priorSelectedIds, floorStart, floorEnd, effectiveTemplate,
        attach, presetMap, worldbookMap, effectiveVolume]);

    const tokenEstimate = useMemo(() => {
      try { return buildSummaryMessages(buildEngineInput()).tokenEstimate; } catch { return 0; }
    }, [buildEngineInput]);

    // 批量分段的系统提示词：当前模板正文做宏替换（轻量直调）
    const batchSystemPrompt = useMemo(() => {
      const base = substituteVars(effectiveTemplate, session.character?.name || '角色', session.user?.name || '用户');
      return base.replace(/\{\{volume\}\}/gi, String(effectiveVolume));
    }, [session, effectiveTemplate, effectiveVolume]);

    const buildSegmentMessages = useCallback((s: number, e: number) => {
      try {
        return buildSummaryMessages({ ...buildEngineInput(), floorStart: s, floorEnd: e, priorSummaries: [], volumeNumber: undefined }).messages;
      } catch {
        return null;
      }
    }, [buildEngineInput]);

    const handleBatchMerge = (text: string) => {
      setResultTitle(`${SUMMARY_KIND_LABELS[kind]} · 批量合并 ${new Date().toLocaleDateString()}`);
      setResultContent(text);
      setCurrentSummaryId(null);
      setSavedPermanent(false);
      setResultVolume(null);
      setPreview(false);
      setManualDraft(false);
      scrollEditorIntoView();
      toast({ title: '已送入结果编辑器', description: '可继续编辑后保存' });
    };

    /** 选中模板的显示名（存进快照，索引里 diy 显示模板名） */
    const selectedTemplateTitle = templates.find((t) => t.id === templateId)?.title;

    const buildItem = (content: string, title: string, autoSaved: boolean, id: string, volume?: number): SummaryItem => ({
      id,
      bookId: story.id,
      bookTitle: story.title,
      kind,
      title,
      volumeNumber: kind === 'volume' ? volume : undefined,
      branchId: branchId ?? undefined,
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
        templateTitle: selectedTemplateTitle,
        templateSnapshot: templateContent,
        speakerPrefix: true,
        diaryOwner: kind === 'diary' && diaryOwner.trim() ? diaryOwner.trim() : undefined,
      },
      createdAt: record?.id === id ? record.createdAt : Date.now(),
      updatedAt: Date.now(),
      autoSaved,
    });

    const autoSave = async (content: string, title: string, volume?: number) => {
      const id = generateSummaryId();
      const item = buildItem(content, title, true, id, volume);
      await saveSummary(item);
      await pruneAutoSavedSummaries();
      setCurrentSummaryId(id);
      setSavedPermanent(false);
      setVolumeOverride(null);
      onSaved(item);
    };

    const handleGenerate = async () => {
      const config = loadAPIConfig();
      if (!config.apiKey) {
        toast({ title: '请先配置 API Key', description: '前往「AI 配置」页配置后回来生成', variant: 'destructive' });
        return;
      }
      const { messages, warnings } = buildSummaryMessages(buildEngineInput());
      if (messages.length === 0) {
        toast({ title: '没有可总结的内容', variant: 'destructive' });
        return;
      }
      warnings.forEach((w) => toast({ title: '提示', description: w }));

      const vol = kind === 'volume' ? effectiveVolume : undefined;
      setResultVolume(vol ?? null);
      setPreview(false);
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

    // 手动保存 → 永久。卷号沿用盖章值（无盖章才现算）
    const handleSave = async () => {
      if (!resultContent) return;
      const id = currentSummaryId ?? generateSummaryId();
      const item = buildItem(resultContent, resultTitle || SUMMARY_KIND_LABELS[kind], false, id, resultVolume ?? effectiveVolume);
      await saveSummary(item);
      setCurrentSummaryId(id);
      setSavedPermanent(true);
      setVolumeOverride(null);
      reloadVolumes();
      onSaved(item);
      toast({ title: '已永久保存', description: resultTitle || SUMMARY_KIND_LABELS[kind] });
    };

    const handleContentEdit = (c: string) => {
      setResultContent(c);
      if (savedPermanent) setSavedPermanent(false);
    };

    // 右栏「重新生成」：按记录 genParams 回填挂载，转为生成新条目
    useImperativeHandle(ref, () => ({
      startManual() {
        setResultTitle('');
        setResultContent('');
        setCurrentSummaryId(null);
        setSavedPermanent(false);
        setResultVolume(null);
        setPreview(false);
        setManualDraft(true);
        scrollEditorIntoView();
      },
      regenerate() {
        const gp = record?.genParams;
        if (gp) {
          setAttach({
            presetId: gp.presetId ?? null,
            worldbookId: gp.worldbookId ?? null,
            worldbookMode: gp.worldbookMode ?? 'constant',
            worldbookUids: gp.worldbookUids ?? [],
          });
          if (gp.templateSnapshot) setTemplateContent(gp.templateSnapshot);
          if (kind === 'diary') setDiaryOwner(gp.diaryOwner ?? '');
        }
        setCurrentSummaryId(null); // 生成为新条目
        if (kind === 'volume' && record?.volumeNumber != null) {
          setVolumeOverride(record.volumeNumber); // 重做该卷：沿用原卷号（可再改）
        }
        setSavedPermanent(false);
        setManualDraft(false);
        toast({ title: '已回填设置', description: '楼层/挂载/模板已按原条目填好，点「生成」即可重做' });
      },
      hasUnsavedDraft() {
        return hasUnsavedSummaryDraft({
          record,
          title: resultTitle,
          content: resultContent,
          streaming,
        });
      },
    }), [record, kind, resultTitle, resultContent, streaming, scrollEditorIntoView, toast]);

    const charName = session.character?.name;
    const branchName = branchId ? story.branches?.find((b) => b.id === branchId)?.name : null;

    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        {showApiStatus && <ApiStatusLine />}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 overflow-hidden">
          {/* 布局铁律：flex-wrap + 行内 flex-basis，禁视口断点（同原总结页） */}
          {/* 左：生成配置 */}
          <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1 scrollbar-thin">
            {configurationHeader}
            {(story.branches?.length ?? 0) > 0 && (
              <Card>
                <CardContent className="p-3 flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground shrink-0">来源脉络</Label>
                  <Select value={branchId ?? MAIN} onValueChange={switchBranch}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MAIN}>主线（{story.session.messages.length} 楼）</SelectItem>
                      {(story.branches ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}（{b.session.messages.length} 楼）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            <FloorRangePicker
              total={session.messages.length}
              start={floorStart}
              end={floorEnd}
              onChange={(s, e) => { setFloorStart(s); setFloorEnd(e); }}
              suggestedStart={kind === 'volume' ? suggestedStart : undefined}
              anchors={anchors}
            />

            <AttachPanel value={attach} onChange={setAttach} tokenEstimate={tokenEstimate} />

            {kind === 'volume' && (
              <PriorVolumesPanel
                volumes={priorVolumes}
                selectedIds={priorSelectedIds}
                onChange={setPriorSelectedIds}
              />
            )}

            <Card>
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
                      placeholder={charName || '角色名'}
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
                  onTemplatesChanged={() => reloadTemplates(templateId)}
                />
                <div className="flex items-center gap-2">
                  {kind === 'volume' && (
                    <div
                      className="flex items-center gap-1 shrink-0"
                      title="本次生成的卷号：默认 = 已有最大卷号 + 1，可直接改"
                    >
                      <Label htmlFor="volume-num" className="text-xs text-muted-foreground">第</Label>
                      <Input
                        id="volume-num"
                        type="number"
                        min={1}
                        value={effectiveVolume}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setVolumeOverride(Number.isFinite(n) && n >= 1 ? n : null);
                        }}
                        className="h-9 w-16 text-center"
                      />
                      <Label htmlFor="volume-num" className="text-xs text-muted-foreground">卷</Label>
                    </div>
                  )}
                  {!streaming ? (
                    <Button className="flex-1 gap-2" onClick={handleGenerate} disabled={floorCount === 0}>
                      <Sparkles className="w-4 h-4" />
                      {kind === 'volume' ? `生成第 ${effectiveVolume} 卷（${floorCount} 楼）` : `生成（${floorCount} 楼）`}
                    </Button>
                  ) : (
                    <Button variant="destructive" className="flex-1 gap-2" onClick={handleStop}>
                      <Square className="w-4 h-4" />停止生成
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </Button>
                  )}
                </div>
                {branchName && (
                  <p className="text-xs text-muted-foreground">读取分支「{branchName}」的楼层，保存的记录也标注该分支。</p>
                )}
              </CardContent>
            </Card>

            <BatchProcessor
              session={session}
              floorStart={floorStart}
              floorEnd={floorEnd}
              systemPrompt={batchSystemPrompt}
              buildFullMessages={buildSegmentMessages}
              onMergeToEditor={handleBatchMerge}
            />
          </div>

          {/* 右：结果（编辑 / MD 排版预览） */}
          <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto pr-1 scrollbar-thin" ref={editorRef}>
            {sidePanel}
            {!streaming && resultContent && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => setPreview((v) => !v)}>
                  {preview ? <Pencil className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                  {preview ? '回到编辑' : '排版预览'}
                </Button>
              </div>
            )}
            {preview && !streaming && resultContent ? (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h2 className="font-display text-xl font-semibold mb-3">{resultTitle || SUMMARY_KIND_LABELS[kind]}</h2>
                  {kind === 'diary' ? (
                    <DiaryView content={resultContent} charName={charName} />
                  ) : (
                    <MarkdownLite
                      text={resultContent}
                      className="rounded-lg border paper-bg px-5 sm:px-8 py-6 font-serif text-[15px] max-w-[75ch] mx-auto"
                    />
                  )}
                </CardContent>
              </Card>
            ) : (showEmptyEditor || streaming || resultContent || manualDraft) ? (
              <SummaryResultEditor
                kind={kind}
                title={resultTitle}
                onTitleChange={setResultTitle}
                content={resultContent}
                onContentChange={handleContentEdit}
                streaming={streaming}
                onSave={handleSave}
                savedPermanent={savedPermanent}
                charName={charName}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  }
);
