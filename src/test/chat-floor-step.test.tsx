import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession, ExportSettings } from '@/types/chat';

const scrollToFloor = vi.hoisted(() => vi.fn());

vi.mock('@/components/chat/ChatPreview', async () => {
  const React = await import('react');
  return {
    ChatPreview: React.forwardRef(function Preview(
      props: { onFloorMapChange?: (map: Map<string, number>) => void },
      ref: React.ForwardedRef<{ scrollToFloor: (floor: number) => void; scrollToMessageId: (id: string) => void }>,
    ) {
      const { onFloorMapChange } = props;
      React.useImperativeHandle(ref, () => ({ scrollToFloor, scrollToMessageId: vi.fn() }), []);
      React.useEffect(() => {
        onFloorMapChange?.(new Map([['m0', 0], ['m1', 1], ['m2', 2]]));
      }, [onFloorMapChange]);
      return <div data-testid="preview" />;
    }),
  };
});

vi.mock('@/components/chat/MessageNavBar', () => ({
  MessageNavBar: ({ currentFloor, onNext }: { currentFloor: number; onNext: () => void }) => (
    <div>
      <span data-testid="current-floor">{currentFloor}</span>
      <button type="button" data-testid="next-floor" onClick={onNext}>下一楼</button>
    </div>
  ),
}));
vi.mock('@/components/chat/MessageSearchBar', () => ({ MessageSearchBar: () => null }));
vi.mock('@/components/chat/EditorToolbar', () => ({ EditorToolbar: () => null }));
vi.mock('@/components/chat/ChapterMarkerDialog', () => ({ ChapterMarkerDialog: () => null }));
vi.mock('@/components/chat/MessageEditDialog', () => ({ MessageEditDialog: () => null }));
vi.mock('@/components/chat/RegexSidebar', () => ({ RegexSidebar: () => null }));
vi.mock('@/components/chat/SettingsPanel', () => ({ SettingsPanel: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { ChatWorkbench } from '@/components/chat/ChatWorkbench';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

const session: ChatSession = {
  id: 'floor-session',
  title: '楼层测试',
  messages: [0, 1, 2].map((index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? 'assistant' : 'user',
    content: `第 ${index} 楼`,
  })),
  character: { name: '角色' },
  user: { name: '用户' },
  createdAt: 1,
};

const settings: ExportSettings = {
  theme: 'minimal',
  showTimestamp: false,
  showAvatar: false,
  paperWidth: 720,
  fontSize: 16,
  prefixMode: 'name',
  regexRules: [],
  cleanPluginCache: false,
  exportRange: 'all',
  recentCount: 20,
  customStart: 0,
  customEnd: 2,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  scrollToFloor.mockClear();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('聊天楼层连续跳转', () => {
  it('下一楼命令立即推进父状态，不依赖虚拟列表的延迟可见楼层回报', async () => {
    await act(async () => {
      root.render(
        <ChatWorkbench
          session={session}
          markers={[]}
          favorites={[]}
          settings={settings}
          onFavoritesChange={vi.fn()}
          onSettingsChange={vi.fn()}
        />,
      );
    });

    const next = container.querySelector<HTMLButtonElement>('[data-testid="next-floor"]');
    expect(container.querySelector('[data-testid="current-floor"]')?.textContent).toBe('0');

    await act(async () => next?.click());
    expect(scrollToFloor).toHaveBeenLastCalledWith(1);
    expect(container.querySelector('[data-testid="current-floor"]')?.textContent).toBe('1');

    await act(async () => next?.click());
    expect(scrollToFloor).toHaveBeenLastCalledWith(2);
    expect(container.querySelector('[data-testid="current-floor"]')?.textContent).toBe('2');
  });
});
