import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, Key, Wand2, BookMarked, Type, Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

const API_KEY_STORAGE_KEY = 'st-beautifier-openai-key';
const API_URL_STORAGE_KEY = 'st-beautifier-api-url';
const API_MODEL_STORAGE_KEY = 'st-beautifier-api-model';

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

const AITools = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [savedApiUrl, setSavedApiUrl] = useState(DEFAULT_API_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [savedModel, setSavedModel] = useState(DEFAULT_MODEL);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Regex generator state
  const [regexInput, setRegexInput] = useState('');
  const [regexOutput, setRegexOutput] = useState('');
  const [regexLoading, setRegexLoading] = useState(false);

  // Chapter splitter state
  const [chapterInput, setChapterInput] = useState('');
  const [chapterOutput, setChapterOutput] = useState('');
  const [chapterLoading, setChapterLoading] = useState(false);

  // Title generator state
  const [titleInput, setTitleInput] = useState('');
  const [titleOutput, setTitleOutput] = useState('');
  const [titleLoading, setTitleLoading] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    const storedUrl = localStorage.getItem(API_URL_STORAGE_KEY);
    const storedModel = localStorage.getItem(API_MODEL_STORAGE_KEY);
    if (storedKey) {
      setSavedApiKey(storedKey);
      setApiKey(storedKey);
    }
    if (storedUrl) {
      setSavedApiUrl(storedUrl);
      setApiUrl(storedUrl);
    }
    if (storedModel) {
      setSavedModel(storedModel);
      setModel(storedModel);
    }
  }, []);

  const handleSaveConfig = () => {
    if (!apiKey.trim()) {
      toast({ title: '请输入 API Key', variant: 'destructive' });
      return;
    }
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
    localStorage.setItem(API_URL_STORAGE_KEY, apiUrl.trim() || DEFAULT_API_URL);
    localStorage.setItem(API_MODEL_STORAGE_KEY, model.trim() || DEFAULT_MODEL);
    setSavedApiKey(apiKey.trim());
    setSavedApiUrl(apiUrl.trim() || DEFAULT_API_URL);
    setSavedModel(model.trim() || DEFAULT_MODEL);
    toast({ title: '配置已保存' });
  };

  const handleClearConfig = () => {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(API_URL_STORAGE_KEY);
    localStorage.removeItem(API_MODEL_STORAGE_KEY);
    setApiKey('');
    setApiUrl(DEFAULT_API_URL);
    setModel(DEFAULT_MODEL);
    setSavedApiKey('');
    setSavedApiUrl(DEFAULT_API_URL);
    setSavedModel(DEFAULT_MODEL);
    toast({ title: '配置已清除' });
  };


  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: '已复制到剪贴板' });
  };

  const callOpenAI = async (prompt: string, systemPrompt: string): Promise<string> => {
    if (!savedApiKey) {
      throw new Error('请先配置 API Key');
    }

    const response = await fetch(savedApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedApiKey}`,
      },
      body: JSON.stringify({
        model: savedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'API 请求失败');
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  };

  const handleGenerateRegex = async () => {
    if (!regexInput.trim()) {
      toast({ title: '请输入需要匹配的文本示例', variant: 'destructive' });
      return;
    }
    setRegexLoading(true);
    try {
      const result = await callOpenAI(
        regexInput,
        `你是一个正则表达式专家。用户会提供一些需要匹配或过滤的文本示例，请生成相应的正则表达式。
输出格式：
1. 首先给出正则表达式（使用 /pattern/flags 格式）
2. 然后简要解释这个正则表达式的作用
3. 如果有替换需求，给出替换字符串

请用中文回复。`
      );
      setRegexOutput(result);
    } catch (error) {
      toast({
        title: '生成失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setRegexLoading(false);
    }
  };

  const handleGenerateChapters = async () => {
    if (!chapterInput.trim()) {
      toast({ title: '请输入聊天内容', variant: 'destructive' });
      return;
    }
    setChapterLoading(true);
    try {
      const result = await callOpenAI(
        chapterInput,
        `你是一个故事分析专家。用户会提供一段聊天记录或故事内容，请分析内容并建议如何分卷/分章节。

输出格式（JSON数组，每个元素包含）：
- floor: 建议的起始楼层号（从1开始的数字）
- title: 章节标题
- summary: 章节简要内容概述（一句话）

只输出JSON数组，不要其他解释文字。
示例：
[
  {"floor": 1, "title": "相遇", "summary": "主角与女主角的初次相遇"},
  {"floor": 15, "title": "误会", "summary": "一场误会导致两人关系紧张"}
]`
      );
      setChapterOutput(result);
    } catch (error) {
      toast({
        title: '生成失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setChapterLoading(false);
    }
  };

  const handleGenerateTitle = async () => {
    if (!titleInput.trim()) {
      toast({ title: '请输入内容摘要', variant: 'destructive' });
      return;
    }
    setTitleLoading(true);
    try {
      const result = await callOpenAI(
        titleInput,
        `你是一个创意写作专家。用户会提供一段故事或聊天内容的摘要，请生成5个有吸引力的标题建议。

要求：
- 标题要有文学感，能引起读者兴趣
- 可以是诗意的、悬念的、或情感化的
- 每个标题占一行，前面加序号

只输出标题列表，不要其他解释文字。`
      );
      setTitleOutput(result);
    } catch (error) {
      toast({
        title: '生成失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setTitleLoading(false);
    }
  };

  return (
    <div className="min-h-screen paper-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">AI 工具箱</h1>
              <p className="text-xs text-muted-foreground">智能辅助功能</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 flex-1">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* API Key Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                API 配置
              </CardTitle>
              <CardDescription>
                配置 AI 服务接口（支持 OpenAI 兼容格式，密钥仅保存在本地浏览器）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      type={isKeyVisible ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setIsKeyVisible(!isKeyVisible)}
                  >
                    {isKeyVisible ? '隐藏' : '显示'}
                  </Button>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-muted-foreground"
              >
                {showAdvanced ? '▼ 收起高级设置' : '▶ 展开高级设置（自定义接口地址/模型）'}
              </Button>

              {showAdvanced && (
                <div className="space-y-4 pl-4 border-l-2 border-border">
                  <div className="space-y-2">
                    <Label>API 接口地址</Label>
                    <Input
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder={DEFAULT_API_URL}
                    />
                    <p className="text-xs text-muted-foreground">
                      支持 OpenAI 兼容格式的接口，如中转站、本地部署的模型等
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>模型名称</Label>
                    <Input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={DEFAULT_MODEL}
                    />
                    <p className="text-xs text-muted-foreground">
                      例如：gpt-4o-mini, gpt-4o, claude-3-haiku, deepseek-chat 等
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveConfig}>保存配置</Button>
                {savedApiKey && (
                  <Button variant="ghost" onClick={handleClearConfig}>
                    清除配置
                  </Button>
                )}
              </div>

              {savedApiKey && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-green-500" />
                  已配置 · 模型: {savedModel}
                  {savedApiUrl !== DEFAULT_API_URL && (
                    <span className="text-xs">· 自定义接口</span>
                  )}
                </div>
              )}
              {!savedApiKey && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  尚未配置 API Key
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Tools */}
          <Tabs defaultValue="regex" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="regex" className="flex items-center gap-2">
                <Wand2 className="w-4 h-4" />
                生成正则
              </TabsTrigger>
              <TabsTrigger value="chapters" className="flex items-center gap-2">
                <BookMarked className="w-4 h-4" />
                智能分卷
              </TabsTrigger>
              <TabsTrigger value="title" className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                生成标题
              </TabsTrigger>
            </TabsList>

            {/* Regex Generator */}
            <TabsContent value="regex">
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
                      value={regexInput}
                      onChange={(e) => setRegexInput(e.target.value)}
                      placeholder="粘贴需要匹配的文本，例如：&#10;[思考中...]&#10;<thinking>这是思考内容</thinking>&#10;*状态栏信息*"
                      rows={6}
                    />
                  </div>
                  <Button onClick={handleGenerateRegex} disabled={regexLoading}>
                    {regexLoading ? '生成中...' : '生成正则'}
                  </Button>
                  {regexOutput && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>生成结果</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(regexOutput, 'regex')}
                        >
                          {copied === 'regex' ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div className="p-4 bg-muted rounded-lg font-mono text-sm whitespace-pre-wrap">
                        {regexOutput}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Chapter Splitter */}
            <TabsContent value="chapters">
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
                      value={chapterInput}
                      onChange={(e) => setChapterInput(e.target.value)}
                      placeholder="粘贴聊天记录内容..."
                      rows={8}
                    />
                  </div>
                  <Button onClick={handleGenerateChapters} disabled={chapterLoading}>
                    {chapterLoading ? '分析中...' : '分析分卷'}
                  </Button>
                  {chapterOutput && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>分卷建议</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(chapterOutput, 'chapters')}
                        >
                          {copied === 'chapters' ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div className="p-4 bg-muted rounded-lg font-mono text-sm whitespace-pre-wrap max-h-64 overflow-auto">
                        {chapterOutput}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Title Generator */}
            <TabsContent value="title">
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
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="简要描述故事内容，例如：&#10;一个现代都市背景的爱情故事，讲述了程序员和设计师之间从相识到相恋的过程..."
                      rows={4}
                    />
                  </div>
                  <Button onClick={handleGenerateTitle} disabled={titleLoading}>
                    {titleLoading ? '生成中...' : '生成标题'}
                  </Button>
                  {titleOutput && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>标题建议</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(titleOutput, 'title')}
                        >
                          {copied === 'title' ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap">
                        {titleOutput}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground flex-shrink-0">
        <p>SillyTavern 对话美化工具 · 让每一段对话都成为艺术</p>
      </footer>
    </div>
  );
};

export default AITools;
