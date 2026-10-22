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
  return next();
});
