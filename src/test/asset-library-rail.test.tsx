/**
 * 附属库只有一套竖导航（0830 反馈条目 12）。
 *
 * 改之前：类别在顶部 tabs、筛选在左栏，而「其他资产」那一支整页换成另一个组件，
 * 它自带第二条左栏——同一个页面两条竖导航，位置和宽度都不一样。
 *
 * 这里钉三件容易悄悄退化的事：
 * 1. 任何视图下 `<aside>` 只有一个（回归成两条栏时会红）。
 * 2. 侧栏点选写 URL：`?tab=` 与 `?section=` 互斥，别叠在一起。
 * 3. 状态/来源筛选出现在正文而不是侧栏里。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldBookItem } from '@/types/worldbook';

const book = (id: string, title: string): WorldBookItem => ({
  id,
  title,
  worldbook: { entries: {} },
  createdAt: 1,
  updatedAt: 2,
});

const getAllWorldBooks = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/worldbook-db', () => ({
  getAllWorldBooks,
  saveWorldBook: vi.fn().mockResolvedValue(undefined),
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

function Location() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname}{location.search}</span>;
}

async function renderPage(entry = '/assets?tab=worldbook') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <AssetLibrary />
        <Location />
      </MemoryRouter>,
    );
    await Promise.resolve();
  });
}

function rail(): HTMLElement {
  const asides = container.querySelectorAll('aside');
  expect(asides).toHaveLength(1);
  return asides[0] as HTMLElement;
}

function locationText() {
  return container.querySelector('[data-testid="loc"]')?.textContent;
}

async function clickIn(scope: ParentNode, label: string) {
  const found = [...scope.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`按钮没找到：${label}`);
  await act(async () => {
    found.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  getAllWorldBooks.mockReset().mockResolvedValue([book('wb-1', '雨港设定')]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('附属库单侧栏', () => {
  it('资产类别视图只有一套侧栏，四个类别都在里面', async () => {
    await renderPage();

    for (const label of ['世界书', '预设', '正则', '其他资产']) {
      expect(rail().textContent).toContain(label);
    }
  });

  it('其他资产视图仍然只有一套侧栏，归档子分类挂在它下面', async () => {
    await renderPage('/assets?section=extensions');

    const text = rail().textContent ?? '';
    expect(text).toContain('其他资产');
    expect(text).toContain('概览');
    expect(text).toContain('快速回复');
    // 三类结构化资产不会因为进了其他资产就从侧栏消失
    expect(text).toContain('世界书');
  });

  it('侧栏切类别时清掉上一个视图的 query，两个参数不叠加', async () => {
    await renderPage('/assets?section=extensions');
    await clickIn(rail(), '预设');
    expect(locationText()).toBe('/assets?tab=preset');

    await clickIn(rail(), '其他资产');
    expect(locationText()).toBe('/assets');
  });

  it('归档子分类写 ?section=，概览回到不带参数的 /assets', async () => {
    await renderPage();
    await clickIn(rail(), '其他资产');
    await clickIn(rail(), '快速回复');
    expect(locationText()).toBe('/assets?section=quick-replies');

    await clickIn(rail(), '概览');
    expect(locationText()).toBe('/assets');
  });

  it('状态和来源筛选在正文首行，不在侧栏', async () => {
    await renderPage();

    expect(rail().textContent).not.toContain('已被引用');
    expect(rail().textContent).not.toContain('来自 ST');
    expect(container.textContent).toContain('已被引用');
    expect(container.textContent).toContain('来自 ST');
  });

  it('读失败时侧栏不显示数量，免得把 0 当成空库', async () => {
    getAllWorldBooks.mockRejectedValue(new Error('boom'));
    await renderPage();

    expect(container.querySelector('[data-asset-library-load-error]')).not.toBeNull();
    const worldbookItem = [...rail().querySelectorAll('button')]
      .find((b) => b.textContent?.includes('世界书'));
    expect(worldbookItem?.textContent).toBe('世界书');
  });
});
