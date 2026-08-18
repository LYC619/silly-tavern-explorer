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

/** 跳转落点在 sticky 遮挡线下方保留的呼吸空间；也是楼层判定线的偏移，两者必须共用。 */
export const REVEAL_GAP = 12;

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
  gap = REVEAL_GAP,
}: SearchRevealMetrics): number {
  return Math.max(0, Math.round(scrollTop + targetTop - containerTop - stickyOffset - gap));
}

interface VirtualRowEdge {
  index: number;
  /** 行底边在滚动内容坐标系中的位置（含 scrollMargin），与 virtualizer 的 item.end 同源。 */
  end: number;
}

/**
 * 求"当前顶部楼层"：第一个底边越过楼层判定线（sticky 遮挡 + REVEAL_GAP + 1px 亚像素容差）的行。
 * 不能直接用 virtualizer.range.startIndex：命令跳转把目标行顶边对齐到判定线，上一行尾部
 * 恒有 gap 高度留在视口顶端，startIndex 会报成 target-1，把乐观更新的楼层计数打回去，
 * 造成"下一层只能动一次、计数停在 0"。判定线与落点同线后，被动上报与跳转目标自洽。
 */
export function resolveTopVisibleIndex(
  rows: readonly VirtualRowEdge[],
  scrollOffset: number,
  stickyOffset: number,
  fallback: number,
): number {
  const threshold = scrollOffset + stickyOffset + REVEAL_GAP + 1;
  for (const row of rows) {
    if (row.end > threshold) return row.index;
  }
  return fallback;
}
