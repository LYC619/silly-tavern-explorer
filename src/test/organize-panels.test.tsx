/**
 * 整理页左栏配置块的默认折叠，以及各视图的内部滚动边界（阶段 B3）。
 *
 * 原先 summary-workspace.test.tsx 里三条 grep：读 4 个面板源码比
 * 「<Collapsible defaultOpen>」，读 SummaryGallery / IOPanel / StoryTreeWorkspace
 * 比 CSS 类名串。折叠状态渲染出来就能看见；滚动区改为断言渲染节点，
 * 抽组件、改类名顺序都不会误红（jsdom 没有排版引擎，滚动本身测不了）。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SummaryItem } from '@/types/summary';
import type { ArchiveStory } from '@/types/archive';
import type { ChatSession } from '@/types/chat';

const summaries = vi.hoisted(() => ({ items: [] as SummaryItem[] }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/summary-db', () => ({
  getAllSummaries: vi.fn(async () => summaries.items),
  saveSummary: vi.fn(async () => {}),
  deleteSummary: vi.fn(async () => {}),
}));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn(async () => []) }));
vi.mock('@/lib/story-tree-db', () => ({ getAllStoryTrees: vi.fn(async () => []) }));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn(async () => []) }));

import { FloorRangePicker } from '@/components/summary/FloorRangePicker';
import { PriorVolumesPanel } from '@/components/summary/PriorVolumesPanel';
import { AttachPanel } from '@/components/summary/AttachPanel';
import { BatchProcessor } from '@/components/summary/BatchProcessor';
import { SummaryGallery } from '@/components/summary/SummaryGallery';
import { IOPanel } from '@/components/workspace/IOPanel';
import { getDefaultExportSettings } from '@/lib/session-storage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

const volume: SummaryItem = {
  id: 'sum-1', bookId: 'story-1', bookTitle: '测试故事', kind: 'volume',
  title: '第一卷', floorStart: 0, floorEnd: 3, content: '卷一正文',
  createdAt: 1, updatedAt: 1,
} as SummaryItem;

const session: ChatSession = {
  id: 's1', title: '测试故事', createdAt: 1,
  character: { name: '角色' }, user: { name: '用户' },
  messages: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'user' : 'assistant', content: `第 ${i} 楼` })),
} as ChatSession;

const story = {
  id: 'story-1', title: '测试故事', session,
  markers: [], favorites: [], meta: { modelsUsed: [], playTimeMs: null },
  createdAt: 1, updatedAt: 1,
} as unknown as ArchiveStory;

async function render(node: React.ReactNode) {
  await act(async () => { root.render(node); });
  await act(async () => { await Promise.resolve(); });
}

/** Radix CollapsibleTrigger 一律带 aria-expanded，asChild 换成 div 也还在 */
const trigger = (label: string) => {
  const found = Array.from(container.querySelectorAll<HTMLElement>('[aria-expanded]'))
    .find((el) => el.textContent?.includes(label));
  if (!found) throw new Error(`找不到「${label}」的折叠开关`);
  return found;
};

beforeEach(() => {
  summaries.items = [];
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('左栏配置块的默认折叠', () => {
  it('楼层范围默认展开，进来就能改起止楼', async () => {
    await render(<FloorRangePicker total={10} start={0} end={5} onChange={vi.fn()} />);

    expect(container.querySelector('#floor-start')).not.toBeNull();
    expect(container.textContent).toContain('起始楼层');
  });

  it('前情连贯默认展开，已有分卷一眼可见', async () => {
    await render(<PriorVolumesPanel volumes={[volume]} selectedIds={[volume.id]} onChange={vi.fn()} />);

    expect(container.textContent).toContain('第一卷');
    expect(container.textContent).toContain('已选 1/1');
  });

  it('挂载设定默认收起，展开后才出预设与世界书选择', async () => {
    await render(<AttachPanel value={{ presetId: null, worldbookId: null, worldbookMode: 'constant', worldbookUids: [] }} onChange={vi.fn()} tokenEstimate={1234} />);

    expect(container.textContent).toContain('挂载设定（可选）');
    expect(container.textContent).not.toContain('决定上下文组装顺序');

    await act(async () => { trigger('挂载设定（可选）').click(); });

    expect(container.textContent).toContain('决定上下文组装顺序');
  });

  it('批量分段生成默认收起，展开后才出分段参数', async () => {
    await render(<BatchProcessor session={session} floorStart={0} floorEnd={5} systemPrompt="模板" />);

    expect(container.textContent).toContain('批量分段生成');
    expect(container.textContent).not.toContain('每段楼数');

    await act(async () => { trigger('批量分段生成').click(); });

    expect(container.textContent).toContain('每段楼数');
  });
});

describe('整理页各视图的内部滚动', () => {
  it('展示页正文单独滚动，标题与导出按钮不跟着滚走', async () => {
    summaries.items = [volume];
    await render(<SummaryGallery currentBookId="story-1" refreshKey={0} kind="volume" />);

    const scroller = container.querySelector<HTMLElement>('[data-summary-content-scroll]');
    expect(scroller).not.toBeNull();
    expect(scroller!.textContent).toContain('卷一正文');
    expect(scroller!.classList.contains('overflow-y-auto')).toBe(true);
    // 导出按钮留在滚动区外
    const exportButton = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.includes('.md'));
    expect(exportButton && scroller!.contains(exportButton)).toBe(false);
  });

  it('导入导出视图自己滚，不把整理页外壳撑破', async () => {
    await render(
      <IOPanel
        story={story}
        branchId={null}
        line={{ session, markers: [], favorites: [], lastFloor: undefined }}
        settings={getDefaultExportSettings()}
        onStoryUpdate={vi.fn()}
      />,
    );

    const rootEl = container.firstElementChild as HTMLElement;
    expect(rootEl.classList.contains('overflow-y-auto')).toBe(true);
    expect(rootEl.classList.contains('h-full')).toBe(true);
    expect(rootEl.classList.contains('min-h-0')).toBe(true);
  });
});
