/**
 * 首页「最近查看的角色」横滑列的卡面行为（阶段 C2）。
 *
 * 取代 frontend-contract.test.ts 里针对这张卡的源码 grep
 * （`className="…" data-home-character-card` 的正则、`aspect-[2/3]`、
 * 两条宽度类、`{c.rating !== undefined ? c.rating : '未评分'}`、`<MessageSquare`）——
 * 那些钉的是「Home.tsx 里出现过这些字符」，卡片一旦与角色库共用 <CharacterTile>
 * 就会误红，而要保住的是这里断言的这些事实。
 *
 * 卡片比例是红线（ST 标准卡 400×600），排序规则「先按最近查看、再按更新时间」
 * 也一并钉住——首页这个区就是靠它挑出这 12 张的。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';

const navigate = vi.hoisted(() => vi.fn());
const getAllCharacters = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getAllArchiveStories = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children, titleBarContent }: { children?: React.ReactNode; titleBarContent?: React.ReactNode }) =>
    <div>{titleBarContent}{children}</div>,
}));
vi.mock('@/components/tools/STImportCard', () => ({ STImportCard: () => null }));
vi.mock('@/components/tools/STAIConfigDialog', () => ({ STAIConfigDialog: () => null }));
vi.mock('@/lib/vault/tauri-fs', () => ({
  isTauri: () => false,
  getAppConfig: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/archive-db', () => ({ getAllCharacters, getAllArchiveStories }));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/regex-db', () => ({ getAllRegexCollections: vi.fn().mockResolvedValue([]) }));

import Home from '@/pages/Home';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

function mkCharacter(id: string, over: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return {
    id,
    name: `角色${id}`,
    card: { name: `角色${id}`, description: '' },
    tags: [],
    status: 'active',
    createdAt: 1000,
    updatedAt: 2000,
    ...over,
  } as unknown as ArchiveCharacter;
}

function mkStory(id: string, characterId: string): ArchiveStory {
  return {
    id,
    title: `故事${id}`,
    characterId,
    createdAt: 1000,
    updatedAt: 2000,
    // 最近故事行会读楼数，fixture 必须满足真实必填字段
    session: { messages: [] },
  } as unknown as ArchiveStory;
}

async function renderHome(characters: ArchiveCharacter[], stories: ArchiveStory[] = []) {
  getAllCharacters.mockResolvedValue(characters);
  getAllArchiveStories.mockResolvedValue(stories);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <TooltipProvider><Home /></TooltipProvider>
      </MemoryRouter>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

const railCards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-home-character-card]'));
const cardIds = () => railCards().map((el) => el.getAttribute('data-character-id'));
const cardOf = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-home-character-card][data-character-id="${id}"]`);
  if (!el) throw new Error(`横滑列里没有角色 ${id}`);
  return el;
};

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
  getAllCharacters.mockClear().mockResolvedValue([]);
  getAllArchiveStories.mockClear().mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('首页最近角色横滑列', () => {
  it('按最近查看排序，没查看过的按更新时间垫后，最多 12 张', async () => {
    await renderHome([
      mkCharacter('old', { lastViewedAt: 100, updatedAt: 9999 }),
      mkCharacter('new', { lastViewedAt: 900 }),
      mkCharacter('never-a', { updatedAt: 500 }),
      mkCharacter('never-b', { updatedAt: 800 }),
    ]);

    expect(cardIds()).toEqual(['new', 'old', 'never-b', 'never-a']);
  });

  it('超过 12 张只取前 12 张', async () => {
    await renderHome(
      Array.from({ length: 15 }, (_, i) => mkCharacter(`c${i}`, { lastViewedAt: 1000 - i })),
    );

    expect(railCards()).toHaveLength(12);
    expect(cardIds()?.[0]).toBe('c0');
  });

  it('卡面保持 2:3（ST 标准卡比例，红线）并按 4 列 / 宽屏 5 列排布', async () => {
    await renderHome([mkCharacter('a')]);

    const cls = cardOf('a').className;
    expect(cls).toContain('aspect-[2/3]');
    expect(cls).not.toContain('aspect-[3/4]');
    // 常规宽度完整显示 4 张，2xl 完整显示 5 张
    expect(cls).toContain('w-[calc((100%-2.625rem)/4)]');
    expect(cls).toContain('2xl:w-[calc((100%-3.5rem)/5)]');
  });

  it('卡面给出评分，没评过分显示「未评分」而不是留白', async () => {
    await renderHome([mkCharacter('rated', { rating: 8 }), mkCharacter('plain')]);

    expect(cardOf('rated').textContent).toContain('8');
    expect(cardOf('plain').textContent).toContain('未评分');
  });

  it('有故事的角色显示故事数，没有故事的不显示角标', async () => {
    await renderHome(
      [mkCharacter('withStory'), mkCharacter('lonely')],
      [mkStory('s1', 'withStory'), mkStory('s2', 'withStory')],
    );

    expect(cardOf('withStory').querySelector('[data-story-count]')?.textContent).toContain('2');
    expect(cardOf('lonely').querySelector('[data-story-count]')).toBeNull();
  });

  it('点击卡片进对应角色页', async () => {
    await renderHome([mkCharacter('a'), mkCharacter('b')]);

    await act(async () => { cardOf('b').click(); });

    expect(navigate).toHaveBeenCalledWith('/character/b');
  });

  it('两处缩略图都按 NSFW 设置模糊，且能被设置关掉', async () => {
    const png = 'iVBORw0KGgo=';
    const nsfwChar = mkCharacter('spicy', { nsfw: true, pngBase64: png });
    const story = { ...mkStory('s1', 'spicy'), lastViewedAt: 5000 } as ArchiveStory;

    await renderHome([nsfwChar], [story]);

    // 角色卡 + 最近故事行的缩略图，两处都要走 <NsfwImage>
    const blurred = document.querySelectorAll('[data-nsfw-blurred="true"]');
    expect(blurred.length).toBe(2);

    // 关掉全局模糊后两处都恢复清晰
    await act(async () => { root.unmount(); });
    localStorage.setItem('ste-nsfw-blur', '0');
    root = createRoot(container);
    await renderHome([nsfwChar], [story]);

    expect(document.querySelectorAll('[data-nsfw-blurred="true"]').length).toBe(0);
    expect(document.querySelectorAll('[data-nsfw-blurred="false"]').length).toBe(2);
  });

  it('没有角色时给空态而不是空白横条', async () => {
    await renderHome([]);

    expect(railCards()).toHaveLength(0);
    expect(document.body.textContent).toContain('还没有角色卡');
  });
});
