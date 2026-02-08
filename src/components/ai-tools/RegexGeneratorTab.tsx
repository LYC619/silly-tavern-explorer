import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { callOpenAI } from './useOpenAI';
import type { APIConfig } from './APIConfigCard';

interface RegexGeneratorTabProps {
  config: APIConfig;
}

const SYSTEM_PROMPT = `你是一个正则表达式专家。用户会提供一些需要匹配或过滤的文本示例，请生成相应的正则表达式。
输出格式：
1. 首先给出正则表达式（使用 /pattern/flags 格式）
2. 然后简要解释这个正则表达式的作用
3. 如果有替换需求，给出替换字符串

请用中文回复。`;

export function RegexGeneratorTab({ config }: RegexGeneratorTabProps) {
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!input.trim()) {
      toast({ title: '请输入需要匹配的文本示例', variant: 'destructive' });
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
        <CardTitle>正则表达式生成器</CardTitle>
        <CardDescription>
          粘贴需要匹配/过滤的文本示例，AI 会生成相应的正则表达式
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>输入文本示例</Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴需要匹配的文本，例如：&#10;[思考中...]&#10;<thinking>这是思考内容</thinking>&#10;*状态栏信息*"
            rows={6}
          />
        </div>
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? '生成中...' : '生成正则'}
        </Button>
        {output && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>生成结果</Label>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="p-4 bg-muted rounded-lg font-mono text-sm whitespace-pre-wrap">
              {output}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
