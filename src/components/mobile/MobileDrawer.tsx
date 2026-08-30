/**
 * 左侧滑出抽屉（移动端适配 P0）：承载当前页面的二级导航。
 *
 * 三段结构，从上到下：
 *   ① 当前一级区域的子界面（NAV_AREAS.children，编辑区七项 / 附属库四项）
 *   ② 页面自带的二级导航（角色库筛选栏、设置页分区、附属库归档分类），由页面
 *      经 AppLayout 的 mobileDrawer 插槽传入
 *   ③ 底部常驻：文件库 / 主题 / 设置——与桌面侧栏底部同一批入口
 *
 * 遮罩、焦点陷阱、Esc 关闭都交给 Radix Dialog（ui/sheet）；这里只补一条左滑关闭。
 */
import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Palette, Wrench } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { VaultSwitcher } from '@/components/vault/VaultSwitcher';
import { cn } from '@/lib/utils';
import { isDrawerCloseSwipe } from '@/lib/mobile-nav';
import { matchesNavDestination, type NavArea, type NavDestination } from '@/lib/navigation-model';
import {
  editorDestinationPath,
  getEditorStoryId,
  matchesEditorStoryNav,
} from '@/lib/editor-story-context';

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前一级区域；不在任何区域内（设置页）时为 undefined */
  area?: NavArea;
  /** 页面自带的二级导航 */
  children?: React.ReactNode;
}

/** 抽屉里的导航行：比桌面侧栏子项更高更宽，满足触控热区 */
function DrawerNavItem({
  item, active, onClick,
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
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-sm transition-colors',
        active
          ? 'bg-[var(--brand-active-bg)] font-medium text-brand'
          : 'text-[color:var(--sidebar-text)] active:bg-[var(--hover-overlay)]',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );
}

export function MobileDrawer({ open, onOpenChange, area, children }: MobileDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const settingsActive = location.pathname.startsWith('/settings');

  const go = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        data-mobile-drawer
        className="flex w-[86vw] max-w-[320px] flex-col gap-0 p-0 sm:max-w-[320px]"
        onTouchStart={(event) => {
          const touch = event.changedTouches[0];
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const touch = event.changedTouches[0];
          touchStart.current = null;
          if (!start || !touch) return;
          if (isDrawerCloseSwipe({ startX: start.x, startY: start.y, endX: touch.clientX, endY: touch.clientY })) {
            onOpenChange(false);
          }
        }}
      >
        <SheetHeader className="shrink-0 border-b border-[color:var(--border-subtle)] px-4 py-3 text-left">
          <SheetTitle className="text-base">{area?.label ?? '导航'}</SheetTitle>
          <SheetDescription className="text-xs">
            {area?.description ?? '当前页面不属于一级区域'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 scrollbar-thin">
          {area && area.children.length > 0 && (
            <div className="mb-2 flex flex-col gap-0.5">
              {area.children.map((child) => (
                <DrawerNavItem
                  key={`${area.key}-${child.key}`}
                  item={child}
                  active={matchesNavDestination(child, location.pathname, location.search)
                    || matchesEditorStoryNav(child.key, location.pathname, location.search)}
                  onClick={() => go(editorDestinationPath(child.key, getEditorStoryId(), child.path))}
                />
              ))}
            </div>
          )}
          {children && (
            <div
              data-mobile-drawer-page-nav
              className={cn(area && area.children.length > 0 && 'border-t border-[color:var(--border-subtle)] pt-2.5')}
            >
              {children}
            </div>
          )}
          {!children && (!area || area.children.length === 0) && (
            <p className="px-2 py-6 text-center text-xs text-[color:var(--text-muted)]">
              这个页面没有二级导航，用底部标签栏切换区域。
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-[color:var(--border-subtle)] px-2.5 py-2">
          <VaultSwitcher expanded />
          <ThemeSwitcher
            side="top"
            trigger={
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-sm text-[color:var(--sidebar-text)] transition-colors active:bg-[var(--hover-overlay)]"
              >
                <Palette className="h-4 w-4 shrink-0 opacity-80" />
                <span className="flex-1">主题</span>
              </button>
            }
          />
          <button
            type="button"
            aria-current={settingsActive ? 'page' : undefined}
            onClick={() => go('/settings')}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-sm transition-colors',
              settingsActive
                ? 'bg-[var(--brand-active-bg)] font-medium text-brand'
                : 'text-[color:var(--sidebar-text)] active:bg-[var(--hover-overlay)]',
            )}
          >
            <Wrench className="h-4 w-4 shrink-0 opacity-80" />
            <span className="flex-1">设置</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

