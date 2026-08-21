/**
 * 故事工作区的一级视图分发（阶段 B3）。
 *
 * 原先在 legacy-editor-workspace.test.ts 里 grep StoryWorkspace.tsx 有没有
 * 「<SummaryWorkspace」「<StoryTreeWorkspace」这两个字符串。真正要保的是
 * ?view= 打到哪个界面、整理视图不再挂宽二级栏、切换写回 URL。
 *
 * 四个一级界面本身各有自己的测试，这里只 stub 成标记，测的是分发这一层。
 */
import { act, forwardRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveStory } from '@/types/archive';

const stored = vi.hoisted(() => ({ story: null as ArchiveStory | null }));

vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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
vi.mock('@/components/organize/SummaryWorkspace', () => ({
  SummaryWorkspace: ({ kind }: { kind: string }) => <div data-testid="view-summary" data-kind={kind} />,
}));
vi.mock('@/components/organize/StoryTreeWorkspace', () => ({
  StoryTreeWorkspace: () => <div data-testid="view-tree" />,
}));
vi.mock('@/components/workspace/IOPanel', () => ({
  IOPanel: () => <div data-testid="view-io" />,
}));
vi.mock('@/components/workspace/STUpdateHint', () => ({ STUpdateHint: () => null }));
vi.mock('@/components/chat/BindStoryDialog', () => ({ BindStoryDialog: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import StoryWorkspace from '@/pages/StoryWorkspace';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const makeStory = (): ArchiveStory => ({
  id: 'story-1',
  title: '测试故事',
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

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname}{location.search}</span>;
}

async function renderAt(entry: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LocationProbe />
        <Routes>
          <Route path="/story/:id" element={<StoryWorkspace />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

const shown = () =>
  Array.from(container.querySelectorAll('[data-testid^="view-"]')).map((el) => el.getAttribute('data-testid'));
const locationText = () => container.querySelector('[data-testid="loc"]')?.textContent ?? '';
const sideNavButton = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.trim() === label);
  if (!found) throw new Error(`二级栏没有「${label}」`);
  return found;
};

beforeEach(() => {
  stored.story = makeStory();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('故事工作区的 ?view= 分发', () => {
  it('默认进阅读与编辑，宽二级栏在', async () => {
    await renderAt('/story/story-1');

    expect(shown()).toEqual(['view-read']);
    expect(sideNavButton('分卷总结')).toBeTruthy();
  });

  it('三种总结视图都落到总结工作台，并把类型透传下去', async () => {
    for (const kind of ['volume', 'diary', 'diy']) {
      await act(async () => { root.unmount(); });
      root = createRoot(container);
      await renderAt(`/story/story-1?view=${kind}`);

      expect(shown()).toEqual(['view-summary']);
      expect(container.querySelector('[data-testid="view-summary"]')?.getAttribute('data-kind')).toBe(kind);
    }
  });

  it('view=tree 落到故事树，view=io 落到导入导出，互不同屏', async () => {
    await renderAt('/story/story-1?view=tree');
    expect(shown()).toEqual(['view-tree']);

    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await renderAt('/story/story-1?view=io');
    expect(shown()).toEqual(['view-io']);
  });

  it('整理视图收起宽二级栏，改用只带返回的上下文条', async () => {
    await renderAt('/story/story-1?view=volume');

    expect(() => sideNavButton('分卷总结')).toThrow();
    expect(container.querySelector('[data-organize-context-bar]')).not.toBeNull();
  });

  it('在二级栏切视图会写回 URL，刷新后还停在原视图', async () => {
    await renderAt('/story/story-1');

    await act(async () => { sideNavButton('故事树').click(); });

    expect(shown()).toEqual(['view-tree']);
    expect(locationText()).toBe('/story/story-1?view=tree');
  });

  it('无法识别的 view 退回阅读与编辑，不留白页', async () => {
    await renderAt('/story/story-1?view=不存在');

    expect(shown()).toEqual(['view-read']);
  });

  it('故事不存在时给明确的找不到提示，不是空白', async () => {
    stored.story = null;
    await renderAt('/story/missing');

    expect(shown()).toEqual([]);
    expect(container.textContent).toContain('找不到该故事');
  });
});
