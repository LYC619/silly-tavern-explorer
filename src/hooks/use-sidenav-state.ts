/**
 * 主侧栏双态状态（2.1-P1，交接包定稿）：
 * 页面默认值（首页展开、其余折叠）+ localStorage 用户手动覆盖。
 * 用户一旦手动切换过，所有页面都跟随用户选择；未切换过则按页面默认。
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

export function useSidenavState(pageDefault: 'expanded' | 'collapsed') {
  const [override, setOverride] = useState<Override | null>(readOverride);
  const expanded = (override ?? pageDefault) === 'expanded';

  const toggle = useCallback(() => {
    setOverride((prev) => {
      const cur = (prev ?? pageDefault) === 'expanded';
      const next: Override = cur ? 'collapsed' : 'expanded';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch { /* 隐私模式等存不了就只在本页生效 */ }
      return next;
    });
  }, [pageDefault]);

  return { expanded, toggle };
}
