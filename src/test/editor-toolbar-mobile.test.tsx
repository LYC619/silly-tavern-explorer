/**
 * 编辑工具栏的窄屏形态（<1024px）。
 *
 * 桌面档九个控件挂在 flex-wrap 里会摊成三行，把正文推出屏幕。窄屏改成：
 * 低频项（章节标记/正则/重新导入）收进「更多」菜单，导出留在外面。
 *
 * 重点验的是「重新导入」这条链在菜单里还通——它原来是 AlertDialogTrigger，
 * 改成受控开关了（菜单项点完菜单就卸载，Trigger 会跟着对话框一起消失）。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorToolbar } from '@/components/chat/EditorToolbar';
import { DEFAULT_REGEX_RULES } from '@/types/chat';
import type { ChatSession, ExportSettings } from '@/types/chat';

vi.mock('@/components/chat/ExportButton', () => ({
  ExportButton: () => <button type="button">导出</button>,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MOBILE_WIDTH = 390;
let originalWidth: number;
let container: HTMLDivElement;
let root: Root;

const session = {
  id: 's1',
  title: '故事',
  messages: [{ id: 'm1', role: 'assistant', content: '正文' }],
  character: { name: '角' },
  user: { name: '用' },
  createdAt: 1,
} as unknown as ChatSession;

const settings = { regexRules: DEFAULT_REGEX_RULES } as unknown as ExportSettings;

interface Handlers {
  onReset?: () => void;
  onToggleEditMode?: () => void;
  onToggleRegex?: () => void;
  hideChapterMark?: boolean;
}

async function renderToolbar({ onReset, onToggleEditMode, onToggleRegex, hideChapterMark }: Handlers = {}) {
  await act(async () => {
    root.render(
      <EditorToolbar
        session={session}
        settings={settings}
        markers={[]}
        editMode={false}
        regexSidebarOpen={false}
        onReset={onReset}
        onToggleEditMode={onToggleEditMode ?? (() => {})}
        onToggleRegex={onToggleRegex ?? (() => {})}
        hideChapterMark={hideChapterMark}
      />,
    );
  });
}

/** 菜单是 portal 到 body 的，作用域要用 document */
const menuItemByText = (label: string) =>
  Array.from(document.querySelectorAll('[role="menuitem"]'))
    .find((el) => el.textContent?.trim() === label) as HTMLElement | undefined;

const buttonByText = (label: string, scope: ParentNode = container) =>
  Array.from(scope.querySelectorAll('button')).find((el) => el.textContent?.trim() === label);

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error('目标不存在');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await act(async () => { await Promise.resolve(); });
};

/**
 * 菜单触发器认的是 pointerdown 不是 click（Radix 故意的：先开菜单再让内容拿焦点）。
 * jsdom 没有 PointerEvent 构造器，但 React 只读 button/ctrlKey，拿 MouseEvent 顶上就行。
 */
const openMenu = async (el: Element | null | undefined) => {
  if (!el) throw new Error('菜单触发器不存在');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  });
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { value: MOBILE_WIDTH, configurable: true, writable: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true, writable: true });
});

describe('编辑工具栏窄屏形态', () => {
  it('低频项收进「更多」，导出留在外面', async () => {
    await renderToolbar({ onReset: () => {} });

    expect(container.querySelector('[data-editor-toolbar-more]')).not.toBeNull();
    // 这三个不再直接占位
    expect(buttonByText('章节标记')).toBeUndefined();
    expect(buttonByText('导入')).toBeUndefined();
    // 导出是唯一主 CTA，任何时候都在外面
    expect(buttonByText('导出')).toBeTruthy();
  });

  it('这一组不换行——换行就是把正文挤出屏幕', async () => {
    await renderToolbar({ onReset: () => {} });

    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('flex-nowrap');
    expect(row.className).not.toContain('flex-wrap');
  });

  it('菜单里三项齐全，点「正则规则」能回调', async () => {
    const onToggleRegex = vi.fn();
    await renderToolbar({ onReset: () => {}, onToggleRegex });

    await openMenu(container.querySelector('[data-editor-toolbar-more]'));

    expect(menuItemByText('章节标记')).toBeTruthy();
    expect(menuItemByText('重新导入')).toBeTruthy();
    const regexItem = menuItemByText(`正则规则（${DEFAULT_REGEX_RULES.filter((r) => !r.disabled).length}）`);
    expect(regexItem).toBeTruthy();

    await click(regexItem);
    expect(onToggleRegex).toHaveBeenCalledTimes(1);
  });

  /**
   * 这条盯的是改造本身的风险点：菜单项一点，菜单就卸载。要是把对话框
   * 挂在菜单项底下（原来的 AlertDialogTrigger 写法），它会跟着一起消失，
   * 于是「重新导入」在手机上变成点了没反应。
   */
  it('从菜单点「重新导入」能弹出确认框，确认后回调', async () => {
    const onReset = vi.fn();
    await renderToolbar({ onReset });

    await openMenu(container.querySelector('[data-editor-toolbar-more]'));
    await click(menuItemByText('重新导入'));

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog, '确认框没弹出来').not.toBeNull();
    expect(dialog!.textContent).toContain('确认重新导入？');

    await click(buttonByText('确认', dialog!));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('就地阅读少一项时仍给菜单，两项不值得为它开特例', async () => {
    // hideChapterMark + onReset 都在 → 正则 + 重新导入 = 两项
    await renderToolbar({ onReset: () => {}, hideChapterMark: true });
    expect(container.querySelector('[data-editor-toolbar-more]')).not.toBeNull();
  });

  it('只剩正则一项时不套菜单，直接给按钮', async () => {
    // 就地阅读模式：hideChapterMark 且不给 onReset
    await renderToolbar({ hideChapterMark: true });

    expect(container.querySelector('[data-editor-toolbar-more]')).toBeNull();
    expect(buttonByText('导出')).toBeTruthy();
  });
});
