import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, Wand2, BookMarked, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  APIConfigCard,
  loadAPIConfig,
  RegexGeneratorTab,
  ChapterSplitterTab,
  TitleGeneratorTab,
  DEFAULT_API_URL,
  DEFAULT_MODEL,
  type APIConfig,
} from '@/components/ai-tools';

const AITools = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<APIConfig>({
    apiKey: '',
    apiUrl: DEFAULT_API_URL,
    model: DEFAULT_MODEL,
  });

  useEffect(() => {
    setConfig(loadAPIConfig());
  }, []);

  const handleConfigSave = (newConfig: APIConfig) => {
    setConfig(newConfig);
  };

  const handleConfigClear = () => {
    setConfig({
      apiKey: '',
      apiUrl: DEFAULT_API_URL,
      model: DEFAULT_MODEL,
    });
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
          <APIConfigCard
            savedConfig={config}
            onConfigSave={handleConfigSave}
            onConfigClear={handleConfigClear}
          />

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

            <TabsContent value="regex">
              <RegexGeneratorTab config={config} />
            </TabsContent>

            <TabsContent value="chapters">
              <ChapterSplitterTab config={config} />
            </TabsContent>

            <TabsContent value="title">
              <TitleGeneratorTab config={config} />
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
