/**
 * 角色卡的键盘可达性（阶段 C2）。
 *
 * 取代 frontend-contract.test.ts 里对 Library.tsx 源码的四条 grep
 * （`tabIndex={0}` / `e.key === 'Enter' || e.key === ' '` / `focus-visible:ring-2` /
 * `e.target !== e.currentTarget`）——那四条钉的是「源码里出现过这些字符」，
 * 卡片一旦抽成 <CharacterTile> 就会误红，而真正要保住的是下面这些行为。
 *
 * `e.target !== e.currentTarget` 那条尤其重要：卡面里嵌着勾选框和菜单按钮，
 * 少了这道判断，在菜单里敲空格会连带激活整张卡。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveCharacter } from '@/types/archive';

const navigate = vi.hoisted(() => vi.fn());
const getAllCharacters = vi.hoisted(() => vi.fn().mockResolvedValue([]));
// 必须跨渲染返回同一个 toast：Library 的 load 依赖它，每次换新函数会让加载 effect 无限重跑
const toast = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));
vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
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
vi.mock('@/lib/archive-index', () => ({ listStoryIndex: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/vault/tauri-fs', () => ({
  isTauri: vi.fn().mockReturnValue(false),
  pickDirectory: vi.fn(),
  createTauriFs: vi.fn(() => ({})),
}));

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

function mkCharacter(id: string): ArchiveCharacter {
  return {
    id,
    name: `角色${id}`,
    card: { name: `角色${id}`, description: '' },
    tags: [],
    status: 'active',
    createdAt: 1000,
    updatedAt: 2000,
  } as unknown as ArchiveCharacter;
}

async function renderLibrary(ids: string[]) {
  getAllCharacters.mockResolvedValue(ids.map(mkCharacter));
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/library']}><Library /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}

const card = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-character-id="${id}"]`);
  if (!el) throw new Error(`没有渲染出角色 ${id}`);
  return el;
};

const selectedIds = () =>
  Array.from(document.querySelectorAll('[data-selected="true"]'))
    .map((el) => el.getAttribute('data-character-id')).sort();

async function press(target: Element, key: string, shiftKey = false) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  });
}

async function click(el: Element | null | undefined) {
  await act(async () => { (el as HTMLElement | undefined)?.click(); });
}

async function enterBatchMode() {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '批量管理');
  if (!btn) throw new Error('没有渲染出「批量管理」入口');
  await click(btn);
}

async function switchToListView() {
  const appearance = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('外观'));
  await act(async () => {
    appearance?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    appearance?.click();
  });
  await click(document.querySelector('[aria-label="列表视图"]'));
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
  getAllCharacters.mockClear().mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('角色卡键盘可达', () => {
  it('网格卡可聚焦，Enter 与空格都能进角色页', async () => {
    await renderLibrary(['a', 'b']);

    expect(card('a').tabIndex).toBe(0);

    await press(card('a'), 'Enter');
    expect(navigate).toHaveBeenCalledWith('/character/a');

    navigate.mockClear();
    await press(card('b'), ' ');
    expect(navigate).toHaveBeenCalledWith('/character/b');
  });

  it('列表行同样可聚焦并响应键盘', async () => {
    await renderLibrary(['a', 'b']);
    await switchToListView();

    expect(card('a').tabIndex).toBe(0);

    await press(card('a'), 'Enter');
    expect(navigate).toHaveBeenCalledWith('/character/a');
  });

  it('键盘焦点有可见描边，不是只靠鼠标 hover', async () => {
    await renderLibrary(['a']);

    // jsdom 没有排版引擎，验不了实际描边；退一步断言那条 focus-visible 类还在
    expect(card('a').className).toContain('focus-visible:ring-2');
  });

  it('卡内子元素上的按键不冒泡成「激活整张卡」', async () => {
    await renderLibrary(['a', 'b']);
    await enterBatchMode();

    // 批量模式下卡面左上角是勾选框，它自己要处理空格
    const checkbox = card('a').querySelector('button[role="checkbox"]');
    if (!checkbox) throw new Error('批量模式下卡面没有勾选框');

    await press(checkbox, ' ');

    // 卡片的 onKeyDown 必须因为 e.target !== e.currentTarget 而放行
    expect(selectedIds()).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('批量模式下键盘激活是选中而不是跳转，Shift+Enter 走范围选', async () => {
    await renderLibrary(['a', 'b', 'c', 'd']);
    await enterBatchMode();

    await press(card('b'), 'Enter');
    expect(navigate).not.toHaveBeenCalled();
    expect(selectedIds()).toEqual(['b']);

    await press(card('d'), 'Enter', true);
    expect(selectedIds()).toEqual(['b', 'c', 'd']);
  });
});
