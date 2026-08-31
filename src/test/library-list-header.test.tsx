import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryListHeader } from '@/components/library/LibraryListHeader';
import { libraryListColumns } from '@/components/library/library-list-columns';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LibraryListHeader', () => {
  it('置顶展示角色卡、评分、故事数、最近活动和操作列', async () => {
    await act(async () => root.render(<LibraryListHeader batchMode={false} />));

    const header = document.body.querySelector<HTMLElement>('[data-library-list-header]');
    expect(header?.className).toContain('sticky');
    expect(header?.getAttribute('role')).toBe('row');
    for (const label of ['角色卡', '评分', '故事数', '最近活动', '操作']) {
      expect(header?.textContent).toContain(label);
    }
    expect(header?.style.gridTemplateColumns).toBe(libraryListColumns(false));
  });

  it('批量模式增加选择列且与列表行复用同一列定义', async () => {
    await act(async () => root.render(<LibraryListHeader batchMode />));

    const header = document.body.querySelector<HTMLElement>('[data-library-list-header]');
    expect(header?.textContent).toContain('选择');
    expect(header?.style.gridTemplateColumns).toBe(libraryListColumns(true));
  });
});
