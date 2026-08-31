/**
 * 故事工作区的窄屏布局（<1024px）。
 *
 * 桌面档的视图分发由 story-workspace-views.test.tsx 守着，这里只验窄屏那套：
 * 宽二级栏不渲染、六个视图进左抽屉插槽、分支/章节进右抽屉插槽、
 * 主区不再带比视口宽的 min-w。
 *
 * AppLayout 在这里不是整体 stub 成透传：那样两个抽屉插槽会被丢掉，
 * 测不到「东西到底进没进抽屉」。这个 mock 把插槽也画出来，各带一个 data 标记。
 */
import { act, forwardRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveStory } from '@/types/archive';
import type { MobileContextDrawerSlot } from '@/components/AppLayout';

const stored = vi.hoisted(() => ({ story: null as ArchiveStory | null }));

vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children, mobileDrawer, mobileContextDrawer }: {
    children?: React.ReactNode;
    mobileDrawer?: React.ReactNode;
    mobileContextDrawer?: MobileContextDrawerSlot;
  }) => (
    <div>
      {mobileDrawer && <div data-testid="left-drawer-slot">{mobileDrawer}</div>}
      {mobileContextDrawer && (
        <div data-testid="right-drawer-slot" data-title={mobileContextDrawer.title}>
          {mobileContextDrawer.content}
        </div>
      )}
      {children}
    </div>
  ),
}));
vi.mock('@/lib/archive-db', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/archive-db')>()),
  getArchiveStory: vi.fn(async () => stored.story),
  updateArchiveStory: vi.fn(async () => stored.story),
  getCharacter: vi.fn(async () => null),
}));
vi.mock('@/components/chat/ChatWorkbench', () => ({
  ChatWorkbench: forwardRef<unknown, Record<string, unknown>>(function MockWorkbench(_props, _ref) {
    return <div data-testid="view-read" />;
  }),
}));
vi.mock('@/components/workspace/BranchPanel', () => ({
  BranchPanel: () => <div data-testid="branch-panel" />,
}));
vi.mock('@/components/workspace/OutlinePanel', () => ({
  OutlinePanel: () => <div data-testid="outline-panel" />,
}));
vi.mock('@/components/organize/SummaryWorkspace', () => ({
  SummaryWorkspace: () => <div data-testid="view-summary" />,
}));
vi.mock('@/components/organize/StoryTreeWorkspace', () => ({
  StoryTreeWorkspace: () => <div data-testid="view-tree" />,
}));
vi.mock('@/components/workspace/IOPanel', () => ({ IOPanel: () => <div data-testid="view-io" /> }));
vi.mock('@/components/workspace/STUpdateHint', () => ({ STUpdateHint: () => null }));
vi.mock('@/components/chat/BindStoryDialog', () => ({ BindStoryDialog: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import StoryWorkspace from '@/pages/StoryWorkspace';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const MOBILE_WIDTH = 390;
let originalWidth: number;
let container: HTMLDivElement;
let root: Root;

const makeStory = (characterId?: string): ArchiveStory => ({
  id: 'story-1',
  title: '测试故事',
  characterId,
  session: {
    id: 's1', title: '测试故事', createdAt: 1,
    messages: [{ id: 'm1', role: 'assistant', content: '内容' }],
    character: { name: '角' }, user: { name: '用' },
  },
  markers: [],
  favorites: [],
  meta: { modelsUsed: [], playTimeMs: null },
  createdAt: 1,
  updatedAt: 1,
} as unknown as ArchiveStory);

async function renderAt(entry: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/story/:id" element={<StoryWorkspace />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

const buttonByText = (label: string, scope: ParentNode = container) =>
  Array.from(scope.querySelectorAll('button')).find((el) => el.textContent?.trim() === label);

beforeEach(() => {
  stored.story = makeStory('char-1');
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

describe('故事工作区窄屏布局', () => {
  it('不渲染宽二级栏，六个视图改由左抽屉插槽承载', async () => {
    await renderAt('/story/story-1');

    // 224px 的二级栏在 390px 视口下没有存在余地
    expect(container.querySelector('aside')).toBeNull();

    const leftSlot = container.querySelector('[data-testid="left-drawer-slot"]');
    expect(leftSlot).not.toBeNull();
    // 六个视图一个不少，都在抽屉里
    for (const label of ['阅读与编辑', '分卷总结', '角色日记', '自定义记录', '故事树', '导入与导出']) {
      expect(buttonByText(label, leftSlot!), `抽屉里缺「${label}」`).toBeTruthy();
    }
  });

  it('分支与章节书签进右抽屉，标题是故事名', async () => {
    await renderAt('/story/story-1');

    const rightSlot = container.querySelector('[data-testid="right-drawer-slot"]');
    expect(rightSlot).not.toBeNull();
    expect(rightSlot!.getAttribute('data-title')).toBe('测试故事');
    expect(rightSlot!.querySelector('[data-testid="branch-panel"]')).not.toBeNull();
    expect(rightSlot!.querySelector('[data-testid="outline-panel"]')).not.toBeNull();
  });

  it('非阅读视图不给右抽屉——分支和书签在总结页没有意义', async () => {
    await renderAt('/story/story-1?view=volume');

    expect(container.querySelector('[data-testid="right-drawer-slot"]')).toBeNull();
    // 左抽屉照旧在，视图之间还得能切
    expect(container.querySelector('[data-testid="left-drawer-slot"]')).not.toBeNull();
  });

  it('窄屏在阅读视图也留上下文条，否则页面上没有返回和故事名', async () => {
    await renderAt('/story/story-1');

    const bar = container.querySelector('[data-organize-context-bar]');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('测试故事');
    // 已经在阅读视图，这个出口按了不会有变化，所以收掉
    expect(buttonByText('阅读与编辑', bar!)).toBeUndefined();
  });

  /**
   * 这条是本文件的要害：溢出的根因就是主区那两处 min-w（24rem / 20rem）
   * 比 390px 视口还宽。注意不能用 querySelectorAll('[class*="min-w-["]')——
   * 属性选择器里的方括号没转义，是非法选择器，会静默匹配不到任何东西，
   * 断言看着绿实际什么都没验（本轮踩过）。改成取全部元素再在 JS 里筛。
   */
  it('主区不留比视口宽的 min-w，否则整页横向溢出', async () => {
    await renderAt('/story/story-1');

    const offenders = Array.from(container.querySelectorAll<HTMLElement>('*'))
      .map((el) => el.className)
      .filter((cls) => typeof cls === 'string' && /min-w-\[(?:1[0-9]|[2-9][0-9])rem\]/.test(cls));
    expect(offenders).toEqual([]);
  });

  it('未绑定故事的绑定入口跟着进抽屉，不随二级栏一起消失', async () => {
    stored.story = makeStory(undefined);
    await renderAt('/story/story-1');

    const leftSlot = container.querySelector('[data-testid="left-drawer-slot"]');
    expect(buttonByText('绑定到角色', leftSlot!)).toBeTruthy();
  });
});
