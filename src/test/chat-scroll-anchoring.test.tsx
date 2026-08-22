/**
 * 聊天正文的滚动锚定：跳转条定位、跳转落点、搜索定位（阶段 B3）。
 *
 * 原先 chat-floor-navigation.test.tsx（16 条）和 embedded-reader.test.ts（33 条）
 * 是读 ChatWorkbench / ChatPreview / MessageNavBar 的源码比字符串——连
 * 「className="sticky self-start」这种半截标签都在断言里。而楼层落点被反复修过
 * 四次，真正会错的是「跳转后目标楼顶有没有被置顶栏盖住」。
 *
 * 这里用真组件跑：只 stub jsdom 缺的几何（getBoundingClientRect / scrollTo /
 * ResizeObserver），跳转条、虚拟列表、正文都是真实渲染。
 */
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVEAL_GAP } from '@/lib/chat-navigation';
import type { ChatMessage, ChatSession, ExportSettings } from '@/types/chat';

// 与楼层定位无关、会拖进弹窗/侧栏的重组件（沿用 chat-floor-step 的边界）
vi.mock('@/components/chat/EditorToolbar', () => ({ EditorToolbar: () => null }));
vi.mock('@/components/chat/ChapterMarkerDialog', () => ({ ChapterMarkerDialog: () => null }));
vi.mock('@/components/chat/MessageEditDialog', () => ({ MessageEditDialog: () => null }));
vi.mock('@/components/chat/RegexSidebar', () => ({ RegexSidebar: () => null }));
vi.mock('@/components/chat/SettingsPanel', () => ({ SettingsPanel: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { ChatWorkbench, type ChatWorkbenchHandle } from '@/components/chat/ChatWorkbench';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWPORT_HEIGHT = 600;
const ROW_HEIGHT = 200;
const TOOLBAR_HEIGHT = 48;
/** ChatWorkbench 给跳转条与落点留的固定间隙（工具栏实高之外） */
const CHROME_GAP = 8;

const rect = (top: number, height: number): DOMRect => ({
  top, height, bottom: top + height, left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => ({}),
}) as DOMRect;

let host: HTMLDivElement;
let root: Root;
let scrollTo: ReturnType<typeof vi.fn>;

/**
 * 造一份可预测的版面：滚动容器 600 高贴在视口顶，每楼 200 高首尾相接。
 * 行的视口坐标 = index * 200 - scrollTop，和真实滚动一致。
 */
function fakeRect(el: Element): DOMRect {
  if (el === host) return rect(0, VIEWPORT_HEIGHT);
  const target = el as HTMLElement;
  if (target.hasAttribute('data-chat-toolbar')) return rect(0, TOOLBAR_HEIGHT);
  const row = target.closest<HTMLElement>('[data-index]');
  if (row) return rect(Number(row.dataset.index) * ROW_HEIGHT - host.scrollTop, ROW_HEIGHT);
  return rect(0, 0);
}

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const box = target.getBoundingClientRect();
    this.callback(
      [{
        target,
        contentRect: box,
        borderBoxSize: [{ inlineSize: box.width, blockSize: box.height }],
      } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const settings: ExportSettings = {
  theme: 'minimal', showTimestamp: false, showAvatar: false, paperWidth: 720, fontSize: 16,
  prefixMode: 'name', regexRules: [], cleanPluginCache: false, exportRange: 'all',
  recentCount: 20, customStart: 0, customEnd: 2,
};

function mkSession(count: number, over: (i: number) => Partial<ChatMessage> = () => ({})): ChatSession {
  return {
    id: 'anchor-session',
    title: '锚定测试',
    createdAt: 1,
    character: { name: '角色' },
    user: { name: '用户' },
    messages: Array.from({ length: count }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'assistant' : 'user',
      content: `第 ${i} 楼正文`,
      ...over(i),
    })) as ChatMessage[],
  };
}

async function renderWorkbench(
  session: ChatSession,
  extra: { readerMode?: boolean; readerStickyTop?: number } = {},
  ref?: React.RefObject<ChatWorkbenchHandle>,
) {
  await act(async () => {
    root.render(
      <ChatWorkbench
        ref={ref}
        session={session}
        markers={[]}
        favorites={[]}
        settings={settings}
        onFavoritesChange={vi.fn()}
        onSettingsChange={vi.fn()}
        {...extra}
      />,
    );
  });
  await flush();
}

/** 落点校正跑在 requestAnimationFrame 里，最多重试 5 帧，这里多放几帧等它跑完 */
async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))); });
  }
}

const shell = () => host.querySelector<HTMLElement>('[data-chat-preview-shell]');
const navBar = () => host.querySelector<HTMLElement>('[aria-label="上一楼"]')?.closest<HTMLElement>('div[style]');
/**
 * 虚拟列表自己也会 scrollTo（按估算高度，落点是 行顶 - scrollPaddingStart），
 * 且会在测量后重试；DOM 实测校正比它多让出一个 REVEAL_GAP。因此只断言「校正值出现过」，
 * 不依赖调用顺序——差的正是那 12px 呼吸间隙，校正没跑就凑不出这个数。
 */
const scrolledTops = () => scrollTo.mock.calls.map((call) => (call[0] as { top: number }).top);
/** 目标行顶 - (阅读栏 + 工具栏实高 + 固定间隙) - 呼吸间隙 */
const revealTop = (floor: number, readerStickyTop = 0) =>
  floor * ROW_HEIGHT - (readerStickyTop + TOOLBAR_HEIGHT + CHROME_GAP) - REVEAL_GAP;

async function click(selector: string) {
  const el = host.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`找不到 ${selector}`);
  await act(async () => { el.click(); });
  await flush();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return fakeRect(this);
  });
  scrollTo = vi.fn();
  host = document.createElement('div');
  host.style.overflowY = 'auto';
  document.body.appendChild(host);
  Object.defineProperty(host, 'scrollTo', { configurable: true, value: scrollTo });
  Object.defineProperty(host, 'scrollTop', { configurable: true, writable: true, value: 0 });
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('楼层跳转条的定位', () => {
  it('挂在正文预览容器内部，用工具栏实测高度做 sticky 偏移', async () => {
    await renderWorkbench(mkSession(6));

    const bar = navBar();
    expect(bar).not.toBeNull();
    expect(shell()?.contains(bar!)).toBe(true);
    // 工具栏实高 48 + 固定间隙 8，而不是 top-10 / top-16 这类固定猜测
    expect(bar!.style.top).toBe(`${TOOLBAR_HEIGHT + CHROME_GAP}px`);
    expect(bar!.className).toContain('sticky');
    expect(bar!.className).not.toContain('fixed');
  });

  it('阅读模式再叠上外层返回栏的实高，逐层偏移', async () => {
    await renderWorkbench(mkSession(6), { readerMode: true, readerStickyTop: 40 });

    expect(navBar()!.style.top).toBe(`${40 + TOOLBAR_HEIGHT + CHROME_GAP}px`);
    expect(shell()?.contains(navBar()!)).toBe(true);
  });

  it('阅读模式收起会话标题统计行，跳转条照旧在阅读器里', async () => {
    await renderWorkbench(mkSession(6), { readerMode: true, readerStickyTop: 40 });

    expect(host.textContent).not.toContain('共 6 楼');
    expect(host.querySelector('[title="点击重命名（标题会自动保存，并用于导出文件名）"]')).toBeNull();
    expect(navBar()).not.toBeNull();
  });
});

describe('楼层跳转的落点', () => {
  it('滚的是最近的滚动容器，不是整个窗口', async () => {
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await renderWorkbench(mkSession(8));
    scrollTo.mockClear();

    await click('[aria-label="下一楼"]');

    expect(scrollTo).toHaveBeenCalled();
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it('落点按目标行实测顶部二次校正，并为置顶栏留出高度', async () => {
    await renderWorkbench(mkSession(8));
    scrollTo.mockClear();

    await click('[aria-label="下一楼"]');

    // 目标是第 1 楼（顶部 200），减掉工具栏 48+8 与呼吸间隙，才不会被盖住半行
    expect(scrolledTops()).toContain(revealTop(1));
  });

  it('阅读模式的落点跟着多让出返回栏的高度', async () => {
    await renderWorkbench(mkSession(8), { readerMode: true, readerStickyTop: 40 });
    scrollTo.mockClear();

    await click('[aria-label="下一楼"]');

    expect(scrolledTops()).toContain(revealTop(1, 40));
  });

  it('收藏跳转走同一条校正路径，不是另一套算法', async () => {
    const ref = createRef<ChatWorkbenchHandle>();
    await renderWorkbench(mkSession(8), {}, ref);
    scrollTo.mockClear();

    await act(async () => { ref.current?.scrollToMessageId('m3'); });
    await flush();

    expect(scrolledTops()).toContain(revealTop(3));
  });
});

describe('搜索定位', () => {
  const searchSession = () => mkSession(8, (i) => (i === 5 ? { content: '这里有关键词' } : {}));

  async function search(text: string) {
    const input = host.querySelector<HTMLInputElement>('[aria-label="搜索消息正文"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
  }

  it('对准楼内实际高亮词，而不是整层顶部', async () => {
    await renderWorkbench(searchSession());
    await search('关键词');
    scrollTo.mockClear();

    await click('[aria-label="下一个命中"]');

    // mark 与所在行同顶（版面桩），落点仍要让出置顶栏
    expect(scrolledTops()).toContain(revealTop(5));
  });

  it('只有一个命中时，反复点下一个每次都重新定位', async () => {
    await renderWorkbench(searchSession());
    await search('关键词');

    await click('[aria-label="下一个命中"]');
    const first = scrollTo.mock.calls.length;
    scrollTo.mockClear();

    await click('[aria-label="下一个命中"]');

    expect(first).toBeGreaterThan(0);
    expect(scrolledTops()).toContain(revealTop(5));
  });

  it('改搜索词只报命中数，不把页面甩到第一个命中', async () => {
    await renderWorkbench(searchSession());
    scrollTo.mockClear();

    await search('关键词');

    expect(scrollTo).not.toHaveBeenCalled();
    // 1 个命中已报出，但尚未定位到任何一个（0/1），要等用户主动按下一个
    expect(host.textContent).toContain('0/1');
  });
});
