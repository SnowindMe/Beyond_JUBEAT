// 全站中间件：把请求里的会话 cookie 解析成 Astro.locals.user，供所有页面/接口读取。
//
// 为什么放在中间件而不是每个页面各查一次：
//   * Header 需要在每一页知道「当前是谁」才能显示登录态，逐页手写必然漏；
//   * 只查一次，页面里读 locals 即可，不额外打 D1。
//
// 重要：构建期预渲染的静态页不该碰 D1（那时没有绑定，也没有请求 cookie）。
// Astro 7 的 context.isPrerendered 能区分这两种情况，预渲染时整体跳过。
import { defineMiddleware } from 'astro:middleware';
import { getUserByToken, readSessionToken, type AuthUser } from './lib/auth';

// 注意：这里不能顶层 import 'cloudflare:workers'。
// 本机预渲染走的是 Node（astro.config.mjs 的 prerenderEnvironment: 'node'），
// 而 Node 的 ESM loader 不认识 cloudflare: 协议——顶层静态导入会让
// 「预渲染 /404」这一步直接崩：ERR_UNSUPPORTED_ESM_URL_SCHEME。
// 改成只在真正跑 SSR 请求时动态导入，预渲染分支根本不执行它。

/* ---------------- 边缘缓存的两层存储（2026-11-02 v2） ----------------
   CACHE_PREFIX 带两层版本：
     · `v2` = 缓存**策略**版本，改动规则时 +1；
     · `site.json 的 version` = **站点版本**，每次发版自动变。
   为什么要带站点版本：陈旧层保留 24h，意味着「部署完了但边缘还在吐旧 HTML」——
   2026-11-02 实测过：v1.58.1 上线后 /songs/ 仍回旧页面（旧 preload 映射还指着 CDN），
   最长要等一个陈旧期。把版本号拼进 key 后，**每次发版 = 换一个新命名空间**，
   老条目自然作废；代价是每次发版后每个 PoP 的第一次访问要真渲染一次（本来就该这样）。
   注意：import 的是构建期常量，运行时不变，不会让缓存 key 抖动。 */
import { version as SITE_VERSION } from './data/site.json';
const CACHE_PREFIX = `/_jb-cache/v2/${SITE_VERSION}`;
/** 新鲜期：这段时间内命中直接返回，连缓存校验都省了 */
const FRESH_TTL = 300;
/** 陈旧期：新鲜期过后仍可「先吐旧的、后台再刷新」，留 24h 兜住冷 PoP 与流量尖峰 */
const STALE_TTL = 60 * 60 * 24;

type CachedResponse = { status: number; headers: Headers; body: ArrayBuffer };

/** 同一 isolate 内同路径的渲染只跑一次，其余请求等同一个 Promise */
const inflight = new Map<string, Promise<CachedResponse | null>>();

/** 把 Response 读成内存快照：body 是流，只能读一次，而我们要分给多个调用方 + 写缓存 */
async function snapshotOf(res: Response): Promise<CachedResponse> {
  const body = await res.arrayBuffer();
  return { status: res.status, headers: new Headers(res.headers), body };
}

/** 用快照给某个请求单独造一份 Response（body 必须复制，ArrayBuffer 不能共用） */
function respondWith(snapshot: CachedResponse, tag: string): Response {
  const headers = new Headers(snapshot.headers);
  headers.set('x-jb-cache', tag);
  return new Response(snapshot.body.slice(0), { status: snapshot.status, headers });
}

/** 缓存命中时补一个标记头，便于线上区分「缓存命中」「陈旧吐出」「真渲染」 */
function relabel(res: Response, tag: string): Response {
  const copy = new Response(res.body, res);
  copy.headers.set('x-jb-cache', tag);
  return copy;
}

/** 同一份快照写两份：新鲜层（短 TTL）+ 陈旧层（长 TTL）。
    注意每份的 Cache-Control 不同——Worker 缓存就是按这个头算过期时间的。 */
async function putBoth(cache: Cache, freshKey: Request, staleKey: Request, snapshot: CachedResponse) {
  for (const [key, ttl] of [
    [freshKey, FRESH_TTL],
    [staleKey, STALE_TTL],
  ] as const) {
    const headers = new Headers(snapshot.headers);
    headers.set('cache-control', `public, max-age=${ttl}, s-maxage=${ttl}`);
    await cache.put(key, new Response(snapshot.body.slice(0), { status: snapshot.status, headers }));
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  // 预渲染阶段（构建期生成静态 HTML）没有 D1 绑定、也没有真实请求：
  // 直接放行，locals.user 保持 null。静态页因此永远是「游客视角」，
  // 登录态相关的 UI 只能在客户端补（静态页无法按会话变化）。
  if (context.isPrerendered) {
    context.locals.user = null;
    return next();
  }

  let db: D1Database | undefined;
  try {
    const { env } = await import('cloudflare:workers');
    db = (env as { beyond_jubeat?: D1Database })?.beyond_jubeat;
  } catch {
    db = undefined;
  }
  const token = readSessionToken(context.request.headers.get('cookie'));
  let user: AuthUser | null = null;

  if (db && token) {
    try {
      user = await getUserByToken(db, token);
    } catch {
      // 数据库抖动不该让整站 500：当作未登录，页面照常渲染。
      user = null;
    }
  }

  context.locals.user = user;

  /* ---- Worker 侧边缘缓存 v2（2026-11-02 改造：stale-while-revalidate + 单飞）----
     背景：CF 的共享 CDN 不缓存 Worker 响应，所以 2026-10-25 用 caches.default 自己存一份。
     审计压测（docs/audit-2026-11-02.md 第一节）暴露两个缺口：

       ① **并发穿透**：缓存过期（s-maxage=300）或冷 PoP 上，N 个请求同时 MISS，
          就会同时跑 N 次「1683 张卡」的 SSR。实测并发 5 起约 20% 撞
          Cloudflare error 1102（Worker 资源超限），并发 20 → 4/20。
          修法：**手写两层 stale-while-revalidate**——旧条目在陈旧层留 24h，
          新鲜条目过期时先吐旧 HTML、后台只重渲一次。用户最多看到几十秒前的页面，
          但不会看到 Error 页。
       ② **key 带查询串**：`?x=123` 这类参数会让每个 URL 各存一份，等于可被轻易穿透
          （压测脚本正是这么打的）。修法：key 只用 pathname——页面内容与查询串无关，
          日服/国服两套 body 本来就是服务端一起渲染、前端做显隐。

     另加**单飞**：同一 isolate 内同路径的并发渲染共用一个 Promise，只跑一次。

     三条红线不变：
       ① 带会话 cookie 的请求不读也不写缓存（绝不让 A 的页面被 B 命中）；
       ② 只缓存 GET/HEAD 的 200，且响应不带 Set-Cookie；
       ③ 白名单路径（只放 /songs/ 与 /recent/）。缓存是优化，任何异常都退回正常渲染。 */
  const url = new URL(context.request.url);
  const PUBLIC_CACHE = /^\/(songs(\/|$)|recent(\/|$))/.test(url.pathname);
  const hasSession = !!token;
  const isRead = context.request.method === 'GET' || context.request.method === 'HEAD';

  if (!PUBLIC_CACHE || hasSession || !isRead) {
    return next();
  }

  try {
    const cache = (caches as unknown as { default: Cache }).default;
    /* 【2026-11-02 分段加载】key 的取舍按路径分两档：
       · 页面级（/songs/、/recent/）：只用 pathname。页面内容与查询串无关
         （日服/国服两套 body 都是服务端一起渲染），带上查询串等于给缓存留个后门。
       · 片段端点（/songs/frag?srv=&gen=）：**必须带上查询串**，否则所有世代的片段
         会共用同一个 key —— jubeat 的片段被当成 festo 的命中，页面直接错乱。 */
    const cachePath = url.pathname === '/songs/frag' ? url.pathname + url.search : url.pathname;
    const freshKey = new Request(url.origin + CACHE_PREFIX + cachePath, { method: 'GET' });
    const staleKey = new Request(url.origin + CACHE_PREFIX + '/stale' + cachePath, { method: 'GET' });

    // ① 新鲜条目：直接返回，完全不进 SSR
    const fresh = await cache.match(freshKey);
    if (fresh) return relabel(fresh, 'HIT');

    // 渲染一次并写两层缓存；并发调用共用同一个 Promise
    const refresh = (): Promise<CachedResponse | null> => {
      const running = inflight.get(cachePath);
      if (running) return running;
      const task = (async (): Promise<CachedResponse | null> => {
        const res = await next();
        // 只缓存干净的 200；带 Set-Cookie 的响应绝不入库（否则会把会话发给所有人）
        if (res.status !== 200 || res.headers.has('set-cookie')) return null;
        const snapshot = await snapshotOf(res);
        await putBoth(cache, freshKey, staleKey, snapshot);
        return snapshot;
      })()
        .catch(() => null)
        .finally(() => inflight.delete(cachePath));
      inflight.set(cachePath, task);
      return task;
    };

    // ② 过期了但旧条目还在：先吐旧的，后台刷新（尖峰时不再有 N 个请求同时渲染）
    const stale = await cache.match(staleKey);
    if (stale) {
      const snapshot = await snapshotOf(stale);
      const task = refresh();
      context.locals.cfContext?.waitUntil?.(task);
      return respondWith(snapshot, 'STALE');
    }

    // ③ 冷 PoP（从没渲染过）：只能同步渲染一次
    const snapshot = await refresh();
    if (!snapshot) return next();
    return respondWith(snapshot, 'MISS');
  } catch {
    // 缓存层任何异常都退回正常渲染路径，绝不把错误抛给用户
    return next();
  }
});
