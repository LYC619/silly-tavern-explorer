/**
 * 角色卡主页 · 评分面板（2.0 阶段6，定稿第四章·评分）。
 * 10 分制总分，三种打分方式：直接手动 / 模板（多维度+权重，算参考总分）/ AI 评分。
 * 内置模板不可改可复制；AI 读取范围每次由用户勾选（卡 / +世界书 / +指定故事）；
 * AI 只给建议和理由，用户确认后才保存；保存所用模板、提示词快照和时间。
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Star, Sparkles, Loader2, Square, Copy, Trash2, Settings2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { loadAPIConfig } from '@/components/ai-tools';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import {
  buildRatingMessages, parseRatingResponse, computeWeightedTotal, describeReadScope,
} from '@/lib/character-ai';
import { listRatingTemplates, copyRatingTemplate, BUILTIN_RATING_TEMPLATE } from '@/lib/rating-templates';
import { saveRatingTemplate, deleteRatingTemplate } from '@/lib/rating-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import type { WorldBookItem } from '@/types/worldbook';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import type { NormalizedCharacterCard } from '@/lib/png-parser';
import type { RatingTemplateItem, RatingDimensionScore, RatingRecord } from '@/types/rating';

interface RatingPanelProps {
  character: ArchiveCharacter;
  norm: NormalizedCharacterCard;
  stories: ArchiveStory[];
  onPatch: (patch: Partial<ArchiveCharacter>) => void;
}

const clampHalf = (n: number) => Math.min(10, Math.max(0, Math.round(n * 2) / 2));

/** 单维度打分行（模板/AI 两个 tab 共用） */
function DimensionRow({
  dim, onScoreChange, onReasonChange,
}: {
  dim: RatingDimensionScore;
  onScoreChange: (v: number) => void;
  onReasonChange?: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-border p-2 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">{dim.name}</span>
        <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground font-normal">权重 {dim.weight}</Badge>
        <Input
          type="number" min={0} max={10} step={0.5}
          value={dim.score}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onScoreChange(Number.isFinite(n) ? clampHalf(n) : 0);
          }}
          className="h-7 w-20 ml-auto text-center"
        />
        <span className="text-xs text-muted-foreground">/ 10</span>
      </div>
      {onReasonChange ? (
        <Textarea
          value={dim.reason ?? ''}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="打分理由（可空）"
          className="min-h-8 h-8 text-xs resize-y"
        />
      ) : dim.reason ? (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{dim.reason}</p>
      ) : null}
    </div>
  );
}

export function RatingPanel({ character, norm, stories, onPatch }: RatingPanelProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('direct');

  // ---- 模板列表 ----
  const [templates, setTemplates] = useState<RatingTemplateItem[]>([BUILTIN_RATING_TEMPLATE]);
  const [templateId, setTemplateId] = useState(BUILTIN_RATING_TEMPLATE.id);
  const reloadTemplates = useCallback(async (keepId?: string) => {
    const list = await listRatingTemplates();
    setTemplates(list);
    if (keepId && !list.some((t) => t.id === keepId)) setTemplateId(BUILTIN_RATING_TEMPLATE.id);
  }, []);
  useEffect(() => { if (open) reloadTemplates(templateId); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const template = templates.find((t) => t.id === templateId) ?? BUILTIN_RATING_TEMPLATE;

  // ---- 直接打分 ----
  const [directScore, setDirectScore] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setDirectScore(character.rating?.toString() ?? '');
    setNote(character.ratingNote ?? '');
  }, [open, character.rating, character.ratingNote]);

  const saveRating = (record: RatingRecord) => {
    onPatch({ rating: record.total, ratingNote: record.note, ratingDetail: record });
    setOpen(false);
    toast({ title: `评分已保存：${record.total} / 10` });
  };

  const handleSaveDirect = () => {
    const v = parseFloat(directScore);
    if (Number.isNaN(v) || v < 0 || v > 10) {
      toast({ title: '评分需在 0~10 之间', variant: 'destructive' });
      return;
    }
    saveRating({ total: clampHalf(v), note: note.trim() || undefined, method: 'manual', createdAt: Date.now() });
  };

  // ---- 模板打分 ----
  const [tplDims, setTplDims] = useState<RatingDimensionScore[]>([]);
  useEffect(() => {
    // 换模板/打开时初始化维度分（沿用已保存的同模板明细）
    const saved = character.ratingDetail;
    if (saved?.templateId === template.id && saved.dimensions?.length) {
      setTplDims(saved.dimensions.map((d) => ({ ...d })));
    } else {
      setTplDims(template.dimensions.map((d) => ({ name: d.name, weight: d.weight, score: 5, reason: '' })));
    }
  }, [template, open, character.ratingDetail]);
  const tplTotal = useMemo(() => computeWeightedTotal(tplDims), [tplDims]);

  const handleSaveTemplate = () => {
    saveRating({
      total: tplTotal,
      note: note.trim() || undefined,
      method: 'template',
      templateId: template.id,
      templateTitle: template.title,
      dimensions: tplDims.map((d) => ({ ...d, reason: d.reason?.trim() || undefined })),
      createdAt: Date.now(),
    });
  };

  // ---- AI 评分 ----
  const [linkedWbs, setLinkedWbs] = useState<WorldBookItem[]>([]);
  useEffect(() => {
    if (!open) return;
    const wbIds = (character.assets ?? []).filter((a) => a.kind === 'worldbook').map((a) => a.assetId);
    if (wbIds.length === 0) { setLinkedWbs([]); return; }
    getAllWorldBooks().then((all) => setLinkedWbs(all.filter((w) => wbIds.includes(w.id)))).catch(() => setLinkedWbs([]));
  }, [open, character.assets]);
  const [pickedWbIds, setPickedWbIds] = useState<string[]>([]);
  const [pickedStoryIds, setPickedStoryIds] = useState<string[]>([]);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiRaw, setAiRaw] = useState('');
  const [aiDims, setAiDims] = useState<RatingDimensionScore[] | null>(null);
  const [aiNote, setAiNote] = useState('');
  const [aiScope, setAiScope] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef('');
  const aiTotal = useMemo(() => (aiDims ? computeWeightedTotal(aiDims) : 0), [aiDims]);

  const handleAiGenerate = async () => {
    const config = loadAPIConfig();
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 配置」页配置后回来生成', variant: 'destructive' });
      return;
    }
    const { messages, readScope } = buildRatingMessages({
      template,
      norm,
      worldbooks: linkedWbs.filter((w) => pickedWbIds.includes(w.id)).map((w) => ({ id: w.id, title: w.title, wb: w.worldbook })),
      stories: stories.filter((s) => pickedStoryIds.includes(s.id)).map((s) => ({ id: s.id, title: s.title, session: s.session })),
    });
    setAiScope(readScope);
    setAiStreaming(true);
    setAiDims(null);
    setAiRaw('');
    outputRef.current = '';
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await callOpenAIMessages(config, messages, {
        onChunk: (chunk) => {
          outputRef.current += chunk;
          setAiRaw(outputRef.current);
        },
        signal: controller.signal,
      });
      const parsed = parseRatingResponse(outputRef.current, template);
      if (!parsed) {
        toast({ title: '解析 AI 回复失败', description: '未找到符合格式的 JSON，可重试或换模型', variant: 'destructive' });
      } else {
        setAiDims(parsed.dimensions);
        setAiNote(parsed.note ?? '');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast({ title: '已停止生成' });
      } else {
        toast({ title: '生成失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
      }
    } finally {
      setAiStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSaveAi = () => {
    if (!aiDims) return;
    saveRating({
      total: aiTotal,
      note: aiNote.trim() || undefined,
      method: 'ai',
      templateId: template.id,
      templateTitle: template.title,
      dimensions: aiDims.map((d) => ({ ...d, reason: d.reason?.trim() || undefined })),
      promptSnapshot: template.prompt,
      readScope: aiScope,
      model: loadAPIConfig().model,
      createdAt: Date.now(),
    });
  };

  // ---- 模板管理（复制/编辑/删除自定义） ----
  const [manageOpen, setManageOpen] = useState(false);
  const [editTpl, setEditTpl] = useState<RatingTemplateItem | null>(null);

  const handleCopyTemplate = async () => {
    const copy = copyRatingTemplate(template);
    await saveRatingTemplate(copy);
    await reloadTemplates();
    setTemplateId(copy.id);
    setEditTpl(copy);
    setManageOpen(true);
    toast({ title: '已复制为自定义模板', description: '维度、权重、提示词都可以改' });
  };

  const handleSaveTplEdit = async () => {
    if (!editTpl) return;
    if (editTpl.dimensions.length === 0) {
      toast({ title: '至少保留一个维度', variant: 'destructive' });
      return;
    }
    await saveRatingTemplate({ ...editTpl, updatedAt: Date.now() });
    await reloadTemplates();
    setManageOpen(false);
    toast({ title: '模板已保存' });
  };

  const handleDeleteTpl = async () => {
    if (!editTpl) return;
    await deleteRatingTemplate(editTpl.id);
    await reloadTemplates(editTpl.id === templateId ? undefined : templateId);
    if (editTpl.id === templateId) setTemplateId(BUILTIN_RATING_TEMPLATE.id);
    setManageOpen(false);
    toast({ title: '模板已删除' });
  };

  const templateSelector = (
    <div className="flex items-center gap-2 flex-wrap">
      <Label className="text-xs text-muted-foreground shrink-0">评分模板</Label>
      <Select value={templateId} onValueChange={setTemplateId}>
        <SelectTrigger className="h-8 text-sm flex-1 min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleCopyTemplate} title="内置模板不可改；复制一份自定义副本后可改维度/权重/提示词">
        <Copy className="w-3.5 h-3.5" />复制
      </Button>
      {!template.builtin && (
        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => { setEditTpl({ ...template, dimensions: template.dimensions.map((d) => ({ ...d })) }); setManageOpen(true); }}>
          <Settings2 className="w-3.5 h-3.5" />编辑
        </Button>
      )}
    </div>
  );

  const detail = character.ratingDetail;

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setOpen(true)}>
        <Star className={`w-4 h-4 ${character.rating !== undefined ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
        {character.rating !== undefined ? `${character.rating} / 10` : '未评分'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>评分「{character.name}」</DialogTitle>
            <DialogDescription>
              10 分制（0.5 步进），只存在 STE 本地档案，不写回 ST 卡文件。
              {detail && (
                <span className="block mt-1 text-xs">
                  当前评分：{detail.total} / 10 ·
                  {detail.method === 'manual' ? '手动' : detail.method === 'template' ? `模板「${detail.templateTitle}」` : `AI 建议（${detail.templateTitle}）`}
                  · {new Date(detail.createdAt).toLocaleDateString('zh-CN')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            {/* 防插件铁律：TabsList 用 flex */}
            <TabsList className="flex w-full">
              <TabsTrigger value="direct" className="flex-1">直接打分</TabsTrigger>
              <TabsTrigger value="template" className="flex-1">模板打分</TabsTrigger>
              <TabsTrigger value="ai" className="flex-1">AI 评分</TabsTrigger>
            </TabsList>

            {/* ===== 直接 ===== */}
            <TabsContent value="direct" className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm shrink-0">总分</Label>
                <Input
                  type="number" min={0} max={10} step={0.5}
                  value={directScore}
                  onChange={(e) => setDirectScore(e.target.value)}
                  className="h-9 w-24 text-center"
                />
                <span className="text-sm text-muted-foreground">/ 10</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">一句话总评（可空）</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：设定扎实，开场白惊艳" />
              </div>
              <div className="flex justify-end gap-2">
                {character.rating !== undefined && (
                  <Button variant="ghost" size="sm" onClick={() => { onPatch({ rating: undefined, ratingNote: undefined, ratingDetail: undefined }); setOpen(false); toast({ title: '评分已清除' }); }}>
                    清除评分
                  </Button>
                )}
                <Button size="sm" onClick={handleSaveDirect}>保存</Button>
              </div>
            </TabsContent>

            {/* ===== 模板 ===== */}
            <TabsContent value="template" className="space-y-3 pt-2">
              {templateSelector}
              <div className="space-y-2">
                {tplDims.map((d, i) => (
                  <DimensionRow
                    key={d.name}
                    dim={d}
                    onScoreChange={(v) => setTplDims((prev) => prev.map((x, j) => (j === i ? { ...x, score: v } : x)))}
                    onReasonChange={(v) => setTplDims((prev) => prev.map((x, j) => (j === i ? { ...x, reason: v } : x)))}
                  />
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">一句话总评（可空）</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：设定扎实，开场白惊艳" />
              </div>
              <div className="flex items-center justify-end gap-3">
                <span className="text-sm">
                  参考总分 <span className="font-display text-lg font-semibold text-primary">{tplTotal}</span> / 10
                </span>
                <Button size="sm" onClick={handleSaveTemplate}>保存评分</Button>
              </div>
            </TabsContent>

            {/* ===== AI ===== */}
            <TabsContent value="ai" className="space-y-3 pt-2">
              {templateSelector}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">AI 读取范围（每次生成前勾选，不默认读全部聊天）</Label>
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <Label className="flex items-center gap-1.5 text-muted-foreground">
                    <Checkbox checked disabled />角色卡
                  </Label>
                  {linkedWbs.map((w) => (
                    <Label key={w.id} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={pickedWbIds.includes(w.id)}
                        onCheckedChange={(c) => setPickedWbIds((prev) => (c ? [...prev, w.id] : prev.filter((x) => x !== w.id)))}
                      />
                      世界书「{w.title}」
                    </Label>
                  ))}
                  {stories.map((s) => (
                    <Label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={pickedStoryIds.includes(s.id)}
                        onCheckedChange={(c) => setPickedStoryIds((prev) => (c ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                      />
                      故事「{s.title}」<span className="text-[10px] text-muted-foreground">（抽样节选）</span>
                    </Label>
                  ))}
                </div>
              </div>

              {!aiStreaming ? (
                <Button size="sm" className="gap-1" onClick={handleAiGenerate}>
                  <Sparkles className="w-3.5 h-3.5" />{aiDims ? '重新生成建议' : '生成 AI 建议'}
                </Button>
              ) : (
                <Button size="sm" variant="destructive" className="gap-1" onClick={() => abortRef.current?.abort()}>
                  <Square className="w-3.5 h-3.5" />停止
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </Button>
              )}

              {aiStreaming && (
                <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {aiRaw || '等待模型返回…'}
                </div>
              )}

              {aiDims && !aiStreaming && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    AI 建议如下（读取：{describeReadScope(aiScope, new Map([...linkedWbs.map((w) => [w.id, w.title] as [string, string]), ...stories.map((s) => [s.id, s.title] as [string, string])]))}）。
                    分数可手工调整，确认保存后才生效。
                  </p>
                  {aiDims.map((d, i) => (
                    <DimensionRow
                      key={d.name}
                      dim={d}
                      onScoreChange={(v) => setAiDims((prev) => prev!.map((x, j) => (j === i ? { ...x, score: v } : x)))}
                      onReasonChange={(v) => setAiDims((prev) => prev!.map((x, j) => (j === i ? { ...x, reason: v } : x)))}
                    />
                  ))}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">一句话总评（AI 给出，可改）</Label>
                    <Input value={aiNote} onChange={(e) => setAiNote(e.target.value)} />
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-sm">
                      参考总分 <span className="font-display text-lg font-semibold text-primary">{aiTotal}</span> / 10
                    </span>
                    <Button size="sm" onClick={handleSaveAi}>确认保存为正式评分</Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ===== 自定义模板编辑 ===== */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑自定义评分模板</DialogTitle>
            <DialogDescription>维度、权重、提示词均可改；内置模板不受影响。</DialogDescription>
          </DialogHeader>
          {editTpl && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">模板名</Label>
                <Input value={editTpl.title} onChange={(e) => setEditTpl({ ...editTpl, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">维度与权重</Label>
                  <Button
                    variant="outline" size="sm" className="h-6 gap-1"
                    onClick={() => setEditTpl({ ...editTpl, dimensions: [...editTpl.dimensions, { name: `维度 ${editTpl.dimensions.length + 1}`, weight: 10 }] })}
                  >
                    <Plus className="w-3 h-3" />加维度
                  </Button>
                </div>
                {editTpl.dimensions.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <Input
                      value={d.name}
                      onChange={(e) => setEditTpl({ ...editTpl, dimensions: editTpl.dimensions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                      className="h-8 w-32"
                      placeholder="维度名"
                    />
                    <Input
                      type="number" min={0}
                      value={d.weight}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        setEditTpl({ ...editTpl, dimensions: editTpl.dimensions.map((x, j) => (j === i ? { ...x, weight: Number.isFinite(n) ? n : 0 } : x)) });
                      }}
                      className="h-8 w-20 text-center"
                      title="权重"
                    />
                    <Input
                      value={d.hint ?? ''}
                      onChange={(e) => setEditTpl({ ...editTpl, dimensions: editTpl.dimensions.map((x, j) => (j === i ? { ...x, hint: e.target.value } : x)) })}
                      className="h-8 flex-1 min-w-32"
                      placeholder="该维度看什么（进提示词）"
                    />
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setEditTpl({ ...editTpl, dimensions: editTpl.dimensions.filter((_, j) => j !== i) })}
                      aria-label="删除维度"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">AI 评分提示词（描述评分立场与口径；维度清单会自动附加）</Label>
                <Textarea
                  value={editTpl.prompt}
                  onChange={(e) => setEditTpl({ ...editTpl, prompt: e.target.value })}
                  className="min-h-32 text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-destructive mr-auto gap-1" onClick={handleDeleteTpl}>
              <Trash2 className="w-3.5 h-3.5" />删除模板
            </Button>
            <Button variant="outline" onClick={() => setManageOpen(false)}>取消</Button>
            <Button onClick={handleSaveTplEdit}>保存模板</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
