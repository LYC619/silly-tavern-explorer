/**
 * Toast 关闭键必须一直看得见。
 *
 * shadcn 默认写法是 `opacity-0 group-hover:opacity-100`：鼠标不悬停就完全透明。
 * 触屏根本没有 hover 状态，等于这条 toast 没有关闭键，只能等它自己超时消失。
 * 同时热区只有 24×24（p-1 + 16px 图标）；绝对定位的关闭键使用 p-2 直接撑到 32px，
 * 不使用依赖 relative 定位基准的 tap-target 伪元素。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@/components/ui/toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

async function renderToast() {
  await act(async () => {
    root.render(
      <ToastProvider>
        <Toast open>
          <ToastTitle>已保存</ToastTitle>
          <ToastDescription>永久留存</ToastDescription>
          <ToastAction altText="撤销">撤销</ToastAction>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
  });
}

const closeButton = () => document.querySelector<HTMLElement>('[toast-close]')!;

describe('Toast 关闭键', () => {
  it('不依赖 hover 就可见', async () => {
    await renderToast();

    const className = closeButton().className;
    expect(className).not.toContain('opacity-0');
    expect(className).not.toContain('group-hover:opacity-100');
    expect(className).toContain('opacity-100');
  });

  it('热区不小于 32px，并且用的是可读的前景色', async () => {
    await renderToast();

    const className = closeButton().className;
    expect(className.split(/\s+/)).not.toContain('tap-target');
    expect(className).toContain('p-2');
    expect(className).toContain('text-foreground/60');
  });

  it('操作按钮本来就常显，不受影响', async () => {
    await renderToast();

    const action = [...document.querySelectorAll<HTMLElement>('button')]
      .find((node) => node.textContent === '撤销');
    expect(action).toBeDefined();
    expect(action!.className).not.toContain('opacity-0');
  });
});
