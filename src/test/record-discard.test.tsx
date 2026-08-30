/**
 * 生成结果的「不要了」（0830 反馈条目 2）。
 * 结果一生成就自动暂存了，所以光清空结果区不算丢弃——库里那条得一起删，
 * 否则用户看着结果区空了，回列表里发现不要的那条还躺在那儿。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SummaryItem } from '@/types/summary';
import type { ArchiveStory } from '@/types/archive';
import type { ChatSession } from '@/types/chat';

const db = vi.hoisted(() => ({
  items: [] as SummaryItem[],
  deleted: [] as string[],
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/summary-db', () => ({
  getAllSummaries: vi.fn(async () => db.items),
  saveSummary: vi.fn(async () => {}),
  pruneAutoSavedSummaries: vi.fn(async () => []),
  getSummaryTemplate: vi.fn(async () => undefined),
  getAllSummaryTemplates: vi.fn(async () => []),
  deleteSummary: vi.fn(async (id: string) => { db.deleted.push(id); }),
}));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn(async () => []) }));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn(async () => []) }));
vi.mock('@/components/ai-tools', () => ({ loadAPIConfig: () => ({ apiKey: '', model: 'test-model' }) }));
vi.mock('@/components/ai-tools/ApiStatusLine', () => ({ ApiStatusLine: () => null }));

import { RecordWorkbench } from '@/components/organize/RecordWorkbench';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView = () => {};

const session: ChatSession = {
  id: 's1', title: '测试故事', createdAt: 1,
  character: { name: '角色' }, user: { name: '用户' },
  messages: Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'user' : 'assistant', content: `第 ${i} 楼` })),
} as ChatSession;

const story = {
  id: 'story-1', title: '测试故事', session,
  markers: [], favorites: [], meta: { modelsUsed: [], playTimeMs: null },
  createdAt: 1, updatedAt: 1,
} as unknown as ArchiveStory;

/** 已自动暂存的一条（生成完就是这个状态） */
const autoSaved: SummaryItem = {
  id: 'sum-auto', bookId: 'story-1', bookTitle: '测试故事', kind: 'volume',
  title: '第一卷', volumeNumber: 1, floorStart: 0, floorEnd: 3, content: '卷一正文',
  createdAt: 1, updatedAt: 1, autoSaved: true,
} as SummaryItem;

let container: HTMLDivElement;
let root: Root;

const buttonBy = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

async function render(node: React.ReactNode) {
  await act(async () => { root.render(node); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  db.items = [autoSaved];
  db.deleted = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('生成结果「不要了」', () => {
  it('确认丢弃后删掉库里那条并通知父组件，结果区清空', async () => {
    const onDiscarded = vi.fn();
    await render(
      <RecordWorkbench
        story={story}
        kind="volume"
        record={autoSaved}
        defaultBranchId={null}
        onSaved={vi.fn()}
        onDiscarded={onDiscarded}
      />,
    );

    const discard = buttonBy(container, '不要了');
    expect(discard).toBeDefined();
    await act(async () => { discard!.click(); });

    // 先弹确认，不是点一下就删
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(db.deleted).toEqual([]);

    const confirm = buttonBy(document, '丢弃');
    await act(async () => { confirm!.click(); });

    expect(db.deleted).toEqual(['sum-auto']);
    expect(onDiscarded).toHaveBeenCalledWith('sum-auto');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('');
  });

  it('弹窗里点取消什么都不删', async () => {
    const onDiscarded = vi.fn();
    await render(
      <RecordWorkbench
        story={story}
        kind="volume"
        record={autoSaved}
        defaultBranchId={null}
        onSaved={vi.fn()}
        onDiscarded={onDiscarded}
      />,
    );

    await act(async () => { buttonBy(container, '不要了')!.click(); });
    await act(async () => { buttonBy(document, '取消')!.click(); });

    expect(db.deleted).toEqual([]);
    expect(onDiscarded).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('卷一正文');
  });

  it('父组件没给 onDiscarded 时不显示这个按钮（旧用法不变）', async () => {
    await render(
      <RecordWorkbench
        story={story}
        kind="volume"
        record={autoSaved}
        defaultBranchId={null}
        onSaved={vi.fn()}
      />,
    );
    expect(buttonBy(container, '不要了')).toBeUndefined();
  });
});
