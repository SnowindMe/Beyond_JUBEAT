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

// 精简样式：藏掉播放器里我们不需要的界面，只留曲目信息、4×4 面板和播放控制。
// 选择器都是对方站真实的 id/class（实测取自它的 DOM），不是猜的。
const SIMPLIFY_CSS = `<style id="bj-simplify">
  /* 只保留三块：曲目信息(#nowPlaying) + 4x4 面板(#panel) + 播放控制(#transport)。
     实测对方原布局：侧栏 320px 在左，其余内容以 320 为起点排布；
     单纯 display:none 掉侧栏会留下右侧空白、且面板不会自动居中
     （邻居仍是按原网格定位的）。所以这里连布局一起改写成居中单列。 */

  /* 1) 藏掉不需要的块 */
  #sidebar, .scrim, #btnSidebarOpen, #btnSidebar,
  #optionsPanel, .options,
  .brand, #visitorCount, #btnShare,
  #timelineWrap, #timelineToggle, #densityWrap, .density-wrap, .density-hud,
  #chartOverview, .chart-overview,
  #loadRow, #btnCollapse, #btnPreview,
  .mobile-bar { display: none !important; }

  /* 2) 应用外壳改成纵向居中的单列 */
  #app {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-start !important;
    width: 100% !important;
    padding: 10px 12px 12px !important;
    box-sizing: border-box !important;
    gap: 8px !important;
  }

  /* 3) 曲目信息条：横排、吃满宽度、别占太高 */
  #nowPlaying {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 8px 12px !important;
    box-sizing: border-box !important;
  }
  /* 封面压小，把纵向空间留给面板 */
  #nowPlaying .cover-wrap, #nowPlaying #cover { width: 56px !important; height: 56px !important; }
  #nowPlaying .np-side { display: none !important; }

  /* 4) 中间那层 main.stage 是真正的宽度约束（实测 380px），必须一起放开 */
  #app > main.stage, main.stage {
    width: 100% !important;
    max-width: none !important;
    height: auto !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 8px !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
  }

  /* 5) 面板：吃满剩余高度并保持正方形。
     它是 4x4 区块的容器，对方自己的 JS 会按渲染比例算像素尺寸，
     所以这里只给外框留出空间，不硬设 width/height（硬设会与它的 canvas 计算打架）。 */
  #panel {
    flex: 1 1 auto !important;
    align-self: center !important;
    margin: 0 auto !important;
    min-height: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  /* 5) 控制条：贴底横排、不换行 */
  #transport {
    width: 100% !important;
    margin: 0 !important;
    padding: 6px 8px !important;
    box-sizing: border-box !important;
    flex: 0 0 auto !important;
  }
</style>`;

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

  // HTML：注入 <base> + 精简样式
  if (type.includes('text/html')) {
    let html = await upstream.text();
    if (!/<base\s/i.test(html)) {
      // 注入到 <head> 开头，越早越好（晚于任何相对资源就来不及了）
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${PREFIX}/">`);
    }
    // 精简注入：我们只在详情页里要「曲目信息 + 4×4 谱面 + 播放控制」，
    // 曲库侧栏、筛选、设置面板、品牌头、访客数、时间轴/物量条全部藏掉。
    // 同源（都经过本代理）才能这样注入 CSS——跨域时改不到 iframe 内部。
    html = html.replace(/<\/head>/i, SIMPLIFY_CSS + '</head>');
    headers.delete('content-length'); // 内容已改，长度作废
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