/**
 * 聊天楼层连续跳转（阶段 B4：修正过度 mock）。
 *
 * 之前这里把 ChatPreview、MessageNavBar 等 8 个子组件全 mock 掉，楼层映射用一个
 * 手写的 Map 顶替——等于只测了 ChatWorkbench 里两个 useState 的加减法，而楼层跳转
 * 恰恰是反复修了四次的地方，真正会错的是「过滤空消息之后，楼层号对应哪一条消息」。
 *
 * 现在只 stub jsdom 缺的 ResizeObserver 与虚拟列表测量，ChatPreview / MessageNavBar
 * 都是真组件，楼层映射由真实过滤逻辑产生。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSession, ExportSettings } from '@/types/chat';

// 只留这几个与楼层无关、且会拖进弹窗/侧栏的重组件
vi.mock('@/components/chat/EditorToolbar', () => ({ EditorToolbar: () => null }));
vi.mock('@/components/chat/ChapterMarkerDialog', () => ({ ChapterMarkerDialog: () => null }));
vi.mock('@/components/chat/MessageEditDialog', () => ({ MessageEditDialog: () => null }));
vi.mock('@/components/chat/RegexSidebar', () => ({ RegexSidebar: () => null }));
vi.mock('@/components/chat/SettingsPanel', () => ({ SettingsPanel: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { ChatWorkbench } from '@/components/chat/ChatWorkbench';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 立刻回报一次尺寸：虚拟列表靠它拿到滚动容器大小 */
class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: target.getBoundingClientRect() } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

function mkMessage(index: number, over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m${index}`,
    role: index % 2 === 0 ? 'assistant' : 'user',
    content: `第 ${index} 楼`,
    ...over,
  } as ChatMessage;
}

function mkSession(messages: ChatMessage[]): ChatSession {
  return {
    id: 'floor-session',
    title: '楼层测试',
    messages,
    character: { name: '角色' },
    user: { name: '用户' },
    createdAt: 1,
  };
}

const settings: ExportSettings = {
  theme: 'minimal',
  showTimestamp: false,
  showAvatar: false,
  paperWidth: 720,
  fontSize: 16,
  prefixMode: 'name',
  regexRules: [],
  cleanPluginCache: false,
  exportRange: 'all',
  recentCount: 20,
  customStart: 0,
  customEnd: 2,
};

let container: HTMLDivElement;
let root: Root;

async function renderWorkbench(session: ChatSession) {
  await act(async () => {
    root.render(
      <ChatWorkbench
        session={session}
        markers={[]}
        favorites={[]}
        settings={settings}
        onFavoritesChange={vi.fn()}
        onSettingsChange={vi.fn()}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

const nextButton = () => document.querySelector<HTMLButtonElement>('[aria-label="下一楼"]');
const prevButton = () => document.querySelector<HTMLButtonElement>('[aria-label="上一楼"]');
const floorInput = () => document.querySelector<HTMLInputElement>('[aria-label="跳转到楼层"]');

/** 跳转条右下角的「/ N」是过滤后的最大楼层号 */
function maxFloorLabel(): string {
  const label = Array.from(document.querySelectorAll('span'))
    .map((s) => s.textContent?.trim() ?? '')
    .find((text) => /^\/\s*\d+$/.test(text));
  return label ?? '';
}

async function click(el: Element | null) {
  await act(async () => { (el as HTMLElement | null)?.click(); });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('聊天楼层连续跳转', () => {
  it('连点下一层能一路推进，不会卡在第一次跳转', async () => {
    await renderWorkbench(mkSession([0, 1, 2].map((i) => mkMessage(i))));

    expect(floorInput()?.value).toBe('0');

    await click(nextButton());
    expect(floorInput()?.value).toBe('1');

    await click(nextButton());
    expect(floorInput()?.value).toBe('2');
  });

  it('上一层同样连续，并在第 0 层停住', async () => {
    await renderWorkbench(mkSession([0, 1, 2].map((i) => mkMessage(i))));

    await click(nextButton());
    await click(nextButton());
    expect(floorInput()?.value).toBe('2');

    await click(prevButton());
    expect(floorInput()?.value).toBe('1');

    await click(prevButton());
    expect(floorInput()?.value).toBe('0');
    expect(prevButton()?.disabled).toBe(true);
  });

  it('到最后一层后下一层禁用，点不出越界楼层', async () => {
    await renderWorkbench(mkSession([0, 1].map((i) => mkMessage(i))));

    await click(nextButton());

    expect(floorInput()?.value).toBe('1');
    expect(nextButton()?.disabled).toBe(true);
  });

  it('楼层总数按过滤后的消息算：空消息不占楼层', async () => {
    const withEmpty = mkSession([
      mkMessage(0),
      mkMessage(1, { content: '   ' }),
      mkMessage(2),
      mkMessage(3),
    ]);
    await renderWorkbench(withEmpty);

    // 4 条消息里有 1 条是空的 → 最大楼层号是 2 而不是 3
    expect(maxFloorLabel()).toBe('/ 2');

    await click(nextButton());
    await click(nextButton());
    expect(floorInput()?.value).toBe('2');
    expect(nextButton()?.disabled).toBe(true);
  });

  it('只有一条消息时两端都禁用', async () => {
    await renderWorkbench(mkSession([mkMessage(0)]));

    expect(prevButton()?.disabled).toBe(true);
    expect(nextButton()?.disabled).toBe(true);
  });
});
