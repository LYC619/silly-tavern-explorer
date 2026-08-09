/**
 * 全局应用外壳（10.1 改版，0801 实测反馈）：
 * - 客户端使用自定义窗口栏：左侧品牌、全局搜索（Ctrl+F）和右侧窗口控制合为一层；
 *   网页版保留独立搜索工具栏
 * - 侧栏：头部=展开/折叠符号；默认展开，从首页离开时自动折叠，其他页面之间保留用户选择；
 *   折叠态=「图标+小字在下」窄栏（插图1）；导航按首页/角色库/编辑区/附属库四个一级区域组织；
 *   编辑区可展开列最近处理条目（editor-recent 派生，无新埋点）
 * - 状态栏：只留运行环境+版本（「已接入 ST」「数据占用」挪设置页，10.4 收容）
 * - 主区内容 framer-motion 入场 fade+slide（A7 切换平滑专项；侧栏不参与动画）
 * - actions/leftActions 契约保留：页面专属操作条仍在主区顶部一行
 */
import {
  createContext,
  forwardRef,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useLocation, useOutlet } from 'react-router-dom';
import {
  Palette, Wrench, PanelLeftClose, PanelLeftOpen, ChevronDown, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { GlobalSearch } from '@/components/GlobalSearch';
import { ClientTitleBar } from '@/components/ClientTitleBar';
import { VaultSwitcher } from '@/components/vault/VaultSwitcher';
import { shouldAutoCollapse, useSidenavState } from '@/hooks/use-sidenav-state';
import { APP_VERSION } from '@/components/GlobalSettings';
import { isTauri } from '@/lib/vault/tauri-fs';
import { pickRecentEdits, RECENT_EDIT_KIND_LABEL, type RecentEditItem } from '@/lib/editor-recent';
import { getAllArchiveStories } from '@/lib/archive-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import { getAllSummaries } from '@/lib/summary-db';
import { getAllStoryTrees } from '@/lib/story-tree-db';
import { getAllCards } from '@/lib/card-db';
import { cn } from '@/lib/utils';
import { getEditorOpen, setEditorOpenState } from '@/lib/editor-open-state';
import { NAV_AREAS, matchesNavDestination, type NavAreaKey, type NavDestination } from '@/lib/navigation-model';

interface AppLayoutProps {
  children?: React.ReactNode;
  /** 自定义窗口栏中的页面摘要；随路由注册，因此离开页面后自动清除。 */
  titleBarContent?: React.ReactNode;
  /** 页面右上角的专属操作区（导入/导出/编辑等），由各页面传入 */
  actions?: React.ReactNode;
  /** 操作条左侧的常驻区（页面标题、外观设置等），与 actions 分列两端，互不遮挡 */
  leftActions?: React.ReactNode;
}

interface LayoutChrome {
  titleBarContent?: React.ReactNode;
  actions?: React.ReactNode;
  leftActions?: React.ReactNode;
}

interface LayoutRegistration extends LayoutChrome {
  routeKey: string;
}

interface LayoutContextValue {
  register: (routeKey: string, chrome: LayoutChrome) => void;
  clear: (routeKey: string) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

interface SideItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ComponentType<{ className?: string }>;
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
          : 'text-[color:var(--sidebar-text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]',
      )}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-accent" />}
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className={cn('text-left', expanded ? 'flex-1 truncate' : 'text-[10px] leading-none whitespace-nowrap')}>
        {label}
      </span>
    </button>
  );
});

function SideSubItem({
  item,
  active,
  onClick,
}: {
  item: NavDestination;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      title={item.description}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md py-1.5 pl-9 pr-2 text-left text-[11px] transition-colors',
        active
          ? 'bg-[var(--brand-active-bg)] text-brand font-medium'
          : 'text-[color:var(--sidebar-text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );
}

/** 编辑区最近处理条目（展开侧栏时可见）：故事、整理记录、故事树和资产，updatedAt 最近 6 条 */
function EditorRecentList({ onGo }: { onGo: (item: RecentEditItem) => void }) {
  const [items, setItems] = useState<RecentEditItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stories, summaries, trees, cards, worldbooks, presets, regexes] = await Promise.all([
        getAllArchiveStories().catch(() => []),
        getAllSummaries().catch(() => []),
        getAllStoryTrees().catch(() => []),
        getAllCards().catch(() => []),
        getAllWorldBooks().catch(() => []),
        getAllPresets().catch(() => []),
        getAllRegexCollections().catch(() => []),
      ]);
      if (!cancelled) {
        setItems(pickRecentEdits({ stories, summaries, trees, cards, worldbooks, presets, regexes }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (items === null) {
    return <p className="pl-9 pr-2 py-1 text-[10px] text-[color:var(--sidebar-text-faint)]">加载中…</p>;
  }
  if (items.length === 0) {
    return <p className="pl-9 pr-2 py-1 text-[10px] text-[color:var(--sidebar-text-faint)]">还没有处理过的条目</p>;
  }
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <button
          key={`${item.kind}-${item.id}`}
          onClick={() => onGo(item)}
          title={item.title}
          className="flex items-center gap-1.5 pl-9 pr-2 py-1 text-left text-[11px] text-[color:var(--sidebar-text-muted)] hover:text-[color:var(--sidebar-text)] hover:bg-[var(--hover-overlay)] rounded-md"
        >
          <span className="truncate flex-1">{item.title}</span>
          <span className="text-[9px] shrink-0 text-[color:var(--sidebar-text-faint)]">{RECENT_EDIT_KIND_LABEL[item.kind]}</span>
        </button>
      ))}
    </div>
  );
}

function PageChromeBridge({ children, titleBarContent, actions, leftActions, layout }: AppLayoutProps & { layout: LayoutContextValue }) {
  const location = useLocation();
  useLayoutEffect(() => {
    layout.register(location.key, { titleBarContent, actions, leftActions });
    return () => layout.clear(location.key);
  }, [actions, leftActions, layout, location.key, titleBarContent]);
  return <>{children}</>;
}

function PersistentAppLayout({ children, titleBarContent, actions, leftActions }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const client = isTauri();
  const { expanded, toggle, collapse } = useSidenavState();
  const [editorOpen, setEditorOpen] = useState(() => getEditorOpen());
  const [assetsOpen, setAssetsOpen] = useState(() => {
    try { return localStorage.getItem('ste-assets-nav-open') !== 'false'; } catch { return true; }
  });
  const [registration, setRegistration] = useState<LayoutRegistration | null>(null);
  const previousPathRef = useRef(location.pathname);

  const register = useCallback((routeKey: string, chrome: LayoutChrome) => {
    setRegistration({ routeKey, ...chrome });
  }, []);
  const clear = useCallback((routeKey: string) => {
    setRegistration((current) => current?.routeKey === routeKey ? null : current);
  }, []);
  const layout = useMemo<LayoutContextValue>(() => ({ register, clear }), [clear, register]);

  useLayoutEffect(() => {
    setRegistration(null);
  }, [location.key]);

  useLayoutEffect(() => {
    if (shouldAutoCollapse(previousPathRef.current, location.pathname) && expanded) collapse();
    previousPathRef.current = location.pathname;
  }, [collapse, expanded, location.pathname]);

  const activeChrome = registration?.routeKey === location.key
    ? registration
    : { titleBarContent, actions, leftActions };
  const content = children ?? outlet;

  const isActive = useCallback((item: NavDestination) => (
    matchesNavDestination(item, location.pathname, location.search)
  ), [location.pathname, location.search]);
  const activeAreaKey = NAV_AREAS.find((area) => isActive(area))?.key;

  const toggleArea = useCallback((key: NavAreaKey) => {
    if (key === 'editor') {
      setEditorOpen((current) => {
        const next = !current;
        setEditorOpenState(next);
        return next;
      });
      return;
    }
    if (key === 'assets') {
      setAssetsOpen((current) => {
        const next = !current;
        try { localStorage.setItem('ste-assets-nav-open', String(next)); } catch { /* no-op */ }
        return next;
      });
    }
  }, []);

  return (
    <LayoutContext.Provider value={layout}>
      <div className="h-screen flex flex-col overflow-hidden bg-canvas text-[color:var(--text-body)]">
      {client ? <ClientTitleBar titleBarContent={activeChrome.titleBarContent} /> : (
        <header className="relative z-[60] h-9 shrink-0 bg-chrome border-b border-[color:var(--border-subtle)] flex items-center justify-center px-3.5">
          {activeChrome.titleBarContent && (
            <div className="pointer-events-none absolute left-4 hidden max-w-[320px] items-center overflow-hidden xl:flex">
              {activeChrome.titleBarContent}
            </div>
          )}
          <GlobalSearch />
        </header>
      )}

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
              'flex items-center pb-2.5 pt-1 mb-2 border-b border-[color:var(--border-subtle)] text-[color:var(--sidebar-text-muted)] hover:text-[color:var(--sidebar-text)] transition-colors',
              expanded ? 'px-2.5 justify-end' : 'px-0 justify-center',
            )}
          >
            {expanded
              ? <PanelLeftClose className="w-[18px] h-[18px]" />
              : <PanelLeftOpen className="w-[18px] h-[18px]" />}
          </button>

          <div className="flex flex-col gap-0.5 min-h-0 overflow-y-auto">
            {NAV_AREAS.map((area) => {
              const AreaIcon = area.icon;
              const areaOpen = area.key === 'editor' ? editorOpen : area.key === 'assets' ? assetsOpen : false;
              const hasChildren = area.children.length > 0;
              return (
                <div key={area.key} className="relative">
                  <SideItem
                    icon={AreaIcon}
                    label={area.label}
                    expanded={expanded}
                    active={activeAreaKey === area.key}
                    title={area.description}
                    onClick={() => navigate(area.path)}
                  />
                  {expanded && hasChildren && (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); toggleArea(area.key); }}
                      title={areaOpen ? `收起${area.label}` : `展开${area.label}`}
                      aria-label={areaOpen ? `收起${area.label}` : `展开${area.label}`}
                      aria-expanded={areaOpen}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[color:var(--sidebar-text-faint)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]"
                    >
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', areaOpen && 'rotate-180')} />
                    </button>
                  )}
                  <AnimatePresence initial={false}>
                    {expanded && hasChildren && areaOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        {area.children.map((child) => (
                          <SideSubItem
                            key={`${area.key}-${child.key}`}
                            item={child}
                            active={isActive(child)}
                            onClick={() => navigate(child.path)}
                          />
                        ))}
                        {area.key === 'editor' && (
                          <>
                            <div className="mx-3 my-1 border-t border-[color:var(--hairline-inner)]" />
                            <EditorRecentList onGo={(item) => navigate(item.path, { state: item.state })} />
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* 底部：当前文件库（客户端）+ 主题（弹层）+ 设置 */}
          <div className="mt-auto pt-2 border-t border-[color:var(--border-subtle)] flex flex-col gap-0.5">
            <VaultSwitcher expanded={expanded} />
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
          {(activeChrome.actions || activeChrome.leftActions) && (
            <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-chrome/60 backdrop-blur-sm z-40">
              <div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">{activeChrome.leftActions}</div>
                <div className="flex items-center gap-2 flex-wrap justify-end">{activeChrome.actions}</div>
              </div>
            </div>
          )}
          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">
            <Suspense fallback={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }>
              <motion.div
                key={`${location.key}:${location.pathname}${location.search}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                className="h-full"
              >
                {content}
              </motion.div>
            </Suspense>
          </main>
        </div>
      </div>

      {/* ===== 状态栏（10.1-A6：ST 接入与数据占用挪设置页，这里只留环境+版本） ===== */}
      <footer className="h-[26px] shrink-0 bg-chrome border-t border-[color:var(--border-subtle)] flex items-center justify-between px-3.5 text-[11px] text-[color:var(--text-muted)]">
        <span className="truncate">{client ? '客户端' : '网页版 · 数据保存在浏览器本地'}</span>
        <span className="shrink-0">STE {APP_VERSION}</span>
      </footer>
      </div>
    </LayoutContext.Provider>
  );
}

export function AppLayout(props: AppLayoutProps) {
  const layout = useContext(LayoutContext);
  if (layout) return <PageChromeBridge {...props} layout={layout} />;
  return <PersistentAppLayout {...props} />;
}
