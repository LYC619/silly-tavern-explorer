import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { callOpenAI } from './useOpenAI';
import type { APIConfig } from './APIConfigCard';

interface ChapterSplitterTabProps {
  config: APIConfig;
}

const SYSTEM_PROMPT = `你是一个故事分析专家。用户会提供一段聊天记录或故事内容，请分析内容并建议如何分卷/分章节。

输出格式（JSON数组，每个元素包含）：
- floor: 建议的起始楼层号（从1开始的数字）
- title: 章节标题
- summary: 章节简要内容概述（一句话）

只输出JSON数组，不要其他解释文字。
示例：
[
  {"floor": 1, "title": "相遇", "summary": "主角与女主角的初次相遇"},
  {"floor": 15, "title": "误会", "summary": "一场误会导致两人关系紧张"}
]`;

export function ChapterSplitterTab({ config }: ChapterSplitterTabProps) {
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!input.trim()) {
      toast({ title: '请输入聊天内容', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const result = await callOpenAI(config, input, SYSTEM_PROMPT);
      setOutput(result);
    } catch (error) {
      toast({
        title: '生成失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: '已复制到剪贴板' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>智能分卷建议</CardTitle>
        <CardDescription>
          粘贴聊天内容，AI 会分析并建议如何分章节（结果为JSON格式，可用于批量导入）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>输入聊天内容</Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴聊天记录内容..."
            rows={8}
          />
        </div>
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? '分析中...' : '分析分卷'}
        </Button>
        {output && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>分卷建议</Label>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="p-4 bg-muted rounded-lg font-mono text-sm whitespace-pre-wrap max-h-64 overflow-auto">
              {output}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
