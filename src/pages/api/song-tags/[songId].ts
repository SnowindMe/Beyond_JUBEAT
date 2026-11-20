// 曲目标签：GET /api/song-tags/<songId> 读；POST 提交一条。
//
// 【为什么单开一个接口而不是塞进详情页 SSR】标签是运行时数据、随时变，
// 详情页是 SSR 且带边缘缓存，塞进去每次提交都要清缓存；这里独立取，
// 页面骨架先出、标签后到，提交后前端就地更新一行，不动 HTML。
//
// 防刷口径与热度打点同源（2026-11-03 主人「要有防止被刷」）：
//   1. 主键 (song_id, diff, kind, name) —— 同一条被重复提交只 +1，不会堆重复行；
//   2. by_user 记第一个打标的人，登录用户一人一条记一下（同人重复打同一条不 +1）；
//   3. 每 IP 每分钟 20 次、每天 200 次，超了静默丢弃返回 204。
// 删除只允许作者自己（by_user = 当前 user）删，且 count 减到 0 才真的删行——
// 别人也打了同一标签时，删一次只是把人数减一。
//
// 标签词表（允许写什么）在 src/lib/song-tags.ts，前后端共用同一份，别各写一份。

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { TAG_KINDS, TAG_MAX_LEN, KINDS_BY_DIFF, isDiff, normTag, tagChangeText, type TagKind } from '../../../lib/song-tags';
import { logRecentChange } from '../../../lib/song-admin';

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

/** 与 hotHits 同一张限流表（hot_ip_days），一天一行一次 upsert 拿到两个计数 */
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
  if (!db || !/^[0-9]{1,12}$/.test(songId)) return new Response('{}', { status: 400, headers: JSON_NO_STORE });

  /* 【2026-11-19 补 mine】详情页 HTML 会过 EdgeOne/CDN 缓存、可能发给没有登录态的另一份，
     于是页面上的 is-mine 与叉随时会错人。这里把「是不是我打的」一并给出，
     客户端拿到 /api/auth/me 的登录态后可以用本接口重画一遍，不必信任缓存里的 HTML。 */
  const uid = locals.user?.id ?? null;
  const rows = await db
    .prepare('SELECT diff, kind, name, count, by_user FROM song_tags WHERE song_id = ? ORDER BY count DESC, name ASC')
    .bind(songId)
    .all<{ diff: string; kind: string; name: string; count: number; by_user: string | null }>();

  // 前端按 diff → kind 分组直接用，不在客户端再折一次
  const out: Record<string, Record<string, { name: string; count: number; mine: boolean }[]>> = {};
  for (const r of rows.results ?? []) {
    (out[r.diff] ??= {})[r.kind] ??= []; // 三种 kind 恒定存在，空数组也要有，前端才不用判空
    (out[r.diff] as Record<string, { name: string; count: number; mine: boolean }[]>)[r.kind].push({
      name: r.name,
      count: r.count,
      mine: !!uid && r.by_user === uid,
    });
  }
  for (const d of Object.keys(out)) for (const k of TAG_KINDS) out[d][k] ??= [];

  return new Response(JSON.stringify(out), { headers: JSON_NO_STORE });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const db = (env as Ctx)?.beyond_jubeat;
  const user = locals.user;
  if (!db) return new Response(null, { status: 500 });
  if (!user) return new Response('{"e":"login"}', { status: 401, headers: JSON_NO_STORE });

  const songId = String(params.songId ?? '');
  if (!/^[0-9]{1,12}$/.test(songId)) return new Response('{"e":"id"}', { status: 400, headers: JSON_NO_STORE });

  const body = (await request.json().catch(() => null)) as
    | { diff?: unknown; kind?: unknown; name?: unknown; del?: unknown }
    | null;
  const diff = String(body?.diff ?? '');
  const kind = String(body?.kind ?? '');
  const name = normTag(String(body?.name ?? ''));
  if (!isDiff(diff) || !KINDS_BY_DIFF[diff].includes(kind) || !name || name.length > TAG_MAX_LEN) {
    return new Response('{"e":"bad"}', { status: 400, headers: JSON_NO_STORE });
  }

  const e = env as unknown as Ctx;
  const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  const ipHash = await sha16(ip + '|' + (e.HOT_SALT ?? DEFAULT_SALT));
  const day = new Date().toISOString().slice(0, 10);
  const minute = new Date().toISOString().slice(0, 16);
  const now = new Date().toISOString();

  // 全部包起来：标签是附加信息，写失败不该把 500 抛给页面
  try {
    const { n, minN } = await bumpIp(db, day, ipHash, minute);
    if (n > IP_PER_DAY || minN > IP_PER_MIN) return new Response(null, { status: 204 });

    // 曲名只用于最近更改里的「曲目：<曲名>」；查不到就退回用 id，记录仍能写。
    const songRow = await db
      .prepare('SELECT title FROM songs WHERE song_id = ?')
      .bind(songId)
      .first<{ title: string }>();
    const song = { id: songId, title: songRow?.title ?? songId };

    if (body?.del) {
      // 删：只允许删自己打的那条，且人数减到 0 才真的删行（别人也打了就只减一）
      const res = await db
        .prepare(
          `UPDATE song_tags SET count = count - 1
            WHERE song_id = ? AND diff = ? AND kind = ? AND name = ? AND by_user = ?`,
        )
        .bind(songId, diff, kind, name, user.id)
        .run();
      // 减到 0 的行清掉；by_user 已被后一个人覆盖时上一句不命中，这里兜住
      await db
        .prepare('DELETE FROM song_tags WHERE song_id = ? AND diff = ? AND kind = ? AND name = ? AND count <= 0')
        .bind(songId, diff, kind, name)
        .run();
      // 【2026-11-20 主人「添加/删除别名或标签之后都要在最近更改里加一条记录」】
      // 只有真减掉一票才记：删别人打的标签（by_user 已经是别人）时上一句不命中，
      // 那一下没改变任何东西，记了就是假账。
      if (res.meta.changes > 0) {
        await logRecentChange(db, song, user.name, tagChangeText('del', diff, kind as TagKind, name), now);
      }
      return new Response(null, { status: 204 });
    }

    // 加：同一条已存在就什么都不做（同一个人重复提交不涨人数）
    const res = await db
      .prepare(
        `INSERT INTO song_tags (song_id, diff, kind, name, count, by_user, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(song_id, diff, kind, name) DO NOTHING`,
      )
      .bind(songId, diff, kind, name, user.id, now)
      .run();
    // 重复提交同一条（ON CONFLICT 命中）不记——那一次没有变化。
    if (res.meta.changes > 0) {
      await logRecentChange(db, song, user.name, tagChangeText('add', diff, kind as TagKind, name), now);
    }
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
};
