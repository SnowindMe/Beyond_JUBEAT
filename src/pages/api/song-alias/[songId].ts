// 曲目别名（俗称）：GET /api/song-alias/<songId> 读；POST 加/删。
//
// 与标签接口同源的那套防刷与「HTML 会被缓存」的顾虑（见 api/song-tags）：
//   · 主键 (song_id, name) —— 重复添加只算一次，不堆行；
//   · by_user 只用于「谁能删」（主人：不展示创建者）；
//   · 每 IP 每分钟 20 次、每天 200 次，超了静默丢弃回 204；
//   · GET 回 mine，页面靠 /api/auth/me 校正登录态后重画，不信任缓存里的 HTML。
// 区别：**无需审核**，插入即生效，没有 pending 状态。

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { ALIAS_MAX_LEN, normAlias } from '../../../lib/song-alias';

export const prerender = false;

const IP_PER_MIN = 20;
const IP_PER_DAY = 200;
const JSON_NO_STORE = { 'content-type': 'application/json', 'cache-control': 'no-store' };

type Ctx = { beyond_jubeat?: D1Database; HOT_SALT?: string };
const DEFAULT_SALT = 'beyond-jubeat-tags';

async function sha16(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 与 song-tags 共用同一张限流表，一天一行一次 upsert 拿到两个计数 */
async function bumpIp(db: D1Database, day: string, ipHash: string, minute: string) {
  const row = await db
    .prepare(
      `INSERT INTO hot_ip_days (day, ip_hash, n, min_key, min_n) VALUES (?, ?, 1, ?, 1)
       ON CONFLICT(day, ip_hash) DO UPDATE SET
         n = n + 1,
         min_n = CASE WHEN min_key = ? THEN min_n + 1 ELSE 1 END,
         min_key = ?
       RETURNING n, min_n`,
    )
    .bind(day, ipHash, minute, minute, minute)
    .first<{ n: number; min_n: number }>();
  return { n: row?.n ?? 1, minN: row?.min_n ?? 1 };
}

export const GET: APIRoute = async ({ params, locals }) => {
  const db = (env as Ctx)?.beyond_jubeat;
  const songId = String(params.songId ?? '');
  if (!db || !/^[0-9]{1,12}$/.test(songId)) return new Response('[]', { status: 400, headers: JSON_NO_STORE });

  const uid = locals.user?.id ?? null;
  const rows = await db
    .prepare('SELECT name, by_user FROM song_alias WHERE song_id = ? ORDER BY created_at ASC')
    .bind(songId)
    .all<{ name: string; by_user: string }>();

  const out = (rows.results ?? []).map((r) => ({ name: r.name, mine: !!uid && r.by_user === uid }));
  return new Response(JSON.stringify(out), { headers: JSON_NO_STORE });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const db = (env as Ctx)?.beyond_jubeat;
  const user = locals.user;
  if (!db) return new Response(null, { status: 500 });
  if (!user) return new Response('{"e":"login"}', { status: 401, headers: JSON_NO_STORE });

  const songId = String(params.songId ?? '');
  if (!/^[0-9]{1,12}$/.test(songId)) return new Response('{"e":"id"}', { status: 400, headers: JSON_NO_STORE });

  const body = (await request.json().catch(() => null)) as { name?: unknown; del?: unknown } | null;
  const name = normAlias(String(body?.name ?? ''));
  if (!name || name.length > ALIAS_MAX_LEN) return new Response('{"e":"bad"}', { status: 400, headers: JSON_NO_STORE });

  const e = env as unknown as Ctx;
  const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  const ipHash = await sha16(ip + '|' + (e.HOT_SALT ?? DEFAULT_SALT));
  const day = new Date().toISOString().slice(0, 10);
  const minute = new Date().toISOString().slice(0, 16);
  const now = new Date().toISOString();

  // 别名是附加信息，写失败不该把 500 抛给页面
  try {
    const { n, minN } = await bumpIp(db, day, ipHash, minute);
    if (n > IP_PER_DAY || minN > IP_PER_MIN) return new Response(null, { status: 204 });

    if (body?.del) {
      // 只允许删自己加的那条（别名没有人数概念，删就是删）
      await db
        .prepare('DELETE FROM song_alias WHERE song_id = ? AND name = ? AND by_user = ?')
        .bind(songId, name, user.id)
        .run();
      return new Response(null, { status: 204 });
    }

    // 加：同一条已存在就什么都不做
    await db
      .prepare(
        `INSERT INTO song_alias (song_id, name, by_user, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(song_id, name) DO NOTHING`,
      )
      .bind(songId, name, user.id, now)
      .run();
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
};
