// 曲绘同源反代：GET|HEAD /api/jacket/<idN.webp>
//
// 【为什么不让浏览器直连图床】
// 曲绘原来直接指向 free-img.400040.xyz。那个域名给了 Cache-Control: max-age=18000
// （5 小时）且没有任何防盗链，于是每个人的浏览器都要跨境去图床取图、每 5 小时
// 重新取一遍，我们这边一份缓存也留不下。改成同源反代后：
//   · 曲绘进本 Worker 的 Cache API，再由 CF 边缘回给浏览器——同一数据中心第二次起
//     就不出边缘，冷 PoP 也只是第一次跨境；
//   · 我们自己发 immutable 长缓存（名字是 idN.webp、内容永不改，换图必然换名）；
//   · 顺手补一道 Referer 防盗链（主人 2026-11-16 要求）。
//
// 安全边界沿用 2026-10-22 定的代理规则：
//   · 只代理 free-img.400040.xyz 这一个主机，目标路径由服务端从映射表查出来拼，
//     不接受用户传入的 URL；
//   · <name> 必须命中映射表，未命中直接 404，不转发；
//   · 只放行 GET / HEAD；上游是静态文件，不透传查询参数。
//
// 【防盗链与缓存的相互作用——必须让"合规"与"不合规"分开缓存】
// 合规请求走正常 key 并缓存 200；不合规请求**既不查缓存也不写缓存**、直接 403。
// 若让两者共用一个 key，热链的人一多，本站人反而会吃到缓存里的 403。
// 反过来若给不合规也缓存，就得给 key 加标记、还要处理「先热链后本站」的翻转，
// 为一个几乎零成本的 403 不值得。Referer 为空（直接地址栏打开、curl）放行。
import type { APIRoute } from 'astro';
import cdn from '../../../data/cdn.json';

export const prerender = false;

const MAP: Record<string, string> = (cdn as { jackets?: Record<string, string> }).jackets ?? {};

// 只接受规范名：id + 数字 + .webp。白名单比「拒绝 ..」更省心，编码绕过也进不来。
// 【2026-11-22】U'nit 世代的曲目还没有官方 songId（占位 unit-001..unit-014），
// 规范名因此是 idunit-NNN.webp —— 与 id<数字>.webp 同属「id 前缀」家族，一起放行。
const NAME_OK = /^id(\d{1,12}|unit-\d{3}|ph-cn)\.webp$/;

/** 我们自己发的缓存头。一曲一图、内容永不改，所以 immutable。 */
const CACHE_CONTROL = 'public, max-age=604800, s-maxage=2592000, immutable';

/** 允许的外链来源：本站两个域名、workers.dev 预览、本机开发。 */
const SITE_HOST = /(^|\.)byd-ub\.top$/;
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function refererAllowed(request: Request): boolean {
  // 浏览器发 <img> 时同源请求会带完整 Referer（strict-origin-when-cross-origin 对同源仍发全 URL）。
  // 没有 Referer 的情况：直接打开图片地址、curl 验收——放行，否则没法验。
  const raw = request.headers.get('referer');
  if (!raw) return true;
  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch {
    return false; // 有头但解析不出来：宁可拒
  }
  return SITE_HOST.test(host) || DEV_HOST.test(host);
}

/** 允许跨域读取（2026-11-16）：同源页面本来不需要它，但功能够用时脚本
 *  （另一个域的预览站、本地工具、将来的 <canvas> 取像素）就能直接读这张图。
 *  曲绘是公开素材，用 * 比逐个列域省事；不带 credentials，Teleport/CORS 的凭据约束也不受影响。 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-max-age': '86400',
} as const;

const notFound = (why: string) =>
  new Response(why, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });

async function serve(name: string, request: Request, cf?: ExecutionContext): Promise<Response> {
  if (!NAME_OK.test(name)) return notFound('bad name');

  const upstream = MAP[name];
  if (!upstream) return notFound('no mapping');

  const cache = caches.default;
  // 缓存键带 origin：Cache API 只对当前 zone 生效，但同一份图从 wiki.byd-ub.top
  // 与 workers.dev 进来时各存一份，别互相串（写死第三方域当 key 会 put 成功而 match 恒 MISS）。
  const key = new Request(new URL('/api/jacket/' + name, new URL(request.url).origin).toString(), {
    method: 'GET',
  });

  if (request.method === 'HEAD') {
    const hit = await cache.match(key);
    if (hit) {
      return new Response(null, {
        status: 200,
        headers: {
          'content-type': hit.headers.get('content-type') || 'image/webp',
          'content-length': hit.headers.get('content-length') || '',
          'cache-control': CACHE_CONTROL,
          ...CORS,
        },
      });
    }
    const up = await fetch(upstream, { method: 'HEAD', cf: { cacheEverything: true } });
    return new Response(null, {
      status: up.ok ? 200 : 502,
      headers: {
        'content-type': up.headers.get('content-type') || 'image/webp',
        'content-length': up.headers.get('content-length') || '',
        'cache-control': CACHE_CONTROL,
        ...CORS,
      },
    });
  }

  const hit = await cache.match(key);
  if (hit) {
    return new Response(hit.body, {
      status: 200,
      headers: {
        'content-type': hit.headers.get('content-type') || 'image/webp',
        'cache-control': CACHE_CONTROL,
        ...CORS,
      },
    });
  }

  const up = await fetch(upstream, { cf: { cacheEverything: true } });
  if (!up.ok) return notFound('upstream ' + up.status);

  // 上游是 webp 小文件（3–13KB），整份读进来再建两个 Response 最省事，
  // 不必为这点体积做流式 tee。
  const buf = await up.arrayBuffer();
  const headers = {
    'content-type': up.headers.get('content-type') || 'image/webp',
    'content-length': String(buf.byteLength),
    'cache-control': CACHE_CONTROL,
    ...CORS,
  };

  /* 写缓存【绝不 await】，两种写法都试过：
     ① 裸调 cache.put(...) 不 await —— 本地 dev 里 put 要 0.3~3s，响应一交出去这条还没落盘的
        put 就被判为请求结束而掐掉，于是每次都 MISS、每次都等上游（实测 8 并发 16 张全部 ~20s）；
     ② 交给 waitUntil —— 请求生命周期撑到 put 结束，但这段等待不占本次响应的耗时。
        与 src/middleware.ts:243、api/audio/[songId].ts:336 同一套做法。
     put 失败（配额/并发）只影响下次命中，catch 吞掉即可，不该让图裂掉。 */
  const toCache = new Response(buf.slice(0), { status: 200, headers });
  cf?.waitUntil?.(cache.put(key, toCache).catch(() => {}));

  return new Response(buf, { status: 200, headers });
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const name = String(params.name ?? '');
  if (!refererAllowed(request)) {
    // 403 也带 CORS：跨域脚本读到的若是 CORS 失败，状态码会被抹成 0，
    // 分不清「被防盗链拒了」还是「网络断了」。
    return new Response('hotlink denied', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS },
    });
  }
  try {
    return await serve(name, request, locals.cfContext);
  } catch (e) {
    // 反代失败不能变成 500 裂图：退回上游直连地址，让浏览器自己去取。
    const up = MAP[name];
    if (up) return Response.redirect(up, 302);
    console.error('jacket proxy failed', e);
    return notFound('proxy failed');
  }
};

// 预检不要落到 serve 里去查缓存：这里直接回 204，省一次 match。
export const OPTIONS: APIRoute = async () =>
  new Response(null, { status: 204, headers: { ...CORS } });

export const HEAD: APIRoute = async ({ params, request, locals }) => {
  const name = String(params.name ?? '');
  if (!refererAllowed(request)) return new Response(null, { status: 403, headers: { ...CORS } });
  try {
    return await serve(name, request, locals.cfContext);
  } catch {
    return new Response(null, { status: 502 });
  }
};
