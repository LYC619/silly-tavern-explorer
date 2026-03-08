import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, BookOpen, GitBranch, FileText, MessageSquare, Loader2, Import, RotateCcw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { callOpenAI } from './useOpenAI';
import type { APIConfig } from './APIConfigCard';

interface PromptTemplatesProps {
  config: APIConfig;
  selectedContent: string;
  selectedCount: number;
}

const DEFAULT_PROMPTS: Record<string, { system: string; label: string; icon: any; description: string; placeholder: string }> = {
  summarize: {
    system: `你是一个故事分析专家。用户会提供一段对话/角色扮演记录，请将其总结为结构化的剧情概要。

输出格式（使用 Markdown）：
## 场景
描述故事发生的场景和背景

## 主要人物
列出出场的主要人物及其特征

## 关键事件
按时间顺序列出关键事件，每个事件一行，使用编号列表

## 剧情走向
总结当前剧情的发展方向和未解决的悬念

请用中文回复。`,
    label: '总结剧情',
    icon: BookOpen,
    description: '将选中楼层内容总结为结构化的剧情概要',
    placeholder: '',
  },
  worldbook: {
    system: `你是一个世界观设定提取专家。用户会提供一段对话/角色扮演记录，请从中提取世界观设定信息，输出为世界书 JSON 格式。

输出要求：
- 只输出一个 JSON 对象，格式为 { "entries": { "0": {...}, "1": {...}, ... } }
- 每个条目包含以下字段：
  - key: 关键词数组（用于触发该条目的关键词）
  - keysecondary: 次要关键词数组（可为空）
  - content: 详细的设定描述文字
  - comment: 条目标题/简短标识
  - constant: false
  - vectorized: false
  - enabled: true
  - position: 4
  - order: 条目序号（从100开始递增）

提取以下类型的设定：
1. 角色特征（外貌、性格、能力、背景）
2. 地点/场景描述
3. 物品/道具设定
4. 世界规则/魔法体系
5. 组织/阵营信息
6. 重要事件/历史

只输出JSON，不要其他解释文字。`,
    label: '提取世界书',
    icon: FileText,
    description: '从选中内容提取世界观设定，输出为世界书 JSON 格式',
    placeholder: '',
  },
  parallel: {
    system: `你是一个创意写作专家。用户会提供一段对话/角色扮演记录，请基于当前剧情，生成一个"平行世界"的分支走向续写提纲。

要求：
1. 找到一个关键的决策点或转折点
2. 假设在那个节点上做出了不同的选择
3. 描述由此产生的不同剧情走向
4. 提供 3-5 个后续场景的大纲

输出格式（使用 Markdown）：
## 分歧点
描述在哪个事件节点产生了分歧

## 不同的选择
原剧情中的选择 vs 平行世界的选择

## 分支剧情大纲
按场景列出平行世界的剧情走向，每个场景包含标题和简述

## 可能的结局走向
描述这条分支可能导向的结局

请用中文回复。`,
    label: '平行世界',
    icon: GitBranch,
    description: '基于选中楼层的剧情，生成一个分支走向的续写提纲',
    placeholder: '',
  },
  custom: {
    system: '',
    label: '自定义提示词',
    icon: MessageSquare,
    description: '使用自定义 System Prompt 发送选中楼层内容',
    placeholder: '输入你的 System Prompt...',
  },
};

function getStoredPrompt(key: string): string | null {
  return localStorage.getItem(`ai-prompt-${key}`);
}

function setStoredPrompt(key: string, value: string) {
  localStorage.setItem(`ai-prompt-${key}`, value);
}

function removeStoredPrompt(key: string) {
  localStorage.removeItem(`ai-prompt-${key}`);
}

export function PromptTemplates({ config, selectedContent, selectedCount }: PromptTemplatesProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('summarize');
  const [customPrompt, setCustomPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  // Editable prompts state
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const outputRef = useRef('');

  // Load custom prompts from localStorage on mount
  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const key of ['summarize', 'worldbook', 'parallel']) {
      const stored = getStoredPrompt(key);
      if (stored !== null) loaded[key] = stored;
    }
    setEditedPrompts(loaded);
  }, []);

  const getActiveSystemPrompt = (key: string): string => {
    if (key === 'custom') return customPrompt;
    if (editedPrompts[key] !== undefined) return editedPrompts[key];
    return DEFAULT_PROMPTS[key].system;
  };

  const handleEditPrompt = (key: string, value: string) => {
    setEditedPrompts(prev => ({ ...prev, [key]: value }));
    setStoredPrompt(key, value);
  };

  const handleResetPrompt = (key: string) => {
    setEditedPrompts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    removeStoredPrompt(key);
    toast({ title: '已恢复默认提示词' });
  };

  const handleGenerate = async () => {
    if (!selectedContent.trim()) {
      toast({ title: '请先选择聊天楼层', variant: 'destructive' });
      return;
    }
    const systemPrompt = getActiveSystemPrompt(activeTab);
    if (!systemPrompt.trim()) {
      toast({ title: '请输入 System Prompt', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setOutput('');
    outputRef.current = '';
    try {
      await callOpenAI(config, selectedContent, systemPrompt, (chunk) => {
        outputRef.current += chunk;
        setOutput(outputRef.current);
      });
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

  const isWorldbookJson = (): boolean => {
    if (activeTab !== 'worldbook' || !output) return false;
    try {
      const jsonStr = output.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      const parsed = JSON.parse(jsonStr);
      return parsed && typeof parsed === 'object' && parsed.entries;
    } catch {
      return false;
    }
  };

  const handleImportToWorldbook = () => {
    try {
      const jsonStr = output.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      const parsed = JSON.parse(jsonStr);
      sessionStorage.setItem('ai-worldbook-import', JSON.stringify(parsed));
      navigate('/worldbook');
      toast({ title: '已跳转到世界书编辑器，正在导入...' });
    } catch {
      toast({ title: '解析 JSON 失败', variant: 'destructive' });
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setOutput(''); }} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        {Object.entries(DEFAULT_PROMPTS).map(([key, { label, icon: Icon }]) => (
          <TabsTrigger key={key} value={key} className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Icon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.slice(0, 2)}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {Object.entries(DEFAULT_PROMPTS).map(([key, template]) => (
        <TabsContent key={key} value={key}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{template.label}</CardTitle>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Editable prompt for preset templates */}
              {key !== 'custom' && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground gap-1">
                      <ChevronDown className="w-3 h-3" />
                      编辑提示词
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <Textarea
                      value={editedPrompts[key] !== undefined ? editedPrompts[key] : template.system}
                      onChange={(e) => handleEditPrompt(key, e.target.value)}
                      rows={8}
                      className="text-xs font-mono"
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResetPrompt(key)}
                        disabled={editedPrompts[key] === undefined}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        恢复默认
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {key === 'custom' && (
                <div className="space-y-2">
                  <Label>System Prompt</Label>
                  <Textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder={template.placeholder}
                    rows={4}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={handleGenerate} disabled={loading || selectedCount === 0}>
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" />生成中...</>
                  ) : (
                    `发送 ${selectedCount} 条消息`
                  )}
                </Button>
                {selectedCount === 0 && (
                  <span className="text-sm text-muted-foreground">请先选择楼层</span>
                )}
              </div>

              {output && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>生成结果</Label>
                    <div className="flex gap-2">
                      {isWorldbookJson() && (
                        <Button variant="outline" size="sm" onClick={handleImportToWorldbook}>
                          <Import className="w-4 h-4 mr-1" />
                          导入到世界书编辑器
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={handleCopy}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap max-h-96 overflow-auto">
                    {output}
                    {loading && <span className="inline-block w-1.5 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom" />}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
