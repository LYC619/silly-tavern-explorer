/**
 * 全局应用外壳（10.1 改版，0801 实测反馈）：
 * - 标题栏去品牌文字层，变纯工具栏：全局搜索（⌘K，最小可用）居中
 * - 侧栏：头部=展开/折叠符号；默认展开、切页不再自动折叠（use-sidenav-state 改版）；
 *   折叠态=「图标+小字在下」窄栏（插图1）；导航扩充 7 项，世界书/预设/正则走 /assets 深链；
 *   编辑区可展开列最近处理条目（editor-recent 派生，无新埋点）
 * - 状态栏：只留运行环境+版本（「已接入 ST」「数据占用」挪设置页，10.4 收容）
 * - 主区内容 framer-motion 入场 fade+slide（A7 切换平滑专项；侧栏不参与动画）
 * - actions/leftActions 契约保留：页面专属操作条仍在主区顶部一行
 */
import { forwardRef, useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Users, BookOpen, SlidersHorizontal, Regex, Layers, PenLine,
  Palette, Wrench, PanelLeftClose, PanelLeftOpen, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useSidenavState } from '@/hooks/use-sidenav-state';
import { APP_VERSION } from '@/components/GlobalSettings';
import { isTauri } from '@/lib/vault/tauri-fs';
import { pickRecentEdits, RECENT_EDIT_KIND_LABEL, type RecentEditItem } from '@/lib/editor-recent';
import { getAllArchiveStories } from '@/lib/archive-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  /** 页面右上角的专属操作区（导入/导出/编辑等），由各页面传入 */
  actions?: React.ReactNode;
  /** 操作条左侧的常驻区（页面标题、外观设置等），与 actions 分列两端，互不遮挡 */
  leftActions?: React.ReactNode;
}

/** 导航 7 项（10.1-A4）：资产三类走 /assets?tab= 深链；「其他」= 资产库总览（后续类别扩展的家） */
interface NavItem {
  label: string;
  icon: typeof Home;
  path: string;
  /** pathname 前缀点亮 */
  prefixes?: string[];
  /** /assets 页按 tab 参数点亮（undefined 表示无 tab 参数时点亮） */
  assetTab?: string | null;
}

const NAV_ITEMS: NavItem[] = [
  { label: '首页', icon: Home, path: '/', prefixes: ['/'] },
  { label: '角色', icon: Users, path: '/library', prefixes: ['/library', '/character'] },
  { label: '世界书', icon: BookOpen, path: '/assets?tab=worldbook', assetTab: 'worldbook' },
  { label: '预设', icon: SlidersHorizontal, path: '/assets?tab=preset', assetTab: 'preset' },
  { label: '正则', icon: Regex, path: '/assets?tab=regex', assetTab: 'regex' },
  { label: '其他', icon: Layers, path: '/assets', assetTab: null },
];

/** 编辑区入口：单列（带可展开的最近处理条目），/story 工作区=编辑器也归它点亮 */
const EDITOR_ITEM: NavItem = {
  label: '编辑区',
  icon: PenLine,
  path: '/tools',
  prefixes: ['/tools', '/chat', '/worldbook', '/card-viewer', '/preset', '/regex', '/story'],
};

interface SideItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: typeof Home;
  label: string;
  expanded: boolean;
  active?: boolean;
  dataTour?: string;
}

/** 侧栏条目：展开=图标+横排文字；折叠=图标+小字在下（0801 插图1 目标样式）。
 * forwardRef + 透传 props：可直接作为 Radix PopoverTrigger asChild 的触发器 */
const SideItem = forwardRef<HTMLButtonElement, SideItemProps>(function SideItem(
  { icon: Icon, label, expanded, active, dataTour, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-current={active ? 'page' : undefined}
      data-tour={dataTour}
      {...rest}
      className={cn(
        'relative rounded-md transition-colors w-full overflow-hidden',
        expanded
          ? 'flex items-center gap-2.5 py-2 px-2.5 text-xs whitespace-nowrap'
          : 'flex flex-col items-center gap-1 py-2 px-0.5',
        active
          ? 'bg-[var(--brand-active-bg)] text-brand'
          : 'text-[color:var(--text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)]',
      )}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand" />}
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className={cn('text-left', expanded ? 'flex-1 truncate' : 'text-[10px] leading-none whitespace-nowrap')}>
        {label}
      </span>
    </button>
  );
});

/** 编辑区最近处理条目（展开侧栏时可见）：未绑定聊天/世界书/预设/正则，updatedAt 最近 6 条 */
function EditorRecentList({ onGo }: { onGo: (path: string) => void }) {
  const [items, setItems] = useState<RecentEditItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stories, worldbooks, presets, regexes] = await Promise.all([
        getAllArchiveStories().catch(() => []),
        getAllWorldBooks().catch(() => []),
        getAllPresets().catch(() => []),
        getAllRegexCollections().catch(() => []),
      ]);
      if (!cancelled) setItems(pickRecentEdits({ stories, worldbooks, presets, regexes }));
    })();
    return () => { cancelled = true; };
  }, []);

  if (items === null) {
    return <p className="pl-9 pr-2 py-1 text-[10px] text-[color:var(--text-faint)]">加载中…</p>;
  }
  if (items.length === 0) {
    return <p className="pl-9 pr-2 py-1 text-[10px] text-[color:var(--text-faint)]">还没有处理过的条目</p>;
  }
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <button
          key={`${item.kind}-${item.id}`}
          onClick={() => onGo(item.path)}
          title={item.title}
          className="flex items-center gap-1.5 pl-9 pr-2 py-1 text-left text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text-body)] hover:bg-[var(--hover-overlay)] rounded-md"
        >
          <span className="truncate flex-1">{item.title}</span>
          <span className="text-[9px] shrink-0 text-[color:var(--text-faint)]">{RECENT_EDIT_KIND_LABEL[item.kind]}</span>
        </button>
      ))}
    </div>
  );
}

export function AppLayout({ children, actions, leftActions }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { expanded, toggle } = useSidenavState();
  const [editorOpen, setEditorOpen] = useState(false);

  const isActive = useCallback((item: NavItem) => {
    if (item.assetTab !== undefined) {
      if (location.pathname !== '/assets') return false;
      const tab = new URLSearchParams(location.search).get('tab');
      return item.assetTab === null ? tab === null : tab === item.assetTab;
    }
    return (item.prefixes ?? []).some((m) =>
      m === '/' ? location.pathname === '/' : location.pathname.startsWith(m));
  }, [location.pathname, location.search]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-canvas text-[color:var(--text-body)]">
      {/* ===== 工具栏（原第二层标题栏，0801 反馈去掉品牌文字，只留搜索与功能钮） ===== */}
      <header className="h-9 shrink-0 bg-chrome border-b border-[color:var(--border-subtle)] flex items-center gap-3 px-3.5">
        <div className="flex-1" />
        <GlobalSearch />
        <div className="flex-1" />
      </header>

      {/* ===== 主体：侧栏 + 主区 ===== */}
      <div className="flex-1 flex min-h-0">
        <nav
          className={cn(
            'shrink-0 bg-chrome border-r border-[color:var(--border-subtle)] flex flex-col px-1.5 py-2 transition-[width] duration-200 overflow-hidden',
            expanded ? 'w-[var(--sidenav-expanded)]' : 'w-[var(--sidenav-collapsed)]',
          )}
        >
          {/* 头部：展开/折叠符号（0801 反馈：替代「ST 处理器」品牌块） */}
          <button
            onClick={toggle}
            title={expanded ? '折叠侧栏' : '展开侧栏'}
            aria-label={expanded ? '折叠侧栏' : '展开侧栏'}
            className={cn(
              'flex items-center pb-2.5 pt-1 mb-2 border-b border-[color:var(--border-subtle)] text-[color:var(--text-muted)] hover:text-[color:var(--text-body)] transition-colors',
              expanded ? 'px-2.5 justify-end' : 'px-0 justify-center',
            )}
          >
            {expanded
              ? <PanelLeftClose className="w-[18px] h-[18px]" />
              : <PanelLeftOpen className="w-[18px] h-[18px]" />}
          </button>

          <div className="flex flex-col gap-0.5 min-h-0 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <SideItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                expanded={expanded}
                active={isActive(item)}
                onClick={() => navigate(item.path)}
              />
            ))}

            {/* 编辑区：主体点击进 /tools；展开态右侧折角展开最近处理条目 */}
            <div className="relative">
              <SideItem
                icon={EDITOR_ITEM.icon}
                label={EDITOR_ITEM.label}
                expanded={expanded}
                active={isActive(EDITOR_ITEM)}
                onClick={() => navigate(EDITOR_ITEM.path)}
              />
              {expanded && (
                <button
                  onClick={() => setEditorOpen((v) => !v)}
                  title={editorOpen ? '收起最近处理' : '展开最近处理'}
                  aria-label={editorOpen ? '收起最近处理' : '展开最近处理'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-[color:var(--text-faint)] hover:text-[color:var(--text-body)] hover:bg-[var(--hover-overlay)]"
                >
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', editorOpen && 'rotate-180')} />
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {expanded && editorOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <EditorRecentList onGo={(path) => navigate(path)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 底部：主题（弹层）+ 设置 */}
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

        {/* 主区：页面操作条（契约保留）+ 内容滚动区（入场 fade+slide，A7） */}
        <div className="flex-1 min-w-0 flex flex-col">
          {(actions || leftActions) && (
            <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-chrome/60 backdrop-blur-sm z-40">
              <div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">{leftActions}</div>
                <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div>
              </div>
            </div>
          )}
          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="h-full"
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>

      {/* ===== 状态栏（10.1-A6：ST 接入与数据占用挪设置页，这里只留环境+版本） ===== */}
      <footer className="h-[26px] shrink-0 bg-chrome border-t border-[color:var(--border-subtle)] flex items-center justify-between px-3.5 text-[11px] text-[color:var(--text-muted)]">
        <span className="truncate">{isTauri() ? '客户端' : '网页版 · 数据保存在浏览器本地'}</span>
        <span className="shrink-0">STE {APP_VERSION}</span>
      </footer>
    </div>
  );
}
