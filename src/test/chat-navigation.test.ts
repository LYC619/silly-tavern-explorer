import { describe, expect, it } from 'vitest';
import {
  REVEAL_GAP,
  calculateSearchRevealScrollTop,
  cycleSearchPosition,
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
  // 三行虚拟行：行高 200，列表前有 100px 标题（scrollMargin 已计入 start/end）
  const rows = [
    { index: 0, end: 300 },
    { index: 1, end: 500 },
    { index: 2, end: 700 },
  ];

  it('命令跳转落点处上一行只剩 gap 尾巴时，判定为目标行而非上一行', () => {
    // 跳到 1 楼后 reveal 校正：scrollOffset = start1 - sticky - gap
    const sticky = 0;
    const scrollOffset = 300 - sticky - REVEAL_GAP;
    // 旧逻辑 range.startIndex 会给 0（0 楼尾巴仍在视口顶端），形成"只能动一次"死循环
    expect(resolveTopVisibleIndex(rows, scrollOffset, sticky, 0)).toBe(1);
  });

  it('阅读模式 sticky 遮挡下同样与落点自洽', () => {
    const sticky = 80;
    const scrollOffset = 300 - sticky - REVEAL_GAP;
    expect(resolveTopVisibleIndex(rows, scrollOffset, sticky, 0)).toBe(1);
  });

  it('容忍亚像素测量误差：底边只越线不足 1px 仍算已滚过', () => {
    expect(resolveTopVisibleIndex(rows, 300 - REVEAL_GAP - 0.5, 0, 0)).toBe(1);
  });

  it('列表顶部与空列表', () => {
    expect(resolveTopVisibleIndex(rows, 0, 0, -1)).toBe(0);
    expect(resolveTopVisibleIndex([], 0, 0, -1)).toBe(-1);
  });
});
