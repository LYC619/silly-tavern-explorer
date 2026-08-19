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
