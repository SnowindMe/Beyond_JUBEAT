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
 *
 * 【2026-10-27 修】v1 的 PRECACHE 里写了 /favicon.svg，而该文件在换品牌标识时被删了
 * （404）。cache.addAll 是「任一失败则整体 reject」，于是 install 直接失败、
 * 新访客的 SW 根本装不上（PWA 坏掉）。两个修法一起做：①列表更新为实际存在的文件；
 * ②预缓存改成逐个 add 并吞掉单项失败——以后某个资源改名/删除也不会拖垮整个安装。
 */
const VERSION = 'v2';
const CACHE = 'jb-static-' + VERSION;

// 品牌资源版本号，必须与以下三处保持一致（见 README「品牌资源版本」）：
//   src/layouts/Base.astro 头部图标链接 / src/components/Header.astro 与
//   src/layouts/Base.astro 的 brand.webp / public/manifest.webmanifest 的 icons。
// 忘了同步这里不会出事（只会多存一份旧 key 的副本），但别让它长期落后。
const ASSET_V = '?v=2';

// 预缓存：体积小且确定不会变的关键资源。
// 【不放 manifest】它里面写着 icons 的 ?v=N，缓存住会让「换图标」不生效——见下面的 fetch。
const PRECACHE = [
  '/icon-192.png' + ASSET_V,
  '/icon-512.png' + ASSET_V,
  '/icon-maskable-512.png' + ASSET_V,
  '/favicon.ico' + ASSET_V,
  '/favicon-32.png' + ASSET_V,
  '/favicon-16.png' + ASSET_V,
  '/apple-touch-icon.png' + ASSET_V,
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 逐项 add 且吞掉单项失败：少一个文件不该让整个 SW 装不上
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
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
  // manifest 必须新鲜：它列着 icons 的 ?v=N，缓存住会让换图标不生效
  if (url.pathname === '/manifest.webmanifest') return;

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
