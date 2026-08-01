/**
 * 主侧栏双态状态（10.1-A3 改版）：
 * 不再按页面给默认值（旧版首页展开/其余折叠，导致切页自动折叠——0801 反馈点名）。
 * 全局一份状态：默认展开，用户手动切换记 localStorage，所有页面跟随，切页不变。
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ste-sidenav';

type Override = 'expanded' | 'collapsed';

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

  return { expanded, toggle };
}
