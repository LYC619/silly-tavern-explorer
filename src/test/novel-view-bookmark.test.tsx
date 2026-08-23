/**
 * 书签跳页必须和普通翻页一样做双页归一化。
 *
 * 小说视图是固定双页：左页恒为偶数页。翻页按钮/方向键/进度条都走 goToPage，
 * 书签和章节目录也必须走同一条路——直接 setCurrentPage(bookmark.pageIndex) 会把
 * 落在奇数页的书签变成左页，整本书的左右页从此错位一位。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NovelView from '@/components/reader/NovelView';
import type { ChatSession } from '@/types/chat';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** 十段长正文 → 多组跨页，书签落点覆盖奇偶两种页码 */
const session: ChatSession = {
  id: 'novel-bookmark-session',
  title: '书签跳页测试',
  messages: Array.from({ length: 10 }, (_, i) => ({
    id: `m${i}`,
    role: (i % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
    content: `这是第${i}段用于分页的完整句子。`.repeat(40),
    rawData: {},
  })),
  character: { name: '角色' },
  user: { name: '用户' },
  createdAt: 1,
};

const favorites = session.messages.map((m) => m.id);

async function renderNovel() {
  await act(async () => {
    root.render(
      <NovelView
        session={session}
        markers={[]}
        regexRules={[]}
        favorites={favorites}
        onClose={vi.fn()}
        readOnly
        embedded
      />,
    );
  });
}

/** 页脚形如「3–4 / 21」或末页「21 / 21」，取左页的 1 基页码 */
function leftPageNumber(): number {
  const text = container.querySelector('[data-novel-progress]')?.textContent ?? '';
  const match = text.match(/^\s*(\d+)/);
  if (!match) throw new Error(`页脚没渲染出页码：${text}`);
  return Number(match[1]);
}

async function openBookmarkList(): Promise<HTMLButtonElement[]> {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="书签列表"]');
  if (!trigger) throw new Error('没找到书签列表入口');
  await act(async () => { trigger.click(); });

  const rows = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .filter((node) => /^#\d+/.test(node.textContent ?? ''));
  if (rows.length === 0) throw new Error('书签弹层没有渲染出条目');
  return rows;
}

describe('小说视图书签跳页', () => {
  it('每一条书签都跳到跨页起点（左页恒为奇数页码）', async () => {
    await renderNovel();
    const rows = await openBookmarkList();
    expect(rows.length).toBeGreaterThan(3);

    const landings: number[] = [];
    for (const row of rows) {
      await act(async () => { row.click(); });
      const left = leftPageNumber();
      // 1 基页码为奇数 ⇔ 0 基 currentPage 为偶数 ⇔ 落在跨页起点
      expect(left % 2, `书签跳到了第 ${left} 页，不是跨页起点`).toBe(1);
      landings.push(left);
    }

    // 书签确实散落在不同跨页上，测试没有因为全部落在第 1 页而空过
    expect(new Set(landings).size).toBeGreaterThan(1);
  });

  it('章节目录与书签用同一条跳页路径', async () => {
    await renderNovel();
    const rows = await openBookmarkList();

    await act(async () => { rows[rows.length - 1].click(); });
    const last = leftPageNumber();

    // 键盘翻页与书签跳页落在同一套跨页起点上
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    });
    expect(leftPageNumber()).toBe(last - 2);
  });
});
