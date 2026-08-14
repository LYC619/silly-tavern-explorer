export type SearchDirection = -1 | 1;

/**
 * 计算循环搜索的下一位置。位置值只描述“当前第几个命中”，滚动动作由调用方每次单独执行；
 * 因此即使唯一命中循环后仍是 0，也不会被 React 的相同状态优化吞掉交互。
 */
export function cycleSearchPosition(
  current: number,
  count: number,
  direction: SearchDirection,
): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return direction > 0 ? 0 : count - 1;
  return (current + direction + count) % count;
}

interface SearchRevealMetrics {
  scrollTop: number;
  containerTop: number;
  targetTop: number;
  stickyOffset: number;
  gap?: number;
}

/** 把实际搜索高亮放到 sticky 控件下方，并留一小段呼吸空间。 */
export function calculateSearchRevealScrollTop({
  scrollTop,
  containerTop,
  targetTop,
  stickyOffset,
  gap = 12,
}: SearchRevealMetrics): number {
  return Math.max(0, Math.round(scrollTop + targetTop - containerTop - stickyOffset - gap));
}
