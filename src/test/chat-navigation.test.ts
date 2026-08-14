import { describe, expect, it } from 'vitest';
import {
  calculateSearchRevealScrollTop,
  cycleSearchPosition,
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
