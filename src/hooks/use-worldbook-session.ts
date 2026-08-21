import { useEffect, useRef, useState } from 'react';
import type { WorldBook } from '@/types/worldbook';

/** 跨页面切换时暂存当前编辑中的世界书，避免切到聊天处理再回来丢失 */
const WB_SESSION_KEY = 'wb-active-session';

/** 连续编辑时的写入节流窗口（毫秒） */
const PERSIST_DELAY = 400;

export interface WbSession {
  worldbook: WorldBook;
  filename: string;
  currentItemId: string | null;
}

export function loadWbSession(): WbSession | null {
  try {
    const raw = sessionStorage.getItem(WB_SESSION_KEY);
    return raw ? (JSON.parse(raw) as WbSession) : null;
  } catch { return null; }
}

function writeSession(session: WbSession | null) {
  try {
    if (session) sessionStorage.setItem(WB_SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(WB_SESSION_KEY);
  } catch { /* sessionStorage 满或不可用时忽略，不影响使用 */ }
}

/**
 * 世界书的跨页会话暂存。
 *
 * 与 `Preset.tsx` / `CardViewer.tsx` 的「只存 id 指针」不同，这里必须整本存：
 * 世界书允许在未保存状态下切走再切回（当初加这段就是为了这个），只留指针会静默丢草稿。
 * 代价是每次改动都要 stringify 整本书，因此加了写入节流——原实现挂在 render 上，
 * 编辑器里每敲一个字符就全量 parse + stringify 一遍。
 *
 */
export function useWorldbookSession(
  worldbook: WorldBook | null,
  filename: string,
  currentItemId: string | null,
): void {
  // 待写入的最新值：节流窗口内被覆盖，卸载时兜底同步写出
  const pendingRef = useRef<WbSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pendingRef.current = worldbook ? { worldbook, filename, currentItemId } : null;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      writeSession(pendingRef.current);
    }, PERSIST_DELAY);
  }, [worldbook, filename, currentItemId]);

  // 路由切换会把本页卸载，未落盘的改动要立刻写出，否则切回来就丢了
  useEffect(() => () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      writeSession(pendingRef.current);
    }
  }, []);
}

/** 挂载时读一次会话快照，用于初始化页面状态；后续渲染不再读 */
export function useRestoredWbSession(): WbSession | null {
  const [restored] = useState<WbSession | null>(loadWbSession);
  return restored;
}
