/**
 * 聊天处理页的故事会话解析与切换行为（阶段 B3）。
 *
 * 原先这个文件只 grep Index.tsx 有没有出现某个变量名——尤其是
 * 「切换故事前重读库内数据」那条，给一个真实丢数据的 bug 补的所谓回归测试
 * 竟然是 expect(page).toContain('fresh = await getArchiveStory(story.id)')，
 * 把变量名从 fresh 改成 latest 就红，把重读整段删掉反而可能不红。
 *
 * 现在改成驱动页面：造一个「列表快照是旧的、库里是新的」的局面，断言 hydrate
 * 出来的是库内数据；读失败时中止切换而不是拿旧快照顶替。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveStory } from '@/types/archive';
import type { ChatMessage } from '@/types/chat';

const getArchiveStory = vi.hoisted(() => vi.fn());
const getAllArchiveStories = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const updateArchiveStory = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));
vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/GuidedTour', () => ({ GuidedTour: () => null }));
vi.mock('@/lib/archive-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/archive-db')>()),
  getArchiveStory,
  getAllArchiveStories,
  updateArchiveStory,
  saveArchiveStory: vi.fn().mockResolvedValue(undefined),
  deleteArchiveStory: vi.fn().mockResolvedValue(undefined),
}));

import Index from '@/pages/Index';
import { setEditorStoryId } from '@/lib/editor-story-context';
import { setTourCompleted } from '@/lib/tour-steps';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 立刻回报一次尺寸，虚拟列表才会渲染内容（沿用 chat-floor-step 的做法） */
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
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

function mkMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'assistant' : 'user',
    content: `第 ${i + 1} 楼`,
  })) as ChatMessage[];
}

function mkStory(id: string, messageCount: number, over: Partial<ArchiveStory> = {}): ArchiveStory {
  return {
    id,
    title: `故事${id}`,
    session: {
      id: `sess_${id}`,
      title: `故事${id}`,
      messages: mkMessages(messageCount),
      character: { name: '角色' },
      user: { name: '用户' },
      createdAt: 1000,
    },
    markers: [],
    favorites: [],
    meta: { modelsUsed: [], playTimeMs: null },
    createdAt: 1000,
    updatedAt: 2000,
    ...over,
  } as unknown as ArchiveStory;
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname}{location.search}</span>;
}

async function renderChat(entry = '/chat') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/chat" element={<><Index /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

/** 工作台标题栏上的「共 N 条消息」，是判断 hydrate 用了哪份数据最稳的可见信号 */
function messageCountLabel(): string {
  const text = container.textContent ?? '';
  return text.match(/共\s*(\d+)\s*条消息/)?.[1] ?? '';
}

const locationText = () => container.querySelector('[data-testid="loc"]')?.textContent ?? '';

async function click(el: Element | null | undefined) {
  await act(async () => { (el as HTMLElement | undefined)?.click(); });
}

/** 空态里未绑定暂存记录的那一行 */
function storyRow(title: string): HTMLElement | null {
  return Array.from(container.querySelectorAll('div'))
    .filter((el) => el.textContent?.includes(title) && el.querySelector('p'))
    .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] as HTMLElement ?? null;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  getArchiveStory.mockReset();
  getAllArchiveStories.mockReset().mockResolvedValue([]);
  updateArchiveStory.mockReset().mockResolvedValue(undefined);
  toast.mockClear();
  // 首次访问会自动塞演示数据并起新手引导，那样就没有空态可点了；这里模拟老用户
  setTourCompleted('home');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('切换故事时的数据来源', () => {
  it('用库内最新数据 hydrate，而不是列表里的陈旧快照', async () => {
    // 路由必须已经指向 s1：handleOpenStory 结尾会 navigate 到同一个 storyId，
    // 若路由发生变化，加载 effect 会重跑并再读一次库，反而把用错快照的痕迹盖掉——
    // 真实的丢数据场景正是「点的就是当前故事、路由不变、effect 不重跑」。
    // 首次读失败留在空态，此时列表快照是 2 楼，库里已经是 5 楼。
    const stale = mkStory('s1', 2);
    const fresh = mkStory('s1', 5);
    getAllArchiveStories.mockResolvedValue([stale]);
    getArchiveStory.mockResolvedValueOnce(null).mockResolvedValue(fresh);
    await renderChat('/chat?storyId=s1');
    expect(messageCountLabel()).toBe('');

    await click(storyRow('故事s1'));
    await act(async () => { await Promise.resolve(); });

    expect(getArchiveStory).toHaveBeenCalledWith('s1');
    expect(messageCountLabel()).toBe('5');
  });

  it('库内读不到时中止切换并明确报错，不拿陈旧快照顶替', async () => {
    const stale = mkStory('s1', 2);
    getAllArchiveStories.mockResolvedValue([stale]);
    getArchiveStory.mockResolvedValue(null);
    await renderChat();

    await click(storyRow('故事s1'));
    await act(async () => { await Promise.resolve(); });

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: '故事读取失败，已取消切换',
      variant: 'destructive',
    }));
    // 仍停在空态，没有用 2 楼的快照打开
    expect(messageCountLabel()).toBe('');
  });

  it('库内读取抛错时同样中止，不把异常吞掉', async () => {
    const stale = mkStory('s1', 2);
    getAllArchiveStories.mockResolvedValue([stale]);
    getArchiveStory.mockRejectedValue(new Error('IndexedDB 挂了'));
    await renderChat();

    await click(storyRow('故事s1'));
    await act(async () => { await Promise.resolve(); });

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: '故事读取失败，已取消切换',
      variant: 'destructive',
    }));
    expect(messageCountLabel()).toBe('');
  });
});

describe('当前故事的解析优先级', () => {
  it('显式 storyId 优先于记忆里的当前故事', async () => {
    setEditorStoryId('remembered');
    getArchiveStory.mockImplementation(async (id: string) =>
      id === 'explicit' ? mkStory('explicit', 4) : mkStory('remembered', 9));

    await renderChat('/chat?storyId=explicit');

    expect(getArchiveStory).toHaveBeenCalledWith('explicit');
    expect(messageCountLabel()).toBe('4');
  });

  it('没有显式 storyId 时用记忆里的当前故事', async () => {
    setEditorStoryId('remembered');
    getArchiveStory.mockImplementation(async (id: string) =>
      id === 'remembered' ? mkStory('remembered', 9) : null);

    await renderChat('/chat');

    expect(getArchiveStory).toHaveBeenCalledWith('remembered');
    expect(messageCountLabel()).toBe('9');
  });

  it('记忆指向的故事已被删除时清掉指针，回到空态而不是空白工作台', async () => {
    setEditorStoryId('gone');
    getArchiveStory.mockResolvedValue(null);

    await renderChat('/chat');

    expect(messageCountLabel()).toBe('');
    expect(localStorage.getItem('ste-current-editor-story-id')).toBeNull();
  });
});

describe('最近故事栏与重置', () => {
  it('最近故事栏只在空态出现，打开故事后让位给工作台', async () => {
    const story = mkStory('s1', 3);
    getAllArchiveStories.mockResolvedValue([story]);
    getArchiveStory.mockResolvedValue(story);

    await renderChat();
    expect(container.querySelector('[aria-label="最近故事"]')).not.toBeNull();

    await click(storyRow('故事s1'));
    await act(async () => { await Promise.resolve(); });

    expect(messageCountLabel()).toBe('3');
    expect(container.querySelector('[aria-label="最近故事"]')).toBeNull();
  });

  it('重置会话把显式 storyId 从路由上清掉，刷新不会复活', async () => {
    const story = mkStory('s1', 3);
    getAllArchiveStories.mockResolvedValue([story]);
    getArchiveStory.mockResolvedValue(story);
    await renderChat('/chat?storyId=s1');
    expect(messageCountLabel()).toBe('3');

    // 「导入」= 重新导入，确认后清空当前会话
    const trigger = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '导入');
    await click(trigger);
    const confirm = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '确认');
    await click(confirm);

    expect(locationText()).toBe('/chat');
    expect(messageCountLabel()).toBe('');
    expect(localStorage.getItem('ste-current-editor-story-id')).toBeNull();
  });
});
