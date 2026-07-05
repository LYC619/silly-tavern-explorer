import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ArrowRight } from 'lucide-react';
import { GuidedTour } from '@/components/GuidedTour';
import { AITOOLS_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { APIConfigCard } from '@/components/ai-tools';
import { APP_VERSION } from '@/components/GlobalSettings';

/**
 * AI 配置页：全应用唯一的 API 提供商管理中心。
 * 原「AI 工具箱」的分析功能已就近迁移——批量分段在总结页、模板库在总结页、世界书提取在世界书页。
 */
const AITools = () => {
  const navigate = useNavigate();
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (!isTourCompleted('aitools')) {
      const timer = setTimeout(() => setShowTour(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* 页内标题 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
              <KeyRound className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <h1 className="font-display text-xl font-semibold">AI 配置</h1>
                <HelpCard>
                  全应用的 AI 能力（总结、故事树、世界书追加/改写、批量分段）都从这里读取配置。支持保存多个提供商（OpenAI 兼容格式）并随时切换，可拉取模型列表、测试连通。密钥仅保存在本地浏览器。
                </HelpCard>
              </div>
              <p className="text-xs text-muted-foreground">全局 API 提供商管理</p>
            </div>
          </div>

          <div data-tour="ai-config">
            <APIConfigCard />
          </div>

          {/* 功能迁移说明 */}
          <Card data-tour="ai-moved">
            <CardHeader>
              <CardTitle className="text-base">找原来的 AI 工具？功能已就近迁移</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>· <strong className="text-foreground">批量分段生成</strong>：在「总结」页左栏（生成按钮下方），与楼层范围、提示词模板同处一屏。</p>
              <p>· <strong className="text-foreground">提示词模板</strong>：由「总结」页的模板库统一管理，可查看/编辑/另存为/删除自定义模板。</p>
              <p>· <strong className="text-foreground">提取世界书</strong>：用「世界书」页的「AI 追加」按聊天提炼新条目，提示词同样可编辑。</p>
              <div className="flex gap-2 pt-1 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/summary')}>
                  去总结页<ArrowRight className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/worldbook')}>
                  去世界书页<ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
        <p>ST 聊天记录处理器 {APP_VERSION}</p>
        <p className="mt-1">
          <a href="https://github.com/LYC619/silly-tavern-explorer" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a>
          {' · MIT License'}
        </p>
      </footer>
    </AppLayout>
  );
};

export default AITools;
