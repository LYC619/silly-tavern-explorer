/**
 * 主侧栏双态状态（10.1-A3 改版）：
 * 不再按页面给默认值（旧版首页展开/其余折叠，导致页面之间反复切换）。
 * 全局一份状态：默认展开；从首页离开时主动收起，其他页面之间切换保留用户选择。
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ste-sidenav';

type Override = 'expanded' | 'collapsed';

/** 只有从首页离开时才自动收起；非首页之间切换不覆盖用户的手动选择。 */
export function shouldAutoCollapse(previousPath: string, nextPath: string): boolean {
  return previousPath === '/' && nextPath !== '/';
}

function readOverride(): Override | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'expanded' || v === 'collapsed' ? v : null;
  } catch {
    return null;
  }
}

export function useSidenavState() {
  const [override, setOverride] = useState<Override | null>(readOverride);
  const expanded = (override ?? 'expanded') === 'expanded';

  const toggle = useCallback(() => {
    setOverride((prev) => {
      const next: Override = (prev ?? 'expanded') === 'expanded' ? 'collapsed' : 'expanded';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch { /* 隐私模式等存不了就只在本页生效 */ }
      return next;
    });
  }, []);

  const collapse = useCallback(() => {
    setOverride('collapsed');
    try {
      localStorage.setItem(STORAGE_KEY, 'collapsed');
    } catch { /* 隐私模式等场景只影响本次渲染 */ }
  }, []);

  return { expanded, toggle, collapse };
}
