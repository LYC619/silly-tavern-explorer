/**
 * 全局应用外壳（2.1-P1，按新前端交接包 demo 重写）：
 * 标题栏（品牌 + ⌘K 搜索占位）/ Obsidian 式双态主侧栏（4 入口）/ 底部状态栏（真实数据）。
 * - 侧栏 expanded 180px / collapsed 52px：首页默认展开、其余折叠，手动切换记 localStorage（useSidenavState）
 * - 底部只有主题 + 设置（扳手）两个入口；"接入 ST 目录"按红线不进侧栏
 * - 路由零变更：4 入口对应既有 /、/library、/tools、/assets，仅导航与标签变化
 * - actions/leftActions 契约保留：页面专属操作条仍在主区顶部一行
 */
import { forwardRef, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, PenLine, Layers, Palette, Wrench } from 'lucide-react';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useSidenavState } from '@/hooks/use-sidenav-state';
import { APP_VERSION } from '@/components/GlobalSettings';
import { isTauri, getAppConfig } from '@/lib/vault/tauri-fs';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  /** 页面右上角的专属操作区（导入/导出/编辑等），由各页面传入 */
  actions?: React.ReactNode;
  /** 操作条左侧的常驻区（页面标题、外观设置等），与 actions 分列两端，互不遮挡 */
  leftActions?: React.ReactNode;
  /** ST 接入或导入完成后递增，触发状态栏重新查询 */
  statusRefreshKey?: number;
}

/** 4 个一级入口（交接包定稿）："处理区"改名"编辑区"，"其他资产"升顶级；matches 列出点亮该入口的路径前缀 */
const NAV_ITEMS = [
  { label: '首页', icon: Home, path: '/', matches: ['/'] },
  { label: '角色库', icon: Users, path: '/library', matches: ['/library', '/character', '/story'] },
  {
    label: '编辑区',
    icon: PenLine,
    path: '/tools',
    matches: ['/tools', '/chat', '/worldbook', '/card-viewer', '/preset', '/regex', '/ai-tools'],
  },
  { label: '其他资产', icon: Layers, path: '/assets', matches: ['/assets'] },
];

interface SideItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: typeof Home;
  label: string;
  expanded: boolean;
  active?: boolean;
  dataTour?: string;
}

/** 侧栏条目通用样式（demo .side-item）：active = 品牌橙底 + 左侧 2px 竖条。
 * forwardRef + 透传 props：可直接作为 Radix PopoverTrigger asChild 的触发器 */
const SideItem = forwardRef<HTMLButtonElement, SideItemProps>(function SideItem(
  { icon: Icon, label, expanded, active, dataTour, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      title={expanded ? undefined : label}
      aria-current={active ? 'page' : undefined}
      data-tour={dataTour}
      {...rest}
      className={cn(
        'relative flex items-center gap-2.5 rounded-md py-2 text-xs whitespace-nowrap overflow-hidden transition-colors w-full',
        expanded ? 'px-2.5' : 'px-0 justify-center',
        active
          ? 'bg-[var(--brand-active-bg)] text-brand'
          : 'text-[color:var(--text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)]',
      )}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand" />}
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span
        className={cn(
          'flex-1 text-left transition-opacity duration-150',
          !expanded && 'opacity-0 w-0 flex-none overflow-hidden pointer-events-none',
        )}
      >
        {label}
      </span>
    </button>
  );
});

/** 状态栏真实数据：版本/运行环境 + ST 接入状态 + 本地数据体量。 */
function useStatusInfo(refreshKey = 0) {
  const [info, setInfo] = useState<{ stRoot: string | null; usage: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = isTauri();
      const [stRoot, usage] = await Promise.all([
        client ? getAppConfig<string>('stRoot').catch(() => null) : Promise.resolve(null),
        client
          ? Promise.resolve(null)
          : navigator.storage?.estimate?.().then((estimate) => {
              const mb = (estimate.usage ?? 0) / 1024 / 1024;
              return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
            }).catch(() => null) ?? Promise.resolve(null),
      ]);
      if (!cancelled) setInfo({ stRoot, usage });
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);
  return info;
}

export function AppLayout({ children, actions, leftActions, statusRefreshKey }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { expanded, toggle } = useSidenavState(location.pathname === '/' ? 'expanded' : 'collapsed');
  const status = useStatusInfo(statusRefreshKey);

  const isActive = (matches: string[]) =>
    matches.some((m) => (m === '/' ? location.pathname === '/' : location.pathname.startsWith(m)));

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-canvas text-[color:var(--text-body)]">
      {/* ===== 标题栏（应用内，保留系统窗口框） ===== */}
      <header className="h-9 shrink-0 bg-chrome border-b border-[color:var(--border-subtle)] flex items-center gap-3 px-3.5 text-xs text-[color:var(--text-muted)]">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-[22px] h-[22px] rounded-[5px] bg-brand text-white flex items-center justify-center text-[11px] font-bold">
            S
          </div>
          <b className="font-serif font-semibold tracking-wide text-[color:var(--text-body)]">STE</b>
          <span className="opacity-45 text-[11px] hidden lg:inline">Silly Tavern Explorer 2.0</span>
        </div>
        <div className="flex-1" />
        {/* ⌘K 全局搜索占位（交接包留白项：位置先放好，逻辑本轮不做） */}
        <div
          className="hidden md:flex items-center gap-2 px-3.5 py-[5px] rounded-md text-[11px] w-72 lg:w-96 bg-[var(--input-bg)] text-[color:var(--text-faint)] cursor-default select-none"
          title="全局搜索（即将上线）"
        >
          <svg className="w-3 h-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="flex-1 truncate">搜索角色、故事、世界书条目…</span>
          <span className="text-[9px] px-1.5 py-px rounded bg-[var(--hover-overlay-strong)] opacity-60">⌘ K</span>
        </div>
        <div className="flex-1 md:hidden" />
      </header>

      {/* ===== 主体：侧栏 + 主区 ===== */}
      <div className="flex-1 flex min-h-0">
        <nav
          className={cn(
            'shrink-0 bg-chrome border-r border-[color:var(--border-subtle)] flex flex-col px-1.5 py-2 transition-[width] duration-200 overflow-hidden',
            expanded ? 'w-[var(--sidenav-expanded)]' : 'w-[var(--sidenav-collapsed)]',
          )}
        >
          {/* 品牌块：点击切换展开/折叠（手动切换记 localStorage） */}
          <button
            onClick={toggle}
            title={expanded ? '折叠侧栏' : '展开侧栏'}
            className={cn(
              'flex items-center gap-2.5 pb-3 pt-1 mb-2 border-b border-[color:var(--border-subtle)] text-[color:var(--text-primary)]',
              expanded ? 'px-2.5' : 'px-0 justify-center',
            )}
          >
            <div className="w-[26px] h-[26px] rounded-md bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0">
              S
            </div>
            <span
              className={cn(
                'font-serif font-semibold tracking-wide text-[13px] whitespace-nowrap transition-opacity duration-150',
                !expanded && 'opacity-0 w-0 overflow-hidden',
              )}
            >
              ST 处理器
            </span>
          </button>

          <div className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <SideItem
                key={item.path}
                icon={item.icon}
                label={item.label}
                expanded={expanded}
                active={isActive(item.matches)}
                onClick={() => navigate(item.path)}
              />
            ))}
          </div>

          {/* 底部只有两个入口：主题（弹层）+ 设置（扳手） */}
          <div className="mt-auto pt-2 border-t border-[color:var(--border-subtle)] flex flex-col gap-0.5">
            <ThemeSwitcher
              side="right"
              trigger={
                <SideItem icon={Palette} label="主题" expanded={expanded} />
              }
            />
            <SideItem
              icon={Wrench}
              label="设置"
              expanded={expanded}
              active={location.pathname.startsWith('/settings')}
              onClick={() => navigate('/settings')}
              dataTour="global-settings"
            />
          </div>
        </nav>

        {/* 主区：页面操作条（契约保留）+ 内容滚动区 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {(actions || leftActions) && (
            <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-chrome/60 backdrop-blur-sm z-40">
              <div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">{leftActions}</div>
                <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div>
              </div>
            </div>
          )}
          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">{children}</main>
        </div>
      </div>

      {/* ===== 状态栏 ===== */}
      <footer className="h-[26px] shrink-0 bg-chrome border-t border-[color:var(--border-subtle)] flex items-center justify-between px-3.5 text-[10px] text-[color:var(--text-muted)] opacity-70">
        <span className="truncate">
          {isTauri()
            ? status?.stRoot
              ? `已接入 ST 目录：${status.stRoot}`
              : '未接入 ST 目录 · 可在首页接入'
            : '网页版 · 数据保存在浏览器本地'}
        </span>
        <span className="shrink-0">
          {status?.usage ? `本地数据 ${status.usage} · ` : ''}STE {APP_VERSION}
        </span>
      </footer>
    </div>
  );
}
