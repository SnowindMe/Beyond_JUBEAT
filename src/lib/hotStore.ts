// 热门榜的存储层：D1 读写、KV 缓存、快照封存。
//
// 分层理由（2026-11-03）：页面与定时任务共用同一套读写，
// 但页面在 SSR 里跑、任务在 scheduled 里跑，两者只差一个"现在几点"的分支——
// 分支放在调用方（pages/tasks），这里只提供纯数据动作。
//
// KV 只用来存快照（读多写少，key 前缀 hot:snap: 与 Astro Sessions 的键不冲突）。
// 【2026-11-04 改】打点路径上的限流/节流原先也走 KV，一次打点写 2 次 KV ——
// KV 免费版只有 1000 keys written/天，超限直接报错、不排队，500 次打点就撞墙。
// 现在全部落在 D1 的 hot_ip_days / hot_gaps，KV 在打点路径上零写入。

import type { HotEntry } from './hot';

const KV_PREFIX = 'hot:snap:';

export type Snapshot = {
  date: string;                 // 快照代表的那一天（北京时区）
  from: string;
  to: string;
  entries: HotEntry[];
  /** true = 真实计票；false = 冷启动兜底（榜里装的是最近上架，不是热度排序） */
  seeded: boolean;
  createdAt: string;
};

export type Env = { beyond_jubeat?: D1Database; SESSION?: KVNamespace };

export function dbOf(env: Env): D1Database {
  const db = env.beyond_jubeat;
  if (!db) throw new Error('D1 binding "beyond_jubeat" is missing');
  return db;
}

/** 记一次命中。表主键是 (day, song_id, visitor)，重复打点靠 INSERT OR IGNORE 吃掉。
 *  【2026-11-04】节流键与命中行合成一次 db.batch，打点路径只剩一次往返、一次事务。 */
export async function recordHit(
  db: D1Database,
  hit: { day: string; songId: string; visitor: string; ipHash: string; gapTtlSec: number },
): Promise<void> {
  const now = Date.now();
  await db.batch([
    db
      .prepare('INSERT OR IGNORE INTO hot_hits (day, song_id, visitor, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(hit.day, hit.songId, hit.visitor, hit.ipHash, new Date(now).toISOString()),
    db
      .prepare(`INSERT INTO hot_gaps (key, minute, expires) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET minute = excluded.minute, expires = excluded.expires`)
      .bind(`${hit.visitor}|${hit.songId}`, new Date(now).toISOString().slice(0, 16), new Date(now + hit.gapTtlSec * 1000).toISOString()),
  ]);
}

/** 打点计数器：一次 upsert 同时累加「当天」与「当前分钟」两个数，并 RETURNING 回来。
 *  【2026-11-04 改】原先日计数是每次 SELECT COUNT(*) 扫 hot_hits、分钟计数是 KV 读改写两跳。
 *  现在一行两列、一次往返：调用方拿到 n 与 minN 自己跟上限比。
 *  min_key 换了分钟就把 min_n 从 1 重算（CASE 里判），不再需要 KV 的 TTL 过期。 */
export async function bumpIp(
  db: D1Database, day: string, ipHash: string, minute: string,
): Promise<{ n: number; minN: number }> {
  const row = await db
    .prepare(`INSERT INTO hot_ip_days (day, ip_hash, n, min_key, min_n) VALUES (?, ?, 1, ?, 1)
              ON CONFLICT(day, ip_hash) DO UPDATE SET
                n     = n + 1,
                min_n = CASE WHEN min_key = excluded.min_key THEN min_n + 1 ELSE 1 END,
                min_key = excluded.min_key
              RETURNING n, min_n AS minN`)
    .bind(day, ipHash, minute)
    .first<{ n: number; minN: number }>();
  return { n: row?.n ?? 1, minN: row?.minN ?? 1 };
}

/** 同人同曲节流闸门：键还在有效期内就返回 true（本次打点丢掉）。
 *  【2026-11-04 改】原先读 KV 的 hot:gap:* 键。 */
export async function isGapThrottled(db: D1Database, visitor: string, songId: string, now: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT expires FROM hot_gaps WHERE key = ?')
    .bind(`${visitor}|${songId}`)
    .first<{ expires: string }>();
  return !!row && Date.parse(row.expires) > now;
}

/** 窗口内的全部命中行（只取算名次要用的两列，够用了） */
export async function votesIn(db: D1Database, from: string, to: string): Promise<{ song_id: string; visitor: string }[]> {
  const { results } = await db
    .prepare('SELECT song_id, visitor FROM hot_hits WHERE day BETWEEN ? AND ?')
    .bind(from, to)
    .all<{ song_id: string; visitor: string }>();
  return results ?? [];
}

/** 封存一个快照。上一版覆盖写：同一天只保留一份，重跑 cron 不会堆垃圾 */
export async function saveSnapshot(env: Env, snap: Snapshot): Promise<void> {
  const db = dbOf(env);
  const entries = JSON.stringify(snap.entries);
  await db
    .prepare('INSERT OR REPLACE INTO hot_snapshots (date, from_day, to_day, entries, seeded, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(snap.date, snap.from, snap.to, entries, snap.seeded ? 1 : 0, snap.createdAt)
    .run();
  // 顺序很要紧：**先落库再刷 KV**。反过来若 KV 先写成功、D1 写失败，缓存里就会留一份
  // 库里没有的快照，第二天想核对"这天的名次哪来的"会查不到依据。
  if (env.SESSION) {
    await env.SESSION.put(KV_PREFIX + snap.date, JSON.stringify(snap), { expirationTtl: 60 * 60 * 72 });
  }
}

/** 读快照：先 KV（边缘毫秒级），未命中回落 D1 并顺手回填 */
export async function readSnapshot(env: Env, date: string): Promise<Snapshot | null> {
  if (env.SESSION) {
    const cached = await env.SESSION.get(KV_PREFIX + date);
    if (cached) return JSON.parse(cached) as Snapshot;
  }
  const row = await dbOf(env)
    .prepare('SELECT date, from_day, to_day, entries, seeded, created_at FROM hot_snapshots WHERE date = ?')
    .bind(date)
    .first<{ date: string; from_day: string; to_day: string; entries: string; seeded: number; created_at: string }>();
  if (!row) return null;
  const snap: Snapshot = {
    date: row.date,
    from: row.from_day,
    to: row.to_day,
    entries: JSON.parse(row.entries) as HotEntry[],
    seeded: !!row.seeded,
    createdAt: row.created_at,
  };
  if (env.SESSION) await env.SESSION.put(KV_PREFIX + date, JSON.stringify(snap), { expirationTtl: 60 * 60 * 72 });
  return snap;
}

/** 快照存在与否：只问有没有，不搬内容 */
export async function hasSnapshot(db: D1Database, date: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS ok FROM hot_snapshots WHERE date = ?').bind(date).first<{ ok: number }>();
  return !!row;
}

/** 清理：埋点行、IP 计数、快照都只留最近 KEEP 天；节流键按到期时间清。
 *  【2026-11-04】计数表与节流表是新增的，不一起清就是一换存储换一换垃圾。 */
export async function pruneBefore(db: D1Database, day: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM hot_hits WHERE day < ?').bind(day),
    db.prepare('DELETE FROM hot_ip_days WHERE day < ?').bind(day),
    db.prepare('DELETE FROM hot_gaps WHERE expires < ?').bind(new Date().toISOString()),
    db.prepare('DELETE FROM hot_snapshots WHERE date < ?').bind(day),
  ]);
}

/** 归档清理（2026-11-04）：recent_changes 从来没有上限，按 KEEP 时间删旧行。
 *  与 pruneBefore 分开是因为它的时间列是 ISO 时间戳、不按日历日切。 */
export async function pruneRecentChanges(db: D1Database, beforeISO: string): Promise<void> {
  await db.prepare('DELETE FROM recent_changes WHERE changed_at < ?').bind(beforeISO).run();
}

/** 清掉所有过期会话（2026-11-04）。原先挂在每次登录上，白多一次 DELETE 扫。 */
export async function pruneExpiredSessions(db: D1Database, nowISO: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowISO).run();
}
