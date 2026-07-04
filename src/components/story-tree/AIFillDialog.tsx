import { useState, useRef } from 'react';
import { Sparkles, Square, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { APIConfigCard, loadAPIConfig, DEFAULT_API_URL, DEFAULT_MODEL, type APIConfig } from '@/components/ai-tools';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import { FloorRangePicker } from '@/components/summary/FloorRangePicker';
import type { ChatSession } from '@/types/chat';
import type { StoryNode } from '@/types/story-tree';
import {
  buildTreeFillMessages, parseTreeOps, applyTreeOps, floorsToText, describeOps, type TreeOp,
} from '@/lib/story-tree-ai';

interface AIFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ChatSession;
  nodes: StoryNode[];
  /** 确认后回传应用了 ops 的新 nodes */
  onApply: (nodes: StoryNode[]) => void;
}

/** AI 从选定楼层生成事实节点：选楼层 → 生成 ops → 预览 → 确认 apply */
export function AIFillDialog({ open, onOpenChange, session, nodes, onApply }: AIFillDialogProps) {
  const { toast } = useToast();
  const [config, setConfig] = useState<APIConfig>(() => loadAPIConfig());
  const [floorStart, setFloorStart] = useState(0);
  const [floorEnd, setFloorEnd] = useState(Math.max(0, session.messages.length - 1));
  const [instruction, setInstruction] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [rawOutput, setRawOutput] = useState('');
  const [ops, setOps] = useState<TreeOp[] | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef('');

  const handleGenerate = async () => {
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', variant: 'destructive' });
      return;
    }
    const floorText = floorsToText(session, floorStart, floorEnd);
    if (!floorText.trim()) {
      toast({ title: '选中的楼层没有内容', variant: 'destructive' });
      return;
    }
    const messages = buildTreeFillMessages(nodes, floorText, instruction);
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

  const handleConfirm = () => {
    if (!ops || ops.length === 0) return;
    const result = applyTreeOps(nodes, ops);
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
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI 从楼层生成事实节点</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <APIConfigCard
            savedConfig={config}
            onConfigSave={setConfig}
            onConfigClear={() => setConfig({ apiKey: '', apiUrl: DEFAULT_API_URL, model: DEFAULT_MODEL })}
          />

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
