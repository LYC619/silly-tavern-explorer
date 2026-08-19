import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { executeDeleteAction } from '@/lib/destructive-action';

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

describe('统一删除确认', () => {
  it('显示影响说明，取消不执行，确认才执行', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    act(() => {
      root.render(
        <DeleteConfirmDialog
          open
          title="删除测试资产？"
          description="该资产被 2 张角色卡引用。"
          onOpenChange={onOpenChange}
          onConfirm={onConfirm}
        />,
      );
    });

    expect(document.body.textContent).toContain('该资产被 2 张角色卡引用');
    const buttons = [...document.body.querySelectorAll('button')];
    act(() => buttons.find((button) => button.textContent === '取消')?.click());
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => buttons.find((button) => button.textContent === '确认删除')?.click());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('删除成功和失败走不同反馈，并把失败原因交给调用方', async () => {
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    await expect(executeDeleteAction(async () => {}, { onSuccess, onFailure })).resolves.toBe(true);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();

    const error = new Error('磁盘不可写');
    await expect(executeDeleteAction(async () => { throw error; }, { onSuccess, onFailure })).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledWith(error);
  });
});
