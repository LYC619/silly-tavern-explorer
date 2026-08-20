/**
 * 世界书条目列表的筛选/排序/分页/批量选择行为（阶段 B1）。
 *
 * 一律通过渲染后的页面驱动，不 grep 源码：这些逻辑当前内联在 WorldBook.tsx，
 * 阶段 C1 会抽成 useEntryFilters / useBatchSelection，抽完这些用例必须仍然通过。
 * 条目在 DOM 上以 data-entry-key 标识，因此改类名、换视图、拆组件都不影响断言。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENTRY } from '@/types/worldbook';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';

vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/GuidedTour', () => ({ GuidedTour: () => null }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/worldbook-db', () => ({
  saveWorldBook: vi.fn().mockResolvedValue(undefined),
  getAllWorldBooks: vi.fn().mockResolvedValue([]),
  getWorldBook: vi.fn().mockResolvedValue(null),
  deleteWorldBook: vi.fn().mockResolvedValue(undefined),
  pruneAutoSavedWorldBooks: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/archive-db', () => ({ getCharacter: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/character-asset-ref', () => ({ updateCharacterAssetReference: vi.fn().mockResolvedValue(undefined) }));

import WorldBookPage from '@/pages/WorldBook';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
// Radix 在 jsdom 下缺的指针 API；只补这几个，组件本身不 mock
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

function mkEntry(uid: number, over: Partial<WorldBookEntry> = {}): WorldBookEntry {
  return {
    ...DEFAULT_ENTRY,
    uid,
    comment: `条目${uid}`,
    content: `正文${uid}`,
    order: uid,
    ...over,
  } as WorldBookEntry;
}

function mkBook(entries: WorldBookEntry[]): WorldBook {
  return { entries: Object.fromEntries(entries.map((e) => [String(e.uid), e])) };
}

async function renderBook(book: WorldBook) {
  sessionStorage.setItem(
    'wb-active-session',
    JSON.stringify({ worldbook: book, filename: '测试世界书', currentItemId: null }),
  );
  await act(async () => {
    root.render(<MemoryRouter><WorldBookPage /></MemoryRouter>);
  });
}

/** 当前可见条目，按渲染顺序 */
const visibleKeys = () =>
  Array.from(document.querySelectorAll('[data-entry-key]')).map((el) => el.getAttribute('data-entry-key'));

const checkedKeys = () =>
  Array.from(document.querySelectorAll('[data-batch-checked="true"]')).map((el) => el.getAttribute('data-entry-key'));

/** 选中的是一个集合，断言时不该依赖渲染顺序 */
const checkedSet = () => checkedKeys().sort();

const buttonByText = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

const buttonContaining = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

async function click(el: Element | null | undefined) {
  await act(async () => { (el as HTMLElement | undefined)?.click(); });
}

async function typeSearch(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[placeholder*="搜索"]');
  if (!input) throw new Error('找不到搜索框');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Radix Select 在 jsdom 下点不开，用键盘打开后再点选项 */
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

async function openFilterPanel() {
  const trigger = buttonContaining('筛选');
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    trigger?.click();
  });
}

/** 批量模式下条目上的勾选热区（卡片是 span 包裹，列表行是 td 里的 checkbox） */
function batchBox(key: string): HTMLElement | null {
  const row = document.querySelector(`[data-entry-key="${key}"]`);
  return row?.querySelector('span.shrink-0.inline-flex') as HTMLElement
    ?? row?.querySelector('button[role="checkbox"]') as HTMLElement
    ?? null;
}

async function clickBatch(key: string, shiftKey = false) {
  const box = batchBox(key);
  if (!box) throw new Error(`条目 ${key} 上没有批量勾选热区`);
  await act(async () => {
    box.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }));
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('世界书条目筛选与排序', () => {
  it('默认按 Order 升序展示，不受 entries 记录顺序影响', async () => {
    await renderBook(mkBook([
      mkEntry(1, { order: 30 }),
      mkEntry(2, { order: 10 }),
      mkEntry(3, { order: 20 }),
    ]));

    expect(visibleKeys()).toEqual(['2', '3', '1']);
  });

  it('切到 Order 降序、标题排序和创建顺序各自生效', async () => {
    // 标题用 ASCII，避免 localeCompare 在不同 ICU 下按拼音还是码位排序的分歧
    await renderBook(mkBook([
      mkEntry(1, { order: 30, comment: 'Charlie' }),
      mkEntry(2, { order: 10, comment: 'Alpha' }),
      mkEntry(3, { order: 20, comment: 'Bravo' }),
    ]));

    await chooseFromSelect('Order 升序', 'Order 降序');
    expect(visibleKeys()).toEqual(['1', '3', '2']);

    await chooseFromSelect('Order 降序', '标题排序');
    expect(visibleKeys()).toEqual(['2', '3', '1']);

    await chooseFromSelect('标题排序', '创建顺序');
    expect(visibleKeys()).toEqual(['1', '2', '3']);
  });

  it('搜全部命中标题、关键词和正文，仅标题只看标题', async () => {
    await renderBook(mkBook([
      mkEntry(1, { comment: '目标标题', content: '无关', key: [] }),
      mkEntry(2, { comment: '无关', content: '正文里有目标', key: [] }),
      mkEntry(3, { comment: '无关', content: '无关', key: ['目标关键词'] }),
      mkEntry(4, { comment: '无关', content: '无关', key: [] }),
    ]));

    await typeSearch('目标');
    expect(visibleKeys()).toEqual(['1', '2', '3']);

    await chooseFromSelect('搜全部', '仅标题');
    expect(visibleKeys()).toEqual(['1']);
  });

  it('搜索无结果时给出明确的空态而不是空白列表', async () => {
    await renderBook(mkBook([mkEntry(1), mkEntry(2)]));

    await typeSearch('不存在的内容');

    expect(visibleKeys()).toEqual([]);
    expect(document.body.textContent).toContain('没有匹配的条目');
  });

  it('策略筛选多选之间是「或」，不是逐层收窄', async () => {
    await renderBook(mkBook([
      mkEntry(1, { constant: true }),
      mkEntry(2, { vectorized: true }),
      mkEntry(3),
    ]));

    await openFilterPanel();
    await click(buttonContaining('🔵 常驻'));
    expect(visibleKeys()).toEqual(['1']);

    await click(buttonContaining('🔗 向量'));
    expect(visibleKeys()).toEqual(['1', '2']);

    await click(buttonContaining('🟢 关键词'));
    expect(visibleKeys()).toEqual(['1', '2', '3']);
  });

  it('同时勾选已启用和已禁用等于不按状态筛选', async () => {
    await renderBook(mkBook([
      mkEntry(1, { enabled: true }),
      mkEntry(2, { enabled: false }),
    ]));

    await openFilterPanel();
    await click(buttonByText('已启用'));
    expect(visibleKeys()).toEqual(['1']);

    await click(buttonByText('已禁用'));
    expect(visibleKeys()).toEqual(['1', '2']);

    await click(buttonByText('已启用'));
    expect(visibleKeys()).toEqual(['2']);
  });

  it('清除筛选把搜索和所有条件一起复位', async () => {
    await renderBook(mkBook([mkEntry(1, { constant: true }), mkEntry(2)]));

    await typeSearch('条目1');
    await openFilterPanel();
    await click(buttonContaining('🔵 常驻'));
    expect(visibleKeys()).toEqual(['1']);

    await click(buttonContaining('清除筛选'));

    expect(visibleKeys()).toEqual(['1', '2']);
    expect(document.querySelector<HTMLInputElement>('input[placeholder*="搜索"]')?.value).toBe('');
  });
});

describe('世界书条目分页', () => {
  const many = (count: number) => mkBook(Array.from({ length: count }, (_, i) => mkEntry(i + 1)));

  it('默认每页 25 条，翻页取到剩余条目', async () => {
    await renderBook(many(30));

    expect(visibleKeys()).toHaveLength(25);
    expect(visibleKeys()[0]).toBe('1');

    await click(buttonContaining('下一页'));

    expect(visibleKeys()).toEqual(['26', '27', '28', '29', '30']);
  });

  it('条目不足一页时不出现翻页控件', async () => {
    await renderBook(many(3));

    expect(buttonContaining('下一页')).toBeUndefined();
  });

  it('改了筛选条件后回到第 1 页，不停在越界的旧页码', async () => {
    await renderBook(many(30));
    await click(buttonContaining('下一页'));
    expect(visibleKeys()[0]).toBe('26');

    await typeSearch('条目1');

    // 条目1、条目1x 共 11 条，一页放得下，且必须从第 1 页开始
    expect(visibleKeys()[0]).toBe('1');
    expect(visibleKeys()).toContain('19');
  });

  it('选择「全部」后不再分页', async () => {
    await renderBook(many(30));

    await chooseFromSelect('25 / 页', '全部');

    expect(visibleKeys()).toHaveLength(30);
    expect(buttonContaining('下一页')).toBeUndefined();
  });
});

describe('世界书批量选择', () => {
  const six = () => mkBook(Array.from({ length: 6 }, (_, i) => mkEntry(i + 1)));

  async function enterBatchMode() {
    await click(buttonByText('批量'));
  }

  it('Shift 连选覆盖上次点击到当前条目的整段', async () => {
    await renderBook(six());
    await enterBatchMode();

    await clickBatch('2');
    await clickBatch('5', true);

    expect(checkedSet()).toEqual(['2', '3', '4', '5']);
  });

  it('Shift 反选按同一段整段取消', async () => {
    await renderBook(six());
    await enterBatchMode();

    await clickBatch('1');
    await clickBatch('6', true);
    expect(checkedSet()).toHaveLength(6);

    await clickBatch('2');
    await clickBatch('5', true);

    expect(checkedSet()).toEqual(['1', '6']);
  });

  it('Shift 连选按当前显示顺序取段，而不是原始顺序', async () => {
    await renderBook(mkBook([
      mkEntry(1, { order: 30 }),
      mkEntry(2, { order: 20 }),
      mkEntry(3, { order: 10 }),
    ]));
    await enterBatchMode();
    expect(visibleKeys()).toEqual(['3', '2', '1']);

    // 显示顺序上 3 与 2 相邻，取段只该覆盖这两条；按原始顺序取则会连上 1
    await clickBatch('3');
    await clickBatch('2', true);

    expect(checkedSet()).toEqual(['2', '3']);
  });

  it('筛选后全选只包含可见条目，且进入批量模式不丢失已有筛选', async () => {
    await renderBook(mkBook([
      mkEntry(1, { constant: true }),
      mkEntry(2, { constant: true }),
      mkEntry(3),
    ]));
    // 批量模式会用批量工具条替换掉筛选栏，所以筛选要先设好
    await openFilterPanel();
    await click(buttonContaining('🔵 常驻'));
    expect(visibleKeys()).toEqual(['1', '2']);

    await enterBatchMode();
    expect(visibleKeys()).toEqual(['1', '2']);

    await click(buttonContaining('全选'));

    expect(checkedSet()).toEqual(['1', '2']);
  });

  it('切换卡片/列表视图后选择结果保持不变', async () => {
    await renderBook(six());
    await enterBatchMode();
    await clickBatch('2');
    await clickBatch('4', true);
    expect(checkedSet()).toEqual(['2', '3', '4']);

    await click(document.querySelector('[aria-label="列表视图"]'));

    expect(checkedSet()).toEqual(['2', '3', '4']);
  });
});
