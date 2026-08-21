import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NovelView from '@/components/reader/NovelView';
import type { ChatSession } from '@/types/chat';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const session: ChatSession = {
  id: 'novel-keyboard-session',
  title: '方向键翻页测试',
  messages: [{
    id: 'm0',
    role: 'assistant',
    content: '这是用于分页的完整句子。'.repeat(160),
    rawData: {},
  }],
  character: { name: '角色' },
  user: { name: '用户' },
  createdAt: 1,
};

describe('小说视图翻页交互', () => {
  it('正文未取得焦点时，方向键仍可翻到下一组双页', async () => {
    await act(async () => {
      root.render(
        <NovelView
          session={session}
          markers={[]}
          regexRules={[]}
          onClose={vi.fn()}
          readOnly
          embedded
        />,
      );
    });

    expect(container.textContent).toMatch(/1–2 \/ \d+/);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toMatch(/3–4 \/ \d+/);
  });

  it('按键已被处理或来自弹窗/交互控件时，阅读器不接管翻页与关闭', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <NovelView
          session={session}
          markers={[]}
          regexRules={[]}
          onClose={onClose}
          readOnly
          embedded
        />,
      );
    });
    expect(container.textContent).toMatch(/1–2 \/ \d+/);

    // 已被上层处理（defaultPrevented）的按键不翻页
    await act(async () => {
      const handled = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      handled.preventDefault();
      window.dispatchEvent(handled);
    });
    expect(container.textContent).toMatch(/1–2 \/ \d+/);

    // 上层弹窗内按 Esc 只关弹窗，不连带关闭阅读器
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    dialog.remove();

    // 焦点在按钮上按空格留给按钮点击，不翻页
    const button = document.createElement('button');
    document.body.appendChild(button);
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toMatch(/1–2 \/ \d+/);

    // 按钮获得焦点后，方向键仍应继续翻页，Escape 仍应关闭阅读器
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toMatch(/3–4 \/ \d+/);
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('小说正文段落连续排版，叙述和对白均使用首行缩进', async () => {
    await act(async () => {
      root.render(
        <NovelView
          session={{
            ...session,
            messages: [{ ...session.messages[0], content: '清晨醒来。\n\n「早安。」' }],
          }}
          markers={[]}
          regexRules={[]}
          onClose={vi.fn()}
          readOnly
          embedded
        />,
      );
    });

    const paragraphs = [...container.querySelectorAll('[data-novel-page="left"] article > p:not(.pt-3)')];
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.every((paragraph) => paragraph.className.includes('indent-[2em]'))).toBe(true);
    expect(paragraphs.every((paragraph) => !paragraph.className.includes('mb-2'))).toBe(true);
  });
});

/**
 * 嵌入模式（角色卡页内嵌阅读器用）。原先由 embedded-reader.test.ts grep
 * 「embedded?: boolean」「className={embedded」「event.clientX < window.innerWidth / 2」
 * 这些源码片段，实际要保的是：不霸占整个视口，且翻页按自己面板的中线判方向。
 */
describe('小说视图嵌入模式', () => {
  async function renderNovel(embedded: boolean) {
    await act(async () => {
      root.render(
        <NovelView session={session} markers={[]} regexRules={[]} onClose={vi.fn()} readOnly embedded={embedded} />,
      );
    });
  }

  const surface = () => container.querySelector<HTMLElement>('[data-novel-surface]')!;

  it('嵌入时留在文档流里，全屏时才铺满视口', async () => {
    await renderNovel(true);
    const embeddedRoot = container.firstElementChild as HTMLElement;
    expect(embeddedRoot.className).not.toContain('fixed');
    expect(embeddedRoot.className).not.toContain('inset-0');

    await renderNovel(false);
    const fullscreenRoot = container.firstElementChild as HTMLElement;
    expect(fullscreenRoot.className).toContain('fixed');
    expect(fullscreenRoot.className).toContain('inset-0');
  });

  it('按自己面板的中线判翻页方向，不看窗口中线', async () => {
    await renderNovel(true);
    // 方向键先翻到第二组，好验证「往回翻」确实发生
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toMatch(/3–4 \/ \d+/);

    // 面板整体偏在窗口右半边：x=[600,1000]，中线 800；窗口中线是 innerWidth/2
    const panel = surface();
    panel.getBoundingClientRect = () => ({
      left: 600, right: 1000, width: 400, top: 0, bottom: 600, height: 600, x: 600, y: 0, toJSON: () => ({}),
    }) as DOMRect;

    // clientX=700 在面板左半边（该往回翻），但在窗口右半边（按窗口中线会往前翻）
    await act(async () => {
      panel.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 700 }));
    });
    expect(container.textContent).toMatch(/1–2 \/ \d+/);

    // clientX=900 在面板右半边，往前翻
    await act(async () => {
      panel.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 900 }));
    });
    expect(container.textContent).toMatch(/3–4 \/ \d+/);
  });
});
