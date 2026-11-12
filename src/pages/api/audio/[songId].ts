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
// 【2026-10-30 重写：流式读取，不再"整份读进内存再切片"】
//
// 旧实现无论浏览器要多少字节，都先把整份 1MB 的音频 `await hit.arrayBuffer()`
// 读进内存、再 `bytes.slice()` 切出要的那段。而浏览器首播只需要开头 128–256KB，
// 等于每次白搬 4 倍数据。实测后果：全新曲目第一次点播放，要 **12.2 秒**才出声
// （第 1 次请求是 audio preload 探测元数据、只要几十字节，却也耗了 8.1 秒）。
//
// 现在的分工：
//   * 缓存 HIT + Range  → 从缓存响应体里**流式跳读**出需要的字节段，不再整份加载；
//   * 缓存 MISS + Range → 把浏览器的 Range **原样转给上游**（上游支持 206），
//     直接把它的响应流回浏览器；缓存留到 6 秒后在后台补（见 scheduleRangeBackfill）；
//   * 缓存 MISS + 无 Range → 流式透传，同时把响应流 tee 一份进缓存；
//   * HEAD → 只回头，不碰数据体（优先读缓存里的 content-length，没有就探一次上游）。
//
// 关键约束（主人 2026-10-30 拍板「优先cdn」）：**边缘缓存这条不许动**。
// caches.default 的读写逻辑全都保留，只改读取方式。
// 后续谁想再优化性能，也不得以「直接透传更快」为由取消缓存。
//
// 缓存键用**实际请求的 origin**：同一份音频从 wiki.byd-ub.top 与 workers.dev
// 进来时各存一份（Cache API 只对当前 zone 生效），但绝不能用写死的第三方域名
// 当 key——那样 put 会「成功」而 match 永远 MISS。
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
/* 超过这个字节数就不走 tee、退回「后台另起 fetch 整份读」。
   阈值取 3MB：曲库里 99% 的 bgm.ogg 在 1–1.5MB，3MB 已能覆盖到极长的谱面曲，
   再大一倍的内存驻留换不到什么，反而是 OOM 风险。 */
const MAX_CACHE_BYTES = 3 * 1024 * 1024;

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; BeyondJUBEAT/1.0; +https://wiki.byd-ub.top)' };

/* 【2026-11-12 补上「Range 冷启动永远不落缓存」这个缺口】
   背景：2026-10-30 为了让首播最快，Range 请求只透传、不写缓存。代价是某个数据中心
   如果只收到过 Range 请求（用户一上来就拖进度条、或客户端不从整份 GET 开始），
   它永远不落缓存、每次都回源，等于那台边缘上没有兜底。

   现在补写，但必须守住 10-30 那条红线——不许抢首播的出口带宽。三个约束：
     ① 延迟：先让这次响应读完，隔 RANGE_BACKFILL_DELAY_MS 再动手；
     ② 单飞：同一 isolate 内同一首只补一次，并发 Range 不会各拉一份 1.2MB；
     ③ waitUntil：绝不 await，永远不进本次请求的关键路径。

   为什么用固定延迟而不是「响应流读完」的回调：没有可靠的客户端读完钩子，
   拿 stream 的 close 触发又会被中断/取消搞得不稳定，延迟最笨但最可控。
   6s 的依据：实测 1.2MB 整份在跨墙线路上要 1–5s，正常首播 3s 内就发完了。 */
const RANGE_BACKFILL_DELAY_MS = 6000;
const BACKFILLING = new Set<string>();

function scheduleRangeBackfill(
  locals: App.Locals,
  cache: Cache,
  key: Request,
  target: string,
  id: string
): void {
  if (BACKFILLING.has(id)) return;
  BACKFILLING.add(id);
  locals.cfContext.waitUntil(
    new Promise<void>((resolve) => setTimeout(resolve, RANGE_BACKFILL_DELAY_MS))
      .then(() => cacheFullInBackground(cache, key, target))
      .finally(() => BACKFILLING.delete(id))
  );
}

export const GET: APIRoute = ({ params, request, locals }) => serve(params, request, locals);
export const HEAD: APIRoute = ({ params, request, locals }) => serve(params, request, locals);

/** 缓存键：固定用请求 origin + 规范路径，不带查询串 */
function cacheKey(id: string, origin: string) {
  return new Request(origin + '/api/audio/' + encodeURIComponent(id), { method: 'GET' });
}

/** 把上游相对路径拼成绝对 URL；路径里有中文与空格，只在这里编码一次，不二次转义 */
function upstreamUrl(rel: string) {
  return UPSTREAM + '/' + rel.split('/').map(encodeURIComponent).join('/');
}

/** 解析 Range 头。返回闭区间 [start, end]，或 null（语法不认识）。 */
function parseRange(header: string, size: number): { start: number; end: number } | null | 'invalid' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return 'invalid';
  }
  return { start, end };
}

/**
 * 从一个字节流的 [start, end]（闭区间）里取出数据，其余部分直接丢弃、不驻留内存。
 * 用于「缓存命中 + Range 请求」：只读需要的那一段。
 */
function sliceStream(
  body: ReadableStream<Uint8Array>,
  start: number,
  end: number
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let pos = 0;
  let finished = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) {
          finished = true;
          controller.close();
          return;
        }
        const chunkStart = pos;
        const chunkEnd = pos + value.byteLength - 1;
        pos += value.byteLength;
        if (chunkEnd < start) continue; // 这一段完全在目标区间之前，丢掉
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(value.byteLength - 1, end - chunkStart);
        if (to >= from) controller.enqueue(value.subarray(from, to + 1));
        if (chunkEnd >= end) {
          finished = true;
          reader.cancel().catch(() => {});
          controller.close();
          return;
        }
        return;
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

async function serve(
  params: Record<string, string | undefined>,
  request: Request,
  locals: App.Locals
): Promise<Response> {
  const id = String(params.songId ?? '');
  if (!ID_OK.test(id)) return notFound('bad songId');

  const rel = MAP[id];
  if (!rel) return notFound('no audio for this song');

  // 【2026-10-30 分段计时】同一个接口测出过 4ms 与 17.6s 两个值，无法判断改动是否有效。
  // 先给每一步打时间戳，用 x-timing 头返回，用于区分耗时属于「我们的代码」还是
  // 「CF→上游跨墙线路」。拿到归属再决定怎么优化，不在噪声上做 A/B。
  //   t0 = 进入 handler
  //   cacheEnd = 缓存查询结束（有没有命中）
  //   upStart / upFirstByte = 发起上游请求 / 上游响应头到达
  //   handlerEnd = 准备返回响应
  const T0 = Date.now();
  const mark: string[] = [];
  const lap = (label: string) => mark.push(label + '=' + (Date.now() - T0));

  const cache = caches.default;
  const key = cacheKey(id, new URL(request.url).origin);
  const rangeHeader = request.headers.get('range');

  // ---- HEAD：只回头。优先从缓存读 content-length，未命中就探一次上游 ----
  if (request.method === 'HEAD') {
    const hit = await cache.match(key);
    if (hit) {
      const size = Number(hit.headers.get('content-length') ?? 0);
      return new Response(null, {
        status: 200,
        headers: baseHeaders(hit.headers.get('content-type') || 'audio/ogg', size, true),
      });
    }
    try {
      const up = await fetch(upstreamUrl(rel), { method: 'HEAD', headers: UA, redirect: 'follow' });
      if (!up.ok) throw new HttpError(up.status === 404 ? 404 : 502, 'upstream ' + up.status);
      const size = Number(up.headers.get('content-length') ?? 0);
      return new Response(null, {
        status: 200,
        headers: baseHeaders(up.headers.get('content-type') || 'audio/ogg', size, false),
      });
    } catch (e) {
      return errorResponse(e);
    }
  }

  const hit = await cache.match(key);
  lap(hit ? 'cache=HIT' : 'cache=MISS');

  // ===================================================================
  // 情况 A：缓存命中
  // ===================================================================
  if (hit) {
    const type = hit.headers.get('content-type') || 'audio/ogg';
    const size = Number(hit.headers.get('content-length') ?? 0) || 0;
    const body = hit.body;
    if (!body) return notFound('cached body empty');

    // 无 Range：整份流式回给浏览器（仍然不读进内存）
    if (!rangeHeader) {
      if (!size) {
        // 老缓存条目可能没有 content-length：退化为整份读（极少见）
        const buf = await hit.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: baseHeaders(type, buf.byteLength, true),
        });
      }
      return new Response(body, {
        status: 200,
        headers: { ...baseHeaders(type, size, true), 'x-timing': mark.join(' ') },
      });
    }

    // 有 Range：判断区间后再决定是切片还是整份
    const r = size ? parseRange(rangeHeader, size) : null;
    if (r === 'invalid' && size) {
      return new Response(null, {
        status: 416,
        headers: { 'content-range': 'bytes */' + size, 'cache-control': 'no-store' },
      });
    }
    if (r && size) {
      return new Response(sliceStream(body, r.start, r.end), {
        status: 206,
        headers: {
          ...baseHeaders(type, r.end - r.start + 1, true),
          'content-range': `bytes ${r.start}-${r.end}/${size}`,
          'x-timing': mark.join(' '),
        },
      });
    }

    // 没有 size 或 Range 语法不认识：整份回，交给浏览器自己处理
    const buf = await hit.arrayBuffer();
    return new Response(buf, { status: 200, headers: baseHeaders(type, buf.byteLength, true) });
  }

  // ===================================================================
  // 情况 B：缓存未命中
  // ===================================================================
  const target = upstreamUrl(rel);

  try {
    // B1. 带 Range：把 Range 原样转给上游，它的 206 直接流回浏览器（首播最快路径）。
    //     **不在这次请求里补写缓存** —— 见下面「为什么不 waitUntil 拉整份」。
    if (rangeHeader) {
      lap('upStart');
      const up = await fetch(target, { headers: { ...UA, range: rangeHeader }, redirect: 'follow' });
      lap('upFirstByte');
      if (!up.ok && up.status !== 206) {
        throw new HttpError(up.status === 404 ? 404 : 502, 'upstream ' + up.status);
      }
      const type = up.headers.get('content-type') || 'audio/ogg';
      const headers: Record<string, string> = baseHeaders(type, Number(up.headers.get('content-length') ?? 0), false);
      const cr = up.headers.get('content-range');
      if (cr) headers['content-range'] = cr;

      // 【2026-10-30 实测修正：这里原先调 cacheFull() 补整份缓存，反而拖慢首播】
      // 现象：Range 请求 TTFB 从上游的 52–201ms 涨到 4.6s。根因是
      // waitUntil 里又发了一条「拉 1.2MB 整份」的 fetch，与本次响应抢同一条出口，
      // 而 CF 到上游是跨墙线路，带宽被占满后本次响应的首字节也跟着排队。
      //
      // 【2026-11-12 主人选了「补缓存」这一边：延迟 6 秒 + 单飞 + waitUntil】
      // 首播路径一个字节都不多等——补的动作在响应交出去 6 秒后才跑，
      // 那时这次 Range 早已读完，出口空闲。见 scheduleRangeBackfill 的说明。
      scheduleRangeBackfill(locals, cache, key, target, id);
      headers['x-timing'] = mark.join(' ');
      headers['x-cache-backfill'] = 'scheduled';
      return new Response(up.body, { status: up.status === 206 ? 206 : 200, headers });
    }

    // B2. 无 Range：整份流式透传，并把同一条流 tee 一份写进缓存。
    lap('upStart');
    const up = await fetch(target, { headers: UA, redirect: 'follow' });
    lap('upFirstByte');
    if (!up.ok) throw new HttpError(up.status === 404 ? 404 : 502, 'upstream ' + up.status);
    const type = up.headers.get('content-type') || 'audio/ogg';
    const size = Number(up.headers.get('content-length') ?? 0);

    // 【2026-10-30 关键：无 Range 的请求也必须「先回响应、再慢慢补缓存」】
    //
    // 浏览器 `audio.preload='auto'` 首次加载时，**第一个请求是不带 Range 的整份 GET**
    // （它用来探测元数据/时长），首播真正要的数据在第二个 Range 请求里。
    // 原先这里写成「await up.arrayBuffer() 读完整份 → 再 put 缓存」，
    // 后果是那个探测请求要等 1.2MB 全部读完才返回第一个字节：实测 TTFB 4.0s、
    // 拿到 128KB 要 5.6s。首播就卡在这儿。
    //
    // 现在的分工：
    //   · 立刻把上游的流原样回给浏览器（首字节由上游决定，实测 52–200ms）；
    //   · 缓存挂 waitUntil 在后台补，不进本次响应的关键路径（tee 或另起 fetch，见下）。
    //
    // 为什么不能直接 await 读整份：那等于把 1.2MB 全憋回内存才给首字节，就是上面那个 4.0s。
    //
    // 带宽争抢问题也验证过了：这次后台补的是**整份请求自己**触发的，
    // 不像之前 Range 路径那样在关键路径上抢出口；且探针请求本身不参与首播时序。
    /* 【2026-11-04 审计第 9 条：后台补缓存不再整份读进内存】
       原先这里固定走「waitUntil 里再发一条 fetch → arrayBuffer() 整份读进内存 → put」。
       1.2MB 的曲要额外占一份完整副本（Worker 只有 128MB，几十个人同时点冷门曲就能顶掉
       isolate），同一份字节还在网络上走了两遍。
       现在改成 tee：这一条流分两支，一支照旧回给浏览器，另一支直接喂 cache.put，
       全程不落地成 ArrayBuffer。

       【2026-10-30 当时为什么以为 tee 不行】那次记的是「put 之后 3 次 HEAD 全 MISS」。
       2026-11-04 重测：同样三条 HEAD 全命中，put 也真落了盘。差别在 put 的目标——
       现在 put 的是一个**新的 Response 壳**（带 content-type / content-length），
       而不是直接 put 上游那份 res：Cache API 对没有 content-length 的流式条目会退回
       chunked 存储，HEAD 拿不到长度、看上去就像没命中。这条路要成立有三个前提：
       ① 上游给了 content-length（没有就不 tee）；② 只对 ≤ MAX_CACHE_BYTES 的曲走流式；
       ③ put 挂 waitUntil，绝不 await。 */
    const streaming = size > 0 && size <= MAX_CACHE_BYTES && up.body;
    if (streaming) {
      const [toClient, toCache] = up.body!.tee();
      const shell = new Response(toCache, { headers: cacheShellHeaders(type, size) });
      locals.cfContext.waitUntil(
        cache.put(key, shell).catch((e) => console.warn('[audio] stream cache write failed', String(e)))
      );
      const h1 = baseHeaders(type, size, false);
      h1['x-timing'] = mark.join(' ');
      return new Response(toClient, { status: 200, headers: h1 });
    }

    // 上游没给长度，或者这首大到不值得整份驻留内存：退回老路（另起 fetch 整份读）。
    // 大文件是小众场景，多走一遍网络、多占一份内存都能接受，胜在稳。
    locals.cfContext.waitUntil(cacheFullInBackground(cache, key, target));
    const h2 = baseHeaders(type, size, false);
    h2['x-timing'] = mark.join(' ');
    return new Response(up.body, { status: 200, headers: h2 });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 后台把完整音频写进缓存。
 * 必须在响应已经交出去之后跑（waitUntil），不能用当前响应的流，
 * 也不能是 ReadableStream body —— 两者都会拖慢首字节或直接写不进去。
 *
 * 【2026-11-04 审计第 9 条】这一份**不能**改读 up.body 的流。
 * 上面那条"不能用 ReadableStream body"说的是缓存的写入路径，不是上游读取：
 * 这里离用户首字节已经很远，没有时效压力，整份读进内存反而最省。
 * arrayBuffer() 只留这一处；搬的是缓存、不是当前响应。
 */
async function cacheFullInBackground(cache: Cache, key: Request, target: string): Promise<void> {
  try {
    const up = await fetch(target, { headers: UA, redirect: 'follow' });
    if (!up.ok) return;
    const type = up.headers.get('content-type') || 'audio/ogg';
    const buf = await up.arrayBuffer();
    await cache.put(
      key,
      new Response(buf, { headers: cacheShellHeaders(type, buf.byteLength) })
    );
  } catch (e) {
    console.warn('[audio] background cache write failed', String(e));
  }
}

/* 【2026-11-04：写缓存用的壳必须自己带 cache-control】Cache API 的 TTL 取自
   响应头的 cache-control，壳里不带就等于 max-age=0 —— 条目写进去了、下一毫秒就过期，
   match() 永远拿不到。本地库能直接看到症状：expiration 与 date 是同一个时刻。
   这正是 2026-10-30 记「tee 分支 put 后 HEAD 全 MISS」的第二层原因
   （第一层是 content-length 缺失会退回 chunked）。两条都补上才真的命中。 */
function cacheShellHeaders(type: string, size: number): Record<string, string> {
  return { 'content-type': type, 'content-length': String(size), 'cache-control': CACHE_CONTROL, 'accept-ranges': 'bytes' };
}

function baseHeaders(type: string, size: number, hit: boolean): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': type,
    'cache-control': CACHE_CONTROL,
    'accept-ranges': 'bytes',
    'x-audio-source': 'ub.thregren.world',
    // 验收用：HIT = 这次吃的是本站边缘缓存，MISS = 回了一次上游
    'x-cache': hit ? 'HIT' : 'MISS',
  };
  if (size > 0) h['content-length'] = String(size);
  return h;
}

function errorResponse(e: unknown): Response {
  const status = e instanceof HttpError ? e.status : 502;
  return new Response(status === 404 ? 'audio not found upstream' : 'audio upstream error', {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
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
