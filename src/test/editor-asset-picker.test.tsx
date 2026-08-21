/**
 * 编辑区资产选择器（/tools?focus=worldbook|preset）的行为（阶段 B3）。
 *
 * 原先全是 grep Tools.tsx 的 CSS 类名串。列表内容、时间标注、点击落点都是渲染后
 * 能直接断言的行为；滚动分区改为断言渲染节点的结构与声明，不再比对源码文本
 * （jsdom 没有排版引擎，滚动本身测不了，但「谁在滚动区里」是结构问题）。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAllWorldBooks = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getAllPresets = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/archive-db', () => ({
  getAllArchiveStories: vi.fn().mockResolvedValue([]),
  getAllCharacters: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks }));
vi.mock('@/lib/preset-db', () => ({ getAllPresets }));

import Tools from '@/pages/Tools';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
/** 与 Tools.tsx 的 formatStoryDate 同参；只为验证时间没被张冠李戴 */
const shown = (ts: number) =>
  new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

const IMPORTED_AT = day(2026, 1, 2);
const SOURCE_AT = day(2025, 6, 7);
const UPDATED_AT = day(2026, 3, 4);

const wbItem = (over: Record<string, unknown> = {}) => ({
  id: 'wb_1',
  title: '带源文件的世界书',
  worldbook: { entries: { a: {}, b: {} } },
  createdAt: IMPORTED_AT,
  updatedAt: UPDATED_AT,
  sourceModifiedAt: SOURCE_AT,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname}{location.search}</span>;
}

async function renderTools(entry: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Routes>
          <Route path="/tools" element={<Tools />} />
          <Route path="/worldbook" element={<div data-testid="worldbook-page">worldbook</div>} />
          <Route path="/preset" element={<div data-testid="preset-page">preset</div>} />
          <Route path="/chat" element={<div data-testid="chat-page">chat</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

const locationText = () => container.querySelector('[data-testid="loc"]')?.textContent ?? '';

const assetButtons = () =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-asset-scroll-region] button[aria-label]'));

const assetButton = (title: string) => {
  const found = assetButtons().find((el) => el.getAttribute('aria-label') === title);
  if (!found) throw new Error(`资产列表里没有「${title}」`);
  return found;
};

beforeEach(() => {
  localStorage.clear();
  getAllWorldBooks.mockClear().mockResolvedValue([]);
  getAllPresets.mockClear().mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('编辑区资产选择器列表', () => {
  it('世界书 focus 列出库内世界书，点击进对应编辑器的深链', async () => {
    getAllWorldBooks.mockResolvedValue([wbItem({ title: '甲世界书' })]);
    await renderTools('/tools?focus=worldbook');

    expect(assetButtons().map((el) => el.getAttribute('aria-label'))).toEqual(['甲世界书']);
    expect(assetButton('甲世界书').textContent).toContain('2 个条目');

    await act(async () => { assetButton('甲世界书').click(); });

    expect(locationText()).toBe('/worldbook?assetId=wb_1');
    expect(container.querySelector('[data-testid="worldbook-page"]')).not.toBeNull();
  });

  it('预设 focus 换成读预设库，落点是预设编辑器', async () => {
    getAllPresets.mockResolvedValue([{
      id: 'ps_1',
      title: '甲预设',
      preset: { prompts: [{}, {}, {}] },
      createdAt: IMPORTED_AT,
      updatedAt: UPDATED_AT,
    }]);
    await renderTools('/tools?focus=preset');

    expect(getAllWorldBooks).not.toHaveBeenCalled();
    expect(assetButton('甲预设').textContent).toContain('3 个提示词');

    await act(async () => { assetButton('甲预设').click(); });

    expect(locationText()).toBe('/preset?assetId=ps_1');
  });

  it('资产 id 带特殊字符时深链做转义，不会把参数截断', async () => {
    getAllWorldBooks.mockResolvedValue([wbItem({ id: 'wb 1&x=2', title: '怪 id' })]);
    await renderTools('/tools?focus=worldbook');

    await act(async () => { assetButton('怪 id').click(); });

    expect(locationText()).toBe('/worldbook?assetId=wb%201%26x%3D2');
  });
});

describe('资产卡的时间标注', () => {
  it('有源文件修改时间时，源文件时间和 STE 导入时间分别标明', async () => {
    getAllWorldBooks.mockResolvedValue([wbItem()]);
    await renderTools('/tools?focus=worldbook');

    const text = assetButton('带源文件的世界书').textContent ?? '';
    expect(text).toContain(`源文件 ${shown(SOURCE_AT)}`);
    expect(text).toContain(`导入 ${shown(IMPORTED_AT)}`);
    expect(text).not.toContain('STE 更新');
  });

  it('没有源文件修改时间时退回 STE 更新时间，不假装知道源文件时间', async () => {
    getAllWorldBooks.mockResolvedValue([wbItem({ title: '手建世界书', sourceModifiedAt: undefined })]);
    await renderTools('/tools?focus=worldbook');

    const text = assetButton('手建世界书').textContent ?? '';
    expect(text).toContain(`STE 更新 ${shown(UPDATED_AT)}`);
    expect(text).not.toContain('源文件');
    expect(text).not.toContain('导入 ');
  });
});

describe('资产列表的滚动分区', () => {
  it('列表自己滚，滚动区在选择栏内部而不是整页', async () => {
    getAllWorldBooks.mockResolvedValue([wbItem()]);
    await renderTools('/tools?focus=worldbook');

    const picker = container.querySelector('[data-editor-story-picker]');
    const region = container.querySelector('[data-asset-scroll-region]');
    expect(picker?.getAttribute('data-editor-focus')).toBe('worldbook');
    expect(region).not.toBeNull();
    expect(picker!.contains(region!)).toBe(true);
    // 标题行、导入按钮、搜索框都留在滚动区外，滚下去还能操作
    expect(region!.contains(container.querySelector('input[type="search"]'))).toBe(false);
    expect(assetButtons().length).toBe(1);

    // jsdom 没有排版引擎，只能断言声明：滚动条常驻（列表增减不抖动）+ 不向外链滚动
    expect(region!.classList.contains('overflow-y-scroll')).toBe(true);
    expect(region!.classList.contains('overscroll-contain')).toBe(true);
    // 左介绍 + 右选择两栏不许换行堆叠
    expect(picker!.parentElement!.classList.contains('flex-nowrap')).toBe(true);
  });

  it('空列表不渲染滚动区，直接给空态引导', async () => {
    await renderTools('/tools?focus=worldbook');

    expect(container.querySelector('[data-asset-scroll-region]')).toBeNull();
    expect(container.textContent).toContain('还没有保存的世界书');
  });
});
