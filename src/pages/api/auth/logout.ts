// 退出登录：POST /api/auth/logout
// 用 POST 而不是 GET：GET 退出会被 <img src> 这类跨站请求触发（CSRF 登出）。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { destroySession, readSessionToken, clearSessionCookie } from '../../../lib/auth';


// API 端点必须标 prerender = false：本站 output 是 'static'，
// 端点默认会被当静态路由在构建期预渲染——那样它既拿不到请求体，
// 也会在 Node 预渲染环境里 import cloudflare:workers 直接崩。
export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const db = (env as { beyond_jubeat?: D1Database })?.beyond_jubeat;
  const token = readSessionToken(request.headers.get('cookie'));
  if (db && token) {
    try {
      await destroySession(db, token);
    } catch {
      // 删不掉也要让用户退出：cookie 清掉即可，残留会话会自然过期
    }
  }
  return new Response(null, {
    status: 303,
    headers: { location: '/', 'set-cookie': clearSessionCookie() },
  });
};
