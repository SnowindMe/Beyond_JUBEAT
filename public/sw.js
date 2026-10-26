/* Beyond ↑ JUBEAT ♪~ Service Worker
 *
 * 目标很小：让「添加到主屏幕」能用（Chrome 要求有 manifest + SW 的 fetch 处理器），
 * 顺带把静态资源（图标/字体/底图）缓存起来，首屏少一次往返。
 *
 * 【绝不缓存 HTML 与 API】本站多数页面是 SSR（查 D1），数据随时会变；缓存 HTML
 * 会让用户看到过期的曲库或登录态。所以 fetch 只处理「静态资源」这一类，
 * 其余（document、/api/）一律直接放行、不碰缓存。
 *
 * 版本号改动即触发清理旧缓存。只清理本 SW 自己的前缀，不碰其他缓存。
 */
const VERSION = 'v1';
const CACHE = 'jb-static-' + VERSION;

// 预缓存：体积小且确定不会变的关键资源
const PRECACHE = [
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('jb-static-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只处理同源
  if (url.origin !== self.location.origin) return;
  // HTML 与接口：一律网络直通，不缓存（本站 SSR 数据会变）
  if (req.mode === 'navigate' || req.destination === 'document') return;
  if (url.pathname.startsWith('/api/')) return;

  // 静态资源：cache-first（构建产物名带 hash，内容不会变）
  const isStatic =
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(png|jpe?g|webp|avif|svg|ico|woff2?|css|js|webmanifest)$/i.test(url.pathname);
  if (!isStatic) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // 只缓存成功的同源响应；opaque/error 不存
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
