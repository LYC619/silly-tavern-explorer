/**
 * 同名入口只有一个落点（阶段 E3）。
 *
 * 首页的「世界书 / 预设」原先直接进空编辑器（/worldbook、/preset），侧栏和编辑区窄栏
 * 进的是选择页（/tools?focus=...）。同一个名字点出两种结果，用户会以为自己点错了。
 *
 * 这里不写死路径——断言的是「首页入口 == 侧栏同名入口」，任何一边改了都会红。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAV_AREAS } from '@/lib/navigation-model';

const navigate = vi.hoisted(() => vi.fn());
const listCharacterIndex = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const listStoryIndex = vi.hoisted(() => vi.fn().mockResolvedValue([]));

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
vi.mock('@/lib/vault/tauri-fs', () => ({ isTauri: () => false, getAppConfig: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/archive-db', () => ({ getAllCharacters: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/archive-index', () => ({ listCharacterIndex, listStoryIndex }));
vi.mock('@/lib/worldbook-db', () => ({ getAllWorldBooks: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/preset-db', () => ({ getAllPresets: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/regex-db', () => ({ getAllRegexCollections: vi.fn().mockResolvedValue([]) }));

import Home from '@/pages/Home';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  navigate.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <TooltipProvider><Home /></TooltipProvider>
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** 点首页编辑处理区里叫这个名字的入口，返回它导航去了哪 */
async function clickEditorEntry(label: string): Promise<string> {
  const button = Array.from(container.querySelectorAll('button'))
    .find((b) => b.querySelector('span')?.textContent?.trim() === label);
  if (!button) throw new Error(`首页没有「${label}」入口`);
  navigate.mockClear();
  await act(async () => { button.click(); });
  const target = navigate.mock.calls.at(-1)?.[0];
  if (typeof target !== 'string') throw new Error(`点「${label}」没有导航`);
  return target;
}

/** 侧栏「编辑区」下同名子项的落点 */
function railPath(label: string): string {
  const child = NAV_AREAS.find((a) => a.key === 'editor')?.children.find((c) => c.label === label);
  if (!child) throw new Error(`侧栏编辑区没有「${label}」`);
  return child.path;
}

describe('首页编辑入口与侧栏落点一致', () => {
  it.each(['世界书', '预设', '聊天处理', '角色卡', '总结'])('「%s」两处去同一个地方', async (label) => {
    expect(await clickEditorEntry(label)).toBe(railPath(label));
  });

  it('世界书和预设进的是选择页，不是空编辑器', async () => {
    // 这条是 E3 的实质：/worldbook、/preset 是选完之后的编辑器路由，不作为入口
    expect(await clickEditorEntry('世界书')).not.toBe('/worldbook');
    expect(await clickEditorEntry('预设')).not.toBe('/preset');
  });
});
