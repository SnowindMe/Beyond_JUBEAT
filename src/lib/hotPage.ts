// 热门模块的"页面视野"：把存储层与计算层拼成页面直接用的一份数据。
//
// 两个调用方：//today 页面（SSR）与 00:05 的定时任务。它们要的东西一样，
// 所以封存逻辑只写一份——任务只是"提前把它跑好"，页面则是"发现没跑就顺手跑"，
// 两条路径产出完全相同，谁先到都行。

import {
  addDays, compareWith, dayOf, fortuneOf, futureWindow, poolOf, rankOf, windowEndingYesterday, WINDOW,
  SRV_COL, TIERS, unit, type Diff, type FortuneLine, type GradeKey, type Svr,
} from './hot';
import { countIpToday, dbOf, hasSnapshot, pruneBefore, readSnapshot, recordHit, saveSnapshot, votesIn, type Env, type Snapshot } from './hotStore';

/** 快照保留天数与"数据够了"的门槛 */
const KEEP_DAYS = 30;
const MIN_ROWS = 30;

/** 同一 isolate 内并发一天只封一次（首页可能被同时打开好几次） */
const inflight = new Map<string, Promise<Snapshot>>();

export type HotQuery = Env & { now?: number };

/* ---------------------------- 封存 ---------------------------- */

/** 服务器口径：运势推荐要能按服挑（主人 2026-11-03「要分日服和国服两个选项」）。
 *  榜是全局的，不传就是两服合起来。 */
export type Ssrv = 'jp' | 'cn';
const srvCol = (srv?: Ssrv) => (srv === 'jp' ? 'server_jp' : srv === 'cn' ? 'server_cn' : null);

/** 冷启动兜底：最近上架的曲目（有上架日的优先，其次仍是新加的） */
async function fallbackPool(db: D1Database, size: number, srv?: Ssrv): Promise<string[]> {
  const col = srvCol(srv);
  const where = col ? `${col} = 1` : 'server_jp = 1 OR server_cn = 1';
  const { results } = await db
    .prepare(`SELECT song_id FROM songs
              WHERE ${where}
              ORDER BY (added_at IS NULL), added_at DESC, song_id DESC
              LIMIT ?`)
    .bind(size)
    .all<{ song_id: string }>();
  return (results ?? []).map((r) => r.song_id);
}

/** 算出并保存今天的快照，返回它。并发调用共用同一次计算 */
export async function sealToday(env: Env): Promise<Snapshot> {
  const today = dayOf();
  const running = inflight.get(today);
  if (running) return running;

  const db = dbOf(env);
  const job = (async (): Promise<Snapshot> => {
    const { from, to } = windowEndingYesterday();
    const rows = await votesIn(db, from, to);
    const current = rankOf(rows);

    // 少于门檻就当数据还不够：榜里装最近上架，页面据 seeded 标"热度统计中"。
    // 判据用行数而不是曲数——曲数会被少量人刷成假饱和，行数才是真量。
    const seeded = rows.length < MIN_ROWS;
    let entries;
    if (seeded) {
      entries = await fallbackPool(db, 10).then((ids) =>
        ids.map((songId, i) => ({ songId, rank: i + 1, delta: 0, isNew: false })),
      );
    } else {
      // 上一窗口 = 本窗口再往前推一个窗口长，两段等长且紧邻、不重叠
      const prev = rankOf(await votesIn(db, addDays(from, -WINDOW), addDays(from, -1)));
      entries = compareWith(current, prev, 10).slice(0, 10);
    }

    const snap: Snapshot = { date: today, from, to, entries, seeded, createdAt: new Date().toISOString() };
    await saveSnapshot(env, snap);
    // 清理放在封存之后：写不进去也别让清理先删了要用的行
    await pruneBefore(db, addDays(today, -KEEP_DAYS)).catch(() => {});
    return snap;
  })();

  inflight.set(today, job);
  try {
    return await job;
  } finally {
    inflight.delete(today);
  }
}

/* ---------------------------- 读 ---------------------------- */

/** 今天的快照；没有就地补一份 */
export async function todaySnapshot(env: Env): Promise<Snapshot> {
  const snap = await readSnapshot(env, dayOf());
  if (snap) return snap;
  return sealToday(env);
}

/* ---------------------------- 运势候选 ---------------------------- */

export type PoolSong = {
  songId: string;
  title: string;
  artist: string;
  cover: string;
  hasHold: boolean;
  /** 这首歌在哪个服有谱。榜是全局快照，靠它按服拆开 */
  jp: boolean;
  cn: boolean;
  /** 三难度的定数（缺的为 null）。运势的"指定难度"要从这里挑一个有值的 */
  lv: { bsc: number | null; adv: number | null; ext: number | null };
};



/** 候选池：未来窗口热度前 40；冷启动退回最新上架 60 首。
 *  按服过滤放在 byIds 的 SQL 里而不是取完再滤——热度是全站口径，
 *  但不能把「在日服热、国服没有谱」的曲推进国服的口袋。 */
export async function fortunePool(env: Env, srv?: Ssrv): Promise<PoolSong[]> {
  const db = dbOf(env);
  const { from, to } = futureWindow();

  const rows = await votesIn(db, from, to);
  let ids = poolOf(rankOf(rows), 40);
  if (!ids.length) ids = await fallbackPool(db, 60, srv);
  if (!ids.length) return [];

  const songs = await byIds(db, ids, srv);
  // 过滤后可能不够三档各一首（小服尤其），补一次最新上架
  if (songs.length < 12) {
    const extra = await fallbackPool(db, 40, srv);
    const have = new Set(songs.map((s) => s.songId));
    const more = await byIds(db, extra.filter((id) => !have.has(id)), srv);
    songs.push(...more);
  }
  return songs;
}

/** 只留某服有谱的曲。榜的排名是全局的，切服时按这个裁行——
 *  不能重排，否则同一首歌在两服的名次会不一样。 */
export function poolForSrv(songs: PoolSong[], srv?: Svr): PoolSong[] {
  if (!srv) return songs;
  return songs.filter((s) => (srv === 'jp' ? s.jp : s.cn));
}

/** 一批 songId → 展示字段。榜单与运势都用它，所以单独抽出来 */
export async function byIds(db: D1Database, ids: string[], srv?: Ssrv): Promise<PoolSong[]> {
  if (!ids.length) return [];
  const col = srvCol(srv);
  const marks = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT song_id, title, artist, cover, bsc, adv, ext, has_hold, server_jp, server_cn FROM songs
              WHERE song_id IN (${marks})${col ? ` AND ${col} = 1` : ''}`)
    .bind(...ids)
    .all<{
      song_id: string; title: string; artist: string; cover: string;
      bsc: number | null; adv: number | null; ext: number | null;
      has_hold: number | null; server_jp: number | null; server_cn: number | null;
    }>();

  const byId = new Map((results ?? []).map((r) => [r.song_id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      songId: r.song_id,
      title: r.title,
      artist: r.artist,
      cover: r.cover,
      hasHold: r.has_hold === 1,
      jp: r.server_jp === 1,
      cn: r.server_cn === 1,
      lv: {
        bsc: r.bsc == null ? null : Number(r.bsc),
        adv: r.adv == null ? null : Number(r.adv),
        ext: r.ext == null ? null : Number(r.ext),
      },
    }));
}

/**
 * 三档各取一首，每首带上"打的是哪一难度、这难度的定数是多少"（页面据此画难度-等级徽章）。
 * 挑法：按档过滤出候选，再用 `seed|visitor|档` 摊一个下标去取——**不能直接取第一个**，
 * 池子是按票数排的，票最高的那首会天天被挑中，三档就固定成了同几首。
 * 这一档没候选（库里那个难度没谱）就退回还剩下的任意一首，保证三首不重复。
 */
/** 只取展示字段、不按服过滤（冷启动的新曲推荐要原样取回快照里的那几首） */
export function fallbackByIds(db: D1Database, ids: string[]): Promise<PoolSong[]> {
  return byIds(db, ids);
}

export type FortunePick = PoolSong & { rank: GradeKey; tier: string; diff: Diff; lv: number };

/**
 * 三档各取一首，每首带上"打哪个难度、这难度的定数"（页面据此画「难度-定数」徽章）。
 * 挑法：按档的难度区间过滤，再用 `seed|visitor|档` 摊一个下标取——**不能直接取第一个**，
 * 池子是按票数排的，票最高的那首会天天被挑中。
 * 该档没候选（库里那个难度没谱）就依次退：先退到"同一首的其他难度只要在区间内"，
 * 再退到还剩下的任意一首，保证三首不重复、也不空档。
 */
export function pickFortune(pool: PoolSong[], lines: FortuneLine[], key: string, pref: Diff): FortunePick[] {
  const used = new Set<string>();
  const out: FortunePick[] = [];
  // 指定的难度排最前（排在就是"评级最好的那首"），另两档按评级跟在后面
  const ordered = [
    ...lines.filter((l) => TIERS.find((t) => t.key === l.tier)?.diff === pref),
    ...lines.filter((l) => TIERS.find((t) => t.key === l.tier)?.diff !== pref),
  ];
  for (const line of ordered) {
    // 用 tier 查定义而**不是**用循环下标：lines 是按评级好坏排过的，
    // 顺序早就不是 sediment→balance→challenge 了，按下标取会挑错档。
    const t = TIERS.find((x) => x.key === line.tier);
    if (!t) continue;
    const inBand = (s: PoolSong) => {
      const v = s.lv[t.diff];
      return v != null && v >= t.lo && v <= t.hi;
    };
    const free = pool.filter((s) => !used.has(s.songId));
    const fit = free.filter(inBand);
    const cand = fit.length ? fit : free;
    if (!cand.length) break;
    const pick = cand[Math.floor(unit(`${key}|${line.tier}`) * cand.length)];
    used.add(pick.songId);
    // 落到兜底那首时它可能没有该难度的谱，退回它自己最低的一个难度，徽章才不会画空
    const diff: Diff = pick.lv[t.diff] != null ? t.diff : pick.lv.bsc != null ? 'bsc' : pick.lv.adv != null ? 'adv' : 'ext';
    out.push({ ...pick, rank: line.grade, tier: line.tier, diff, lv: pick.lv[diff] ?? 0 });
  }
  return out;
}

/** 访客指纹：已登录用 user_id，游客用匿名 id。用 | 隔开避免两类撞车 */
export function visitorOf(userId: string | undefined, anonId: string): string {
  return userId ? 'u:' + userId : 'a:' + anonId;
}

export { countIpToday, dbOf, recordHit, hasSnapshot, fortuneOf, dayOf };
export type { Snapshot, FortuneLine };