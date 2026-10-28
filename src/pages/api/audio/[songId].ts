// BGM 试听反代：GET|HEAD /api/audio/<songId>
//
// 为什么不让浏览器直连上游：主人要求「资源要击中 CF CDN」。
// 直连 ub.thregren.world 时音频完全走对方源站——它自己挂的是
// Cache-Control: public, max-age=0, must-revalidate，浏览器每次都要回源，
// 我们这边也完全管不到。改成同源反代后，音频进本站 Worker 的 Cache API，
// 再由 CF 边缘回给浏览器，同一数据中心第二次起就不出边缘。
//
// 安全边界沿用 2026-10-22 定的代理规则：
//   * 只代理 ub.thregren.world 这**一个**主机；路径由服务端从映射表查出来拼，
//     不接受任何用户传入的 URL（否则就是开放代理）；
//   * <songId> 必须能命中映射表，未命中直接 404，不转发；
//   * 只放行 GET / HEAD；
//   * 不透传查询参数——上游 bgm.ogg 是静态文件，没有参数语义。
//
// 缓存与分段（Range）：
//   * 缓存键用固定规范域名 + 路径，不用 request.url——同一份音频从
//     wiki.byd-ub.top / workers.dev 进来时不会各存一份；
//   * 只缓存「完整 200 响应」；拖动进度条产生的 Range 请求一律由缓存的完整体
//     本地切片回 206，不会每次 seek 都回源；
//   * 音频约 1MB，整份读进内存再切片实现最简单也不易错（Worker 内存上限 128MB）。
import type { APIRoute } from 'astro';
import audioMap from '../../../data/ub-audio.json';

export const prerender = false;

const UPSTREAM = 'https://ub.thregren.world';

const MAP = audioMap as Record<string, string>;

// 只接受 10000036 / 11000228 / BTA-83105461 这类 id：字母数字与连字符、1-24 位。
// 用白名单而不是「拒绝 ..」——编码绕过、路径穿越、头部注入都进不到 URL 拼接里。
const ID_OK = /^[A-Za-z0-9-]{1,24}$/;

// 浏览器与边缘共用一份长缓存：一曲一文件、内容永不改，songId 变了 URL 才变。
const CACHE_CONTROL = 'public, max-age=604800, s-maxage=2592000, immutable';

export const GET: APIRoute = ({ params, request, locals }) => serve(params, request, locals);
export const HEAD: APIRoute = ({ params, request, locals }) => serve(params, request, locals);

async function serve(
  params: Record<string, string | undefined>,
  request: Request,
  locals: App.Locals
): Promise<Response> {
  const id = String(params.songId ?? '');
  if (!ID_OK.test(id)) return notFound('bad songId');

  const rel = MAP[id];
  if (!rel) return notFound('no audio for this song');

  let full: Cached;
  try {
    full = await getFull(id, rel, new URL(request.url).origin, locals);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 502;
    return new Response(status === 404 ? 'audio not found upstream' : 'audio upstream error', {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const common: Record<string, string> = {
    'content-type': full.type,
    'cache-control': CACHE_CONTROL,
    'accept-ranges': 'bytes',
    'x-audio-source': 'ub.thregren.world',
    // 验收用：HIT = 这次吃的是本站边缘缓存，MISS = 回了一次上游
    'x-cache': full.hit ? 'HIT' : 'MISS',
  };

  // HEAD：只回头，不带体（播放器预探测用不到，但语义要对）
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: { ...common, 'content-length': String(full.size) } });
  }

  const range = request.headers.get('range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      const size = full.size;
      const start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
      const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { 'content-range': 'bytes */' + size, 'cache-control': 'no-store' },
        });
      }
      return new Response(full.bytes.slice(start, end + 1), {
        status: 206,
        headers: {
          ...common,
          'content-range': 'bytes ' + start + '-' + end + '/' + size,
          'content-length': String(end - start + 1),
        },
      });
    }
  }

  return new Response(full.bytes, {
    status: 200,
    headers: { ...common, 'content-length': String(full.size) },
  });
}

// hit 只用于观测：线上看 x-cache 头就知道这次是真打上游还是吃了边缘缓存。
// 注意本地 wrangler dev 的 caches.default 是内存级、每个请求可能落在不同 isolate，
// 实测连打三次都 MISS 属正常，别把它当「缓存没生效」的证据——以线上响应头为准。
type Cached = { bytes: ArrayBuffer; size: number; type: string; hit: boolean };

/** 取完整音频：先查边缘缓存，未命中回源并写回缓存 */
async function getFull(id: string, rel: string, origin: string, locals: App.Locals): Promise<Cached> {
  const cache = caches.default;
  // 缓存键用**实际请求的 origin**：同一份音频从 wiki.byd-ub.top 与 workers.dev 进来时
  // 各存一份（Cache API 只对当前 zone 生效），但绝不能用写死的第三方域名当 key——
  // 那样 put 会「成功」而 match 永远 MISS。
  const key = new Request(origin + '/api/audio/' + encodeURIComponent(id), { method: 'GET' });

  const hit = await cache.match(key);
  if (hit) {
    const bytes = await hit.arrayBuffer();
    return { bytes, size: bytes.byteLength, type: hit.headers.get('content-type') || 'audio/ogg', hit: true };
  }

  // 上游路径里有中文目录与空格（音乐魔方/C018 Crystal Awakening）：
  // 映射表存原始相对路径，编码只在这里做一次，不会二次转义。
  const target = UPSTREAM + '/' + rel.split('/').map(encodeURIComponent).join('/');
  const upstream = await fetch(target, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; BeyondJUBEAT/1.0; +https://wiki.byd-ub.top)' },
    // 冷缓存一律要完整体（切片在本地做），所以回源这层不带 Range
    redirect: 'follow',
  });

  if (!upstream.ok) throw new HttpError(upstream.status === 404 ? 404 : 502, 'upstream ' + upstream.status);

  const bytes = await upstream.arrayBuffer();
  const type = upstream.headers.get('content-type') || 'audio/ogg';

  // 写缓存用 waitUntil：响应先回浏览器、落盘在后台完成，不拖慢首次播放。
  // 写失败（超出单对象限制等）只影响下一次是否命中，不影响本次播放。
  locals.cfContext.waitUntil(
    cache
      .put(key, new Response(bytes.slice(0), {
        headers: { 'content-type': type, 'content-length': String(bytes.byteLength) },
      }))
      .catch((e) => console.warn('[audio] cache put failed', String(e)))
  );

  return { bytes, size: bytes.byteLength, type, hit: false };
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function notFound(msg: string): Response {
  // 未命中不缓存：以后补了映射表能立刻生效
  return new Response(msg, {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
