/**
 * 首屏骨架 / 刷新指示 / 失败态的行为（移动端适配 P3）。
 *
 * 钉住的是三件容易写反的事：
 * 1. 读档还没回来时不许显示空态文案 —— 「还没有角色卡」和「读档失败」是两种结论，
 *    在还不知道结论的时候提前下结论，用户会以为数据丢了；
 * 2. 已经有数据再刷新时不许把内容换回骨架 —— 那是从「看得见」退回「看不见」；
 * 3. 读失败要和空库分开，且能重试。
 *
 * 用一个手动 resolve 的 deferred 把读档挂在半空，才能观察加载中那一帧。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveCharacter } from '@/types/archive';

const getAllCharacters = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const listStoryIndex = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children, actions, leftActions, titleBarContent }: {
    children?: React.ReactNode; actions?: React.ReactNode;
    leftActions?: React.ReactNode; titleBarContent?: React.ReactNode;
  }) => <div>{titleBarContent}{leftActions}{actions}{children}</div>,
}));
vi.mock('@/components/tools/STImportCard', () => ({ STImportCard: () => null }));
vi.mock('@/components/tools/STAIConfigDialog', () => ({ STAIConfigDialog: () => null }));
vi.mock('@/lib/archive-db', () => ({
  CHARACTER_TYPES: ['人物', '剧情', '玩法', '综合', '同人'],
  getAllCharacters,
  deleteCharacter: vi.fn().mockResolvedValue(undefined),
  saveCharacter: vi.fn().mockResolvedValue(undefined),
  getLibraryTagPreferences: vi.fn(async () => {
    const { normalizeLibraryTagPreferences } = await import('@/lib/library-tag-preferences');
    return normalizeLibraryTagPreferences(undefined);
  }),
  saveLibraryTagPreferences: vi.fn().mockResolvedValue(undefined),
  updateArchiveStory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/archive-index', () => ({ listStoryIndex }));
vi.mock('@/lib/character-batch-export', () => ({
  exportCharactersToDirectory: vi.fn().mockResolvedValue({ exported: [], failed: [] }),
}));
vi.mock('@/lib/vault/tauri-fs', () => ({
  isTauri: () => false,
  pickDirectory: vi.fn().mockResolvedValue(null),
  createTauriFs: vi.fn(() => ({})),
  getAppConfig: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/regex-db', () => ({ getAllRegexCollections: vi.fn().mockResolvedValue([]) }));

import Library from '@/pages/Library';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

function mkCharacter(id: string, over: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return {
    id,
    name: `角色${id}`,
    card: { name: `角色${id}`, description: '' },
    tags: [],
    status: 'active',
    createdAt: 1000,
    updatedAt: 2000,
    ...over,
  } as unknown as ArchiveCharacter;
}

/** 手动控制何时读完 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const skeletons = () => document.querySelectorAll('[data-skeleton]').length;
const text = () => container.textContent ?? '';
const buttonByText = (label: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

beforeEach(() => {
  localStorage.clear();
  toast.mockClear();
  getAllCharacters.mockClear().mockResolvedValue([]);
  listStoryIndex.mockClear().mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderLibrary() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/library']}>
        <TooltipProvider><Library /></TooltipProvider>
      </MemoryRouter>,
    );
  });
}

describe('角色库加载状态', () => {
  it('首屏读档期间给卡墙骨架，不提前显示空库引导', async () => {
    const pending = deferred<ArchiveCharacter[]>();
    getAllCharacters.mockReturnValue(pending.promise);

    await renderLibrary();

    expect(document.querySelector('[data-character-grid-skeleton]')).not.toBeNull();
    expect(skeletons()).toBeGreaterThan(0);
    // 还不知道库里有没有卡，这时候说「空的」就是把加载中误报成结论
    expect(text()).not.toContain('角色库还是空的');

    pending.resolve([mkCharacter('a'), mkCharacter('b')]);
    await flush();

    expect(document.querySelector('[data-character-grid-skeleton]')).toBeNull();
    expect(document.querySelectorAll('[data-character-id]').length).toBe(2);
  });

  it('确实读到空库才显示导入引导', async () => {
    getAllCharacters.mockResolvedValue([]);

    await renderLibrary();
    await flush();

    expect(document.querySelector('[data-character-grid-skeleton]')).toBeNull();
    expect(text()).toContain('角色库还是空的');
  });

  it('读档失败显示失败态和重试，不冒充空库', async () => {
    getAllCharacters.mockRejectedValueOnce(new Error('idb 挂了'));

    await renderLibrary();
    await flush();

    const error = document.querySelector('[data-library-load-error]');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('读取角色库失败');
    expect(text()).not.toContain('角色库还是空的');

    // 重试成功后回到正常卡墙
    getAllCharacters.mockResolvedValue([mkCharacter('a')]);
    const retry = buttonByText('重试');
    expect(retry).toBeDefined();
    await act(async () => { retry!.click(); });
    await flush();

    expect(document.querySelector('[data-library-load-error]')).toBeNull();
    expect(document.querySelectorAll('[data-character-id]').length).toBe(1);
  });

  it('已有数据时刷新只给顶部指示条，不把卡墙换回骨架', async () => {
    getAllCharacters.mockResolvedValue([mkCharacter('a'), mkCharacter('b'), mkCharacter('c')]);
    await renderLibrary();
    await flush();
    expect(document.querySelectorAll('[data-character-id]').length).toBe(3);

    // 走真实刷新路径：批量删除完会 await load()
    await act(async () => { buttonByText('批量管理')!.click(); });
    await act(async () => {
      document.querySelector<HTMLElement>('[data-character-id="c"]')!.click();
    });
    await act(async () => { buttonByText('删除')!.click(); });

    // 第二次读档挂在半空。确认按钮跟批量栏那颗同样叫「删除」，得限定在弹窗里找
    const pending = deferred<ArchiveCharacter[]>();
    getAllCharacters.mockReturnValue(pending.promise);
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    const confirm = Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent?.trim() === '删除');
    expect(confirm).toBeDefined();
    await act(async () => { confirm!.click(); });
    await flush();

    // 刷新中：细指示条挂上，已读到的卡还在，骨架不许回来
    expect(document.querySelector('[data-refresh-indicator]')).not.toBeNull();
    expect(document.querySelector('[data-character-grid-skeleton]')).toBeNull();
    expect(document.querySelectorAll('[data-character-id]').length).toBe(3);

    pending.resolve([mkCharacter('a'), mkCharacter('b')]);
    await flush();

    expect(document.querySelector('[data-refresh-indicator]')).toBeNull();
    expect(document.querySelectorAll('[data-character-id]').length).toBe(2);
  });
});
