/**
 * 故事树工作台外壳的行为（阶段 B3）。
 *
 * 原先在 legacy-editor-workspace.test.ts 里 grep「data-story-tree-selector」
 * 「<TreeWorkbench」「新建/导入/导出」这些源码文本。工具行长什么样、按钮点下去
 * 干什么，渲染出来就能断言。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveStory } from '@/types/archive';
import type { StoryTree } from '@/types/story-tree';

const getAllStoryTrees = vi.hoisted(() => vi.fn<() => Promise<StoryTree[]>>());
const saveStoryTree = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const deleteStoryTree = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/story-tree-db', () => ({ getAllStoryTrees, saveStoryTree, deleteStoryTree }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { StoryTreeWorkspace } from '@/components/organize/StoryTreeWorkspace';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb([{ target, contentRect: { width: 800, height: 600 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

const story = {
  id: 'story-1',
  title: '测试故事',
  session: { id: 's1', title: '测试故事', messages: [{ id: 'm1', role: 'assistant', content: '内容' }], character: { name: '角' }, user: { name: '用' }, createdAt: 1 },
  markers: [],
  favorites: [],
  meta: { modelsUsed: [], playTimeMs: null },
  createdAt: 1,
  updatedAt: 1,
} as unknown as ArchiveStory;

const tree = (over: Partial<StoryTree> = {}): StoryTree => ({
  id: 'tree-1',
  bookId: 'story-1',
  bookTitle: '测试故事',
  title: '甲树',
  nodes: [],
  createdAt: 1,
  updatedAt: 2,
  autoSaved: false,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(<StoryTreeWorkspace story={story} currentBranchId={null} />);
  });
  await act(async () => { await Promise.resolve(); });
}

const selector = () => container.querySelector('[data-story-tree-selector]');

const buttonIn = (scope: ParentNode, label: string) => {
  const found = Array.from(scope.querySelectorAll('button')).find((el) => el.textContent?.trim() === label);
  if (!found) throw new Error(`找不到「${label}」按钮`);
  return found;
};

/** 「导入」是包在 <label> 里的 asChild 按钮，实际触发点是里面的 file input */
const importInput = (scope: ParentNode) => {
  const label = Array.from(scope.querySelectorAll('label')).find((el) => el.textContent?.includes('导入'));
  const input = label?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('找不到「导入」的文件入口');
  return input;
};

const pickFile = async (input: HTMLInputElement, content: string) => {
  const file = new File([content], 'tree.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  getAllStoryTrees.mockReset().mockResolvedValue([]);
  saveStoryTree.mockClear();
  deleteStoryTree.mockClear();
  toast.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('[role="menu"]').forEach((el) => el.remove());
});

describe('故事树选树工具行', () => {
  it('有树时顶部工具行和树编辑器同屏，文件操作都在工具行里', async () => {
    getAllStoryTrees.mockResolvedValue([tree()]);
    await render();

    const bar = selector();
    expect(bar).not.toBeNull();
    // 工具行必须和编辑器同屏：编辑器的节点入口在，说明不是「先选树再进编辑器」两步
    expect(container.textContent).toContain('甲树');
    expect(buttonIn(bar!, '新建')).toBeTruthy();
    expect(buttonIn(bar!, '导出')).toBeTruthy();
    expect(buttonIn(bar!, '删除')).toBeTruthy();
    expect(importInput(bar!)).toBeTruthy();
  });

  it('只列当前故事的树，别的故事的树不混进来', async () => {
    getAllStoryTrees.mockResolvedValue([
      tree(),
      tree({ id: 'tree-2', bookId: 'story-2', bookTitle: '别的故事', title: '乙树' }),
    ]);
    await render();

    const trigger = selector()!.querySelector('[role="combobox"]');
    await act(async () => { trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    const options = Array.from(document.querySelectorAll('[role="option"]')).map((el) => el.textContent);
    expect(options).toHaveLength(1);
    expect(options[0]).toContain('甲树');
  });

  it('导出给 JSON 和 Markdown 两条路，不是单一格式', async () => {
    getAllStoryTrees.mockResolvedValue([tree()]);
    await render();

    const exportButton = buttonIn(selector()!, '导出');
    await act(async () => {
      exportButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      exportButton.click();
    });

    const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent ?? '');
    expect(items.some((text) => text.includes('JSON'))).toBe(true);
    expect(items.some((text) => text.includes('Markdown'))).toBe(true);
  });
});

describe('还没有故事树时', () => {
  it('空态照样给新建和导入，不给导出和删除', async () => {
    await render();

    const bar = selector();
    expect(bar).not.toBeNull();
    expect(buttonIn(bar!, '新建故事树')).toBeTruthy();
    expect(importInput(bar!)).toBeTruthy();
    expect(Array.from(bar!.querySelectorAll('button')).map((el) => el.textContent?.trim()))
      .not.toContain('导出');
  });

  it('导入的树落到当前故事名下，节点原样带进来', async () => {
    await render();

    saveStoryTree.mockImplementation(async (item: StoryTree) => {
      getAllStoryTrees.mockResolvedValue([item]);
    });
    await pickFile(importInput(selector()!), JSON.stringify({
      title: '外来的树',
      nodes: [{ id: 'n1', title: '开端' }, { id: 'n2', title: '转折', parentId: 'n1' }],
    }));

    expect(saveStoryTree).toHaveBeenCalledTimes(1);
    expect(saveStoryTree.mock.calls[0][0]).toMatchObject({ bookId: 'story-1', title: '外来的树' });
    expect(saveStoryTree.mock.calls[0][0].nodes).toHaveLength(2);
    expect(container.textContent).toContain('外来的树');
  });

  it('导入内容不是故事树时报错且不落库', async () => {
    await render();

    await pickFile(importInput(selector()!), JSON.stringify({ title: '空壳' }));

    expect(saveStoryTree).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '导入失败', variant: 'destructive' }));
  });

  it('新建落库后当场进入这棵新树的编辑器', async () => {
    await render();

    getAllStoryTrees.mockResolvedValue([tree({ title: '测试故事 的故事树' })]);
    saveStoryTree.mockImplementation(async (item: StoryTree) => {
      getAllStoryTrees.mockResolvedValue([tree({ id: item.id, title: item.title })]);
    });

    await act(async () => { buttonIn(selector()!, '新建故事树').click(); });
    await act(async () => { await Promise.resolve(); });

    expect(saveStoryTree).toHaveBeenCalledTimes(1);
    expect(saveStoryTree.mock.calls[0][0]).toMatchObject({ bookId: 'story-1', nodes: [] });
    expect(container.textContent).toContain('测试故事 的故事树');
    expect(buttonIn(selector()!, '导出')).toBeTruthy();
  });
});
