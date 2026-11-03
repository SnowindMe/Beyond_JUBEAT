// 热度打点：POST /api/hot/hit  body: {"songId":"..."}
//
// 埋点在浏览器侧：曲目详情页用 IntersectionObserver 看播放条，真正听到 8 秒才发一次。
// 服务端在这里只做闸门与落库，不含任何业务判断。
//
// 防刷分四层（口径由主人 2026-11-03 拍板：热度 = 独立听众数，当日只算一次）：
//   1. 表主键 (day, song_id, visitor) —— 同一人同一首当天只留一行，重复打点被 IGNORE 吃掉，
//      **这是主防线**：换不掉 visitor 就刷不动名次；
//   2. visitor 优先取会话里的 user_id，游客用 HttpOnly 的匿名 cookie，JS 改不了；
//   3. 同一 visitor + songId 30 秒内重复打点直接丢（切歌回来不算新听众）；
//   4. 每 IP 每分钟 30 次、每天 400 次有效计数（超了静默丢弃，返回 204 不报错）。
// 第 4 层之外的成本已经很低：即使脚本持续换 IP + 换 cookie，也要真打到接口才有用。

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { dayOf } from '../../../lib/hot';
import { visitorOf } from '../../../lib/hotPage';
import { bumpIp, dbOf, isGapThrottled, recordHit } from '../../../lib/hotStore';

export const prerender = false;

const IP_PER_MIN = 30;
const IP_PER_DAY = 400;
// 秒。同曲节流窗口。原先这个键存在 KV 上、ttl 受 KV 的 60 秒下限约束；
// 2026-11-04 挪到 D1 后不再有下限，但仍保持 60——同一人同曲当天本来就只算一次（表主键去重），
// 这个值只影响 hot_gaps 里那行的存活时长。
const SAME_SONG_GAP = 60;

const AID = 'jb_aid';
/** 没配 HOT_SALT 时的兜底盐：hash 只用于聚合，不参与鉴权，公开无害 */
const DEFAULT_SALT = 'beyond-jubeat-hot';

type Ctx = { beyond_jubeat?: D1Database; HOT_SALT?: string };

async function sha16(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const JSON_NO_STORE = { 'content-type': 'application/json', 'cache-control': 'no-store' };

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const e = env as unknown as Ctx;

  const body = (await request.json().catch(() => null)) as { songId?: unknown } | null;
  const songId = typeof body?.songId === 'string' ? body.songId.trim() : '';
  if (!songId || songId.length > 32) return new Response('{"ok":false}', { status: 400, headers: JSON_NO_STORE });

  // 匿名 cookie：老访客沿用，新访客当场发一个。HttpOnly 让脚本改不了，换它得清 cookie。
  let anon = cookies.get(AID)?.value;
  if (!anon || !/^[a-f0-9]{16,32}$/.test(anon)) {
    anon = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
    cookies.set(AID, anon, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', secure: true });
  }

  const visitor = visitorOf(locals.user?.id, anon);
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '0.0.0.0';
  const ipHash = await sha16(ip + '|' + (e.HOT_SALT ?? DEFAULT_SALT));
  const day = dayOf();
  const minute = new Date().toISOString().slice(0, 16);
  const now = Date.now();

  const nh = { status: 204, headers: { 'cache-control': 'no-store' } };

  /* 【2026-11-03 全程兜底】埋点是顺带做的，它挂掉绝不能把 500 抛给播放器。
     线上实测过：D1 确实写进去了，接口却仍然 500 —— 抛出点在写入之后。
     2026-11-04 起闸门与落库全在 D1 上、且已合成一次 batch，
     所以从建连接开始整段包起来：任何一步失败都只是少一次计数。 */
  try {
    const db = dbOf(e);

    // 闸门 3：同曲节流（放在最前，命中就不用再打扰后面两层）
    if (await isGapThrottled(db, visitor, songId, now)) return new Response(null, nh);

    // 闸门 4a + 4b：每分钟 30 次、每天 400 次。一次 upsert 同时累加两个计数并拿回结果，
    // 不再有 KV 的两跳读改写，也没有 COUNT 扫描；超限时计数已经加上去（与原先一致）。
    const { n, minN } = await bumpIp(db, day, ipHash, minute);
    if (minN > IP_PER_MIN || n > IP_PER_DAY) return new Response(null, nh);

    await recordHit(db, { day, songId, visitor, ipHash, gapTtlSec: SAME_SONG_GAP });
  } catch (err) {
    console.error('hot/hit failed', err);
  }

  return new Response(null, nh);
};
