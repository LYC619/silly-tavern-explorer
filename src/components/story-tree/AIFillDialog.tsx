import { useState, useRef, useEffect } from 'react';
import { Sparkles, Square, Loader2, Check, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import {
  buildTreeFillMessages, parseTreeOps, applyTreeOps, floorsToText, describeOps,
  DEFAULT_TREE_FILL_PROMPT, type TreeOp,
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

/**
 * AI 从选定楼层生成事实节点：选楼层 → 生成 ops → 预览 → 确认 apply。
 * API 配置在「AI 配置」页统一维护（此处只显示状态）；提示词可查看/编辑（localStorage 记忆）。
 */
export function AIFillDialog({ open, onOpenChange, session, nodes, onApply }: AIFillDialogProps) {
  const { toast } = useToast();
  const [floorStart, setFloorStart] = useState(0);
  const [floorEnd, setFloorEnd] = useState(Math.max(0, session.messages.length - 1));
  const [instruction, setInstruction] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [rawOutput, setRawOutput] = useState('');
  const [ops, setOps] = useState<TreeOp[] | null>(null);

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
    setOps(null);
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
      setOps(parsed);
      if (parsed.length === 0) toast({ title: '未解析出有效操作', description: '可重试或调整楼层范围', variant: 'destructive' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') toast({ title: '已停止' });
      else toast({ title: '生成失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleConfirm = async () => {
    if (!ops || ops.length === 0) return;
    // 本批事实归到 `## <卷/楼层>` 小节下：条目正文按卷分段，切视图可见状态演变。
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
    const result = applyTreeOps(nodes, ops, { sectionLabel });
    onApply(result.nodes);
    toast({
      title: '已应用到故事树',
      description: `新增 ${result.inserted}·更新 ${result.updated}·归档 ${result.archived}${result.skipped ? `·跳过 ${result.skipped}` : ''}`,
    });
    onOpenChange(false);
    setOps(null);
    setRawOutput('');
  };

  const opLines = ops ? describeOps(ops) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI 从楼层生成事实节点</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <ApiStatusLine />

          <p className="text-xs text-muted-foreground">
            累加式生成：当前树的结构（含之前各卷生成的节点）会随请求一并发给 AI，AI 只输出增量更新——
            按第二卷楼层生成时无需重选第一卷。新事实会按卷/楼层归入节点正文的对应小节。
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

          {/* 预览 */}
          {(streaming || rawOutput) && (
            <div className="space-y-2">
              {ops ? (
                <>
                  <Label className="text-xs text-muted-foreground">将应用的操作（{ops.length}）</Label>
                  <ScrollArea className="h-40 border rounded-md p-2">
                    <div className="space-y-0.5 text-sm font-mono">
                      {opLines.map((line, i) => <div key={i}>{line}</div>)}
                      {ops.length === 0 && <p className="text-muted-foreground">无有效操作</p>}
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
          <Button className="gap-1" onClick={handleConfirm} disabled={!ops || ops.length === 0}>
            <Check className="w-4 h-4" />应用到故事树
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
