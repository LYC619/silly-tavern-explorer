import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReaderView from '@/components/reader/ReaderView';
import type { ChatMessage } from '@/types/chat';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

let container: HTMLDivElement;
let root: Root;

const messages: ChatMessage[] = [
  { id: 'm1', role: 'assistant', content: '第一页正文', rawData: {} },
  { id: 'm2', role: 'assistant', content: '第二页正文', rawData: {} },
];

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function renderReader(onClose = vi.fn()) {
  await act(async () => {
    root.render(
      <ReaderView
        messages={messages}
        markers={[]}
        regexRules={[]}
        characterName="角色"
        userName="用户"
        onClose={onClose}
      />,
    );
  });
  return onClose;
}

async function dispatchFrom(target: HTMLElement, key: string, preventDefault = false) {
  await act(async () => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    if (preventDefault) event.preventDefault();
    target.dispatchEvent(event);
    vi.runAllTimers();
  });
}

describe('沉浸式阅读器键盘作用域', () => {
  it('正文区域的方向键仍正常翻页', async () => {
    await renderReader();
    expect(container).toHaveTextContent('第一页正文');

    await dispatchFrom(window.document.body, 'ArrowRight');

    expect(container).toHaveTextContent('第二页正文');
  });

  it('输入框和滑块中的方向键不触发阅读器翻页', async () => {
    await renderReader();
    const input = document.createElement('input');
    const slider = document.createElement('div');
    slider.setAttribute('role', 'slider');
    document.body.append(input, slider);

    await dispatchFrom(input, 'ArrowRight');
    await dispatchFrom(slider, 'ArrowRight');

    expect(container).toHaveTextContent('第一页正文');
    input.remove();
    slider.remove();
  });

  it('按钮空格、弹窗 Escape 和已处理事件不触发阅读器动作', async () => {
    const onClose = await renderReader();
    const button = document.createElement('button');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(button, dialog);

    await dispatchFrom(button, ' ');
    await dispatchFrom(dialog, 'Escape');
    await dispatchFrom(document.body, 'ArrowRight', true);

    expect(container).toHaveTextContent('第一页正文');
    expect(onClose).not.toHaveBeenCalled();
    button.remove();
    dialog.remove();
  });

  it('正文区域 Escape 仍正常关闭阅读器', async () => {
    const onClose = await renderReader();

    await dispatchFrom(document.body, 'Escape');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
