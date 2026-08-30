/**
 * 底部标签栏（移动端适配 P0）：常驻四个一级入口，来源就是 NAV_AREAS 的四个区域，
 * 不额外维护第二份信息架构。设置不在这里——它不是一级区域，入口在左侧抽屉底部，
 * 与桌面侧栏的位置一致。全屏阅读层挂载时整条隐藏（沉浸态）。
 */
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV_AREAS, type NavAreaKey } from '@/lib/navigation-model';
import { activeAreaIndex } from '@/lib/mobile-nav';

interface MobileTabBarProps {
  /** 与桌面侧栏共用：点 tab 时顺带展开该区域的子导航开关 */
  onActivateArea: (key: NavAreaKey, path: string) => void;
}

export function MobileTabBar({ onActivateArea }: MobileTabBarProps) {
  const { pathname, search } = useLocation();
  const activeIndex = activeAreaIndex(pathname, search);
  /** 设置页不属于任何一级区域，四个 tab 都不该亮 */
  const outsideAreas = pathname.startsWith('/settings');

  return (
    <nav
      data-mobile-tab-bar
      aria-label="主导航"
      className="shrink-0 border-t border-[color:var(--border-subtle)] bg-chrome pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch">
        {NAV_AREAS.map((area, index) => {
          const Icon = area.icon;
          const active = !outsideAreas && index === activeIndex;
          return (
            <button
              key={area.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              title={area.description}
              onClick={() => onActivateArea(area.key, area.path)}
              className={cn(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors',
                active
                  ? 'text-brand'
                  : 'text-[color:var(--sidebar-text-muted)] active:bg-[var(--hover-overlay)]',
              )}
            >
              {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-accent" />}
              <Icon className="h-[22px] w-[22px] shrink-0" />
              <span className="max-w-full truncate text-[11px] leading-none">{area.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
