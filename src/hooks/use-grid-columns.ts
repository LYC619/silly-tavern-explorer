import { useLayoutEffect, useRef, useState } from 'react';

/**
 * 实测容器宽度，算出 `repeat(auto-fill, minmax(cardWidth, 1fr))` 实际排了几列。
 *
 * 分组视图要「每组两行」，行数 × 列数才是该渲染的张数；而列数是 auto-fill 按容器
 * 宽度现算的，CSS 里拿不到，只能量。窗口缩放、侧栏展开都会改宽度，所以挂 ResizeObserver。
 *
 * 返回 0 表示还没量到（首帧、jsdom 里 clientWidth 恒为 0），调用方据此退回不折叠。
 */
export function useGridColumns(cardWidth: number, gap = 14) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(0);

  // useLayoutEffect：量完在同一帧内改完 state，避免先画满再折叠的闪动
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (width > 0) setCols(Math.max(1, Math.floor((width + gap) / (cardWidth + gap))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardWidth, gap]);

  return { ref, cols };
}
