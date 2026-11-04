// 热门模块的"页面视野"：把存储层与计算层拼成页面直接用的一份数据。
//
// 两个调用方：//today 页面（SSR）与 00:05 的定时任务。它们要的东西一样，
// 所以封存逻辑只写一份——任务只是"提前把它跑好"，页面则是"发现没跑就顺手跑"，
// 两条路径产出完全相同，谁先到都行。

import {
  addDays,
  compareWith,
  dayOf,
  DIFFS,
  fortuneOf,
  gradeIndex,
  GRADES,
  rankOf,
  windowEndingYesterday,
  WINDOW,
  TIERS,
  TOP,
  unit,
  type Diff,
  type FortuneLine,
  type GradeKey,
} from "./hot";
import {
  dbOf,
  hasSnapshot,
  pruneBefore,
  readSnapshot,
  recordHit,
  saveSnapshot,
  votesIn,
  type Env,
  type Snapshot,
} from "./hotStore";

/** 快照保留天数与"数据够了"的门槛 */
const KEEP_DAYS = 30;
const MIN_ROWS = 30;

/** 同一 isolate 内并发一天只封一次（首页可能被同时打开好几次） */
const inflight = new Map<string, Promise<Snapshot>>();

export type HotQuery = Env & { now?: number };

/* ---------------------------- 封存 ---------------------------- */

/** 服务器口径：运势按服分池（2026-11-03 主人「要分日服和国服两个选项」…
 *  当日下午砍掉又加回来）。热榜是全局的，不传就是两服合排。 */
export type Ssrv = "jp" | "cn";
const srvCol = (srv?: Ssrv) =>
  srv === "jp" ? "server_jp" : srv === "cn" ? "server_cn" : null;

/** 冷启动兜底：最近上架的曲目（有上架日的优先，其次仍是新加的）。
 *  榜单也用它把不足 TOP 的部分补齐——真人流量涨得慢，只靠真命中几天都凑不满 25。 */
export async function fallbackPool(
  db: D1Database,
  size: number,
  srv?: Ssrv,
): Promise<string[]> {
  const col = srvCol(srv);
  const where = col ? `${col} = 1` : "server_jp = 1 OR server_cn = 1";
  const { results } = await db
    .prepare(
      `SELECT song_id FROM songs
              WHERE ${where}
              ORDER BY (added_at IS NULL), added_at DESC, song_id DESC
              LIMIT ?`,
    )
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
      entries = await fallbackPool(db, TOP).then((ids) =>
        ids.map((songId, i) => ({
          songId,
          rank: i + 1,
          delta: 0,
          isNew: false,
        })),
      );
    } else {
      // 上一窗口 = 本窗口再往前推一个窗口长，两段等长且紧邻、不重叠
      const prev = rankOf(
        await votesIn(db, addDays(from, -WINDOW), addDays(from, -1)),
      );
      entries = compareWith(current, prev, TOP).slice(0, TOP);
    }

    const snap: Snapshot = {
      date: today,
      from,
      to,
      entries,
      seeded,
      createdAt: new Date().toISOString(),
    };
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
  /** 这首歌在哪个服有谱。运势按服分池，靠它过滤 */
  jp: boolean;
  cn: boolean;
  /** 三难度的定数（缺的为 null）。挑选时用对应的档区间过滤 */
  lv: { bsc: number | null; adv: number | null; ext: number | null };
};

/** 候选池：未来窗口热度前 40；冷启动退回最新上架 60 首。
 *  按服过滤放在 SQL 里而不是取完再滤——热度是全站口径，
 *  但不能把「在日服热、国服没有谱」的曲塞进国服的推荐里。 */
export async function fortunePool(env: Env, srv?: Ssrv): Promise<PoolSong[]> {
  const db = dbOf(env);
  const col = srvCol(srv);
  const where = col ? `${col} = 1` : "server_jp = 1 OR server_cn = 1";

  // 直接从这一服自己的曲库抽（主人 2026-11-05「推荐歌曲要从各自服务器的曲库抽，
  // 不要在热歌榜歌曲抽」）：以前取的是热榜前 40，新曲与小众曲永远轮不到。
  // 排序按「当日 + 服 + id」的哈希摊开，所以同一服同一天给每个人看到的候选集相同，
  // 抽签的随机性仍由 pickFortune 的 key 提供。
  const { results } = await db
    .prepare(
      `SELECT song_id, title, artist, cover, bsc, adv, ext, has_hold, server_jp, server_cn
              FROM songs WHERE ${where}`,
    )
    .all<Row>();
  const rows = results ?? [];
  if (!rows.length) return [];

  const day = dayOf();
  rows.sort(
    (a, b) =>
      unit(`${day}|${srv}|p${a.song_id}`) - unit(`${day}|${srv}|p${b.song_id}`),
  );
  return rows.map(shape);
}

/** 一批 songId → 展示字段。榜单与运势都用它，所以单独抽出来 */
export async function byIds(
  db: D1Database,
  ids: string[],
  srv?: Ssrv,
): Promise<PoolSong[]> {
  if (!ids.length) return [];
  const col = srvCol(srv);
  const marks = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT song_id, title, artist, cover, bsc, adv, ext, has_hold, server_jp, server_cn FROM songs
              WHERE song_id IN (${marks})${col ? ` AND ${col} = 1` : ""}`,
    )
    .bind(...ids)
    .all<Row>();

  const byId = new Map((results ?? []).map((r) => [r.song_id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is Row => !!r)
    .map(shape);
}

/** 库行 → 展示字段。byIds 与 fortunePool 共用一份，两个视图的字段口径才不会走散 */
function shape(r: Row): PoolSong {
  return {
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
  };
}

/** 冷启动的新曲推荐：只取展示字段，原样取回快照里的那几首 */
export function fallbackByIds(
  db: D1Database,
  ids: string[],
): Promise<PoolSong[]> {
  return byIds(db, ids);
}

export type FortunePick = PoolSong & {
  /** 今日运气值 0–120（三首共用，页面印读数与刻度尺） */
  luck: number;
  /** 这一首要求打到的评价（取自当日区间，三首沿斜坡往上） */
  need: GradeKey;
  /** 区间另一头（更差的那一头），页面标成「S…EXC」 */
  needFloor: GradeKey;
  tier: string;
  diff: Diff;
  lv: number;
};

/** songs 表的行（byIds 与 fortunePool 都读它） */
type Row = {
  song_id: string;
  title: string;
  artist: string;
  cover: string;
  bsc: number | null;
  adv: number | null;
  ext: number | null;
  has_hold: number | null;
  server_jp: number | null;
  server_cn: number | null;
};

/** 定数落在区间里的判定：有一点余量就给一点，别让 0.1 的差把候选清空 */
const inBand = (v: number | null, lo: number, hi: number) =>
  v != null && v >= lo - 0.45 && v <= hi + 0.45;

/** 这首在不在（档, 区间）里，返回该用的难度；不在给 null。档自己的难度优先 */
function diffFor(s: PoolSong, tier: Diff, lo: number, hi: number): Diff | null {
  if (inBand(s.lv[tier], lo, hi)) return tier;
  for (const d of DIFFS) if (inBand(s.lv[d], lo, hi)) return d;
  return null;
}

/**
 * 三首各取一首：每首带上"打哪个难度、这难度要求什么评价区间、定数多少"。
 *
 * 【2026-11-05 改】原来三档固定各一首、每首按档的固定定数段过滤，现在改成按 line 走：
 * line 里已经带了当日抬好的区间（[lo, hi]）与档位，这里只负责在池子里找**同时满足档难度与区间**的歌。
 * 摊下标仍用 `key|序号`（序号不是档名——三首可能同档）。
 * 全部落空的兜底顺序：放宽半档 → 放宽一整档 → 只按档难度 → 剩下的任意一首，
 * 保证三首不重复、不空档；难度落到其他列时按"区间内优先、其次最低"重挑，徽章才不会画空。
 */
export function pickFortune(
  pool: PoolSong[],
  lines: FortuneLine[],
  key: string,
): FortunePick[] {
  const used = new Set<string>();
  const out: FortunePick[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = TIERS.find((x) => x.key === line.tier);
    if (!t) continue;
    const free = pool.filter((s) => !used.has(s.songId));
    if (!free.length) break;

    let cand: { s: PoolSong; diff: Diff }[] = [];
    for (const pad of [0, 0.5, 1, 2]) {
      cand = free
        .map((s) => ({
          s,
          diff: diffFor(s, t.diff, line.lo - pad, line.hi + pad),
        }))
        .filter((x): x is { s: PoolSong; diff: Diff } => !!x.diff);
      if (cand.length) break;
    }
    if (!cand.length) {
      // 只剩"能打这个难度"这一条：区间太苛刻时宁可破区间也不空档
      cand = free
        .filter((s) => s.lv[t.diff] != null)
        .map((s) => ({ s, diff: t.diff as Diff }));
    }
    if (!cand.length) cand = free.map((s) => ({ s, diff: t.diff as Diff }));

    const hit = cand[Math.floor(unit(`${key}|${i}`) * cand.length)];
    used.add(hit.s.songId);

    // 低等级的歌可以把要求往上抬一格到两格（主人 2026-11-05「低难度低等级的歌可以
    // 稍微给高评价」）：3 级以下要多打一级，1 级以下多打两级——反正谱面本身不难，
    // 用高评价补回一点份量。抬的是**要求**，不抬定数段（段是挑歌用的，抬了会挑不到歌）。
    // 上下界一起抬，才能保住原来的区间宽度；贴到 exc 就截平。
    const lv = hit.s.lv[hit.diff] ?? 0;
    const bump = lv <= 1 ? 2 : lv <= 3 ? 1 : 0;
    const ni = Math.max(0, gradeIndex(line.need) - bump);
    const fi = Math.max(ni, gradeIndex(line.worstGrade) - bump);

    out.push({
      ...hit.s,
      luck: line.luck,
      need: GRADES[ni].key,
      needFloor: GRADES[fi].key,
      tier: line.tier,
      diff: hit.diff,
      lv: hit.s.lv[hit.diff] ?? 0,
    });
  }
  return out;
}

/** 访客指纹：已登录用 user_id，游客用匿名 id。用 | 隔开避免两类撞车 */
export function visitorOf(userId: string | undefined, anonId: string): string {
  return userId ? "u:" + userId : "a:" + anonId;
}

export { dbOf, hasSnapshot, recordHit, fortuneOf, dayOf };
export type { Snapshot, FortuneLine };
