import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizeContextBar } from '@/components/workspace/OrganizeContextBar';
import { isOrganizeWorkspaceView } from '@/lib/story-workspace-layout';

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

describe('整理视图上下文栏', () => {
  it('提供返回来源与返回阅读两个独立出口，并保留故事标题', () => {
    const onBack = vi.fn();
    const onRead = vi.fn();
    act(() => {
      root.render(
        <OrganizeContextBar
          storyTitle="测试故事"
          backLabel="测试角色"
          onBack={onBack}
          onRead={onRead}
        />,
      );
    });

    expect(container.textContent).toContain('测试故事');
    const buttons = [...container.querySelectorAll('button')];
    act(() => buttons.find((button) => button.textContent?.includes('测试角色'))?.click());
    act(() => buttons.find((button) => button.textContent?.includes('阅读与编辑'))?.click());
    expect(onBack).toHaveBeenCalledOnce();
    expect(onRead).toHaveBeenCalledOnce();
  });

  it('导入与导出和整理页面使用同一固定高度布局', () => {
    expect(isOrganizeWorkspaceView('volume')).toBe(true);
    expect(isOrganizeWorkspaceView('mini')).toBe(true);
    expect(isOrganizeWorkspaceView('tree')).toBe(true);
    expect(isOrganizeWorkspaceView('io')).toBe(true);
    expect(isOrganizeWorkspaceView('read')).toBe(false);
  });
});
