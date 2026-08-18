import { describe, expect, it } from 'vitest';
import {
  REVEAL_GAP,
  calculateSearchRevealScrollTop,
  cycleSearchPosition,
  floorJudgementLine,
  resolveTopVisibleIndex,
} from '@/lib/chat-navigation';

describe('聊天正文搜索导航', () => {
  it('单个命中重复向下或向上时仍返回可执行的同一目标', () => {
    expect(cycleSearchPosition(-1, 1, 1)).toBe(0);
    expect(cycleSearchPosition(0, 1, 1)).toBe(0);
    expect(cycleSearchPosition(0, 1, -1)).toBe(0);
  });

  it('多个命中首尾循环，不依赖 React 状态值是否发生变化', () => {
    expect(cycleSearchPosition(-1, 3, 1)).toBe(0);
    expect(cycleSearchPosition(2, 3, 1)).toBe(0);
    expect(cycleSearchPosition(-1, 3, -1)).toBe(2);
    expect(cycleSearchPosition(0, 3, -1)).toBe(2);
  });

  it('把楼层内的实际高亮词放到置顶工具栏下方，而不是只定位整层', () => {
    expect(calculateSearchRevealScrollTop({
      scrollTop: 300,
      containerTop: 100,
      targetTop: 118,
      stickyOffset: 80,
      gap: 12,
    })).toBe(226);

    expect(calculateSearchRevealScrollTop({
      scrollTop: 300,
      containerTop: 100,
      targetTop: 420,
      stickyOffset: 80,
      gap: 12,
    })).toBe(528);
  });
});

describe('顶部可见楼层判定', () => {
  // 视口坐标系（getBoundingClientRect），与跳转落点校正同源；容器顶固定在 100
  const CONTAINER_TOP = 100;

  it('命令跳转落点：上一行只剩 gap 尾巴留在顶端时，判定为目标行而非上一行', () => {
    // 落点把 1 楼顶边对齐到 容器顶+gap → 0 楼底边也停在同一位置
    const line = floorJudgementLine(CONTAINER_TOP, 0);
    const rows = [
      { index: 0, bottom: CONTAINER_TOP + REVEAL_GAP },
      { index: 1, bottom: CONTAINER_TOP + REVEAL_GAP + 200 },
    ];
    expect(resolveTopVisibleIndex(rows, line, 0)).toBe(1);
  });

  it('阅读模式 sticky 遮挡下同样与落点自洽', () => {
    const sticky = 80;
    const line = floorJudgementLine(CONTAINER_TOP, sticky);
    const rows = [
      { index: 0, bottom: CONTAINER_TOP + sticky + REVEAL_GAP },
      { index: 1, bottom: CONTAINER_TOP + sticky + REVEAL_GAP + 200 },
    ];
    expect(resolveTopVisibleIndex(rows, line, 0)).toBe(1);
  });

  it('容忍亚像素误差：底边越线不足 1px 仍算已滚过', () => {
    const line = floorJudgementLine(CONTAINER_TOP, 0);
    const rows = [
      { index: 0, bottom: CONTAINER_TOP + REVEAL_GAP + 0.5 },
      { index: 1, bottom: CONTAINER_TOP + REVEAL_GAP + 200 },
    ];
    expect(resolveTopVisibleIndex(rows, line, 0)).toBe(1);
  });

  it('列表顶部返回首行；空行集返回 fallback', () => {
    const line = floorJudgementLine(CONTAINER_TOP, 0);
    const rows = [
      { index: 0, bottom: CONTAINER_TOP + 200 },
      { index: 1, bottom: CONTAINER_TOP + 400 },
    ];
    expect(resolveTopVisibleIndex(rows, line, -1)).toBe(0);
    expect(resolveTopVisibleIndex([], line, -1)).toBe(-1);
  });
});
