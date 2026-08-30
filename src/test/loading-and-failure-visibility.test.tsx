/**
 * 加载态与失败可见性（阶段 D4）。
 *
 * 三处「看起来一样但含义完全不同」的界面：
 * - 首页整页读失败以前静默显示空态，用户会以为归档没了
 * - 工具页读完之前就断言「还没有可以处理的故事」
 * - 世界书空态在资产库读完之前就断言用户没有可恢复的世界书
 *
 * 空态是一句结论，读完之前不能下这个结论。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOADING_LABEL } from '@/lib/ui-copy';

const navigate = vi.hoisted(() => vi.fn());
const getAllCharacters = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const listStoryIndex = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getAllArchiveStories = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const listCharacterIndex = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children, titleBarContent }: { children?: React.ReactNode; titleBarContent?: React.ReactNode }) =>
    <div>{titleBarContent}{children}</div>,
}));
vi.mock('@/components/tools/STImportCard', () => ({ STImportCard: () => null }));
vi.mock('@/components/tools/STAIConfigDialog', () => ({ STAIConfigDialog: () => null }));
vi.mock('@/lib/vault/tauri-fs', () => ({
  isTauri: () => false,
  getAppConfig: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/archive-db', () => ({ getAllCharacters, getAllArchiveStories }));
vi.mock('@/lib/archive-index', () => ({ listStoryIndex, listCharacterIndex }));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/regex-db', () => ({ getAllRegexCollections: vi.fn().mockResolvedValue([]) }));

import Home from '@/pages/Home';
import Tools from '@/pages/Tools';
import { WorldBookEmptyState } from '@/components/worldbook/WorldBookEmptyState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  getAllCharacters.mockClear().mockResolvedValue([]);
  listStoryIndex.mockClear().mockResolvedValue([]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderHome() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <TooltipProvider><Home /></TooltipProvider>
      </MemoryRouter>,
    );
  });
}

describe('首页整页读失败要说出来', () => {
  it('读失败时给出报错与重试，而不是安静地显示空态', async () => {
    getAllCharacters.mockRejectedValue(new Error('库打不开'));
    await renderHome();

    const banner = container.querySelector('[data-home-load-error]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('读取归档失败');
    // 关键是别让用户以为数据没了
    expect(banner!.textContent).toContain('数据仍在库里');
  });

  it('点重试会重新读一次；这次成功就把报错收起来', async () => {
    getAllCharacters.mockRejectedValueOnce(new Error('库打不开'));
    await renderHome();
    expect(container.querySelector('[data-home-load-error]')).not.toBeNull();

    getAllCharacters.mockResolvedValue([]);
    const retry = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '重试');
    if (!retry) throw new Error('没有渲染出重试按钮');
    await act(async () => { retry.click(); });

    expect(container.querySelector('[data-home-load-error]')).toBeNull();
    expect(getAllCharacters).toHaveBeenCalledTimes(2);
  });

  it('读成功时不显示报错', async () => {
    await renderHome();
    expect(container.querySelector('[data-home-load-error]')).toBeNull();
  });
});

describe('工具页：读完之前不说「还没有可以处理的故事」', () => {
  /** 让故事读取悬着，好在「加载中」这一帧上做断言 */
  function deferStories() {
    let release!: (v: unknown[]) => void;
    getAllArchiveStories.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    return release;
  }

  async function renderTools() {
    // 没有 ?focus= 的 /tools 会直接 Navigate 去 /chat，选择器根本不渲染
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/tools?focus=summary']}>
          <TooltipProvider><Tools /></TooltipProvider>
        </MemoryRouter>,
      );
    });
  }

  it('还在读的时候显示加载态，不下「没有故事」的结论', async () => {
    const release = deferStories();
    await renderTools();

    expect(container.querySelector('[data-story-picker-loading]')?.textContent).toBe(LOADING_LABEL);
    expect(container.textContent).not.toContain('还没有可以处理的故事');

    await act(async () => { release([]); });
  });

  it('读完确实没有故事时，加载态收起，空态才出现', async () => {
    const release = deferStories();
    await renderTools();
    await act(async () => { release([]); });

    expect(container.querySelector('[data-story-picker-loading]')).toBeNull();
    expect(container.textContent).toContain('还没有可以处理的故事');
  });

  it('故事库读取失败时显示错误并支持重试，而不是伪装成空库', async () => {
    getAllArchiveStories.mockRejectedValueOnce(new Error('故事库打不开'));
    await renderTools();

    const error = container.querySelector('[data-tools-load-error]');
    expect(error?.textContent).toContain('读取失败');
    expect(error?.textContent).toContain('故事库打不开');
    expect(container.textContent).not.toContain('还没有可以处理的故事');

    getAllArchiveStories.mockResolvedValue([]);
    const retry = Array.from(error?.querySelectorAll('button') ?? []).find((b) => b.textContent?.trim() === '重试');
    if (!retry) throw new Error('没有渲染出重试按钮');
    await act(async () => { retry.click(); });
    expect(container.querySelector('[data-tools-load-error]')).toBeNull();
  });
});

describe('世界书空态：读完之前不下结论', () => {

  it('资产库还没读完时显示加载态，不显示世界书列表', async () => {
    const noop = () => {};
    await act(async () => {
      root.render(
        <WorldBookEmptyState savedItems={[]} savedLoaded={false} onImport={noop} onRestore={noop} onDelete={noop} />,
      );
    });

    expect(container.querySelector('[data-staged-loading]')?.textContent).toBe(LOADING_LABEL);
    expect(container.textContent).not.toContain('资产库里的世界书');
  });

  it('读完且资产库确实是空的，加载态收起、也不假装有可恢复的内容', async () => {
    const noop = () => {};
    await act(async () => {
      root.render(
        <WorldBookEmptyState savedItems={[]} savedLoaded onImport={noop} onRestore={noop} onDelete={noop} />,
      );
    });

    expect(container.querySelector('[data-staged-loading]')).toBeNull();
    expect(container.textContent).not.toContain('资产库里的世界书');
  });

  it('读完且资产库里有世界书时列出来', async () => {
    const noop = () => {};
    const item = {
      id: 'wb1', title: '魔法世界', createdAt: 1, updatedAt: 2,
      worldbook: { entries: {}, originalData: {} },
    } as unknown as Parameters<typeof WorldBookEmptyState>[0]['savedItems'][number];

    await act(async () => {
      root.render(
        <WorldBookEmptyState savedItems={[item]} savedLoaded onImport={noop} onRestore={noop} onDelete={noop} />,
      );
    });

    expect(container.querySelector('[data-staged-loading]')).toBeNull();
    expect(container.textContent).toContain('资产库里的世界书');
    expect(container.textContent).toContain('魔法世界');
  });

  it('资产库读取失败时显示错误和重试入口', async () => {
    const noop = () => {};
    await act(async () => {
      root.render(
        <WorldBookEmptyState
          savedItems={[]}
          savedLoaded
          loadError="世界书库打不开"
          onRetry={noop}
          onImport={noop}
          onRestore={noop}
          onDelete={noop}
        />,
      );
    });

    const error = container.querySelector('[data-worldbook-load-error]');
    expect(error?.textContent).toContain('世界书库打不开');
    expect(error?.querySelector('button')?.textContent?.trim()).toBe('重试');
  });
});
