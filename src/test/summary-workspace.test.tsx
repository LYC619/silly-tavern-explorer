import { act, forwardRef, useImperativeHandle, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveStory } from '@/types/archive';
import type { SummaryKind } from '@/types/summary';
import type { RecordWorkbenchHandle } from '@/components/organize/RecordWorkbench';

const workbenchBehavior = vi.hoisted(() => ({ unsaved: false }));

vi.mock('@/components/organize/RecordWorkbench', () => ({
  RecordWorkbench: forwardRef<RecordWorkbenchHandle, Record<string, unknown>>(function MockWorkbench(props, ref) {
    const record = props.record as { title?: string } | null;
    useImperativeHandle(ref, () => ({
      startManual: vi.fn(),
      regenerate: vi.fn(),
      hasUnsavedDraft: () => workbenchBehavior.unsaved,
    }));
    return (
      <div data-testid="record-workbench">
        {props.sidePanel as ReactNode}
        {record && <span data-testid="active-record">{record.title}</span>}
      </div>
    );
  }),
}));

vi.mock('@/components/summary/SavedSummaryList', () => ({
  SavedSummaryList: ({ kind, onView, onAdd }: { kind: string; onView: (item: unknown) => void; onAdd: () => void }) => (
    <div data-testid="saved-summary-list" data-kind={kind}>
      <button
        type="button"
        onClick={() => onView({
          id: 'summary-1', bookId: 'story-1', bookTitle: '测试故事', kind: 'volume',
          title: '第一卷', floorStart: 0, floorEnd: 1, content: '正文', createdAt: 1, updatedAt: 1,
        })}
      >
        查看现有
      </button>
      <button type="button" onClick={onAdd}>新增总结</button>
    </div>
  ),
}));

vi.mock('@/components/summary/SummaryGallery', () => ({
  SummaryGallery: ({ kind }: { kind: string }) => <div data-testid="summary-gallery" data-kind={kind}>展示页内容</div>,
}));

vi.mock('@/components/summary/MiniSummaryPanel', () => ({
  MiniSummaryPanel: () => <div data-testid="mini-summary">小总结内容</div>,
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

const activateTab = (button: HTMLButtonElement | undefined) => {
  act(() => button?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
};

function ControlledWorkspace({
  initialKind = 'volume',
  onKindChange = () => {},
}: {
  initialKind?: SummaryKind | 'mini';
  onKindChange?: (kind: SummaryKind | 'mini') => void;
}) {
  const [kind, setKind] = useState<SummaryKind | 'mini'>(initialKind);
  return (
    <SummaryWorkspace
      story={story}
      currentBranchId={null}
      kind={kind}
      onKindChange={(next) => {
        setKind(next);
        onKindChange(next);
      }}
    />
  );
}

beforeEach(() => {
  workbenchBehavior.unsaved = false;
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

  it('整理页外壳自己吃满高度并夹住溢出，滚动交给各视图内部', () => {
    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ControlledWorkspace />
        </MemoryRouter>,
      );
    });

    // jsdom 没有排版引擎，只能断言外壳的声明；展示页正文的滚动区见 organize-panels.test.tsx
    const shell = container.querySelector<HTMLElement>('[data-summary-workspace]');
    expect(shell).not.toBeNull();
    expect(shell!.classList.contains('h-full')).toBe(true);
    expect(shell!.classList.contains('min-h-0')).toBe(true);
    expect(shell!.classList.contains('overflow-hidden')).toBe(true);
  });

  it('一级页面默认停在生成工作台，切到展示页再切回来还能拿到列表', () => {
    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ControlledWorkspace />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[data-testid="record-workbench"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="saved-summary-list"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="summary-gallery"]')).toBeNull();

    activateTab([...container.querySelectorAll('button')].find((button) => button.textContent?.includes('展示页')));
    expect(container.querySelector('[data-testid="record-workbench"]')).toBeNull();

    activateTab([...container.querySelectorAll('button')].find((button) => button.textContent?.includes('生成工作台')));
    expect(container.querySelector('[data-testid="record-workbench"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="summary-gallery"]')).toBeNull();
  });

  it('一级页面与二级总结类型独立切换，展示页不会被送回生成工作台', () => {
    const onKindChange = vi.fn();
    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ControlledWorkspace onKindChange={onKindChange} />
        </MemoryRouter>,
      );
    });

    const galleryButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('展示页'));
    activateTab(galleryButton);
    expect(container.querySelector('[data-testid="summary-gallery"]')).not.toBeNull();

    const diaryButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('角色日记'));
    activateTab(diaryButton);
    expect(container.querySelector('[data-testid="summary-gallery"]')?.getAttribute('data-kind')).toBe('diary');
    expect(container.textContent).not.toContain('查看现有');
    expect(onKindChange).toHaveBeenCalledWith('diary');
  });

  it('小总结是首行二级类型，不再藏在右侧列表筛选里', () => {
    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ControlledWorkspace />
        </MemoryRouter>,
      );
    });
    const miniButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('小总结'));
    activateTab(miniButton);
    expect(container.querySelector('[data-testid="mini-summary"]')).not.toBeNull();
  });

  it('切换类型前确认放弃未保存草稿，取消时保留当前类型', () => {
    const onKindChange = vi.fn();
    workbenchBehavior.unsaved = true;
    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ControlledWorkspace onKindChange={onKindChange} />
        </MemoryRouter>,
      );
    });

    const diaryButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('角色日记'));
    activateTab(diaryButton);

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(onKindChange).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="saved-summary-list"]')?.getAttribute('data-kind')).toBe('volume');

    const discard = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('放弃草稿并切换'));
    act(() => discard?.click());
    expect(onKindChange).toHaveBeenCalledWith('diary');
    expect(container.querySelector('[data-testid="saved-summary-list"]')?.getAttribute('data-kind')).toBe('diary');
  });

});
