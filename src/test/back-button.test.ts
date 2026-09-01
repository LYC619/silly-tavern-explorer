/**
 * Android 返回键的分发顺序。
 *
 * 行为表（任务指定）：沉浸阅读 → 退沉浸；抽屉开 → 关抽屉；浮层开 → 关浮层；
 * 子页面 → 回上一级；一级页面 → 最小化应用（不是退出）。
 * 这里测前三条和「一级页面」的判定；路由兜底那两条在 use-android-back 里，
 * 依赖 Capacitor 运行时，留给真机。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backHandlerCount, handleBackPress, isTopLevelPath, registerBackHandler, resetBackHandlers,
} from '@/lib/back-button';

afterEach(() => {
  resetBackHandlers();
  document.body.innerHTML = '';
});

describe('返回键处理栈', () => {
  it('没人注册时返回 unhandled，交给调用方兜底', () => {
    expect(handleBackPress()).toBe('unhandled');
  });

  it('注册的处理器说处理了就停下', () => {
    const handler = vi.fn(() => true);
    registerBackHandler(handler);
    expect(handleBackPress()).toBe('handled');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('返回 false 就继续往下问，后注册的先被问到', () => {
    const order: string[] = [];
    // 只有最底层会说「我处理了」，上面两层都放行——这样才能看出走访顺序
    registerBackHandler(() => { order.push('底层'); return true; });
    registerBackHandler(() => { order.push('中层'); return false; });
    registerBackHandler(() => { order.push('顶层'); return false; });

    expect(handleBackPress()).toBe('handled');
    // 后注册的先被问到——视觉上更靠上的层通常更晚挂载
    expect(order).toEqual(['顶层', '中层', '底层']);
  });

  it('有人处理了就不再问更下面的层', () => {
    const bottom = vi.fn(() => true);
    registerBackHandler(bottom);
    registerBackHandler(() => true);

    expect(handleBackPress()).toBe('handled');
    expect(bottom).not.toHaveBeenCalled();
  });

  it('全都不处理时落到 unhandled', () => {
    registerBackHandler(() => false);
    registerBackHandler(() => false);
    expect(handleBackPress()).toBe('unhandled');
  });

  it('注销之后不再被问到', () => {
    const handler = vi.fn(() => true);
    const off = registerBackHandler(handler);
    off();
    expect(backHandlerCount()).toBe(0);
    expect(handleBackPress()).toBe('unhandled');
    expect(handler).not.toHaveBeenCalled();
  });

  it('重复注销不炸（卸载路径可能走两次）', () => {
    const off = registerBackHandler(() => true);
    off();
    expect(() => off()).not.toThrow();
  });
});

describe('返回键与 Radix 浮层', () => {
  const openDialog = (role: string) => {
    const el = document.createElement('div');
    el.setAttribute('role', role);
    el.setAttribute('data-state', 'open');
    document.body.appendChild(el);
    return el;
  };

  /**
   * 浮层排在注册层之前：它可能开在别的层之上（沉浸阅读里弹的章节对话框）。
   * 这时候按返回应该关对话框，而不是把整个阅读器退掉。
   */
  it('有打开的浮层时优先关浮层，不动下面的层', () => {
    const readerClose = vi.fn(() => true);
    registerBackHandler(readerClose);
    openDialog('dialog');

    const escapes: string[] = [];
    document.addEventListener('keydown', (e) => escapes.push(e.key));

    expect(handleBackPress()).toBe('closed-layer');
    expect(escapes).toEqual(['Escape']);
    expect(readerClose).not.toHaveBeenCalled();
  });

  it('alertdialog / menu / listbox 一样认', () => {
    for (const role of ['alertdialog', 'menu', 'listbox']) {
      document.body.innerHTML = '';
      openDialog(role);
      expect(handleBackPress(), role).toBe('closed-layer');
    }
  });

  it('关闭状态的浮层不算——data-state 是 closed 时该往下传', () => {
    const el = openDialog('dialog');
    el.setAttribute('data-state', 'closed');
    const handler = vi.fn(() => true);
    registerBackHandler(handler);

    expect(handleBackPress()).toBe('handled');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('一级页面判定', () => {
  it('四个一级入口上按返回应该最小化应用，而不是继续退', () => {
    expect(isTopLevelPath('/')).toBe(true);
    expect(isTopLevelPath('/library')).toBe(true);
    expect(isTopLevelPath('/chat')).toBe(true);
    expect(isTopLevelPath('/assets')).toBe(true);
  });

  it('子页面不算——那些该回上一级', () => {
    expect(isTopLevelPath('/character/abc')).toBe(false);
    expect(isTopLevelPath('/story/s1')).toBe(false);
    expect(isTopLevelPath('/settings')).toBe(false);
    expect(isTopLevelPath('/worldbook')).toBe(false);
  });
});
