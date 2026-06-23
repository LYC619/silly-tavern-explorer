import { useState, useRef } from 'react';
import { Wand2, Loader2, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { callOpenAI, loadAPIConfig } from '@/components/ai-tools';

const SYSTEM_PROMPT = `你是一个 SillyTavern 世界书条目润色助手。用户会给你一条世界书条目的当前内容，以及修改要求。
请按要求改写这条内容，直接输出改写后的【完整正文】，不要任何解释、不要代码块包裹、不要前后缀说明。
保持世界书条目应有的设定描述风格；若用户没有特别要求格式，保留原有的结构与分段。`;

const QUICK_PRESETS = [
  '优化措辞，使表达更自然流畅',
  '精简内容，去掉冗余，保留要点',
  '扩写得更详细具体',
  '改写为更正式的书面语',
];

interface Props {
  content: string;
  onResult: (text: string) => void;
  /** 触发按钮样式，紧凑用于工具行 */
  compact?: boolean;
}

/** 单条世界书条目的 AI 改写：输入要求 → 喂当前内容+要求 → 直接替换内容 */
export function AIRewriteContent({ content, onResult, compact }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    const config = loadAPIConfig();
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '到「AI 工具」页填入 API Key 后再用', variant: 'destructive' });
      return;
    }
    if (!content.trim()) {
      toast({ title: '当前条目内容为空', description: '没有可改写的内容', variant: 'destructive' });
      return;
    }
    if (!instruction.trim()) {
      toast({ title: '请填写改写要求', variant: 'destructive' });
      return;
    }
    const userContent = `【当前内容】：\n${content}\n\n【修改要求】：\n${instruction.trim()}`;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    let acc = '';
    try {
      await callOpenAI(config, userContent, SYSTEM_PROMPT, (chunk) => { acc += chunk; }, controller.signal);
      const result = acc.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      if (result) {
        onResult(result);
        toast({ title: 'AI 已改写', description: '可在内容框继续编辑或 Ctrl+Z 撤销' });
        setOpen(false);
        setInstruction('');
      } else {
        toast({ title: 'AI 未返回内容', description: '请调整要求后重试', variant: 'destructive' });
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') toast({ title: '已停止' });
      else toast({ title: '改写失败', description: e instanceof Error ? e.message : '请检查 API 配置', variant: 'destructive' });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (!loading) setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={compact ? 'h-6 px-2 text-xs text-muted-foreground hover:text-foreground' : 'h-7 px-2 text-xs'}
          title="用 AI 改写本条内容"
        >
          <Wand2 className="w-3.5 h-3.5 mr-1" /> AI 改写
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <p className="text-xs font-medium">AI 改写本条内容</p>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="填写改写要求，如：优化措辞 / 精简 / 扩写 / 改成第三人称…"
            className="text-xs min-h-[60px]"
          />
          <div className="flex flex-wrap gap-1">
            {QUICK_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInstruction(p)}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent"
              >
                {p.slice(0, 6)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!loading ? (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={run}>
                <Wand2 className="w-3.5 h-3.5" /> 改写并替换
              </Button>
            ) : (
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => abortRef.current?.abort()}>
                <StopCircle className="w-3.5 h-3.5" /> 停止
              </Button>
            )}
            {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-[10px] text-muted-foreground">改写后直接替换内容，可用 Ctrl+Z 撤销</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
