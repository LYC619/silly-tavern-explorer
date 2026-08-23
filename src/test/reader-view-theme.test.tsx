/**
 * 沉浸式阅读器的配色必须跟随主题。
 *
 * 原实现把顶栏/底栏按钮、页码、进度条滑块写死成白色，渐变写死成黑色：
 * 三个深色主题下看着正常，cream（浅色）下白字白滑块压在米白底上，整个控制栏消失。
 * 这里断言的是渲染结果里不存在写死的黑白，而不是源码里没有某个字符串。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  { id: 'm1', role: 'user', content: '用户这边说的话', rawData: {} },
  { id: 'm2', role: 'assistant', content: '角色这边说的话', rawData: {} },
];

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

async function renderReader() {
  await act(async () => {
    root.render(
      <ReaderView
        messages={messages}
        markers={[{ messageId: 'm2', messageIndex: 1, title: '第一章', createdAt: 1 }]}
        regexRules={[]}
        characterName="角色"
        userName="用户"
        onClose={vi.fn()}
      />,
    );
  });
}

/** 渲染结果里出现即判负的写死配色（白字、白底、黑色遮罩、浅色专用底） */
const HARDCODED = [
  'text-white', 'bg-white', 'border-white',
  'from-black/', 'to-black/', 'via-black/', 'bg-black/',
  'bg-blue-100', 'bg-rose-100',
];

describe('沉浸式阅读器配色跟随主题', () => {
  it('渲染出的任何元素都不带写死的黑白配色', async () => {
    await renderReader();

    const offenders: string[] = [];
    for (const node of container.querySelectorAll<HTMLElement>('*')) {
      for (const bad of HARDCODED) {
        if (node.className && typeof node.className === 'string' && node.className.includes(bad)) {
          offenders.push(`${node.tagName.toLowerCase()}[${bad}]`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('顶栏与底栏用主题的阅读器渐隐底，控制按钮用正文色', async () => {
    await renderReader();

    const scrims = [...container.querySelectorAll<HTMLElement>('[class*="reader-scrim"]')];
    expect(scrims).toHaveLength(2);
    expect(scrims.some((n) => n.className.includes('bg-gradient-to-b'))).toBe(true);
    expect(scrims.some((n) => n.className.includes('bg-gradient-to-t'))).toBe(true);

    const close = container.querySelector<HTMLElement>('button');
    expect(close?.className).toContain('text-[color:var(--text-body)]');
    expect(close?.className).toContain('hover:bg-[var(--hover-overlay-strong)]');
  });

  it('进度条交给 Slider 自带的主题样式，不再覆盖成白色滑块', async () => {
    await renderReader();

    const slider = container.querySelector<HTMLElement>('[role="slider"]');
    expect(slider).not.toBeNull();
    expect(slider!.className).toContain('border-primary');
    expect(slider!.className).toContain('bg-background');

    const progress = container.querySelector<HTMLElement>('[aria-label="阅读进度"]');
    expect(progress?.className ?? '').not.toContain('[role=slider]');
  });

  it('说话人标签在深浅主题下都用透明底 + 主题化文字', async () => {
    await renderReader();

    const badge = [...container.querySelectorAll<HTMLElement>('span')]
      .find((n) => n.textContent === '用户');
    expect(badge?.className).toContain('bg-blue-500/15');
    expect(badge?.className).toContain('dark:text-blue-300');
  });

  it('四套主题都定义了 --reader-scrim', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/themes.css'), 'utf8');
    for (const theme of ['cocoa', 'ink', 'midnight', 'cream']) {
      const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
      expect(block, `${theme} 缺 --reader-scrim`).toMatch(/--reader-scrim:\s*rgba\(/);
    }
  });
});
