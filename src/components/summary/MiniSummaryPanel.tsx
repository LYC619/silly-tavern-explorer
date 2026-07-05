import { useState, useEffect, useMemo } from 'react';
import { Copy, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { ChatSession } from '@/types/chat';
import { extractMiniSummaries, miniSummariesToText } from '@/lib/mini-summary';
import { downloadMarkdown } from '@/lib/obsidian-export';

const LS_KEY = 'st-mini-summary-regex';
const DEFAULT_REGEX = '/<summary>([\\s\\S]*?)<\\/summary>/g';

interface MiniSummaryPanelProps {
  session: ChatSession;
}

/**
 * 小总结子模块：用正则从聊天里提取每楼 AI 自带的小结，与前一条用户消息配对展示。
 * 纯正则提取，不调 AI；只读原始聊天不改动。
 */
export function MiniSummaryPanel({ session }: MiniSummaryPanelProps) {
  const { toast } = useToast();
  const [regex, setRegex] = useState(DEFAULT_REGEX);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setRegex(saved);
  }, []);

  const pairs = useMemo(() => {
    if (!regex.trim()) return [];
    return extractMiniSummaries(session, regex);
  }, [session, regex]);

  const handleRegexChange = (v: string) => {
    setRegex(v);
    localStorage.setItem(LS_KEY, v);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(miniSummariesToText(pairs));
    toast({ title: '已复制配对文本' });
  };

  const handleExport = () => {
    downloadMarkdown(`${session.title} 小结`, miniSummariesToText(pairs));
    toast({ title: '已导出小结' });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">提取正则（匹配 AI 消息里的小结；建议用捕获组框住小结内容）</Label>
              <Input
                value={regex}
                onChange={(e) => handleRegexChange(e.target.value)}
                className="h-8 font-mono text-xs"
                placeholder={DEFAULT_REGEX}
              />
              <p className="text-xs text-muted-foreground">
                例：{'/<summary>([\\s\\S]*?)<\\/summary>/g'} —— 提取 {'<summary>…</summary>'} 里的内容。第一个捕获组即小结正文。
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="font-normal">找到 {pairs.length} 条小结</Badge>
              {pairs.length > 0 && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={handleCopy}>
                    <Copy className="w-3.5 h-3.5" />复制
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={handleExport}>
                    <Download className="w-3.5 h-3.5" />导出
                  </Button>
                </div>
              )}
            </div>

            {pairs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                没匹配到小结。检查正则是否符合你聊天里的小结标记格式。
              </p>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto">
                <div className="space-y-2 pr-2">
                  {pairs.map((p) => (
                    <div key={p.floor} className="rounded-md border overflow-hidden text-sm">
                      {p.userText.trim() && (
                        <div className="px-3 py-2 bg-muted/40 text-muted-foreground">
                          <span className="text-[10px] uppercase tracking-wide">用户 · 第{p.floor - 1}楼附近</span>
                          <p className="mt-0.5 line-clamp-2">{p.userText.trim()}</p>
                        </div>
                      )}
                      <div className="px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wide text-primary">小结 · 第{p.floor}楼</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{p.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
      </CardContent>
    </Card>
  );
}
