import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorldBookDraftState } from '@/hooks/use-worldbook-draft-state';
import type { WorldBook } from '@/types/worldbook';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useWorldBookDraftState>;

function HookHarness({ initial }: { initial: WorldBook | null }) {
  current = useWorldBookDraftState(initial);
  return null;
}

function renderDraftState(initial: WorldBook | null) {
  act(() => root.render(<HookHarness initial={initial} />));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function makeWorldBook(title: string): WorldBook {
  return {
    entries: {},
    originalData: { title },
  };
}

describe('useWorldBookDraftState', () => {
  it('keeps an asynchronous hydration clean', () => {
    const hydrated = makeWorldBook('异步恢复');
    renderDraftState(null);

    expect(current.isDirty).toBe(false);

    act(() => current.hydrateWorldbook(hydrated));

    expect(current.worldbook).toBe(hydrated);
    expect(current.isDirty).toBe(false);
  });

  it('marks an immutable user edit dirty', () => {
    const initial = makeWorldBook('原始内容');
    renderDraftState(initial);

    act(() => {
      current.setWorldbook((worldbook) => worldbook
        ? { ...worldbook, originalData: { title: '用户修改' } }
        : worldbook);
    });

    expect(current.worldbook?.originalData).toEqual({ title: '用户修改' });
    expect(current.isDirty).toBe(true);
  });

  it('resets the clean baseline after switching assets and saving', () => {
    const first = makeWorldBook('第一本');
    const second = makeWorldBook('第二本');
    renderDraftState(first);

    act(() => {
      current.setWorldbook((worldbook) => worldbook
        ? { ...worldbook, originalData: { title: '未保存修改' } }
        : worldbook);
    });
    expect(current.isDirty).toBe(true);

    act(() => current.hydrateWorldbook(second));
    expect(current.worldbook).toBe(second);
    expect(current.isDirty).toBe(false);

    act(() => {
      current.setWorldbook((worldbook) => worldbook
        ? { ...worldbook, originalData: { title: '第二本修改' } }
        : worldbook);
    });
    expect(current.isDirty).toBe(true);

    const saved = current.worldbook;
    act(() => current.markWorldbookClean(saved));
    expect(current.isDirty).toBe(false);
  });

  it('does not mark edits made during an asynchronous save as clean', () => {
    renderDraftState(makeWorldBook('原始内容'));

    act(() => {
      current.setWorldbook((worldbook) => worldbook
        ? { ...worldbook, originalData: { title: '开始保存的版本' } }
        : worldbook);
    });
    const savedSnapshot = current.worldbook;

    act(() => {
      current.setWorldbook((worldbook) => worldbook
        ? { ...worldbook, originalData: { title: '保存期间的新修改' } }
        : worldbook);
    });
    act(() => current.markWorldbookClean(savedSnapshot));

    expect(current.worldbook?.originalData).toEqual({ title: '保存期间的新修改' });
    expect(current.isDirty).toBe(true);
  });
});
