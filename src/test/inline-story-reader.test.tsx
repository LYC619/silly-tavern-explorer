/**
 * 角色卡页内嵌阅读器（阶段 B3）。
 *
 * 原先 embedded-reader.test.ts 用 grep 比「readerStickyTop={readerHeaderHeight}」
 * 「{novelOpen ? (」这类源码片段。真正要保的是两件事：
 * 1. 置顶栏一层套一层，跳转条落在阅读顶栏 + 工具栏之下，而不是被盖住；
 * 2. 小说视图是就地替换正文，不是追加到长聊天底部。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveStory } from '@/types/archive';

const stored = vi.hoisted(() => ({ story: null as ArchiveStory | null }));
/** toast 必须跨渲染稳定：InlineStoryReader 的加载 effect 把它列进依赖，
 *  每次渲染换一个新函数会让 effect 无限重跑（第一版测试就卡死在这里）。 */
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/archive-db', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/archive-db')>()),
  getArchiveStory: vi.fn(async () => stored.story),
  updateArchiveStory: vi.fn(async () => stored.story),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
// 与置顶偏移无关、会拖进弹窗/侧栏的重组件
vi.mock('@/components/chat/EditorToolbar', () => ({ EditorToolbar: () => null }));
vi.mock('@/components/chat/ChapterMarkerDialog', () => ({ ChapterMarkerDialog: () => null }));
vi.mock('@/components/chat/MessageEditDialog', () => ({ MessageEditDialog: () => null }));
vi.mock('@/components/chat/RegexSidebar', () => ({ RegexSidebar: () => null }));
vi.mock('@/components/chat/SettingsPanel', () => ({ SettingsPanel: () => null }));

import { InlineStoryReader } from '@/components/character/InlineStoryReader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HEADER_HEIGHT = 40;
const TOOLBAR_HEIGHT = 48;
/** ChatWorkbench 给跳转条留的固定间隙 */
const CHROME_GAP = 8;

const rect = (height: number): DOMRect => ({
  top: 0, height, bottom: height, left: 0, right: 800, width: 800, x: 0, y: 0, toJSON: () => ({}),
}) as DOMRect;

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const box = target.getBoundingClientRect();
    this.callback(
      [{ target, contentRect: box, borderBoxSize: [{ inlineSize: box.width, blockSize: box.height }] } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement;
let root: Root;

const makeStory = (): ArchiveStory => ({
  id: 'story-1',
  title: '内嵌阅读的故事',
  session: {
    id: 's1', title: '内嵌阅读的故事', createdAt: 1,
    character: { name: '角色' }, user: { name: '用户' },
    messages: Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'user' : 'assistant', content: `第 ${i} 楼正文` })),
  },
  markers: [],
  favorites: [],
  meta: { modelsUsed: [], playTimeMs: null },
  createdAt: 1,
  updatedAt: 1,
} as unknown as ArchiveStory);

async function render() {
  await act(async () => {
    root.render(
      <InlineStoryReader
        storyId="story-1"
        stories={[stored.story!]}
        onSwitchStory={vi.fn()}
        onBack={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

const navBar = () => container.querySelector<HTMLElement>('[aria-label="上一楼"]')?.closest<HTMLElement>('div[style]');
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.includes(label));
  if (!found) throw new Error(`找不到「${label}」`);
  return found;
};

beforeEach(() => {
  stored.story = makeStory();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    if (el.hasAttribute('data-reader-header')) return rect(HEADER_HEIGHT);
    if (el.hasAttribute('data-chat-toolbar')) return rect(TOOLBAR_HEIGHT);
    return rect(0);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('内嵌阅读器的置顶层叠', () => {
  it('跳转条落在阅读顶栏与工具栏之下，用的都是实测高度', async () => {
    await render();

    expect(container.querySelector('[data-reader-header]')).not.toBeNull();
    expect(navBar()!.style.top).toBe(`${HEADER_HEIGHT + TOOLBAR_HEIGHT + CHROME_GAP}px`);
  });
});

describe('内嵌小说视图', () => {
  it('小说视图就地替换正文，不追加到长聊天底部', async () => {
    await render();
    expect(container.querySelector('[data-chat-preview-shell]')).not.toBeNull();

    await act(async () => { button('小说视图').click(); });

    expect(container.querySelector('[data-novel-spread="true"]')).not.toBeNull();
    expect(container.querySelector('[data-chat-preview-shell]')).toBeNull();
  });

  it('内嵌的小说视图不铺满整个视口，阅读顶栏还在', async () => {
    await render();
    await act(async () => { button('小说视图').click(); });

    const novelRoot = container.querySelector('[data-novel-surface]')!.parentElement!;
    expect(novelRoot.className).not.toContain('fixed');
    expect(container.textContent).toContain('在编辑器中打开');
  });

  it('退出小说视图回到聊天正文', async () => {
    await render();
    await act(async () => { button('小说视图').click(); });

    const close = container.querySelector<HTMLElement>('[aria-label="退出小说视图"]');
    await act(async () => { close?.click(); });

    expect(container.querySelector('[data-chat-preview-shell]')).not.toBeNull();
    expect(container.querySelector('[data-novel-spread="true"]')).toBeNull();
  });
});
