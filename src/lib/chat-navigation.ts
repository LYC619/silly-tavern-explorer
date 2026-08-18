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
  /** 行底边的视口 Y 坐标（getBoundingClientRect().bottom），与跳转落点校正同源。 */
  bottom: number;
}

/**
 * 楼层判定线（视口坐标系）：容器顶 + sticky 遮挡 + 落点呼吸空间 + 1px 亚像素容差。
 * 判定线必须与 calculateSearchRevealScrollTop 的落点线同源同坐标系：跳转落点是按 DOM
 * 实测校正的，virtualizer 的估算坐标与 DOM 可差数像素，若用它判楼，命令跳转后被动
 * 上报会把楼层打回 target-1，造成"下一层只能动一次、计数停在 0"。
 */
export function floorJudgementLine(containerTop: number, stickyOffset: number): number {
  return containerTop + stickyOffset + REVEAL_GAP + 1;
}

/** 求"当前顶部楼层"：第一个底边越过判定线的行；行按 index 升序传入。 */
export function resolveTopVisibleIndex(
  rows: readonly VirtualRowEdge[],
  judgementLine: number,
  fallback: number,
): number {
  for (const row of rows) {
    if (row.bottom > judgementLine) return row.index;
  }
  return fallback;
}
