import { useState, useRef } from 'react';
import { Layers, Play, Loader2, Merge, ChevronDown, Copy, Check, Square, FileInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { loadAPIConfig } from '@/components/ai-tools';
import { callOpenAIMessages, type ChatCompletionMessage } from '@/components/ai-tools/useOpenAI';
import type { ChatSession, ChatMessage } from '@/types/chat';

interface BatchProcessorProps {
  session: ChatSession;
  /** 0-based 闭区间，与总结页楼层范围共用 */
  floorStart: number;
  floorEnd: number;
  /** 轻量直调时的系统提示词 = 当前模板正文（宏已替换） */
  systemPrompt: string;
  /** 挂载模式：由父组件用完整引擎为某段楼层组装 messages（预设/世界书与左栏一致） */
  buildFullMessages?: (start: number, end: number) => ChatCompletionMessage[] | null;
  /** 把合并结果送入右栏结果编辑器（走既有编辑/保存/导出流） */
  onMergeToEditor?: (text: string) => void;
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface SegmentResult {
  index: number;
  total: number;
  content: string;
  done: boolean;
}

/** 批量分段生成：把所选楼层范围按每段 N 楼拆开并行调用，适合超长范围的分段总结。 */
export function BatchProcessor({ session, floorStart, floorEnd, systemPrompt, buildFullMessages, onMergeToEditor }: BatchProcessorProps) {
  const { toast } = useToast();
  const [segmentSize, setSegmentSize] = useState(10);
  const [concurrency, setConcurrency] = useState(3);
  const [attachContext, setAttachContext] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<SegmentResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [merged, setMerged] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(false);

  const lo = Math.max(0, Math.min(floorStart, floorEnd));
  const hi = Math.min(session.messages.length - 1, Math.max(floorStart, floorEnd));
  const floorCount = Math.max(0, hi - lo + 1);

  const speakerName = (m: ChatMessage) => {
    const isUser = m.role === 'user' || m.is_user === true;
    return isUser
      ? (session.user?.name || m.name || 'User')
      : (session.character?.name || m.name || 'Character');
  };

  // 直接按消息数组切段（楼号用真实楼层号，与聊天处理页一致）
  const buildSegments = (size: number): Segment[] => {
    const segs: Segment[] = [];
    for (let i = lo; i <= hi; i += size) {
      const end = Math.min(i + size - 1, hi);
      const chunk = session.messages.slice(i, end + 1);
      const text = chunk
        .map((m, j) => `[#${i + j + 1} ${speakerName(m)}]\n${m.content}`)
        .join('\n\n');
      if (text.trim()) segs.push({ start: i, end, text });
    }
    return segs;
  };

  const handleStart = async () => {
    const config = loadAPIConfig(); // 生成时即时读取（配置在「AI 配置」页维护）
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 配置」页配置后回来生成', variant: 'destructive' });
      return;
    }
    if (floorCount === 0) {
      toast({ title: '请先选择楼层范围', variant: 'destructive' });
      return;
    }
    if (!systemPrompt.trim()) {
      toast({ title: '请先选择或编辑提示词模板', variant: 'destructive' });
      return;
    }

    const segments = buildSegments(segmentSize);
    if (segments.length === 0) return;

    setProcessing(true);
    setResults([]);
    setMerged('');
    setProgress(0);
    abortRef.current = false;

    const resultArr: SegmentResult[] = segments.map((_, i) => ({
      index: i,
      total: segments.length,
      content: '',
      done: false,
    }));
    setResults([...resultArr]);

    let completed = 0;
    const queue = [...segments.map((seg, i) => ({ seg, i }))];
    const workers: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0 && !abortRef.current) {
        const item = queue.shift();
        if (!item) break;
        const { seg, i } = item;
        try {
          // 挂载模式：该段用完整引擎组装（预设/世界书与左栏一致）；组装失败回落轻量直调
          const fullMessages = attachContext && buildFullMessages ? buildFullMessages(seg.start, seg.end) : null;
          const messages: ChatCompletionMessage[] = fullMessages ?? [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: seg.text },
          ];
          const result = await callOpenAIMessages(config, messages);
          resultArr[i] = { ...resultArr[i], content: result, done: true };
        } catch (e) {
          resultArr[i] = {
            ...resultArr[i],
            content: `❌ 第 ${i + 1} 段处理失败: ${e instanceof Error ? e.message : '未知错误'}`,
            done: true,
          };
        }
        completed++;
        setProgress(Math.round((completed / segments.length) * 100));
        setResults([...resultArr]);
      }
    };

    for (let i = 0; i < Math.min(concurrency, segments.length); i++) {
      workers.push(runNext());
    }

    await Promise.all(workers);
    setProcessing(false);
    if (abortRef.current) {
      toast({ title: `已取消，已完成 ${completed}/${segments.length} 段` });
    } else {
      toast({ title: `批量生成完成，共 ${segments.length} 段` });
    }
  };

  const handleMerge = () => {
    const text = results
      .filter(r => r.done)
      .map(r => r.content)
      .join('\n\n---\n\n');
    setMerged(text);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: '已复制到剪贴板' });
  };

  const allDone = results.length > 0 && results.every(r => r.done);

  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />
              批量分段生成
              <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              楼层很多时，把上方所选范围按每段 N 楼拆开并行生成。默认<strong>轻量直调</strong>：每段只发送「当前提示词模板 + 该段楼层文本」；勾选「挂载左栏设定」后每段按完整引擎组装（预设/世界书与左栏一致；前情分卷与卷号不参与，避免逐段重复）。
            </p>

            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">每段楼数</Label>
                <Input
                  type="number"
                  min={5}
                  max={50}
                  value={segmentSize}
                  onChange={(e) => setSegmentSize(Math.max(5, Math.min(50, parseInt(e.target.value) || 10)))}
                  className="w-24 h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">并发数</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
                  className="w-24 h-8"
                />
              </div>
              <div className="flex items-center gap-2 h-8">
                <Checkbox
                  id="batch-attach"
                  checked={attachContext}
                  onCheckedChange={(v) => setAttachContext(v === true)}
                />
                <Label htmlFor="batch-attach" className="text-xs cursor-pointer">
                  挂载左栏设定（预设/世界书）
                </Label>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleStart} disabled={processing || floorCount === 0}>
                {processing ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" />生成中...</>
                ) : (
                  <><Play className="w-4 h-4 mr-1" />开始批量生成</>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                {floorCount} 楼，约 {Math.ceil(floorCount / segmentSize)} 段
              </span>
            </div>

            {processing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>处理进度</span>
                  <div className="flex items-center gap-2">
                    <span>{progress}%</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => { abortRef.current = true; }}
                    >
                      <Square className="w-3 h-3 mr-1" />
                      取消
                    </Button>
                  </div>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-3">
                <Label>分段结果</Label>
                <div className="space-y-2 max-h-80 overflow-auto">
                  {results.map((r) => (
                    <div key={r.index} className="border rounded-md p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-xs">
                          第 {r.index + 1}/{r.total} 段 {r.done ? '✓' : '⏳'}
                        </span>
                        {r.done && r.content && (
                          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => handleCopy(r.content)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      {r.done ? (
                        <div className="text-muted-foreground whitespace-pre-wrap text-xs max-h-32 overflow-auto">
                          {r.content.slice(0, 500)}{r.content.length > 500 ? '...' : ''}
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-xs">处理中...</div>
                      )}
                    </div>
                  ))}
                </div>

                {allDone && !merged && (
                  <Button variant="outline" onClick={handleMerge}>
                    <Merge className="w-4 h-4 mr-1" />
                    合并全部结果
                  </Button>
                )}

                {merged && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>合并结果</Label>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleCopy(merged)}>
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        {onMergeToEditor && (
                          <Button size="sm" className="gap-1" onClick={() => onMergeToEditor(merged)}>
                            <FileInput className="w-3.5 h-3.5" />送入结果编辑器
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap max-h-96 overflow-auto">
                      {merged}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
