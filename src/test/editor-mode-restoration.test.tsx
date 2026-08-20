/**
 * 编辑区入口的落点与恢复行为（阶段 B3）。
 *
 * 原先全是 grep：读 Home.tsx 匹配一段正则、读 Tools.tsx 比对整行 JSX、
 * 读 navigation-model.ts 找字符串。信息架构本来就是可以直接 import 的数据，
 * 路由跳转本来就是可以渲染后断言的行为，没有一条需要读源码文本。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAV_AREAS, matchesNavDestination } from '@/lib/navigation-model';

const getAllArchiveStories = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getAllCharacters = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children, actions }: { children?: React.ReactNode; actions?: React.ReactNode }) => (
    <div>{actions}{children}</div>
  ),
}));
vi.mock('@/lib/archive-db', () => ({ getAllArchiveStories, getAllCharacters }));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn().mockResolvedValue([]) }));

import Tools from '@/pages/Tools';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname}{location.search}</span>;
}

const locationText = () => container.querySelector('[data-testid="loc"]')?.textContent ?? '';

async function renderTools(entry: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Routes>
          <Route path="/tools" element={<Tools />} />
          <Route path="/chat" element={<div data-testid="chat-page">chat</div>} />
          <Route path="/story/:id" element={<div data-testid="story-page">story</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  getAllArchiveStories.mockClear().mockResolvedValue([]);
  getAllCharacters.mockClear().mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('编辑区一级入口', () => {
  it('编辑区落点就是聊天工作台，不再经过一个选择页', () => {
    const editor = NAV_AREAS.find((area) => area.key === 'editor');
    expect(editor?.path).toBe('/chat');
  });

  it('不带 focus 直接进 /tools 会被送回聊天工作台', async () => {
    await renderTools('/tools');

    expect(container.querySelector('[data-testid="chat-page"]')).not.toBeNull();
    expect(locationText()).toBe('/chat');
  });

  it('带 focus 的整理入口停在选择页，不被重定向走', async () => {
    for (const focus of ['summary', 'story-tree', 'worldbook', 'preset']) {
      await act(async () => { root.unmount(); });
      root = createRoot(container);
      await renderTools(`/tools?focus=${focus}`);

      expect(container.querySelector('[data-testid="chat-page"]')).toBeNull();
      expect(locationText()).toBe(`/tools?focus=${focus}`);
    }
  });

  it('无法识别的 focus 同样回到聊天工作台，不留白页', async () => {
    await renderTools('/tools?focus=不存在的视图');

    expect(container.querySelector('[data-testid="chat-page"]')).not.toBeNull();
  });
});

describe('整理入口与聊天工作台互不串台', () => {
  const editorChildren = NAV_AREAS.find((area) => area.key === 'editor')!.children;

  it('总结、故事树、世界书、预设各自有独立落点，都不是 /chat', () => {
    const organizers = ['summary', 'story-tree', 'worldbook', 'preset'];
    for (const key of organizers) {
      const child = editorChildren.find((item) => item.key === key);
      expect(child, `编辑区缺少子项 ${key}`).toBeDefined();
      expect(child!.path).not.toBe('/chat');
      expect(child!.path.startsWith('/tools?focus=') || child!.path.startsWith('/')).toBe(true);
    }
  });

  it('停在聊天工作台时，四个整理子项都不高亮', () => {
    for (const key of ['summary', 'story-tree', 'worldbook', 'preset']) {
      const child = editorChildren.find((item) => item.key === key)!;
      expect(matchesNavDestination(child, '/chat', ''), `${key} 不该在 /chat 高亮`).toBe(false);
    }
  });

  it('每个整理子项只在自己的 focus 下高亮', () => {
    for (const key of ['summary', 'story-tree']) {
      const child = editorChildren.find((item) => item.key === key)!;
      const search = `?focus=${key}`;
      expect(matchesNavDestination(child, '/tools', search)).toBe(true);
      expect(matchesNavDestination(child, '/tools', '?focus=其他')).toBe(false);
    }
  });
});

describe('选择页不再重复承担 ST 扫描与旧入口', () => {
  it('总结选择页上没有 ST 扫描入口，也没有旧的「进入分卷总结」按钮', async () => {
    await renderTools('/tools?focus=summary');

    const text = container.textContent ?? '';
    expect(text).not.toContain('进入分卷总结');
    expect(text).not.toContain('扫描 SillyTavern');
    expect(container.querySelector('[data-st-import-card]')).toBeNull();
  });

  it('在总结选择页挑一个故事，进的是同一故事的分卷视图并记住当前故事', async () => {
    getAllArchiveStories.mockResolvedValue([{
      id: 'st_1',
      title: '被选中的故事',
      characterId: undefined,
      session: { id: 's1', title: '被选中的故事', messages: [], character: { name: '角' }, user: { name: '用' }, createdAt: 1 },
      markers: [],
      favorites: [],
      meta: { modelsUsed: [], playTimeMs: null },
      createdAt: 1,
      updatedAt: 2,
    }]);
    await renderTools('/tools?focus=summary');

    const picker = container.querySelector('[data-editor-story-picker]');
    expect(picker).not.toBeNull();
    const row = Array.from(picker!.querySelectorAll('button, [role="button"]'))
      .find((el) => el.textContent?.includes('被选中的故事'));
    if (!row) throw new Error('选择页没有列出故事');

    await act(async () => { (row as HTMLElement).click(); });

    expect(locationText()).toBe('/story/st_1?view=volume');
    expect(localStorage.getItem('ste-current-editor-story-id')).toBe('st_1');
  });
});
