/**
 * 世界书跨页会话暂存的写入时机（阶段 C1 新增行为）。
 *
 * 原实现每次渲染都 stringify 整本书，改成节流后必须保证两件事：
 * 编辑过程中不再逐字符写盘，以及路由切换卸载时未落盘的改动仍要写出——
 * 后者丢了就等于用户切个页面草稿没了，正是这段代码存在的理由。
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENTRY } from '@/types/worldbook';
import type { WorldBook } from '@/types/worldbook';
import { loadWbSession, useRestoredWbSession, useWorldbookSession } from '@/hooks/use-worldbook-session';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mkBook = (comment: string): WorldBook => ({
  entries: { '0': { ...DEFAULT_ENTRY, uid: 0, comment } },
});

let container: HTMLDivElement;
let root: Root;
let setBook: (wb: WorldBook | null) => void;

function Harness({ initial }: { initial: WorldBook | null }) {
  const [wb, setWb] = useState<WorldBook | null>(initial);
  setBook = setWb;
  useWorldbookSession(wb, '测试世界书', 'wb_1');
  return null;
}

function RestoreProbe() {
  const restored = useRestoredWbSession();
  return <span data-restored={restored?.filename ?? ''} />;
}

const render = async (node: React.ReactNode) => { await act(async () => { root.render(node); }); };
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
const stored = () => loadWbSession();

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('世界书会话暂存的写入时机', () => {
  it('连续编辑不逐次写盘，安静下来后只落最后一版', async () => {
    await render(<Harness initial={mkBook('第一版')} />);
    // 节流窗口内还没写出
    expect(stored()).toBeNull();

    await act(async () => { setBook(mkBook('第二版')); });
    await advance(200);
    await act(async () => { setBook(mkBook('第三版')); });
    expect(stored()).toBeNull();

    await advance(500);

    expect(stored()?.worldbook.entries['0'].comment).toBe('第三版');
    expect(stored()?.filename).toBe('测试世界书');
    expect(stored()?.currentItemId).toBe('wb_1');
  });

  it('卸载时把未落盘的改动写出，切走再切回不丢草稿', async () => {
    await render(<Harness initial={mkBook('草稿')} />);
    expect(stored()).toBeNull();

    // 节流还没到点就被路由卸载
    await act(async () => { root.unmount(); });

    expect(stored()?.worldbook.entries['0'].comment).toBe('草稿');

    // 重新挂载的页面能读回这份草稿
    root = createRoot(container);
    await render(<RestoreProbe />);
    expect(container.querySelector('span')?.getAttribute('data-restored')).toBe('测试世界书');
  });

  it('世界书被清空时删除暂存，不留下过期草稿', async () => {
    await render(<Harness initial={mkBook('有内容')} />);
    await advance(500);
    expect(stored()).not.toBeNull();

    await act(async () => { setBook(null); });
    await advance(500);

    expect(stored()).toBeNull();
  });
});
