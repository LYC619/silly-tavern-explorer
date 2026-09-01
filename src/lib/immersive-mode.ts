/**
 * 沉浸阅读态：阅读覆盖层挂载期间要求外壳让开（移动端隐藏底部标签栏和状态栏）。
 *
 * 用模块级计数 + window 事件，而不是 context：阅读器分散在三个页面里，还有一路
 * 嵌在角色页内（InlineStoryReader），走 context 得把 provider 提到 AppLayout 之外
 * 再逐层传下来。计数是为了两层覆盖层（小说视图开在沉浸阅读之上）退出时不早退。
 */
import { useEffect, useState } from 'react';
import { registerBackHandler } from '@/lib/back-button';

const IMMERSIVE_CHANGE_EVENT = 'ste-immersive-change';

let depth = 0;

export function isImmersiveActive(): boolean {
  return depth > 0;
}

function notify(): void {
  window.dispatchEvent(new Event(IMMERSIVE_CHANGE_EVENT));
}

export function pushImmersive(): void {
  depth += 1;
  notify();
}

export function popImmersive(): void {
  depth = Math.max(0, depth - 1);
  notify();
}

/**
 * 覆盖层挂载期间占用沉浸态；active 为假时不占用（嵌入模式的小说视图不算沉浸）。
 *
 * onBack 是这一层的关闭动作，接 Android 返回键用：沉浸阅读中按返回应该退沉浸，
 * 而不是把整个页面退掉。传了就自动挂到返回键处理栈上，和 Escape 走同一个 onClose，
 * 两条路径不会各自漂移。
 */
export function useImmersiveLock(active: boolean, onBack?: () => void): void {
  useEffect(() => {
    if (!active) return;
    pushImmersive();
    return () => popImmersive();
  }, [active]);

  // 单独一个 effect：onBack 每次渲染都是新函数，混在上面会让沉浸态计数
  // 反复 push/pop（外壳跟着闪）。
  useEffect(() => {
    if (!active || !onBack) return;
    return registerBackHandler(() => { onBack(); return true; });
  }, [active, onBack]);
}

/** 外壳侧订阅：有覆盖层在时隐藏自己的导航层。 */
export function useImmersive(): boolean {
  const [immersive, setImmersive] = useState(isImmersiveActive);
  useEffect(() => {
    const sync = () => setImmersive(isImmersiveActive());
    window.addEventListener(IMMERSIVE_CHANGE_EVENT, sync);
    sync();
    return () => window.removeEventListener(IMMERSIVE_CHANGE_EVENT, sync);
  }, []);
  return immersive;
}
