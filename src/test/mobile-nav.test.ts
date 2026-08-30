/**
 * 移动端导航的纯逻辑：tab 索引判定、入场滑动方向、抽屉手势阈值。
 * 这三样都不碰 DOM，所以直接按函数测；壳层的渲染分支由 app-layout-navigation 覆盖。
 */
import { describe, expect, it } from 'vitest';
import {
  EDGE_SWIPE_ZONE,
  SWIPE_OPEN_THRESHOLD,
  activeAreaIndex,
  isDrawerCloseSwipe,
  isDrawerOpenSwipe,
  slideDirection,
} from '@/lib/mobile-nav';
import { MOBILE_MAX_WIDTH, DESKTOP_MIN_WIDTH, viewportTier } from '@/hooks/use-viewport';

describe('视口档位', () => {
  it('按 768 / 1024 两条断点分三档，边界归上一档', () => {
    expect(viewportTier(390)).toBe('mobile');
    expect(viewportTier(MOBILE_MAX_WIDTH - 1)).toBe('mobile');
    expect(viewportTier(MOBILE_MAX_WIDTH)).toBe('tablet');
    expect(viewportTier(DESKTOP_MIN_WIDTH - 1)).toBe('tablet');
    expect(viewportTier(DESKTOP_MIN_WIDTH)).toBe('desktop');
    expect(viewportTier(1920)).toBe('desktop');
  });

  it('jsdom 默认视口是桌面档——既有测试全部继续走适配前的路径', () => {
    expect(viewportTier(window.innerWidth)).toBe('desktop');
  });
});

describe('一级区域索引', () => {
  it('四个一级入口各归各位', () => {
    expect(activeAreaIndex('/', '')).toBe(0);
    expect(activeAreaIndex('/library', '')).toBe(1);
    expect(activeAreaIndex('/chat', '')).toBe(2);
    expect(activeAreaIndex('/assets', '?tab=worldbook')).toBe(3);
  });

  it('子界面点亮父 tab', () => {
    // 编辑区：独立路由的和挂 ?focus= 的都要落在编辑区
    expect(activeAreaIndex('/worldbook', '')).toBe(2);
    expect(activeAreaIndex('/card-viewer', '')).toBe(2);
    expect(activeAreaIndex('/tools', '?focus=summary')).toBe(2);
    // 角色详情页归角色库
    expect(activeAreaIndex('/character/abc', '')).toBe(1);
    // 附属库换 tab 不改一级归属
    expect(activeAreaIndex('/assets', '?tab=preset')).toBe(3);
  });

  it('不属于任何区域的路由返回 -1（设置页四个 tab 都不该亮）', () => {
    expect(activeAreaIndex('/settings', '')).toBe(-1);
    expect(activeAreaIndex('/settings/data', '')).toBe(-1);
  });
});

describe('入场滑动方向', () => {
  it('往右边的 tab 去就从右侧滑入，反之从左侧', () => {
    expect(slideDirection(0, 2)).toBe(1);
    expect(slideDirection(3, 1)).toBe(-1);
  });

  it('同一个 tab 内换子界面不滑', () => {
    expect(slideDirection(2, 2)).toBe(0);
  });

  it('任一侧不属于一级区域时不滑', () => {
    // 从设置页回首页给方向，只会让人以为设置也在 tab 序列里
    expect(slideDirection(-1, 0)).toBe(0);
    expect(slideDirection(1, -1)).toBe(0);
  });
});

describe('抽屉手势', () => {
  it('从左缘足够远地右滑 = 开抽屉', () => {
    expect(isDrawerOpenSwipe({ startX: 8, startY: 300, endX: 8 + SWIPE_OPEN_THRESHOLD, endY: 304 })).toBe(true);
  });

  it('起点不在左缘不算——列表里横滑卡片不该弹抽屉', () => {
    expect(isDrawerOpenSwipe({
      startX: EDGE_SWIPE_ZONE + 20, startY: 300, endX: EDGE_SWIPE_ZONE + 200, endY: 300,
    })).toBe(false);
  });

  it('滑得不够远不算', () => {
    expect(isDrawerOpenSwipe({ startX: 6, startY: 300, endX: 6 + SWIPE_OPEN_THRESHOLD - 10, endY: 300 })).toBe(false);
  });

  it('竖向为主的手势不算——滚长列表时抽屉不能乱弹', () => {
    expect(isDrawerOpenSwipe({ startX: 6, startY: 500, endX: 6 + SWIPE_OPEN_THRESHOLD, endY: 200 })).toBe(false);
  });

  it('在抽屉上左滑 = 关抽屉，方向相反的不算', () => {
    expect(isDrawerCloseSwipe({ startX: 300, startY: 200, endX: 300 - SWIPE_OPEN_THRESHOLD, endY: 205 })).toBe(true);
    expect(isDrawerCloseSwipe({ startX: 300, startY: 200, endX: 300 + SWIPE_OPEN_THRESHOLD, endY: 205 })).toBe(false);
    expect(isDrawerCloseSwipe({ startX: 300, startY: 500, endX: 300 - SWIPE_OPEN_THRESHOLD, endY: 100 })).toBe(false);
  });
});
