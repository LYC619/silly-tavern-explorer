/**
 * 分享图组件的接线（0901 审查修复）。
 *
 * 守三件在 code review 里发现声明与实现不符的事：
 * 1. 只在 Capacitor 原生壳里出现——桌面端和网页版底栏不该多一个按钮
 * 2. 开合要汇报给调用方（NovelView 靠它暂停工具栏自动收起）
 * 3. 导出失败要弹 toast，不能变成 unhandled rejection
 *
 * 渐变取色和折行是纯函数，在 share-image.test.ts 里守。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareImage } from '@/components/reader/ShareImage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toasts: { variant?: string; description?: string }[] = [];
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: (t: { variant?: string; description?: string }) => { toasts.push(t); } }),
}));

interface CapWin { Capacitor?: { isNativePlatform?: () => boolean } }

function setNative(native: boolean) {
  (window as unknown as CapWin).Capacitor = { isNativePlatform: () => native };
}

let container: HTMLDivElement;
let root: Root;

const PROPS = {
  storyTitle: '测试故事',
  characterName: '阿狸',
  currentFloor: 7,
  currentText: '这是一段用来分享的正文。',
};

beforeEach(() => {
  toasts.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as CapWin).Capacitor;
  vi.restoreAllMocks();
});

describe('分享图 · 环境门控', () => {
  it('非原生壳（桌面端/网页版）什么都不渲染', () => {
    setNative(false);
    act(() => root.render(<ShareImage {...PROPS} />));
    expect(container.querySelector('button')).toBeNull();
  });

  it('Capacitor 原生壳里给出触发按钮', () => {
    setNative(true);
    act(() => root.render(<ShareImage {...PROPS} />));
    expect(container.querySelector('button[aria-label="生成分享图"]')).not.toBeNull();
  });
});

describe('分享图 · 开合汇报', () => {
  it('打开时通知调用方——NovelView 靠这个暂停工具栏自动收起', () => {
    setNative(true);
    const seen: boolean[] = [];
    act(() => root.render(<ShareImage {...PROPS} onOpenChange={(o) => seen.push(o)} />));

    const trigger = container.querySelector('button[aria-label="生成分享图"]') as HTMLButtonElement;
    act(() => trigger.click());

    expect(seen).toEqual([true]);
  });

  it('没给 onOpenChange 也不炸（ReaderView 那边没有自动收起计时器）', () => {
    setNative(true);
    act(() => root.render(<ShareImage {...PROPS} />));
    const trigger = container.querySelector('button[aria-label="生成分享图"]') as HTMLButtonElement;
    expect(() => act(() => trigger.click())).not.toThrow();
  });
});

describe('分享图 · 导出失败', () => {
  it('canvas 导不出时弹错误 toast，而不是静默失败', async () => {
    setNative(true);
    // jsdom 的 toBlob 未实现；给一个直接回 null 的，走「导出失败」那条
    HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) { cb(null); };
    HTMLCanvasElement.prototype.getContext = (() => ({
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {}, fillText() {},
      measureText: (t: string) => ({ width: t.length * 10 }),
      set fillStyle(_v: unknown) {}, set font(_v: unknown) {}, set textBaseline(_v: unknown) {},
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    act(() => root.render(<ShareImage {...PROPS} />));
    const trigger = container.querySelector('button[aria-label="生成分享图"]') as HTMLButtonElement;
    act(() => trigger.click());

    const generate = [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('生成并分享')) as HTMLButtonElement;
    await act(async () => { generate.click(); });

    expect(toasts.some((t) => t.variant === 'destructive' && t.description?.includes('生成失败')))
      .toBe(true);
  });
});
