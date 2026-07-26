import { toast } from 'sonner';
import { isTauri } from '@/lib/vault/tauri-fs';

/**
 * 注册 Service Worker，并在检测到新版本时弹「新版本可用」提示——不自动刷新，
 * 免得打断正在编辑的用户；用户点「刷新」才让等待中的新 SW 接管并重载一次。
 *
 * 首次安装（此前无 controller）不弹提示、不重载：controllerchange→reload 的监听只在
 * 用户点击刷新时才挂上，故 activate 里的 clients.claim() 不会导致首访被意外刷新。
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // 客户端（Tauri）不注册 SW：前端资产内嵌在 exe 里本就离线可用，SW 缓存反而可能
  // 让旧版资产盖住新 exe（sw.js 字节不变时浏览器永不触发更新）。同时注销历史注册
  // 并清空 CacheStorage，解救此前版本已在 WebView 里装过 SW 的安装；清理成功后
  // 重载一次脱离旧 controller（此后 getRegistrations 为空，不会再次重载）。
  if (isTauri()) {
    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (regs.length === 0) return;
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        window.location.reload();
      } catch { /* 清理失败不阻塞使用 */ }
    })();
    return;
  }

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
