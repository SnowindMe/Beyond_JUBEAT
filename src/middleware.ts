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

  /* ---- Worker 侧边缘缓存（2026-10-25）----
     为什么需要：CF 的**共享 CDN 不缓存 Worker 生成的响应**（静态资源会，Worker 响应不会）。
     实测 /songs/ 连打 3 次都没有 CF-Cache-Status，页面里写的 s-maxage=300 实际上没生效，
     每次访问都真打 D1。这里用 caches.default 自己存一份。

     三条红线（都踩过或会踩）：
       ① **只在游客态缓存**：页面里虽然登录态靠客户端补，但 SSR 期 locals.user 仍可能让
          某些区块变化。带会话 cookie 的请求一律绕过缓存与写入，绝不让 A 的页面被 B 命中。
       ② **只缓存读、只缓存 200**：POST/表单提交（/api/*）不进缓存逻辑。
       ③ **私有路径完全不碰**：/account /admin /login /register /api 是会话相关，
          缓存它们等于把登录态页面发给别人。白名单式判断，只放明确公开的路径。

     命中时跳过 next()，省掉整次 SSR 渲染 + D1 查询；未命中则渲染后 put 一份。
     失败一律降级为「正常放行」——缓存是优化，绝不能因为它把页面搞挂。 */
  const url = new URL(context.request.url);
  const PUBLIC_CACHE = /^\/(songs(\/|$)|recent(\/|$))/.test(url.pathname);
  const hasSession = !!token;
  const isRead = context.request.method === 'GET' || context.request.method === 'HEAD';

  if (!PUBLIC_CACHE || hasSession || !isRead) {
    return next();
  }

  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(key);
    if (hit) {
      // 命中直接返回，但补一个标记头便于线上区分「缓存命中」与「真渲染」
      const res = new Response(hit.body, hit);
      res.headers.set('x-jb-cache', 'HIT');
      return res;
    }
    const res = await next();
    // 只缓存干净的 200；带 Set-Cookie 的响应绝不入库（否则会把会话发给所有人）
    if (res.status === 200 && !res.headers.has('set-cookie')) {
      const toCache = new Response(res.body, res);
      toCache.headers.set('x-jb-cache', 'MISS');
      // 页面的 Cache-Control 是 max-age=30/s-maxage=300，照用；Worker 缓存按这个 TTL 过期
      // 注意：put 必须用 clone()——body 是流，put 会消费它，不 clone 的话回给浏览器的
      // 那个 Response 就是空的了（页面变白屏）。这个坑很隐蔽，只在第一次未命中时出现。
      await cache.put(key, toCache.clone());
      return toCache;
    }
    return res;
  } catch {
    // 缓存层任何异常都退回正常渲染路径，绝不把错误抛给用户
    return next();
  }
});
