import { useState, useRef, useEffect } from 'react';
import { Sparkles, Square, Loader2, Check, Pencil, RotateCcw, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { loadAPIConfig } from '@/components/ai-tools';
import { ApiStatusLine } from '@/components/ai-tools/ApiStatusLine';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import { FloorRangePicker } from '@/components/summary/FloorRangePicker';
import { loadSessionPointer } from '@/lib/session-storage';
import { getAllSummaries } from '@/lib/summary-db';
import type { ChatSession } from '@/types/chat';
import type { StoryNode } from '@/types/story-tree';
import { NODE_TYPE_LABELS, isStoryNodeType } from '@/types/story-tree';
import {
  buildTreeFillMessages, parseTreeOps, applyTreeOps,
  DEFAULT_TREE_FILL_PROMPT, floorsToText, type TreeOp,
} from '@/lib/story-tree-ai';

const PROMPT_LS_KEY = 'st-story-tree-fill-prompt';

interface AIFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ChatSession;
  nodes: StoryNode[];
  /** 确认后回传应用了 ops 的新 nodes */
  onApply: (nodes: StoryNode[]) => void;
}

/** 单条待应用操作：included=是否应用；expanded=是否展开预览/编辑 */
interface OpItem {
  op: TreeOp;
  included: boolean;
  expanded: boolean;
}

const OP_BADGE: Record<TreeOp['op'], { text: string; cls: string }> = {
  insert: { text: '+ 新增', cls: 'text-emerald-600 dark:text-emerald-400' },
  update: { text: '~ 更新', cls: 'text-amber-600 dark:text-amber-400' },
  archive: { text: '⊘ 归档', cls: 'text-muted-foreground' },
};

/**
 * AI 从选定楼层生成事实节点：选楼层 → 生成 ops → 逐条预览/编辑/取舍 → 确认 apply。
 * API 配置在「AI 配置」页统一维护（此处只显示状态）；提示词可查看/编辑（localStorage 记忆）。
 */
export function AIFillDialog({ open, onOpenChange, session, nodes, onApply }: AIFillDialogProps) {
  const { toast } = useToast();
  const [floorStart, setFloorStart] = useState(0);
  const [floorEnd, setFloorEnd] = useState(Math.max(0, session.messages.length - 1));
  const [instruction, setInstruction] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [rawOutput, setRawOutput] = useState('');
  const [opItems, setOpItems] = useState<OpItem[] | null>(null);

  // 可编辑提示词（改后记忆；空=用默认）
  const [promptOpen, setPromptOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_TREE_FILL_PROMPT);

  useEffect(() => {
    const saved = localStorage.getItem(PROMPT_LS_KEY);
    if (saved) setCustomPrompt(saved);
  }, []);

  const handlePromptChange = (v: string) => {
    setCustomPrompt(v);
    localStorage.setItem(PROMPT_LS_KEY, v);
  };

  const handlePromptReset = () => {
    setCustomPrompt(DEFAULT_TREE_FILL_PROMPT);
    localStorage.removeItem(PROMPT_LS_KEY);
    toast({ title: '已恢复默认提示词' });
  };

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef('');

  const handleGenerate = async () => {
    const config = loadAPIConfig(); // 即时读取全局配置
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 配置」页配置后回来生成', variant: 'destructive' });
      return;
    }
    const floorText = floorsToText(session, floorStart, floorEnd);
    if (!floorText.trim()) {
      toast({ title: '选中的楼层没有内容', variant: 'destructive' });
      return;
    }
    const messages = buildTreeFillMessages(nodes, floorText, instruction, customPrompt);
    setStreaming(true);
    setRawOutput('');
    setOpItems(null);
    outputRef.current = '';
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await callOpenAIMessages(config, messages, {
        onChunk: (c) => { outputRef.current += c; setRawOutput(outputRef.current); },
        signal: controller.signal,
        params: { temperature: 0.2 }, // 求稳定结构化输出
      });
      const parsed = parseTreeOps(outputRef.current);
      setOpItems(parsed.map((op) => ({ op, included: true, expanded: false })));
      if (parsed.length === 0) toast({ title: '未解析出有效操作', description: '可重试或调整楼层范围', variant: 'destructive' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') toast({ title: '已停止' });
      else toast({ title: '生成失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const patchItem = (idx: number, patch: Partial<OpItem>) =>
    setOpItems((items) => items?.map((it, i) => (i === idx ? { ...it, ...patch } : it)) ?? null);
  const patchOp = (idx: number, patch: Partial<TreeOp>) =>
    setOpItems((items) => items?.map((it, i) => (i === idx ? { ...it, op: { ...it.op, ...patch } } : it)) ?? null);
  const removeItem = (idx: number) =>
    setOpItems((items) => items?.filter((_, i) => i !== idx) ?? null);

  const includedCount = opItems?.filter((it) => it.included).length ?? 0;

  const handleConfirm = async () => {
    const activeOps = opItems?.filter((it) => it.included).map((it) => it.op) ?? [];
    if (activeOps.length === 0) return;
    // 本批事实的卷/楼层标记（仅角色节点会按它分卷归档，见 applyTreeOps）。
    // 选中范围完整落在某个已存分卷内时用「第N卷」，否则用楼层区间。
    const lo = Math.min(floorStart, floorEnd);
    const hi = Math.max(floorStart, floorEnd);
    let sectionLabel = `楼层 ${lo}~${hi}`;
    try {
      const bid = loadSessionPointer()?.currentBookId ?? null;
      const vol = (await getAllSummaries()).find((s) =>
        s.kind === 'volume' && s.volumeNumber != null && s.bookId === bid
        && lo >= s.floorStart && hi <= s.floorEnd
      );
      if (vol) sectionLabel = `第${vol.volumeNumber}卷 · 楼层 ${lo}~${hi}`;
    } catch { /* 查不到分卷就用楼层区间 */ }
    const result = applyTreeOps(nodes, activeOps, { sectionLabel });
    onApply(result.nodes);
    toast({
      title: '已应用到故事树',
      description: `新增 ${result.inserted}·更新 ${result.updated}·归档 ${result.archived}${result.skipped ? `·跳过 ${result.skipped}` : ''}`,
    });
    onOpenChange(false);
    setOpItems(null);
    setRawOutput('');
  };

  /** 行首摘要：op 徽章 + 目标路径 */
  const opTarget = (op: TreeOp) =>
    op.op === 'insert' ? `${op.parent ? `${op.parent}/` : ''}${op.title ?? '?'}` : (op.path ?? '?');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 宽度加行内样式兜底：个别环境下 !max-w 类规则不生效（见 v0.16.1 世界书弹窗同款教训） */}
      <DialogContent className="!max-w-[min(64rem,94vw)] max-h-[88vh] overflow-y-auto" style={{ maxWidth: 'min(64rem, 94vw)' }}>
        <DialogHeader>
          <DialogTitle>AI 从楼层生成事实节点</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <ApiStatusLine />

          <p className="text-xs text-muted-foreground">
            累加式生成：当前树的结构（含之前各卷生成的节点）会随请求一并发给 AI，AI 只输出增量更新——
            按第二卷楼层生成时无需重选第一卷。角色的新事实会按卷归档进该角色名下；事件按发生顺序独立成节点。
          </p>

          <FloorRangePicker
            total={session.messages.length}
            start={floorStart}
            end={floorEnd}
            onChange={(s, e) => { setFloorStart(s); setFloorEnd(e); }}
          />

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">额外要求（可选）</Label>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="例如：只关注角色关系变化；或：重点整理地点设定"
              className="min-h-[60px] text-sm"
            />
          </div>

          {/* 提示词查看/编辑 */}
          <div className="space-y-1">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setPromptOpen((o) => !o)}
            >
              <Pencil className="w-3 h-3" />
              {promptOpen ? '收起提示词' : '查看/编辑提示词'}
            </button>
            {promptOpen && (
              <div className="space-y-1.5">
                <Textarea
                  value={customPrompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  className="min-h-[30vh] font-mono text-xs"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    修改会自动记住。注意保留 JSON ops 输出格式约定，否则无法解析。
                  </p>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={handlePromptReset}>
                    <RotateCcw className="w-3 h-3" />恢复默认
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!streaming ? (
              <Button className="gap-2" onClick={handleGenerate}>
                <Sparkles className="w-4 h-4" />生成
              </Button>
            ) : (
              <Button variant="destructive" className="gap-2" onClick={() => abortRef.current?.abort()}>
                <Square className="w-4 h-4" />停止
              </Button>
            )}
            {streaming && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>

          {/* 预览：每条操作可展开查看/编辑内容、勾选取舍、删除 */}
          {(streaming || rawOutput) && (
            <div className="space-y-2">
              {opItems ? (
                <>
                  <Label className="text-xs text-muted-foreground">
                    将应用的操作（{includedCount} / {opItems.length}）—— 点行展开预览与编辑
                  </Label>
                  <ScrollArea className="h-[48vh] border rounded-md">
                    <div className="p-1.5 space-y-1">
                      {opItems.map((item, i) => {
                        const badge = OP_BADGE[item.op.op] ?? OP_BADGE.archive;
                        const typeLabel = isStoryNodeType(item.op.type) ? NODE_TYPE_LABELS[item.op.type] : null;
                        return (
                          <div
                            key={i}
                            className={`rounded border ${item.included ? 'border-border' : 'border-border/50 opacity-50'}`}
                          >
                            <div className="flex items-center gap-1.5 px-1.5 py-1">
                              <Checkbox
                                checked={item.included}
                                onCheckedChange={(v) => patchItem(i, { included: v === true })}
                                aria-label="是否应用此操作"
                                className="shrink-0"
                              />
                              <button
                                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                                onClick={() => patchItem(i, { expanded: !item.expanded })}
                              >
                                {item.expanded
                                  ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                  : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                                <span className={`text-xs font-mono shrink-0 ${badge.cls}`}>{badge.text}</span>
                                <span className="text-sm truncate">{opTarget(item.op)}</span>
                                {typeLabel && (
                                  <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground shrink-0">{typeLabel}</span>
                                )}
                                {!item.expanded && item.op.content && (
                                  <span className="text-xs text-muted-foreground truncate">
                                    {item.op.content.slice(0, 60)}
                                  </span>
                                )}
                              </button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => removeItem(i)}
                                title="删除此操作"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            {item.expanded && (
                              <div className="px-2 pb-2 pl-8 space-y-1.5">
                                {item.op.op === 'insert' && (
                                  <div className="flex items-center gap-1.5">
                                    <Label className="text-[10px] text-muted-foreground shrink-0">标题</Label>
                                    <Input
                                      value={item.op.title ?? ''}
                                      onChange={(e) => patchOp(i, { title: e.target.value })}
                                      className="h-7 text-sm"
                                    />
                                  </div>
                                )}
                                {item.op.op !== 'archive' && (
                                  <div className="space-y-0.5">
                                    <Label className="text-[10px] text-muted-foreground">
                                      {item.op.op === 'insert' ? '正文' : '追加内容'}
                                    </Label>
                                    <Textarea
                                      value={item.op.content ?? ''}
                                      onChange={(e) => patchOp(i, { content: e.target.value })}
                                      className="min-h-[110px] text-sm"
                                    />
                                  </div>
                                )}
                                {(item.op.hint || item.op.keywords) && (
                                  <p className="text-[10px] text-muted-foreground">
                                    {item.op.hint ? `提示：${item.op.hint}` : ''}
                                    {item.op.hint && item.op.keywords ? ' · ' : ''}
                                    {item.op.keywords
                                      ? `标签：${Array.isArray(item.op.keywords) ? item.op.keywords.join(', ') : item.op.keywords}`
                                      : ''}
                                  </p>
                                )}
                                {item.op.op === 'archive' && (
                                  <p className="text-xs text-muted-foreground">将把「{item.op.path}」标记为已归档（可在树中恢复）。</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {opItems.length === 0 && <p className="text-sm text-muted-foreground p-2">无有效操作</p>}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <ScrollArea className="h-32 border rounded-md p-2">
                  <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{rawOutput}</pre>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="gap-1" onClick={handleConfirm} disabled={includedCount === 0}>
            <Check className="w-4 h-4" />应用到故事树（{includedCount}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
