import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, AlertCircle } from 'lucide-react';
import { GuidedTour } from '@/components/GuidedTour';
import { AITOOLS_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { Button } from '@/components/ui/button';
import { HelpCard } from '@/components/HelpCard';
import {
  APIConfigCard,
  loadAPIConfig,
  DEFAULT_API_URL,
  DEFAULT_MODEL,
  type APIConfig,
} from '@/components/ai-tools';
import { FloorSelector } from '@/components/ai-tools/FloorSelector';
import { PromptTemplates } from '@/components/ai-tools/PromptTemplates';
import { BatchProcessor } from '@/components/ai-tools/BatchProcessor';
import { loadSessionState } from '@/lib/session-storage';
import type { ChatSession } from '@/types/chat';

// Need to access the active system prompt from PromptTemplates
// We'll lift it via a simple approach: duplicate the default prompts here for batch processor
const DEFAULT_PROMPTS_SYSTEM: Record<string, string> = {
  summarize: `你是一个故事分析专家。用户会提供一段对话/角色扮演记录，请将其总结为结构化的剧情概要。\n\n输出格式（使用 Markdown）：\n## 场景\n描述故事发生的场景和背景\n\n## 主要人物\n列出出场的主要人物及其特征\n\n## 关键事件\n按时间顺序列出关键事件，每个事件一行，使用编号列表\n\n## 剧情走向\n总结当前剧情的发展方向和未解决的悬念\n\n## 章节标记\n在上述分析基础上，将对话按剧情转折点划分为若干章节，输出一个 JSON 代码块。\n\n请用中文回复。`,
  worldbook: `你是一个世界观设定提取专家。请从对话记录中提取世界观设定，输出为世界书 JSON 格式。`,
  parallel: `你是一个创意写作专家。请基于对话记录生成平行世界分支续写提纲。`,
  custom: '',
};

const AITools = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<APIConfig>({
    apiKey: '',
    apiUrl: DEFAULT_API_URL,
    model: DEFAULT_MODEL,
  });
  const [session, setSession] = useState<ChatSession | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState('summarize');
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    setConfig(loadAPIConfig());
    const state = loadSessionState();
    if (state?.session) {
      setSession(state.session);
      setSelectedIndices(new Set(state.session.messages.map((_, i) => i)));
    }
    if (!isTourCompleted('aitools')) {
      setTimeout(() => setShowTour(true), 500);
    }
  }, []);

  const handleConfigSave = (newConfig: APIConfig) => setConfig(newConfig);
  const handleConfigClear = () => setConfig({ apiKey: '', apiUrl: DEFAULT_API_URL, model: DEFAULT_MODEL });

  const selectedContent = useMemo(() => {
    if (!session) return '';
    const msgs = session.messages
      .filter((_, i) => selectedIndices.has(i))
      .map((m, idx) => {
        const name = m.role === 'user'
          ? (session.user?.name || m.name || 'User')
          : (session.character?.name || m.name || 'Character');
        return `[#${idx + 1} ${name}]\n${m.content}`;
      });
    return msgs.join('\n\n');
  }, [session, selectedIndices]);

  // Get active system prompt for batch processor
  const batchSystemPrompt = useMemo(() => {
    if (activeTab === 'custom') return '';
    const stored = localStorage.getItem(`ai-prompt-${activeTab}`);
    return stored || DEFAULT_PROMPTS_SYSTEM[activeTab] || '';
  }, [activeTab]);

  return (
    <div className="min-h-screen paper-bg flex flex-col">
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
              <div className="flex items-center gap-1">
                <h1 className="font-display text-xl font-semibold">AI 工具箱</h1>
                <HelpCard>
                  需要 OpenAI 兼容的 API Key。从主页导入聊天记录后，选择需要分析的楼层范围，使用内置模板或自定义提示词发送给 AI。支持剧情总结、世界书提取、平行世界续写等功能。
                </HelpCard>
              </div>
              <p className="text-xs text-muted-foreground">聊天记录智能分析</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 flex-1">
        <div className="max-w-3xl mx-auto space-y-6">
          <div data-tour="ai-config">
            <APIConfigCard savedConfig={config} onConfigSave={handleConfigSave} onConfigClear={handleConfigClear} />
          </div>

          {!session ? (
            <div className="p-8 text-center border-2 border-dashed border-border rounded-lg">
              <AlertCircle className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground mb-3">尚未导入聊天记录</p>
              <p className="text-sm text-muted-foreground mb-4">
                请先在主页导入聊天记录，然后返回此页面使用 AI 工具
              </p>
              <Button variant="outline" onClick={() => navigate('/')}>
                前往主页导入
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{session.title}</span>
                <span>· {session.messages.length} 条消息</span>
                <span>· {session.character?.name} & {session.user?.name}</span>
              </div>

              <div data-tour="ai-floor-selector">
                <FloorSelector
                  messages={session.messages}
                  characterName={session.character?.name}
                  userName={session.user?.name}
                  selectedIndices={selectedIndices}
                  onSelectionChange={setSelectedIndices}
                />
              </div>

              <div data-tour="ai-batch">
                <BatchProcessor
                  config={config}
                  selectedContent={selectedContent}
                  selectedCount={selectedIndices.size}
                  systemPrompt={batchSystemPrompt}
                />
              </div>

              <div data-tour="ai-templates">
                <PromptTemplates
                  config={config}
                  selectedContent={selectedContent}
                  selectedCount={selectedIndices.size}
                />
              </div>
            </>
          )}
        </div>
      </main>

      {/* Guided Tour */}
      {showTour && (
        <GuidedTour
          steps={AITOOLS_TOUR_STEPS}
          module="aitools"
          onComplete={() => { setTourCompleted('aitools'); setShowTour(false); }}
          onSkip={() => { setTourCompleted('aitools'); setShowTour(false); }}
        />
      )}

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground flex-shrink-0">
        <p>ST 聊天记录处理器 v0.9</p>
        <p className="mt-1">
          <a href="https://github.com/LYC619/silly-tavern-explorer" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a>
          {' · MIT License'}
        </p>
      </footer>
    </div>
  );
};

export default AITools;
