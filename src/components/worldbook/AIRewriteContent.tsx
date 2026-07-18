import { useState, useRef, useMemo } from 'react';
import { Wand2, Loader2, StopCircle, Check, X } from 'lucide-react';
import { diffChars } from 'diff';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { callOpenAI, loadAPIConfig } from '@/components/ai-tools';

const WB_SYSTEM_PROMPT = `你是一个 SillyTavern 世界书条目润色助手。用户会给你一条世界书条目的当前内容，以及修改要求。
请按要求改写这条内容，直接输出改写后的【完整正文】，不要任何解释、不要代码块包裹、不要前后缀说明。
保持世界书条目应有的设定描述风格；若用户没有特别要求格式，保留原有的结构与分段。`;

const WB_PRESETS = [
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
  /** 改写用的 system prompt（默认世界书条目润色；预设等场景可传入自己的语境） */
  systemPrompt?: string;
  /** 快捷预设要求按钮（默认世界书那套） */
  quickPresets?: string[];
  /** 弹窗标题（默认"AI 改写本条内容"） */
  title?: string;
}

/** 通用 AI 改写：输入要求 → 喂当前内容+要求 → 左右对照确认后替换。世界书条目 / 预设块等均可复用 */
export function AIRewriteContent({ content, onResult, compact, systemPrompt, quickPresets, title }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  // AI 改写结果：先进对照弹窗由用户确认，不直接替换
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sysPrompt = systemPrompt ?? WB_SYSTEM_PROMPT;
  const presets = quickPresets ?? WB_PRESETS;
  const popTitle = title ?? 'AI 改写本条内容';

  // 对照高亮：字符级 diff，左侧标删除、右侧标新增（中文按字比对比按词准）
  const diffParts = useMemo(
    () => (pendingResult == null ? [] : diffChars(content, pendingResult)),
    [content, pendingResult]
  );

  const run = async () => {
    const config = loadAPIConfig();
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '到「AI 配置」页填入 API Key 后再用', variant: 'destructive' });
      return;
    }
    if (!content.trim()) {
      toast({ title: '当前内容为空', description: '没有可改写的内容', variant: 'destructive' });
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
      await callOpenAI(config, userContent, sysPrompt, (chunk) => { acc += chunk; }, controller.signal);
      const result = acc.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      if (result) {
        setPendingResult(result); // 进对照弹窗，由用户决定是否替换
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

  const handleApply = () => {
    if (pendingResult == null) return;
    onResult(pendingResult);
    toast({ title: '已替换内容', description: '可继续编辑或 Ctrl+Z 撤销' });
    setPendingResult(null);
    setOpen(false);
    setInstruction('');
  };

  return (
    <>
      <Popover open={open} onOpenChange={(o) => { if (!loading) setOpen(o); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={compact ? 'h-6 px-2 text-xs text-muted-foreground hover:text-foreground' : 'h-7 px-2 text-xs'}
            title="用 AI 改写当前内容"
          >
            <Wand2 className="w-3.5 h-3.5 mr-1" /> AI 改写
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-2">
            <p className="text-xs font-medium">{popTitle}</p>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="填写改写要求，如：优化措辞 / 精简 / 扩写 / 改成第三人称…"
              className="text-xs min-h-[60px]"
            />
            <div className="flex flex-wrap gap-1">
              {presets.map((p) => (
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
                  <Wand2 className="w-3.5 h-3.5" /> 生成改写
                </Button>
              ) : (
                <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => abortRef.current?.abort()}>
                  <StopCircle className="w-3.5 h-3.5" /> 停止
                </Button>
              )}
              {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-[10px] text-muted-foreground">生成后先左右对照确认，不会直接替换</p>
          </div>
        </PopoverContent>
      </Popover>

      {/* 对照确认弹窗：左=当前内容（标删除），右=AI 结果（标新增） */}
      <Dialog open={pendingResult != null} onOpenChange={(o) => { if (!o) setPendingResult(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>对照确认改写结果</DialogTitle>
            <DialogDescription>
              左侧为当前内容（红色为将被删除的部分），右侧为 AI 改写结果（绿色为新增部分）。确认无误再替换。
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 flex-1 min-h-0 flex-wrap">
            <div className="flex-1 basis-[240px] min-w-0 flex flex-col min-h-0">
              <p className="text-xs font-medium text-muted-foreground mb-1">当前内容</p>
              <div className="flex-1 min-h-0 max-h-[50vh] overflow-y-auto rounded-md border border-border bg-muted/30 p-2.5 text-xs whitespace-pre-wrap leading-relaxed">
                {diffParts.map((part, i) =>
                  part.added ? null : (
                    <span
                      key={i}
                      className={part.removed ? 'bg-destructive/15 text-destructive line-through decoration-destructive/60' : undefined}
                    >
                      {part.value}
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="flex-1 basis-[240px] min-w-0 flex flex-col min-h-0">
              <p className="text-xs font-medium text-muted-foreground mb-1">AI 改写结果</p>
              <div className="flex-1 min-h-0 max-h-[50vh] overflow-y-auto rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs whitespace-pre-wrap leading-relaxed">
                {diffParts.map((part, i) =>
                  part.removed ? null : (
                    <span
                      key={i}
                      className={part.added ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : undefined}
                    >
                      {part.value}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setPendingResult(null)}>
              <X className="w-3.5 h-3.5" /> 放弃（回到要求编辑）
            </Button>
            <Button size="sm" className="gap-1" onClick={handleApply}>
              <Check className="w-3.5 h-3.5" /> 应用替换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
