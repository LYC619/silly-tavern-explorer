/**
 * 视口档位（移动端适配）：<768 移动端 / 768–1024 平板 / ≥1024 桌面。
 *
 * 桌面档必须与适配前逐像素一致，所以这里只提供判据，不提供默认行为——
 * 调用方一律写成「compact 时走新分支，否则走原来那一行」，
 * 不允许把原桌面样式改成 `md:` 前缀再靠断点还原（那样桌面就依赖新写的断点了）。
 *
 * jsdom 默认视口 1024×768 → tier = 'desktop'，所以既有测试全部继续走桌面路径。
 */
import { useEffect, useState } from 'react';

/** 移动端上界（不含）：<768 为移动端 */
export const MOBILE_MAX_WIDTH = 768;
/** 平板上界（不含）：768–1023 为平板，≥1024 为桌面 */
export const DESKTOP_MIN_WIDTH = 1024;

export type ViewportTier = 'mobile' | 'tablet' | 'desktop';

export function viewportTier(width: number): ViewportTier {
  if (width < MOBILE_MAX_WIDTH) return 'mobile';
  if (width < DESKTOP_MIN_WIDTH) return 'tablet';
  return 'desktop';
}

function readTier(): ViewportTier {
  if (typeof window === 'undefined') return 'desktop';
  return viewportTier(window.innerWidth);
}

export interface Viewport {
  tier: ViewportTier;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /**
   * 移动端 + 平板：页面级竖导航（角色库筛选栏、附属库类别栏）改走左侧抽屉。
   * 平板不上底部标签栏——64px 的折叠侧栏在这个宽度还够用，横屏 iPad 上
   * 再占一条底栏是净损失。
   */
  isCompact: boolean;
}

export function useViewport(): Viewport {
  const [tier, setTier] = useState<ViewportTier>(readTier);

  useEffect(() => {
    // 一个 resize 覆盖两个断点，比挂两个 matchMedia 少一半代码。
    const sync = () => setTier(readTier());
    window.addEventListener('resize', sync);
    sync();
    return () => window.removeEventListener('resize', sync);
  }, []);

  return {
    tier,
    isMobile: tier === 'mobile',
    isTablet: tier === 'tablet',
    isDesktop: tier === 'desktop',
    isCompact: tier !== 'desktop',
  };
}
