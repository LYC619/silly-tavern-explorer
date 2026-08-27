import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryFilterRail } from '@/components/library/LibraryFilterRail';
import {
  buildLibraryFilterSections,
  buildManagedTagOptions,
  normalizeLibraryTagPreferences,
} from '@/lib/library-tag-preferences';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function buttonText(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.trim().startsWith(label)) as HTMLButtonElement | undefined;
}

async function renderRail({
  uncategorizedExpanded = false,
  activeType = 'all',
  onTypeChange = vi.fn(),
  railWidth,
}: {
  uncategorizedExpanded?: boolean;
  activeType?: string;
  onTypeChange?: ReturnType<typeof vi.fn>;
  railWidth?: number;
} = {}) {
  if (railWidth !== undefined) localStorage.setItem('ste-library-filter-width', String(railWidth));
  const tags = [
    '人物/少女',
    '人物/少女',
    '卡面/NSFW',
    '评价/精品',
    ...Array.from({ length: 8 }, (_, index) => `散列${index + 1}`),
  ];
  const preferences = normalizeLibraryTagPreferences(undefined);
  const sections = buildLibraryFilterSections(
    buildManagedTagOptions(tags, preferences),
    uncategorizedExpanded,
  );
  await act(async () => {
    root.render(
      <LibraryFilterRail
        typeOptions={[
          { value: '人物', label: '人物', count: 2 },
          { value: '剧情', label: '剧情', count: 0 },
        ]}
        unclassifiedCount={1}
        activeType={activeType}
        sections={sections}
        activeTags={{}}
        uncategorizedExpanded={uncategorizedExpanded}
        onTypeChange={onTypeChange}
        onTagToggle={vi.fn()}
        onUncategorizedExpandedChange={vi.fn()}
      />,
    );
  });
  return { sections, onTypeChange };
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root.unmount());
  container.remove();
});

describe('LibraryFilterRail', () => {
  it('类型固定在标签滚动区外，且零计数类型仍然展示', async () => {
    await renderRail();

    expect(buttonText('全部')).toBeUndefined();
    expect(buttonText('人物')).toBeDefined();
    expect(buttonText('剧情')).toBeDefined();
    const scroller = document.body.querySelector('[data-library-filter-scroll]') as HTMLElement;
    const typePanel = document.body.querySelector('[data-library-type-panel]') as HTMLElement;
    expect(typePanel).toBeInstanceOf(HTMLElement);
    expect(scroller.contains(typePanel)).toBe(false);
    expect(typePanel.textContent).not.toContain('未分类');
  });

  it('主标签区默认双列，显示已定义但未使用的标签，不显示卡面和评价', async () => {
    await renderRail();

    expect(document.body.querySelector('[data-library-tag-grid]')?.className).toContain('grid-cols-2');
    expect(document.body.textContent).toContain('人物');
    expect(document.body.textContent).not.toContain('卡面');
    expect(document.body.textContent).not.toContain('评价');
    expect(document.body.textContent).toContain('成女');
  });

  it('类型在最窄侧栏中仍固定使用紧凑双列', async () => {
    await renderRail({ railWidth: 200 });
    expect(document.body.querySelector('[data-library-type-grid]')?.className).toContain('grid-cols-2');
    expect(document.body.querySelector('[data-library-tag-grid]')?.className).toContain('grid-cols-1');
  });

  it('普通标签从 240px 起使用双列', async () => {
    await renderRail({ railWidth: 240 });
    expect(document.body.querySelector('[data-library-tag-grid]')?.className).toContain('grid-cols-2');
  });

  it('未分类标签固定在滚动区外，默认三行六个并可展开', async () => {
    const { sections } = await renderRail();

    expect(document.body.querySelector('[data-library-filter-scroll]')).not.toContain(
      document.body.querySelector('[data-library-uncategorized-footer]'),
    );
    expect(document.body.querySelectorAll('[data-library-uncategorized-item]')).toHaveLength(6);
    expect(document.body.querySelector('[data-library-uncategorized-footer]')?.textContent).toContain('未分类');
    expect(buttonText('展开其余')).toBeDefined();
    expect(sections.uncategorized.hasMore).toBe(true);

    await renderRail({ uncategorizedExpanded: true });
    expect(document.body.querySelectorAll('[data-library-uncategorized-item]')).toHaveLength(8);
    expect(buttonText('收起')).toBeDefined();
  });

  it('底部未分类标题负责筛选无类型角色，并支持再次点击清除', async () => {
    const onTypeChange = vi.fn();
    await renderRail({ onTypeChange });

    await act(async () => buttonText('未分类')?.click());
    expect(onTypeChange).toHaveBeenCalledWith('none');

    await renderRail({ activeType: 'none', onTypeChange });
    await act(async () => buttonText('未分类')?.click());
    expect(onTypeChange).toHaveBeenLastCalledWith('all');
  });

  it('「?」说明是可聚焦按钮，且不嵌在其它按钮里', async () => {
    await renderRail();

    // 曾经的写法是给 <span> 挂原生 title：WebView2 下不可靠，键盘和读屏摸不到；
    // 嵌在折叠按钮内部时更是永不触发——悬浮命中的是外层 button。
    const hints = [...document.body.querySelectorAll('[aria-label$="说明"]')];
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) {
      expect(hint.tagName).toBe('BUTTON');
      expect(hint.closest('button')).toBe(hint);
      expect(hint.getAttribute('title')).toBeNull();
    }
    expect(hints.some((hint) => hint.getAttribute('aria-label') === '类型说明')).toBe(true);
  });

  it('标签组折叠按钮与说明按钮各自独立可点', async () => {
    await renderRail();

    const groupHint = [...document.body.querySelectorAll('button[aria-label^="标签组"]')]
      .find((button) => button.getAttribute('aria-label')?.endsWith('说明'));
    expect(groupHint).toBeDefined();
    const collapseToggle = [...document.body.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label')?.startsWith('折叠标签组'));
    expect(collapseToggle).toBeDefined();
    expect(collapseToggle?.contains(groupHint as Node)).toBe(false);
  });

  it('标签滚动条默认隐藏，只在滚动期间标记为可见', async () => {
    vi.useFakeTimers();
    await renderRail();
    const scroller = document.body.querySelector('[data-library-filter-scroll]') as HTMLElement;

    expect(scroller.dataset.scrolling).toBe('false');
    await act(async () => scroller.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(scroller.dataset.scrolling).toBe('true');

    await act(async () => vi.advanceTimersByTime(800));
    expect(scroller.dataset.scrolling).toBe('false');
  });
});
