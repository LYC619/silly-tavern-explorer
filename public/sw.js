// 缓存版本随发布版本走：改这里的 CACHE_VERSION 会换掉整个 cache 名，
// activate 时自动清掉所有旧版本 cache，避免旧资源长期堆积、也便于按版本排查。
// 发布时与 package.json / APP_VERSION 一起改（version-sync 测试会校验三者一致）。
const CACHE_VERSION = 'v0.18.0';
const CACHE_NAME = 'st-chat-' + CACHE_VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/index.html'])).catch(() => {
      // 离线安装时预缓存可能失败，不阻断安装
    })
  );
  // 不自动 skipWaiting：新版本先进入 waiting，由页面弹"新版本可用"提示、用户点刷新才接管，
  // 免得正在编辑（世界书/总结等）的用户被强制刷新打断。
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// 页面点"刷新"后发来此消息 → 让等待中的新 SW 立即接管（随后 controllerchange 触发一次性重载）
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // 只接管同源请求；跨域（如用户配置的 AI 提供商）一律放行、绝不进缓存
  if (url.origin !== self.location.origin) return;

  // cache-first 只给带 hash 的构建产物（/assets/）和不可变媒体/字体。
  // 千万别把裸 .js/.css 也算进来：dev 的 /src/index.css 没有 hash，一旦 cache-first
  // 就被永久钉死，出现"新 JS + 旧 CSS"的半新半旧页面（2.1-P4 实测踩坑）。
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    /\.(woff2?|png|jpe?g|gif|svg|ico|webp)$/.test(url.pathname);

  if (isStaticAsset) {
    // 带 hash 的构建产物：cache-first（命中直接用，未命中取网络并只在成功时入缓存）
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  } else {
    // 其余同源请求（主要是 HTML 导航）：network-first，只缓存成功响应，离线时回退缓存
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
