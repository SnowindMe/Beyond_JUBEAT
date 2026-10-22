import type { APIRoute } from 'astro';

// 谱面确认代理：让详情页能够内嵌 ub.thregren.world 的播放器。
//
// 为什么需要代理：对方站用 X-Frame-Options: SAMEORIGIN + CSP frame-ancestors 'self'
// 明确拒绝被第三方 iframe 嵌入，不剥掉这两条头，iframe 会被浏览器直接拦截成空白。
//
// 代理必须严格限定范围，不做通用开放代理：
//   ① 只代理 UB_ORIGIN 一个主机；
//   ② 只放行 /ub-proxy/* 前缀，路径含 .. 直接拒绝（防穿越）；
//   ③ 只放行 GET / HEAD；
//   ④ 只透传深链接需要的查询参数（song/chart/t/paused/play）。
//
// 关键点：ub 是 SPA，页面里的 /static/xxx.js、/static/xxx.css、音频、封面
// 全都写成站点根的绝对路径。若只把 HTML 代理过来，这些子资源会请求到
// wiki.byd-ub.top 根下 → 404，播放器直接白屏。所以这里做的是「前缀代理」：
// /ub-proxy/static/x.js  →  https://ub.thregren.world/static/x.js
// 并在 HTML 响应里把 <base> 注入成 /ub-proxy/，让相对路径也落到代理前缀下。
export const prerender = false;

const UB_ORIGIN = 'https://ub.thregren.world';
const PREFIX = '/ub-proxy';

const PASS_QUERY = new Set(['song', 'chart', 't', 'paused', 'play']);

export const GET: APIRoute = async ({ request, url }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 });
  }
  if (url.pathname.includes('..')) {
    return new Response('bad path', { status: 400 });
  }

  // 去掉前缀，剩下的就是对方站上的路径
  let rest = url.pathname.slice(PREFIX.length) || '/';
  if (!rest.startsWith('/')) rest = '/' + rest;

  const target = new URL(UB_ORIGIN + rest);
  for (const [k, v] of url.searchParams) {
    if (PASS_QUERY.has(k)) target.searchParams.append(k, v);
  }

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers: { accept: request.headers.get('accept') ?? '*/*' },
    redirect: 'follow',
  });

  // 白名单搬运响应头：绝不整份复制（尤其不能带 X-Frame-Options / CSP /
  // X-Robots-Tag，那正是需要剥掉的三条）
  const headers = new Headers();
  const PASS_HEADERS = [
    'content-type',
    'cache-control',
    'etag',
    'last-modified',
    'content-length',
    'content-encoding',
    'accept-ranges',
  ];
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  // 代理内容一律允许被本站页面内嵌
  headers.set('x-content-type-options', 'nosniff');

  const type = upstream.headers.get('content-type') ?? '';

  // HTML：注入 <base>，让页面内相对路径也走代理前缀
  if (type.includes('text/html')) {
    let html = await upstream.text();
    if (!/<base\s/i.test(html)) {
      // 注入到 <head> 开头，越早越好（晚于任何相对资源就来不及了）
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${PREFIX}/">`);
      headers.delete('content-length'); // 内容已改，长度作废
    }
    return new Response(request.method === 'HEAD' ? null : html, {
      status: upstream.status,
      headers,
    });
  }

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
};