import { useState, useRef, useCallback } from 'react';
import { Layers, Play, Loader2, Merge, ChevronDown, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { callOpenAI } from './useOpenAI';
import type { APIConfig } from './APIConfigCard';

interface BatchProcessorProps {
  config: APIConfig;
  selectedContent: string;
  selectedCount: number;
  systemPrompt: string;
}

interface SegmentResult {
  index: number;
  total: number;
  content: string;
  done: boolean;
}

export function BatchProcessor({ config, selectedContent, selectedCount, systemPrompt }: BatchProcessorProps) {
  const { toast } = useToast();
  const [segmentSize, setSegmentSize] = useState(10);
  const [concurrency, setConcurrency] = useState(3);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<SegmentResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [merged, setMerged] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(false);

  const splitContent = useCallback((content: string, size: number): string[] => {
    // Split by message blocks (each starts with [#N ...])
    const msgBlocks = content.split(/(?=\[#\d+\s)/);
    const segments: string[] = [];
    for (let i = 0; i < msgBlocks.length; i += size) {
      segments.push(msgBlocks.slice(i, i + size).join('\n\n'));
    }
    return segments.filter(s => s.trim());
  }, []);

  const handleStart = async () => {
    if (!selectedContent.trim()) {
      toast({ title: '请先选择聊天楼层', variant: 'destructive' });
      return;
    }
    if (!systemPrompt.trim()) {
      toast({ title: '请先选择或输入提示词模板', variant: 'destructive' });
      return;
    }

    const segments = splitContent(selectedContent, segmentSize);
    if (segments.length === 0) return;

    setProcessing(true);
    setResults([]);
    setMerged('');
    setProgress(0);
    setTotalSegments(segments.length);
    abortRef.current = false;

    const resultArr: SegmentResult[] = segments.map((_, i) => ({
      index: i,
      total: segments.length,
      content: '',
      done: false,
    }));
    setResults([...resultArr]);

    let completed = 0;

    // Concurrent execution with limit
    const queue = [...segments.map((seg, i) => ({ seg, i }))];
    const workers: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0 && !abortRef.current) {
        const item = queue.shift();
        if (!item) break;
        const { seg, i } = item;
        try {
          const result = await callOpenAI(config, seg, systemPrompt);
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
    toast({ title: `批量处理完成，共 ${segments.length} 段` });
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
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />
              批量处理
              <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              将选中消息分段，并行调用 API 处理，适合大量内容的批量分析
            </p>

            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <Label className="text-xs">每段消息数</Label>
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
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleStart} disabled={processing || selectedCount === 0}>
                {processing ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" />处理中...</>
                ) : (
                  <><Play className="w-4 h-4 mr-1" />开始批量处理</>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedCount} 条消息，约 {Math.ceil(selectedCount / segmentSize)} 段
              </span>
            </div>

            {processing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>处理进度</span>
                  <span>{progress}%</span>
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
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(merged)}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
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
