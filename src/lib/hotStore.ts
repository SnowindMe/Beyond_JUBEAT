// 热门榜的存储层：D1 读写、KV 缓存、快照封存。
//
// 分层理由（2026-11-03）：页面与定时任务共用同一套读写，
// 但页面在 SSR 里跑、任务在 scheduled 里跑，两者只差一个"现在几点"的分支——
// 分支放在调用方（pages/tasks），这里只提供纯数据动作。
//
// KV 用现成的 SESSION namespace（新人榜不值得单开一个 namespace，
// 它的 key 前缀带 hot:，与 Astro Sessions 的键不冲突）。

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

/** 记一次命中。表主键是 (day, song_id, visitor)，重复打点靠 INSERT OR IGNORE 吃掉 */
export async function recordHit(
  db: D1Database,
  hit: { day: string; songId: string; visitor: string; ipHash: string },
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO hot_hits (day, song_id, visitor, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(hit.day, hit.songId, hit.visitor, hit.ipHash, new Date().toISOString())
    .run();
}

/** 同一 IP 某天的打点次数 —— 限流闸门，命中索引 idx_hot_hits_day_ip，很便宜 */
export async function countIpToday(db: D1Database, day: string, ipHash: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM hot_hits WHERE day = ? AND ip_hash = ?')
    .bind(day, ipHash)
    .first<{ n: number }>();
  return row?.n ?? 0;
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

/** 清理：埋点行与快照都只留最近 KEEP 天 */
export async function pruneBefore(db: D1Database, day: string): Promise<void> {
  await db.prepare('DELETE FROM hot_hits WHERE day < ?').bind(day).run();
  await db.prepare('DELETE FROM hot_snapshots WHERE date < ?').bind(day).run();
}
