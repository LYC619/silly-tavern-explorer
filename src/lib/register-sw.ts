import { toast } from 'sonner';

/**
 * 注册 Service Worker，并在检测到新版本时弹「新版本可用」提示——不自动刷新，
 * 免得打断正在编辑的用户；用户点「刷新」才让等待中的新 SW 接管并重载一次。
 *
 * 首次安装（此前无 controller）不弹提示、不重载：controllerchange→reload 的监听只在
 * 用户点击刷新时才挂上，故 activate 里的 clients.claim() 不会导致首访被意外刷新。
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    let registration: ServiceWorkerRegistration;
    try {
      registration = await navigator.serviceWorker.register('/sw.js');
    } catch {
      return; // 注册失败：应用照常运行，只是没有离线缓存
    }

    const acceptUpdate = (waiting: ServiceWorker) => {
      // 只在用户主动接受时才监听接管并重载（一次性），避开首装 claim 触发的 controllerchange
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => window.location.reload(),
        { once: true },
      );
      waiting.postMessage('SKIP_WAITING');
    };

    const promptUpdate = (waiting: ServiceWorker | null) => {
      if (!waiting) return;
      toast('新版本可用', {
        description: '点刷新加载最新版本（建议先保存当前编辑）',
        duration: Infinity,
        action: { label: '刷新', onClick: () => acceptUpdate(waiting) },
      });
    };

    // 打开页面时已存在等待中的新版本（上次访问装好但没刷新）
    if (registration.waiting && navigator.serviceWorker.controller) {
      promptUpdate(registration.waiting);
    }

    // 运行期间发现更新
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // 装到 installed 且已有 controller = 这是一次「更新」而非首次安装
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          promptUpdate(registration.waiting);
        }
      });
    });
  });
}
