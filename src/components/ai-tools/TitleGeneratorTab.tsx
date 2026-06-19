import { useState, useRef } from 'react';
import { Copy, Check, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { callOpenAI } from './useOpenAI';
import type { APIConfig } from './APIConfigCard';

interface TitleGeneratorTabProps {
  config: APIConfig;
}

const SYSTEM_PROMPT = `你是一个创意写作专家。用户会提供一段故事或聊天内容的摘要，请生成5个有吸引力的标题建议。

要求：
- 标题要有文学感，能引起读者兴趣
- 可以是诗意的、悬念的、或情感化的
- 每个标题占一行，前面加序号

只输出标题列表，不要其他解释文字。`;

export function TitleGeneratorTab({ config }: TitleGeneratorTabProps) {
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleGenerate = async () => {
    if (!input.trim()) {
      toast({ title: '请输入内容摘要', variant: 'destructive' });
      return;
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    try {
      const result = await callOpenAI(config, input, SYSTEM_PROMPT, controller.signal);
      setOutput(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast({ title: '已停止生成' });
      } else {
        toast({
          title: '生成失败',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'destructive',
        });
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
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
        <CardTitle>标题生成器</CardTitle>
        <CardDescription>
          输入故事/聊天的摘要，AI 会生成多个标题建议
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>内容摘要</Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="简要描述故事内容，例如：&#10;一个现代都市背景的爱情故事，讲述了程序员和设计师之间从相识到相恋的过程..."
            rows={4}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : '生成标题'}
          </Button>
          {loading && (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Square className="w-3 h-3 mr-1" />停止
            </Button>
          )}
        </div>
        {output && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>标题建议</Label>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap">
              {output}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
