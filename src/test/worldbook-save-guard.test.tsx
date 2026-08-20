/**
 * 世界书的未保存守卫与保存落库路径（阶段 B1）。
 *
 * 覆盖 dirty → beforeunload 拦截、普通保存、写时复制（原资产不动 + 角色引用切副本），
 * 以及暂存列表的时间显示回退。全部通过渲染页面驱动，阶段 C1 抽 hook 后应仍然通过。
 * 注意：不改 COW 保存块本身（那块留给阶段 F），这里只是把它现有行为钉住。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENTRY } from '@/types/worldbook';
import type { WorldBook, WorldBookEntry, WorldBookItem } from '@/types/worldbook';

const saveWorldBook = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getAllWorldBooks = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getWorldBook = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const updateCharacterAssetReference = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/GuidedTour', () => ({ GuidedTour: () => null }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/worldbook-db', () => ({
  saveWorldBook,
  getAllWorldBooks,
  getWorldBook,
  deleteWorldBook: vi.fn().mockResolvedValue(undefined),
  pruneAutoSavedWorldBooks: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/archive-db', () => ({
  getCharacter: vi.fn().mockResolvedValue({ id: 'char_1', name: '赫敏' }),
}));
vi.mock('@/lib/character-asset-ref', () => ({ updateCharacterAssetReference }));

import WorldBookPage from '@/pages/WorldBook';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

function mkEntry(uid: number, over: Partial<WorldBookEntry> = {}): WorldBookEntry {
  return { ...DEFAULT_ENTRY, uid, comment: `条目${uid}`, content: `正文${uid}`, order: uid, ...over } as WorldBookEntry;
}

function mkBook(entries: WorldBookEntry[] = [mkEntry(1)]): WorldBook {
  return { entries: Object.fromEntries(entries.map((e) => [String(e.uid), e])) };
}

function mkItem(over: Partial<WorldBookItem> & { id: string; title: string }): WorldBookItem {
  return { worldbook: mkBook(), createdAt: 1000, updatedAt: 2000, ...over };
}

async function renderPage(session: { worldbook: WorldBook; filename: string; currentItemId: string | null }, search = '') {
  sessionStorage.setItem('wb-active-session', JSON.stringify(session));
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/worldbook${search}`]}>
        <WorldBookPage />
      </MemoryRouter>,
    );
  });
}

const buttonByText = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

async function click(el: Element | null | undefined) {
  await act(async () => { (el as HTMLElement | undefined)?.click(); });
}

/** 改一个条目的启用开关，作为「用户产生了未保存修改」的最小动作 */
async function makeDirty() {
  const toggle = document.querySelector('[data-entry-key] button[role="switch"]');
  if (!toggle) throw new Error('找不到条目上的启用开关');
  await click(toggle);
}

async function save() {
  const btn = buttonByText('保存') ?? Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('保存'));
  await click(btn);
  await act(async () => { await Promise.resolve(); });
}

/** beforeunload 是否被守卫拦下（preventDefault） */
function unloadBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  saveWorldBook.mockClear().mockResolvedValue(undefined);
  getAllWorldBooks.mockClear().mockResolvedValue([]);
  getWorldBook.mockClear().mockResolvedValue(null);
  updateCharacterAssetReference.mockClear().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('世界书未保存守卫', () => {
  it('恢复会话本身不算修改，不拦截关闭', async () => {
    await renderPage({ worldbook: mkBook(), filename: '测试', currentItemId: null });

    expect(unloadBlocked()).toBe(false);
  });

  it('用户改动后拦截关闭，保存完成后放行', async () => {
    getAllWorldBooks.mockResolvedValue([]);
    await renderPage({ worldbook: mkBook(), filename: '测试', currentItemId: null });

    await makeDirty();
    expect(unloadBlocked()).toBe(true);

    await save();

    expect(saveWorldBook).toHaveBeenCalled();
    expect(unloadBlocked()).toBe(false);
  });
});

describe('世界书保存落库', () => {
  it('无角色上下文时原地更新同一条资产', async () => {
    const existing = mkItem({ id: 'wb_1', title: '共享世界书' });
    getAllWorldBooks.mockResolvedValue([existing]);
    await renderPage({ worldbook: mkBook(), filename: '共享世界书', currentItemId: 'wb_1' });

    await makeDirty();
    await save();

    const saved = saveWorldBook.mock.calls.at(-1)![0] as WorldBookItem;
    expect(saved.id).toBe('wb_1');
    expect(saved.autoSaved).toBe(false);
    expect(updateCharacterAssetReference).not.toHaveBeenCalled();
  });

  it('角色上下文首次改共享资产：原资产不动，另存派生副本并把该角色引用切过去', async () => {
    const shared = mkItem({ id: 'wb_shared', title: '共享世界书' });
    getAllWorldBooks.mockResolvedValue([shared]);
    getWorldBook.mockResolvedValue(shared);
    await renderPage(
      { worldbook: mkBook(), filename: '共享世界书', currentItemId: 'wb_shared' },
      '?characterId=char_1&assetId=wb_shared',
    );

    await makeDirty();
    await save();

    const saved = saveWorldBook.mock.calls.at(-1)![0] as WorldBookItem;
    expect(saved.id).not.toBe('wb_shared');
    expect(saved.title).toBe('共享世界书_赫敏');
    expect(saved.derived).toMatchObject({ derivedFrom: 'wb_shared', characterId: 'char_1' });
    // 原资产没有被写过
    expect(saveWorldBook.mock.calls.every(([item]) => (item as WorldBookItem).id !== 'wb_shared')).toBe(true);
    // 该角色的引用切到新副本
    expect(updateCharacterAssetReference).toHaveBeenCalledWith(
      'char_1', 'worldbook', 'wb_shared', saved.id, expect.any(Number),
    );
  });

  it('同一角色再次保存时更新既有副本，不重复新建', async () => {
    const shared = mkItem({ id: 'wb_shared', title: '共享世界书' });
    const copy = mkItem({
      id: 'wb_copy',
      title: '共享世界书_赫敏',
      derived: { derivedFrom: 'wb_shared', characterId: 'char_1', diverged: true, createdAt: 1, updatedAt: 1 },
    });
    getAllWorldBooks.mockResolvedValue([shared, copy]);
    getWorldBook.mockResolvedValue(shared);
    await renderPage(
      { worldbook: mkBook(), filename: '共享世界书', currentItemId: 'wb_shared' },
      '?characterId=char_1&assetId=wb_shared',
    );

    await makeDirty();
    await save();

    const saved = saveWorldBook.mock.calls.at(-1)![0] as WorldBookItem;
    expect(saved.id).toBe('wb_copy');
    expect(updateCharacterAssetReference).toHaveBeenCalledWith(
      'char_1', 'worldbook', 'wb_shared', 'wb_copy', expect.any(Number),
    );
  });

  it('角色上下文里保存一份全新世界书：直接入库并挂到该角色名下', async () => {
    getAllWorldBooks.mockResolvedValue([]);
    await renderPage(
      { worldbook: mkBook(), filename: '新世界书', currentItemId: null },
      '?characterId=char_1',
    );

    await makeDirty();
    await save();

    const saved = saveWorldBook.mock.calls.at(-1)![0] as WorldBookItem;
    expect(saved.derived).toBeUndefined();
    expect(updateCharacterAssetReference).toHaveBeenCalledWith(
      'char_1', 'worldbook', saved.id, saved.id, expect.any(Number),
    );
  });
});

describe('暂存列表的时间显示', () => {
  it('有源文件修改时间时显示源文件时间，没有才回退到 STE 更新时间', async () => {
    const sourceModifiedAt = Date.UTC(2024, 0, 2, 3, 4, 5);
    const updatedAt = Date.UTC(2025, 5, 6, 7, 8, 9);
    getAllWorldBooks.mockResolvedValue([
      mkItem({ id: 'wb_src', title: '带源时间', sourceModifiedAt, updatedAt }),
      mkItem({ id: 'wb_plain', title: '无源时间', updatedAt }),
    ]);
    await renderPage({ worldbook: mkBook(), filename: '测试', currentItemId: null });

    await click(Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('已暂存')));

    const rowText = (title: string) => Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.includes(title))?.textContent ?? '';

    expect(rowText('带源时间')).toContain(new Date(sourceModifiedAt).toLocaleString());
    expect(rowText('带源时间')).not.toContain(new Date(updatedAt).toLocaleString());
    expect(rowText('无源时间')).toContain(new Date(updatedAt).toLocaleString());
  });
});
