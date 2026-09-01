/**
 * 把 Android 系统返回键接到 lib/back-button 的处理栈上。
 *
 * 只在 Capacitor 原生壳里生效：桌面端和网页版没有这个键（浏览器的后退是历史导航，
 * 那个由 react-router 自己管，不该被我们接管）。
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isCapacitor } from '@/lib/runtime';
import { handleBackPress, isTopLevelPath } from '@/lib/back-button';

export function useAndroidBackButton(): void {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isCapacitor()) return;

    let dispose: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { App } = await import('@capacitor/app');
      // 组件可能在 await 期间卸载
      if (cancelled) return;
      const listener = await App.addListener('backButton', () => {
        const outcome = handleBackPress();
        if (outcome !== 'unhandled') return;

        if (isTopLevelPath(location.pathname)) {
          // 最小化而不是退出：退出会把阅读位置、抽屉状态全丢掉，
          // 而 Android 的习惯是返回到桌面、应用留在后台。
          void App.minimizeApp();
          return;
        }
        navigate(-1);
      });
      if (cancelled) { void listener.remove(); return; }
      dispose = () => { void listener.remove(); };
    })();

    return () => { cancelled = true; dispose?.(); };
    // location.pathname 进依赖：兜底分支要看当前在哪一页
  }, [navigate, location.pathname]);
}
