/**
 * 世界书直接入库（附属库「导入世界书」入口）的行为（阶段 B1）。
 *
 * 原先这里 grep AssetLibrary.tsx / WorldBook.tsx 的源码字符串和 CSS 类名，
 * 换组件名或调类名顺序就会红；现在改成驱动真实 DOM：选文件 → 入库 → 列表显示两种时间。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readWorldBookUpload, worldBookItemFromUpload } from '@/lib/worldbook-file-import';
import type { WorldBookItem } from '@/types/worldbook';

const saveWorldBook = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getAllWorldBooks = vi.hoisted(() => vi.fn().mockResolvedValue([]));
/** Toaster 由 App 挂载，页面级测试里没有渲染点，只能在 hook 上收 */
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children, actions }: { children?: React.ReactNode; actions?: React.ReactNode }) => (
    <div>{actions}{children}</div>
  ),
}));
vi.mock('@/lib/worldbook-db', () => ({
  saveWorldBook,
  getAllWorldBooks,
  deleteWorldBook: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/preset-db', () => ({
  getAllPresets: vi.fn().mockResolvedValue([]),
  deletePreset: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/regex-db', () => ({
  getAllRegexCollections: vi.fn().mockResolvedValue([]),
  deleteRegexCollection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/archive-db', () => ({
  getAllCharacters: vi.fn().mockResolvedValue([]),
  getAllArchiveStories: vi.fn().mockResolvedValue([]),
}));

import AssetLibrary from '@/pages/AssetLibrary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  saveWorldBook.mockClear().mockResolvedValue(undefined);
  getAllWorldBooks.mockClear().mockResolvedValue([]);
  toast.mockClear();
  localStorage.clear();
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
      <MemoryRouter initialEntries={['/assets?tab=worldbook']}>
        <AssetLibrary />
      </MemoryRouter>,
    );
  });
}

/** 造一个 change 事件里带文件的 input，绕开 jsdom 不能给 input.files 赋值的限制 */
function fireFilePick(input: HTMLInputElement, file: Partial<File> & { name: string }) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('世界书文件解析', () => {
  it('解析文件时保留源文件最后修改时间并用于新资产', async () => {
    const upload = await readWorldBookUpload({
      name: 'demo.json',
      lastModified: 1_725_000_000_123,
      text: async () => JSON.stringify({ entries: { 0: { uid: 0, content: '设定' } } }),
    });
    const item = worldBookItemFromUpload(upload, 2_000_000_000_000);

    expect(item.title).toBe('demo');
    expect(item.sourceModifiedAt).toBe(1_725_000_000_123);
    expect(item.createdAt).toBe(2_000_000_000_000);
    expect(item.updatedAt).toBe(2_000_000_000_000);
    expect(Object.keys(item.worldbook.entries)).toHaveLength(1);
  });
});

describe('附属库直接导入世界书', () => {
  it('提供带无障碍名称的导入入口', async () => {
    await renderLibrary();

    expect(container.querySelector('[aria-label="导入世界书"]')).not.toBeNull();
  });

  it('选中文件后解析入库，并带上源文件修改时间', async () => {
    await renderLibrary();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    await act(async () => {
      fireFilePick(input!, {
        name: '设定集.json',
        lastModified: 1_725_000_000_123,
        text: async () => JSON.stringify({ entries: { 0: { uid: 0, content: '设定' } } }),
      });
    });
    await act(async () => { await Promise.resolve(); });

    expect(saveWorldBook).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '世界书导入成功' }));
    const saved = saveWorldBook.mock.calls[0][0] as WorldBookItem;
    expect(saved.title).toBe('设定集');
    expect(saved.sourceModifiedAt).toBe(1_725_000_000_123);
    expect(Object.keys(saved.worldbook.entries)).toHaveLength(1);
  });

  it('无法解析的文件不入库，并给出失败提示', async () => {
    await renderLibrary();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');

    await act(async () => {
      fireFilePick(input!, { name: '坏文件.json', lastModified: 1, text: async () => '不是 JSON' });
    });
    await act(async () => { await Promise.resolve(); });

    expect(saveWorldBook).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: '世界书导入失败',
      variant: 'destructive',
    }));
  });

  it('资产卡区分 STE 最后修改与源文件最后修改，没有源时间就不显示那一行', async () => {
    const sourceModifiedAt = Date.UTC(2024, 0, 2, 3, 4, 5);
    const updatedAt = Date.UTC(2025, 5, 6, 7, 8, 9);
    getAllWorldBooks.mockResolvedValue([
      { id: 'wb_src', title: '有源文件', worldbook: { entries: {} }, createdAt: 1, updatedAt, sourceModifiedAt },
      { id: 'wb_plain', title: '手动新建', worldbook: { entries: {} }, createdAt: 1, updatedAt },
    ]);
    await renderLibrary();

    const cardText = (title: string) => Array.from(container.querySelectorAll('*'))
      .filter((el) => el.textContent?.includes(title) && el.querySelectorAll('*').length < 40)
      .map((el) => el.textContent ?? '')
      .sort((a, b) => a.length - b.length)
      .find((text) => text.includes('STE 最后修改')) ?? '';

    expect(cardText('有源文件')).toContain('STE 最后修改');
    expect(cardText('有源文件')).toContain('源文件最后修改');
    expect(cardText('有源文件')).toContain(new Date(sourceModifiedAt).toLocaleString('zh-CN'));
    expect(cardText('手动新建')).toContain('STE 最后修改');
    expect(cardText('手动新建')).not.toContain('源文件最后修改');
  });
});
