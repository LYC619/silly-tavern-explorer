import { act, forwardRef, useImperativeHandle, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('页面和展示正文声明固定高度与内部滚动边界', () => {
    const workspace = readFileSync(resolve(process.cwd(), 'src/components/organize/SummaryWorkspace.tsx'), 'utf8');
    const gallery = readFileSync(resolve(process.cwd(), 'src/components/summary/SummaryGallery.tsx'), 'utf8');
    expect(workspace).toContain('h-full min-h-0 overflow-hidden');
    expect(workspace).toContain('data-summary-workspace');
    expect(gallery).toContain('data-summary-content-scroll');
    expect(gallery).toContain('overflow-y-auto');
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

  it('左侧配置块可折叠，挂载设定和批量生成默认收起', () => {
    const floor = readFileSync(resolve(process.cwd(), 'src/components/summary/FloorRangePicker.tsx'), 'utf8');
    const attach = readFileSync(resolve(process.cwd(), 'src/components/summary/AttachPanel.tsx'), 'utf8');
    const prior = readFileSync(resolve(process.cwd(), 'src/components/summary/PriorVolumesPanel.tsx'), 'utf8');
    const batch = readFileSync(resolve(process.cwd(), 'src/components/summary/BatchProcessor.tsx'), 'utf8');
    expect(floor).toContain('<Collapsible defaultOpen>');
    expect(prior).toContain('<Collapsible defaultOpen>');
    expect(attach).toContain('<Collapsible>');
    expect(attach).not.toContain('<Collapsible defaultOpen>');
    expect(batch).toContain('<Collapsible>');
    expect(batch).not.toContain('<Collapsible defaultOpen>');
  });

  it('故事树和导入导出视图在整理页外壳内拥有独立滚动', () => {
    const tree = readFileSync(resolve(process.cwd(), 'src/components/organize/StoryTreeWorkspace.tsx'), 'utf8');
    const io = readFileSync(resolve(process.cwd(), 'src/components/workspace/IOPanel.tsx'), 'utf8');
    expect(tree).toContain('h-full min-h-0 overflow-y-auto');
    expect(io).toContain('h-full min-h-0 overflow-y-auto');
  });
});
