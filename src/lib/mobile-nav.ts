/**
 * 底部标签栏与页面切换动画的纯逻辑（移动端适配 P0）。
 * 信息架构仍以 navigation-model 的 NAV_AREAS 为唯一来源，这里只做「当前在第几个」
 * 和「往哪个方向滑」两件事，便于单测。
 */
import { NAV_AREAS, findNavArea } from '@/lib/navigation-model';

/**
 * 当前路由落在第几个一级区域；不属于任何区域（如 /settings）返回 -1。
 * 判定复用 findNavArea，所以含子项：编辑区的 /worldbook、附属库的 ?tab=preset
 * 都会点亮各自的父 tab，也不会和侧栏的高亮判据分叉。
 */
export function activeAreaIndex(pathname: string, search: string): number {
  const area = findNavArea(pathname, search);
  return area ? NAV_AREAS.indexOf(area) : -1;
}

/**
 * 页面入场滑动方向：+1 = 从右侧滑入（去更靠右的 tab），-1 = 从左侧滑入，0 = 不滑（淡入）。
 * 任一侧不属于一级区域时不滑：从 /settings 回首页给个方向只会让人以为设置也在 tab 里。
 */
export function slideDirection(fromIndex: number, toIndex: number): -1 | 0 | 1 {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return 0;
  return toIndex > fromIndex ? 1 : -1;
}

/** 从屏幕左缘起算多少像素内的按下算作「边缘」，用于右滑开抽屉 */
export const EDGE_SWIPE_ZONE = 28;
/** 触发抽屉开合的最小水平位移 */
export const SWIPE_OPEN_THRESHOLD = 56;
/** 水平位移必须领先垂直位移这么多，才认定为横向手势（否则是在滚页面） */
export const SWIPE_AXIS_MARGIN = 1.4;

export interface SwipeSample {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** 从左缘右滑 = 开抽屉。竖向为主的手势一律不算，避免滚动列表时抽屉乱弹。 */
export function isDrawerOpenSwipe(sample: SwipeSample): boolean {
  const dx = sample.endX - sample.startX;
  const dy = Math.abs(sample.endY - sample.startY);
  return sample.startX <= EDGE_SWIPE_ZONE
    && dx >= SWIPE_OPEN_THRESHOLD
    && dx >= dy * SWIPE_AXIS_MARGIN;
}

/** 在抽屉上左滑 = 关抽屉。 */
export function isDrawerCloseSwipe(sample: SwipeSample): boolean {
  const dx = sample.startX - sample.endX;
  const dy = Math.abs(sample.endY - sample.startY);
  return dx >= SWIPE_OPEN_THRESHOLD && dx >= dy * SWIPE_AXIS_MARGIN;
}

/**
 * 在右侧抽屉上右滑 = 关抽屉。方向与 isDrawerCloseSwipe 相反：
 * 关一个抽屉的手势应该是「把它推回它来的那一边」，左抽屉往左推、右抽屉往右推。
 * 阈值和轴向判定共用同一组常量，两侧手感一致。
 */
export function isRightDrawerCloseSwipe(sample: SwipeSample): boolean {
  const dx = sample.endX - sample.startX;
  const dy = Math.abs(sample.endY - sample.startY);
  return dx >= SWIPE_OPEN_THRESHOLD && dx >= dy * SWIPE_AXIS_MARGIN;
}
