import { act } from 'react';
import { useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const collapseSidenav = vi.hoisted(() => vi.fn());
/** 侧栏子项默认折叠，个别用例需要展开后断言高亮，因此让开合状态可控。 */
const navOpen = vi.hoisted(() => ({ editor: false, assets: false }));

vi.mock('@/components/ClientTitleBar', () => ({ ClientTitleBar: () => null }));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => null }));
vi.mock('@/components/GlobalSettings', () => ({ APP_VERSION: 'v0.18.0' }));
vi.mock('@/components/ThemeSwitcher', () => ({
  ThemeSwitcher: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('@/hooks/use-sidenav-state', () => ({
  shouldAutoCollapse: (previous: string, next: string) => previous === '/' && next !== '/',
  useSidenavState: () => ({ expanded: true, toggle: vi.fn(), collapse: collapseSidenav }),
}));
vi.mock('@/lib/vault/tauri-fs', () => ({ isTauri: () => false }));
vi.mock('@/lib/editor-open-state', () => ({
  getEditorOpen: () => navOpen.editor,
  setEditorOpenState: vi.fn(),
}));
vi.mock('@/lib/assets-open-state', () => ({
  getAssetsOpen: () => navOpen.assets,
  setAssetsOpenState: vi.fn(),
}));

vi.mock('@/lib/archive-db', () => ({ getAllArchiveStories: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/regex-db', () => ({ getAllRegexCollections: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/summary-db', () => ({ getAllSummaries: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/story-tree-db', () => ({ getAllStoryTrees: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/card-db', () => ({ getAllCards: vi.fn().mockResolvedValue([]) }));

import { AppLayout } from '@/components/AppLayout';
import { NAV_AREAS } from '@/lib/navigation-model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 从信息架构里取子项，避免测试里硬抄文案 */
function navChild(areaKey: string, childKey: string) {
  const child = NAV_AREAS.find((area) => area.key === areaKey)?.children.find((item) => item.key === childKey);
  if (!child) throw new Error(`导航缺少 ${areaKey}/${childKey}`);
  return child;
}

/** 侧栏子项按 description 渲染成 title，是区分同名「正则」两个落点的唯一稳定标识 */
function sideSubItem(root: ParentNode, areaKey: string, childKey: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`button[title="${navChild(areaKey, childKey).description}"]`);
}

/** 取某个一级区块下真正的子项按钮（排除父行自己和展开箭头） */
function sideSubItems(areaLabel: string): HTMLButtonElement[] {
  const parentRow = Array.from(container.querySelectorAll('[data-nav-parent-row]'))
    .find((row) => row.textContent?.trim() === areaLabel);
  if (!parentRow) throw new Error(`侧栏没有「${areaLabel}」父项`);
  return Array.from(parentRow.parentElement!.querySelectorAll<HTMLButtonElement>('button[title]'))
    .filter((button) => !parentRow.contains(button));
}

function railButton(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-editor-rail] button'))
    .find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`窄工具栏没有「${label}」`);
  return found;
}

function TestPage({ id, target }: { id: string; target: string }) {
  const navigate = useNavigate();
  return (
    <AppLayout leftActions={<span>{id}</span>}>
      <section data-testid={`${id}-page`}>
        <button data-testid={`${id}-navigate`} type="button" onClick={() => navigate(target)}>切换</button>
      </section>
    </AppLayout>
  );
}

function LayoutLocationProbe() {
  const location = useLocation();
  return <span data-testid="layout-location">{location.pathname}{location.search}</span>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  collapseSidenav.mockClear();
  navOpen.editor = false;
  navOpen.assets = false;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('AppLayout route transitions', () => {
  it('编辑区展开后只展示信息架构里的正式子界面，不混入最近处理条目', async () => {
    navOpen.editor = true;
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/chat']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppLayout><LayoutLocationProbe /></AppLayout>
        </MemoryRouter>,
      );
    });

    const expected = NAV_AREAS.find((area) => area.key === 'editor')!.children.map((child) => child.description);
    expect(sideSubItems('编辑区').map((button) => button.getAttribute('title'))).toEqual(expected);
  });

  it('removes the previous route instead of stacking pages in the main scroller', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={['/']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<TestPage id="home" target="/library" />} />
              <Route path="/library" element={<TestPage id="library" target="/" />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[data-testid="home-page"]')).not.toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="home-navigate"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(container.querySelector('[data-testid="library-page"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="home-page"]')).toBeNull();
    expect(container.querySelectorAll('main > div')).toHaveLength(1);
    expect(collapseSidenav).toHaveBeenCalledTimes(1);
  });

  it('同一路径只换 query 参数时页面不重挂，页面内子视图状态得以保留', async () => {
    // 0826 反馈 5：入场动画的 key 里带过 location.key/search，编辑区用 ?view= 切子界面
    // 就会整页重挂——总结页点「查看」闪一下「加载中」又弹回列表就是这么来的。
    let mounts = 0;
    function CountingPage() {
      const [, setSearchParams] = useSearchParams();
      useEffect(() => { mounts += 1; }, []);
      return (
        <AppLayout>
          <button
            data-testid="switch-view"
            type="button"
            onClick={() => setSearchParams((current) => { current.set('view', 'diary'); return current; }, { replace: true })}
          >
            换子视图
          </button>
        </AppLayout>
      );
    }

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/story/st_9?view=volume']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/story/:id" element={<CountingPage />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(mounts).toBe(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="switch-view"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(mounts).toBe(1);
  });

  it('附属库在新会话中默认折叠', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppLayout><LayoutLocationProbe /></AppLayout>
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[aria-label="展开附属库"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="收起附属库"]')).toBeNull();
  });

  it('点击附属库父项时展开子项并进入世界书', async () => {
    localStorage.setItem('ste-assets-nav-open', 'false');
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppLayout><LayoutLocationProbe /></AppLayout>
        </MemoryRouter>,
      );
    });

    const assetsButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '附属库');
    expect(assetsButton).toBeDefined();

    await act(async () => {
      assetsButton?.click();
    });

    expect(container.querySelector('[data-testid="layout-location"]')?.textContent).toBe('/assets?tab=worldbook');
    expect(container.querySelector('[aria-label="收起附属库"]')).not.toBeNull();
  });
});

describe('正则工具页的编辑区落点', () => {
  async function renderAt(path: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppLayout><LayoutLocationProbe /></AppLayout>
        </MemoryRouter>,
      );
    });
  }

  it('停在 /regex 时窄工具栏只高亮「正则」一项', async () => {
    await renderAt('/regex');

    const rail = container.querySelector('[data-editor-rail]');
    expect(rail).not.toBeNull();
    const active = Array.from(rail!.querySelectorAll<HTMLButtonElement>('button[aria-current="page"]'));
    expect(active.map((button) => button.textContent?.trim())).toEqual(['正则']);
  });

  it('侧栏编辑区的「正则」高亮时，附属库的同名「正则」不跟着亮', async () => {
    navOpen.editor = true;
    navOpen.assets = true;
    await renderAt('/regex');

    const editorItem = sideSubItem(container, 'editor', 'regex');
    const assetsItem = sideSubItem(container, 'assets', 'regex');
    expect(editorItem).not.toBeNull();
    expect(assetsItem).not.toBeNull();
    expect(editorItem!.getAttribute('aria-current')).toBe('page');
    expect(assetsItem!.getAttribute('aria-current')).toBeNull();
  });

  it('停在附属库正则资产页时反过来，且不渲染编辑区窄工具栏', async () => {
    navOpen.editor = true;
    navOpen.assets = true;
    await renderAt('/assets?tab=regex');

    const editorItem = sideSubItem(container, 'editor', 'regex');
    const assetsItem = sideSubItem(container, 'assets', 'regex');
    expect(assetsItem!.getAttribute('aria-current')).toBe('page');
    expect(editorItem!.getAttribute('aria-current')).toBeNull();
    expect(container.querySelector('[data-editor-rail]')).toBeNull();
  });

  it('窄工具栏的「正则」进的是工具页，不是资产列表', async () => {
    await renderAt('/chat');

    const button = railButton('正则');
    await act(async () => { button.click(); });

    expect(container.querySelector('[data-testid="layout-location"]')?.textContent).toBe('/regex');
  });
});

describe('编辑区窄工具栏与侧栏共用当前故事', () => {
  async function renderAt(path: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppLayout><LayoutLocationProbe /></AppLayout>
        </MemoryRouter>,
      );
    });
  }
  const location = () => container.querySelector('[data-testid="layout-location"]')?.textContent;

  it('没有当前故事时按各自的兜底落点走', async () => {
    await renderAt('/regex');

    await act(async () => { railButton('聊天处理').click(); });
    expect(location()).toBe('/chat');

    await act(async () => { railButton('总结').click(); });
    expect(location()).toBe('/tools?focus=summary');
  });

  it('有当前故事时深链进这个故事，不再回选择页', async () => {
    localStorage.setItem('ste-current-editor-story-id', 'st_9');
    await renderAt('/regex');

    await act(async () => { railButton('总结').click(); });
    expect(location()).toBe('/story/st_9?view=volume');

    await act(async () => { railButton('故事树').click(); });
    expect(location()).toBe('/story/st_9?view=tree');

    await act(async () => { railButton('聊天处理').click(); });
    expect(location()).toBe('/chat?storyId=st_9');
  });

  it('侧栏子项和窄工具栏用同一个当前故事，不会一个进故事一个进选择页', async () => {
    localStorage.setItem('ste-current-editor-story-id', 'st_9');
    navOpen.editor = true;
    await renderAt('/regex');

    await act(async () => { sideSubItem(container, 'editor', 'summary')!.click(); });

    expect(location()).toBe('/story/st_9?view=volume');
  });

  it('不吃故事上下文的世界书照样进选择页', async () => {
    localStorage.setItem('ste-current-editor-story-id', 'st_9');
    await renderAt('/regex');

    await act(async () => { railButton('世界书').click(); });
    expect(location()).toBe('/tools?focus=worldbook');
  });
});
