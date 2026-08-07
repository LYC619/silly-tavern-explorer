import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ClientTitleBar', () => ({ ClientTitleBar: () => null }));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => null }));
vi.mock('@/components/GlobalSettings', () => ({ APP_VERSION: 'v0.18.0' }));
vi.mock('@/components/ThemeSwitcher', () => ({
  ThemeSwitcher: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('@/hooks/use-sidenav-state', () => ({
  useSidenavState: () => ({ expanded: false, toggle: vi.fn() }),
}));
vi.mock('@/lib/vault/tauri-fs', () => ({ isTauri: () => false }));
vi.mock('@/lib/editor-open-state', () => ({
  getEditorOpen: () => false,
  setEditorOpenState: vi.fn(),
}));

vi.mock('@/lib/archive-db', () => ({ getAllArchiveStories: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/regex-db', () => ({ getAllRegexCollections: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/summary-db', () => ({ getAllSummaries: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/story-tree-db', () => ({ getAllStoryTrees: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/card-db', () => ({ getAllCards: vi.fn().mockResolvedValue([]) }));

import { AppLayout } from '@/components/AppLayout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function TestPage({ id, target }: { id: string; target: string }) {
  const navigate = useNavigate();
  return (
    <AppLayout leftActions={<span>{id}</span>}>
      <section data-testid={`${id}-page`}>
        <button data-testid={`${id}-navigate`} type="button" onClick={() => navigate(target)}>切换</button>
      </section>
    </AppLayout>
  );
}

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

describe('AppLayout route transitions', () => {
  it('removes the previous route instead of stacking pages in the main scroller', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={['/']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<TestPage id="home" target="/library" />} />
              <Route path="/library" element={<TestPage id="library" target="/" />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[data-testid="home-page"]')).not.toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="home-navigate"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(container.querySelector('[data-testid="library-page"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="home-page"]')).toBeNull();
    expect(container.querySelectorAll('main > div')).toHaveLength(1);
  });
});
