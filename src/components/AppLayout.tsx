import { useNavigate, useLocation } from 'react-router-dom';
import { ScrollText, Globe, Library, KeyRound, Moon, Sun, IdCard, SlidersHorizontal, NotebookText, Network } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { GlobalSettings } from '@/components/GlobalSettings';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  /** 页面右上角的专属操作区（导入/导出/编辑等），由各页面传入 */
  actions?: React.ReactNode;
  /** 顶栏左侧的常驻区（外观设置、全文搜索等），与 actions 分列两端，互不遮挡 */
  leftActions?: React.ReactNode;
}

const NAV_ITEMS = [
  { label: '聊天处理', icon: ScrollText, path: '/' },
  { label: '总结', icon: NotebookText, path: '/summary' },
  { label: '故事树', icon: Network, path: '/story-tree' },
  { label: '世界书', icon: Globe, path: '/worldbook' },
  { label: '角色卡', icon: IdCard, path: '/card-viewer' },
  { label: '预设', icon: SlidersHorizontal, path: '/preset' },
  { label: '书架', icon: Library, path: '/bookshelf' },
  { label: 'AI 配置', icon: KeyRound, path: '/ai-tools' },
];

/**
 * 全局共享布局：左侧固定主导航栏（主功能切换）+ 顶部品牌/全局设置 + 右侧页面专属操作。
 * 取代过去每个页面各写一份 header、星型 navigate 跳转的混乱结构。
 */
export function AppLayout({ children, actions, leftActions }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen paper-bg flex">
      {/* 左侧主导航栏 */}
      <aside className="w-20 md:w-24 flex-shrink-0 border-r border-border bg-card/80 backdrop-blur-sm flex flex-col sticky top-0 h-screen">
        {/* 品牌 */}
        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center gap-1 py-4 border-b border-border hover:bg-accent/40 transition-colors"
          aria-label="首页"
        >
          <div className="w-9 h-9 rounded-lg gold-gradient flex items-center justify-center shadow-card">
            <ScrollText className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground hidden md:block">ST 处理器</span>
        </button>

        {/* 主功能切换 */}
        <nav className="flex-1 flex flex-col gap-1 p-2 mt-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 rounded-lg transition-colors text-xs',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-5 h-5" />
                <span className="leading-none">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 底部：全局设置 + 暗色切换 */}
        <div className="p-2 border-t border-border flex flex-col items-center gap-1">
          <GlobalSettings data-tour="global-settings" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9"
            aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {(actions || leftActions) && (
          <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
            <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              {/* 左侧常驻：外观 + 搜索（与右侧操作分列，popover/弹层从左展开不遮正文） */}
              <div className="flex items-center gap-2 flex-wrap min-w-0">{leftActions}</div>
              {/* 右侧操作：处理 + 输入输出 */}
              <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div>
            </div>
          </header>
        )}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
