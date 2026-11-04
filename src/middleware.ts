// 全站中间件：把请求里的会话 cookie 解析成 Astro.locals.user，供所有页面/接口读取。
//
// 为什么放在中间件而不是每个页面各查一次：
//   * Header 需要在每一页知道「当前是谁」才能显示登录态，逐页手写必然漏；
//   * 只查一次，页面里读 locals 即可，不额外打 D1。
//
// 重要：构建期预渲染的静态页不该碰 D1（那时没有绑定，也没有请求 cookie）。
// Astro 7 的 context.isPrerendered 能区分这两种情况，预渲染时整体跳过。
import { defineMiddleware, type MiddlewareHandler } from 'astro:middleware';
import { getUserByToken, readSessionToken, type AuthUser } from './lib/auth';
import { withSecurityHeaders } from './lib/csp';

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

type Snapshot = { status: number; headers: Headers; body: ReadableStream<Uint8Array> };

/** 同一 isolate 内同路径的渲染只跑一次，其余请求等同一个 Promise */
const inflight = new Map<string, Promise<Snapshot | null>>();

/** 空 body（HEAD / 204 这类响应没有流可读，后续照样要能 tee 出一条空的） */
const emptyBody = () => new ReadableStream<Uint8Array>({ start: (c) => c.close() });

/* 【2026-11-04 改：命中不再整份复制 HTML】
   原实现是 `await res.arrayBuffer()` 把整页读进内存，之后每用一次再 `slice(0)`
   复制一份：一次 fresh 命中复制 3 份（respondWith 一份 + putBoth 两份），STALE 命中
   复制 1 份。/songs/ 首屏约 250KB、/jubility 是全量渲染的大页，命中一次就白付一遍
   整页 memcpy，而命中恰恰是最该便宜的那条路径。

   现在 body 留成流，靠 bodyOf() 用 tee() 现场分叉：tee 只是把同一块 chunk 挂到两个
   队列上（引用，不复制字节）。“ArrayBuffer 不能跨 Response 共用”这条约束依然成立——
   每个 Response / cache.put 拿到的都是自己独占的一条流，谁也不碰别人的。 */
function snapshotOf(res: Response): Snapshot {
  return { status: res.status, headers: new Headers(res.headers), body: res.body ?? emptyBody() };
}

/** 从快照里分出一条**独占**的 body，交给某个 Response 或 cache.put。
 *  注意原始流被第一次 tee 之后就锁住了，所以分完必须把剩下那条写回快照，
 *  下一次调用才能继续分叉（并发等同一个 Promise 的多个请求正是这么各拿一份的）。
 *  代价：最后一次分叉总会在快照上留一条没人读的悬空分支，它会一直攒着 chunk 引用
 *  直到快照本身被回收。tee 只是引用同一个 chunk、不复制字节，所以最坏是多留一份
 *  「引用」，仍比原来每次使用都真复制一份（最多 3 份整页副本）便宜得多。 */
function bodyOf(snapshot: Snapshot): ReadableStream<Uint8Array> {
  const [mine, rest] = snapshot.body.tee();
  snapshot.body = rest;
  return mine;
}

/** 用快照的元信息 + 一条独占的 body 造 Response */
function respondWith(snapshot: Snapshot, body: ReadableStream<Uint8Array>, tag: string): Response {
  const headers = new Headers(snapshot.headers);
  headers.set('x-jb-cache', tag);
  /* 【2026-11-02 事故修复】「陈旧内容」绝不能再被下游缓存。
     原实现把快照头原样回给调用方，而快照里存的是陈旧层的 max-age=86400：
     于是浏览器与腾讯 EdgeOne（wiki-cn 那一跳）会把**旧页面**按 1 天缓存住，
     部署新版本后普通 URL 仍吐旧 HTML（实测 Age: 1370、EO-Cache-Status: HIT）。
     现在陈旧响应一律 no-store：拿到旧内容的那一次之后就一定会回来重新问源站。 */
  if (tag === 'STALE') {
    headers.set('cache-control', 'no-store, max-age=0');
    headers.delete('age');
  }
  return new Response(body, { status: snapshot.status, headers });
}

/** 缓存命中时补一个标记头，便于线上区分「缓存命中」「陈旧吐出」「真渲染」 */
function relabel(res: Response, tag: string): Response {
  const copy = new Response(res.body, res);
  copy.headers.set('x-jb-cache', tag);
  return copy;
}

/** 同一份快照写两份：新鲜层（短 TTL）+ 陈旧层（长 TTL）。
    注意每份的 Cache-Control 不同——Worker 缓存就是按这个头算过期时间的。
    【2026-11-04】两份各分一条流（tee），不再各自 slice(0) 复制一遍内存；
    返回的是两个写操作的 Promise，调用方可以在后台跑不必干等——body 现在是流，
    等 put 写完再交给用户等于又把整页憋回了内存。缓存写失败一律吞掉（它是优化不是依赖）。 */
function putBoth(cache: Cache, freshKey: Request, staleKey: Request, snapshot: Snapshot): Promise<unknown>[] {
  return ([
    [freshKey, FRESH_TTL],
    [staleKey, STALE_TTL],
  ] as const).map(([key, ttl]) => {
    const headers = new Headers(snapshot.headers);
    headers.set('cache-control', `public, max-age=${ttl}, s-maxage=${ttl}`);
    return cache.put(key, new Response(bodyOf(snapshot), { status: snapshot.status, headers })).catch(() => {});
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const res = await handle(context, next);
  // MiddlewareHandler 允许返回 void（等于放行），那种情况没有响应可修饰
  return res instanceof Response ? withSecurityHeaders(res) : res;
});

/**
 * 真正的中间件主体。
 *
 * 拆出来是因为 `withSecurityHeaders` 要包住**每一个出口**——原实现有 6 处 `return`
 * （预渲染、命中新鲜缓存、吐陈旧、冷渲染、缓存异常兜底、以及不缓存的分支），
 * 逐个手包必漏。包在最外层，出口再多也只覆盖一次。
 *
 * 【注意不是所有响应都该补头】头只对能被浏览器渲染/解析的东西有意义。
 * /api/* 的 JSON、以及 SSE/流式响应补了也不会坏，所以统一都补，不做路径判断——
 * 少一个判断就少一处「新加接口忘了补」的坑。
 */
const handle: MiddlewareHandler = async (context, next) => {
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

     红线（2026-11-04 按新规则重写）：
       ① **响应带 Set-Cookie 就绝不入库**（refresh() 里判的）——一旦入库，A 的会话 cookie
          就跟着 HTML 发给所有命中者。这是「一个带会话的请求能不能吃缓存」的唯一硬闸，
          比「请求里有没有 cookie」更准：cookie 在、响应却不带 Set-Cookie，body 就是公共的；
       ② 只缓存 GET/HEAD 的 200，且路径必须落在白名单里；
       ③ 白名单是闭集（/、/songs/、/recent/、/jubility/，另加要带查询串的 /songs/frag），
          登录相关页（/login、/register、/account、/admin）一律不进。
       缓存是优化，任何异常都退回正常渲染。 */
  const url = new URL(context.request.url);
  /* 白名单是闭集，加新页必须在这里显式补一条（别图省事改成前缀通配）。
     · /songs/ 与 /recent/：全量读 D1 渲染的曲库/变更页（2026-11-02 起）；
     · /  ：2026-11-03 起 SSR（当日运势 + 热榜要读 D1 快照）。不缓存就每次请求
            都真打 D1 + KV，还会连带压到 miniflare/workerd 的 CPU。游客的运势种子
            恒为 'guest'（见 Fortune.astro 的 visitor），全体游客本就该看到同一份；
     · /jubility/：2026-10-26 起 SSR，每请求 getAllSongs() 全曲库再算两服理论值，
            是全站最贵的一页——不缓存等于把最贵的渲染乘上访问量。它靠曲库吃饭，
            但理论值跟着新曲变本来也不要求秒级，FRESH_TTL 那点延迟完全可接受；
            真要更快就对该路径单开短 TTL，别整条跳过缓存。 */
  const PUBLIC_CACHE = /^\/($|songs(\/|$)|recent(\/|$)|jubility(\/|$))/.test(url.pathname);
  /* 【2026-11-04 改：登录用户不再整段绕过缓存】原来 (`hasSession` → 直接 next())
     把「个性化」当成了「私有」：登录用户访问 /songs/ 每次都要重渲那一屏，而那一屏
     对登录与游客的 body 一模一样。现在只在**真的按登录态渲染不同 body** 的路径上跳过：
       · /           —— Fortune.astro:31 用 user.id 当运势种子，换人缓存等于把 A 的
                        运势发给 B，必须跳过（首页对登录用户不缓存，这是正确性）；
       · /songs/frag —— 与 /songs/ 同源同渲染，同样零处 locals。
     /songs/、/recent/、/jubility/ 页面层 0 处 Astro.locals，登录态是顶栏客户端拉
     /api/auth/me 补的（Header.astro:223），这三页按纯公共处理、不判 cookie。
     万一哪天有人在白名单页里读 locals，兜底是红线①：响应带 Set-Cookie 就谁也不缓存。 */
  const LOGIN_DEPENDENT = url.pathname === '/' || url.pathname === '/songs/frag';
  const hasSession = !!token;
  const isRead = context.request.method === 'GET' || context.request.method === 'HEAD';

  if (!PUBLIC_CACHE || (hasSession && LOGIN_DEPENDENT) || !isRead) {
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
    const refresh = (): Promise<Snapshot | null> => {
      const running = inflight.get(cachePath);
      if (running) return running;
      const task = (async (): Promise<Snapshot | null> => {
        const res = await next();
        // 只缓存干净的 200；带 Set-Cookie 的响应绝不入库（否则会把会话发给所有人）
        if (res.status !== 200 || res.headers.has('set-cookie')) return null;
        /* 这里同步把两条流分出去就返回，**不 await 写缓存**：body 已经是流，
           等 put 写完才交给用户等于又把整页憋回内存一次，白白多一份完整副本。
           分完即走，各条流自己跑，谁读谁的。 */
        const snapshot = snapshotOf(res);
        // 两个写都挂到 waitUntil 上：响应体从流里走完之后，写缓存也不该被草率掐断
        for (const put of putBoth(cache, freshKey, staleKey, snapshot)) {
          context.locals.cfContext?.waitUntil?.(put);
        }
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
      const snapshot = snapshotOf(stale);
      const task = refresh();
      context.locals.cfContext?.waitUntil?.(task);
      // 这一条只给当前请求用，直接交出去，不必再 tee（tee 的另一半没人读会白攒一份内存）
      return respondWith(snapshot, snapshot.body, 'STALE');
    }

    // ③ 冷 PoP（从没渲染过）：只能同步渲染一次
    const snapshot = await refresh();
    if (!snapshot) return next();
    return respondWith(snapshot, bodyOf(snapshot), 'MISS');
  } catch {
    // 缓存层任何异常都退回正常渲染路径，绝不把错误抛给用户
    return next();
  }
};
