import { describe, expect, it } from 'vitest';
import { shouldIgnoreGlobalShortcut } from '@/lib/keyboard-shortcuts';

function eventFrom(target: HTMLElement, key = 'Escape') {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function withRole(role: string) {
  const element = document.createElement('div');
  element.setAttribute('role', role);
  return element;
}

describe('全局快捷键作用域', () => {
  it.each([
    ['文本输入框', document.createElement('input')],
    ['多行文本框', document.createElement('textarea')],
    ['滑块', withRole('slider')],
    ['菜单', withRole('menu')],
    ['列表框', withRole('listbox')],
    ['弹窗', withRole('dialog')],
  ])('忽略来自%s的按键', (_label, target) => {
    expect(shouldIgnoreGlobalShortcut(eventFrom(target))).toBe(true);
  });

  it('忽略来自交互控件的空格，但允许正文区域空格', () => {
    const button = document.createElement('button');
    const content = document.createElement('article');

    expect(shouldIgnoreGlobalShortcut(eventFrom(button, ' '))).toBe(true);
    expect(shouldIgnoreGlobalShortcut(eventFrom(content, ' '))).toBe(false);
  });

  it('忽略已经被下层处理的事件', () => {
    const event = eventFrom(document.createElement('article'), 'ArrowRight');
    event.preventDefault();

    expect(shouldIgnoreGlobalShortcut(event)).toBe(true);
  });
});
