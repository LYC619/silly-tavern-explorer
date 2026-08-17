import { act, forwardRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ArchiveStory } from '@/types/archive';

vi.mock('@/components/organize/RecordWorkbench', () => ({
  RecordWorkbench: forwardRef<HTMLDivElement, Record<string, unknown>>(function MockWorkbench(props, ref) {
    const record = props.record as { title?: string } | null;
    return (
      <div ref={ref} data-testid="record-workbench">
        {props.sidePanel as ReactNode}
        {record && <span data-testid="active-record">{record.title}</span>}
      </div>
    );
  }),
}));

vi.mock('@/components/summary/SavedSummaryList', () => ({
  SavedSummaryList: ({ onView }: { onView: (item: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onView({
        id: 'summary-1', bookId: 'story-1', bookTitle: '测试故事', kind: 'volume',
        title: '第一卷', floorStart: 0, floorEnd: 1, content: '正文', createdAt: 1, updatedAt: 1,
      })}
    >
      查看现有
    </button>
  ),
}));

vi.mock('@/components/summary/SummaryGallery', () => ({
  SummaryGallery: () => <div>展示页内容</div>,
}));

import { SummaryWorkspace } from '@/components/organize/SummaryWorkspace';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const story = {
  id: 'story-1',
  title: '测试故事',
  session: { messages: [{ id: 'm1', role: 'assistant', content: '内容' }] },
  markers: [],
  favorites: [],
  meta: { modelsUsed: [], playTimeMs: null },
  createdAt: 1,
  updatedAt: 1,
} as unknown as ArchiveStory;

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

describe('总结工作台单屏交互', () => {
  it('查看已生成总结后用详情替换列表，并提供返回列表', () => {
    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SummaryWorkspace
            story={story}
            currentBranchId={null}
            kind="volume"
            onKindChange={() => {}}
          />
        </MemoryRouter>,
      );
    });

    const viewButton = [...container.querySelectorAll('button')].find((button) => button.textContent === '查看现有');
    act(() => viewButton?.click());

    expect(container.querySelector('[data-testid="active-record"]')?.textContent).toBe('第一卷');
    expect([...container.querySelectorAll('button')].some((button) => button.textContent?.includes('返回已生成总结'))).toBe(true);
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === '查看现有')).toBe(false);
  });

  it('页面和展示正文声明固定高度与内部滚动边界', () => {
    const workspace = readFileSync(resolve(process.cwd(), 'src/components/organize/SummaryWorkspace.tsx'), 'utf8');
    const gallery = readFileSync(resolve(process.cwd(), 'src/components/summary/SummaryGallery.tsx'), 'utf8');
    expect(workspace).toContain('h-full min-h-0 overflow-hidden');
    expect(workspace).toContain('data-summary-workspace');
    expect(gallery).toContain('data-summary-content-scroll');
    expect(gallery).toContain('overflow-y-auto');
  });
});
