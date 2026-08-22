/**
 * 角色库页面的选择、分组与批量操作行为（阶段 B2）。
 *
 * 替代 frontend-contract.test.ts 里那几组「grep Library.tsx 有没有某个 import
 * 或某段 JSX」的断言：逻辑层（library-query / library-grouping /
 * library-tag-preferences / character-batch-export）已各自有单测，这里只钉住
 * 页面把它们接起来的部分。阶段 C2 会把卡片抽成 <CharacterTile>，
 * 断言走 data-character-id，抽完应仍然通过。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveCharacter } from '@/types/archive';

const getAllCharacters = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const listStoryIndex = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const deleteCharacter = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const exportCharactersToDirectory = vi.hoisted(() => vi.fn().mockResolvedValue({ exported: [], failed: [] }));
const pickDirectory = vi.hoisted(() => vi.fn().mockResolvedValue('D:/导出'));
const isTauri = vi.hoisted(() => vi.fn().mockReturnValue(true));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));
vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children, actions, leftActions }: {
    children?: React.ReactNode; actions?: React.ReactNode; leftActions?: React.ReactNode;
  }) => <div>{leftActions}{actions}{children}</div>,
}));
vi.mock('@/lib/archive-db', () => ({
  CHARACTER_TYPES: ['人物', '剧情', '玩法', '综合', '同人'],
  getAllCharacters,
  deleteCharacter,
  saveCharacter: vi.fn().mockResolvedValue(undefined),
  // 真实实现永远返回规整后的对象，不会是 null；用真的 normalizer 免得测试造出不可能的形状
  getLibraryTagPreferences: vi.fn(async () => {
    const { normalizeLibraryTagPreferences } = await import('@/lib/library-tag-preferences');
    return normalizeLibraryTagPreferences(undefined);
  }),
  saveLibraryTagPreferences: vi.fn().mockResolvedValue(undefined),
  updateArchiveStory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/archive-index', () => ({ listStoryIndex }));
vi.mock('@/lib/character-batch-export', () => ({ exportCharactersToDirectory }));
vi.mock('@/lib/vault/tauri-fs', () => ({
  isTauri,
  pickDirectory,
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

async function renderLibrary(characters: ArchiveCharacter[]) {
  getAllCharacters.mockResolvedValue(characters);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/library']}><Library /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}

const cardIds = () =>
  Array.from(document.querySelectorAll('[data-character-id]')).map((el) => el.getAttribute('data-character-id'));

const selectedIds = () =>
  Array.from(document.querySelectorAll('[data-selected="true"]')).map((el) => el.getAttribute('data-character-id')).sort();

const card = (id: string) => document.querySelector<HTMLElement>(`[data-character-id="${id}"]`);

const buttonByText = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

const buttonContaining = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

async function click(el: Element | null | undefined) {
  await act(async () => { (el as HTMLElement | undefined)?.click(); });
}

async function clickCard(id: string, shiftKey = false) {
  const el = card(id);
  if (!el) throw new Error(`没有渲染出角色 ${id}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }));
  });
}

async function chooseFromSelect(currentLabel: string, optionLabel: string) {
  const trigger = Array.from(document.querySelectorAll('[role="combobox"]'))
    .find((t) => t.textContent?.trim() === currentLabel);
  if (!trigger) throw new Error(`找不到当前值为「${currentLabel}」的下拉框`);
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  const option = Array.from(document.querySelectorAll('[role="option"]'))
    .find((o) => o.textContent?.trim() === optionLabel);
  if (!option) throw new Error(`下拉框里没有「${optionLabel}」`);
  await click(option);
}

/** 批量管理入口只在 2 张卡以上出现；找不到就直接失败，避免静默跳过后面的断言 */
async function enterBatchMode() {
  const btn = buttonByText('批量管理');
  if (!btn) throw new Error('没有渲染出「批量管理」入口');
  await click(btn);
}

beforeEach(() => {
  localStorage.clear();
  getAllCharacters.mockClear().mockResolvedValue([]);
  listStoryIndex.mockClear().mockResolvedValue([]);
  deleteCharacter.mockClear().mockResolvedValue(undefined);
  exportCharactersToDirectory.mockClear().mockResolvedValue({ exported: [], failed: [] });
  pickDirectory.mockClear().mockResolvedValue('D:/导出');
  isTauri.mockReturnValue(true);
  toast.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('角色库批量选择', () => {
  const five = () => ['a', 'b', 'c', 'd', 'e'].map((id) => mkCharacter(id));

  it('普通点击切换单个，再点一次取消', async () => {
    await renderLibrary(five());
    await enterBatchMode();

    await clickCard('b');
    expect(selectedIds()).toEqual(['b']);

    await clickCard('b');
    expect(selectedIds()).toEqual([]);
  });

  it('Shift 点击从锚点到当前整段全选', async () => {
    await renderLibrary(five());
    await enterBatchMode();

    await clickCard('b');
    await clickCard('d', true);

    expect(selectedIds()).toEqual(['b', 'c', 'd']);
  });

  it('Shift 范围是并集，不会清掉锚点之外已选的项', async () => {
    await renderLibrary(five());
    await enterBatchMode();

    await clickCard('e');
    await clickCard('a');
    await clickCard('c', true);

    expect(selectedIds()).toEqual(['a', 'b', 'c', 'e']);
  });

  it('没有锚点时 Shift 点击退化成普通点选', async () => {
    await renderLibrary(five());
    await enterBatchMode();

    await clickCard('c', true);

    expect(selectedIds()).toEqual(['c']);
  });

  it('筛选变化会重置锚点，Shift 不会跨越旧上下文连选', async () => {
    await renderLibrary(five());
    await enterBatchMode();
    await clickCard('a');
    expect(selectedIds()).toEqual(['a']);

    // 改搜索 → filtered 重算 → 锚点清空、选择集收缩到仍可见的项
    const input = document.querySelector<HTMLInputElement>('input[placeholder*="搜索"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, '角色');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await clickCard('d', true);

    // 锚点已清，d 只是被单独选上，不会把 a..d 整段带进来
    expect(selectedIds()).toEqual(['a', 'd']);
  });

  it('退出批量模式清空选择', async () => {
    await renderLibrary(five());
    await enterBatchMode();
    await clickCard('b');
    expect(selectedIds()).toEqual(['b']);

    await click(buttonByText('退出批量'));

    expect(selectedIds()).toEqual([]);
  });
});

describe('角色库工具条与分组', () => {
  /** a 在 b 之前（文档顺序），用来钉住工具条的排列而不依赖类名 */
  const isBefore = (a: Element, b: Element) =>
    !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('标签管理与批量管理紧跟搜索框，排序控件在它们之后', async () => {
    await renderLibrary([mkCharacter('a'), mkCharacter('b')]);

    const search = document.querySelector('input[placeholder*="搜索"]')!;
    const tagManager = document.querySelector('[aria-label="标签管理"]')!;
    const batch = buttonByText('批量管理')!;
    const sort = document.querySelector('[aria-label="切换排序方向"]')!;

    expect(isBefore(search, tagManager)).toBe(true);
    expect(isBefore(tagManager, batch)).toBe(true);
    expect(isBefore(batch, sort)).toBe(true);
  });

  it('分组选择持久化到 localStorage，重新进入仍然生效', async () => {
    await renderLibrary([
      mkCharacter('a', { tags: ['分类:甲'] }),
      mkCharacter('b', { tags: ['分类:乙'] }),
    ]);

    await chooseFromSelect('不分组', '按类型');

    expect(localStorage.getItem('ste-library-group-by')).toBe('type');

    // 重新挂载：读回持久化值，而不是回到默认
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await renderLibrary([mkCharacter('a'), mkCharacter('b')]);

    const groupTrigger = Array.from(document.querySelectorAll('[role="combobox"]'))
      .find((t) => t.textContent?.trim() === '按类型');
    expect(groupTrigger).toBeDefined();
  });

  it('分组后所有角色仍然全部出现，只是被拆进不同分组', async () => {
    await renderLibrary(['a', 'b', 'c'].map((id) => mkCharacter(id)));
    expect(cardIds()).toHaveLength(3);

    await chooseFromSelect('不分组', '按类型');

    expect(cardIds().sort()).toEqual(['a', 'b', 'c']);
  });

  it('按标签分组时才出现一级标签分类选择，并同样持久化', async () => {
    await renderLibrary([
      mkCharacter('a', { tags: ['角色/主角'] }),
      mkCharacter('b', { tags: ['角色/配角'] }),
    ]);
    expect(document.querySelector('[aria-label="标签分组分类"]')).toBeNull();

    await chooseFromSelect('不分组', '按标签');

    expect(document.querySelector('[aria-label="标签分组分类"]')).not.toBeNull();
    expect(localStorage.getItem('ste-library-group-by')).toBe('tag');
    expect(cardIds().sort()).toEqual(['a', 'b']);
  });

  it('侧边筛选栏的标签可点，勾中后只留带该标签的角色，再点取消', async () => {
    // 用内置分类法里的真实标签（人物/少女），自造的「角色/xx」不进内置筛选组
    await renderLibrary([
      mkCharacter('a', { tags: ['人物/少女'] }),
      mkCharacter('b', { tags: ['人物/成女'] }),
    ]);
    expect(cardIds().sort()).toEqual(['a', 'b']);

    const tagButton = Array.from(document.querySelectorAll('button'))
      // 标签按钮文本是「标签名+计数」，去掉尾部数字再比
      .find((b) => b.textContent?.trim().replace(/\d+$/, '') === '少女');
    if (!tagButton) throw new Error('筛选栏里没有渲染出「少女」标签');

    await click(tagButton);
    expect(cardIds()).toEqual(['a']);

    await click(tagButton);
    expect(cardIds().sort()).toEqual(['a', 'b']);
  });
});

describe('角色库批量导出', () => {
  it('用户选目录后导出所选角色，并回报真实结果', async () => {
    exportCharactersToDirectory.mockResolvedValue({ exported: [{ id: 'a', fileName: 'a.png' }, { id: 'b', fileName: 'b.png' }], failed: [] });
    await renderLibrary([mkCharacter('a'), mkCharacter('b'), mkCharacter('c')]);
    await enterBatchMode();
    await clickCard('a');
    await clickCard('b');

    await click(buttonByText('导出'));
    await act(async () => { await Promise.resolve(); });

    expect(pickDirectory).toHaveBeenCalled();
    const [targets] = exportCharactersToDirectory.mock.calls[0];
    expect((targets as ArchiveCharacter[]).map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('导出') }));
  });

  it('用户取消选目录时不导出，也不静默', async () => {
    pickDirectory.mockResolvedValue(null);
    await renderLibrary([mkCharacter('a'), mkCharacter('b')]);
    await enterBatchMode();
    await clickCard('a');

    const exportBtn = buttonByText('导出');
    expect(exportBtn).toBeDefined();
    await click(exportBtn);
    await act(async () => { await Promise.resolve(); });

    expect(exportCharactersToDirectory).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('已取消') }));
  });

  it('部分失败时把失败项报给用户，而不是只说成功', async () => {
    exportCharactersToDirectory.mockResolvedValue({
      exported: [{ id: 'a', fileName: 'a.png' }],
      failed: [{ id: 'b', fileName: 'b.png', error: '写入失败' }],
    });
    await renderLibrary([mkCharacter('a'), mkCharacter('b')]);
    await enterBatchMode();
    await clickCard('a');
    await clickCard('b');

    await click(buttonByText('导出'));
    await act(async () => { await Promise.resolve(); });

    const reported = toast.mock.calls.map(([arg]) => JSON.stringify(arg)).join(' ');
    expect(reported).toContain('1');
    expect(reported).toMatch(/失败/);
  });
});
