/**
 * 小说视图的移动端阅读体验（<768px）。
 *
 * 桌面档的排版和翻页由 novel-view-interaction.test.tsx 守着，这里只验窄屏分支：
 * 单页步进、三分区点击、沉浸态、滚动模式。视口用 innerWidth 造，
 * useViewport 在挂载时读一次就够。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NovelView from '@/components/reader/NovelView';
import { isImmersiveActive } from '@/lib/immersive-mode';
import type { ChatSession } from '@/types/chat';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// jsdom 没有布局，元素滚动是空实现；滚动模式挂载时会调它。
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}

const MOBILE_WIDTH = 390;
let originalWidth: number;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: MOBILE_WIDTH, configurable: true, writable: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true, writable: true });
});

const session: ChatSession = {
  id: 'novel-mobile-session',
  title: '移动端阅读测试',
  messages: [{
    id: 'm0',
    role: 'assistant',
    content: '这是用于分页的完整句子。'.repeat(160),
    rawData: {},
  }],
  character: { name: '角色' },
  user: { name: '用户' },
  createdAt: 1,
};

/** 直接写入持久化的阅读设置：翻页模式 + 提示已看过，省得每个用例点两下 */
function presetOptions(readingMode: 'page' | 'scroll') {
  localStorage.setItem('novel-view-options', JSON.stringify({
    userMode: 'weaken', showHidden: false, sceneGapMinutes: 30, fontSize: 18, readingMode,
  }));
  localStorage.setItem('novel-view-zone-hint-seen', '1');
}

async function renderNovel(options: { embedded?: boolean } = {}) {
  await act(async () => {
    root.render(
      <NovelView
        session={session}
        markers={[]}
        regexRules={[]}
        onClose={vi.fn()}
        readOnly
        embedded={options.embedded ?? false}
      />,
    );
  });
}

/** 三分区按面板自己的宽度算，jsdom 没有布局，得把矩形喂进去 */
function stubSurfaceBounds() {
  const surface = container.querySelector<HTMLElement>('[data-novel-surface]')!;
  surface.getBoundingClientRect = () => ({
    left: 0, right: MOBILE_WIDTH, width: MOBILE_WIDTH, top: 0, bottom: 700, height: 700,
    x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
  return surface;
}

async function tapAt(surface: HTMLElement, clientX: number) {
  await act(async () => {
    surface.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX }));
  });
}

/** 只读进度条那一格：书页角标紧贴在它前面，读整个 container 会拼成 "22 / 15" */
function progressText() {
  return container.querySelector('[data-novel-progress]')!.textContent;
}

describe('小说视图移动端 · 翻页模式', () => {
  beforeEach(() => presetOptions('page'));

  it('一屏一页，进度按单页走而不是跨页', async () => {
    await renderNovel();
    // 桌面是 "1–2 / N"，手机必须是 "1 / N"
    expect(progressText()).toMatch(/^1 \/ \d+$/);
    expect(container.querySelector('[data-novel-spread="single"]')).not.toBeNull();
    expect(container.querySelector('[data-novel-page="single"]')).not.toBeNull();
  });

  it('方向键一次只翻一页，中间那页不会被跳过', async () => {
    await renderNovel();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(progressText()).toMatch(/^2 \/ \d+$/);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(progressText()).toMatch(/^3 \/ \d+$/);
  });

  it('左三分之一点上一页、右三分之一点下一页', async () => {
    await renderNovel();
    const surface = stubSurfaceBounds();

    await tapAt(surface, MOBILE_WIDTH - 20);
    expect(progressText()).toMatch(/^2 \/ \d+$/);

    await tapAt(surface, 20);
    expect(progressText()).toMatch(/^1 \/ \d+$/);
  });

  it('点中间只开关工具栏，不翻页', async () => {
    await renderNovel();
    const surface = stubSurfaceBounds();
    const topBar = () => container.querySelector<HTMLElement>('[data-reader-top-bar]')!;

    // 进来先给一眼工具栏
    expect(topBar().className).not.toContain('-translate-y-full');

    await tapAt(surface, MOBILE_WIDTH / 2);
    expect(progressText()).toMatch(/^1 \/ \d+$/);
    expect(topBar().className).toContain('-translate-y-full');

    await tapAt(surface, MOBILE_WIDTH / 2);
    expect(topBar().className).not.toContain('-translate-y-full');
  });

  it('翻页顺手收掉工具栏，正文不被挡', async () => {
    await renderNovel();
    const surface = stubSurfaceBounds();
    await tapAt(surface, MOBILE_WIDTH - 20);
    expect(container.querySelector('[data-reader-top-bar]')!.className).toContain('-translate-y-full');
    expect(container.querySelector('[data-reader-bottom-bar]')!.className).toContain('translate-y-full');
  });
});

describe('小说视图移动端 · 滚动模式', () => {
  beforeEach(() => presetOptions('scroll'));

  it('正文连续渲染，不再分成书页', async () => {
    await renderNovel();
    expect(container.querySelector('[data-novel-scroll]')).not.toBeNull();
    expect(container.querySelectorAll('[data-novel-scroll-page]').length).toBeGreaterThan(1);
    expect(container.querySelector('[data-novel-spread]')).toBeNull();
  });

  it('滚动模式下点左右两侧也只开关工具栏，不跳页', async () => {
    await renderNovel();
    const surface = stubSurfaceBounds();
    const before = progressText();

    await tapAt(surface, 20);
    expect(progressText()).toBe(before);
    expect(container.querySelector('[data-reader-top-bar]')!.className).toContain('-translate-y-full');
  });
});

describe('小说视图移动端 · 沉浸态', () => {
  beforeEach(() => presetOptions('page'));

  it('全屏时铺满整屏并让外壳收掉导航，卸载后释放', async () => {
    await renderNovel();
    const rootEl = container.firstElementChild as HTMLElement;
    expect(rootEl.className).toContain('inset-0');
    // 手机上外壳的窗口栏已经被收掉，不需要再为它让位
    expect(rootEl.className).not.toContain('top-[var(--app-chrome-h,0px)]');
    expect(isImmersiveActive()).toBe(true);

    await act(async () => root.unmount());
    expect(isImmersiveActive()).toBe(false);
    // afterEach 会再 unmount 一次，重建一个空 root 顶上
    root = createRoot(container);
  });

  it('嵌入模式不算沉浸——角色卡页的外壳还得能用', async () => {
    await renderNovel({ embedded: true });
    expect(isImmersiveActive()).toBe(false);
    expect((container.firstElementChild as HTMLElement).className).not.toContain('fixed');
  });

  it('首次进入给分区提示，点掉后记住', async () => {
    localStorage.removeItem('novel-view-zone-hint-seen');
    await renderNovel();
    const hint = container.querySelector<HTMLElement>('[data-reader-zone-hint]');
    expect(hint).not.toBeNull();

    await act(async () => {
      hint!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-reader-zone-hint]')).toBeNull();
    expect(localStorage.getItem('novel-view-zone-hint-seen')).toBe('1');
  });
});
