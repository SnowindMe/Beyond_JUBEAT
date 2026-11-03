// 曲目数据：构建期静态资产 + 边缘缓存，请求期**不碰 D1**。
//
// 注意与 src/lib/db.ts 的分工（后者只剩最近更改）：
// 两处都导出 `type Song`，页面从本文件 import 类型，别再引 db.ts。
//
// 为什么（成本账，见 docs/database-review-2026-11-04.md P0-1）：
// songs 表 1248 行，全表扫一次就记 1248 rows read，而 D1 免费额度是 5,000,000/天。
// songs.astro:30、songs/frag.astro:28、jubility.astro:30 每请求各扫一遍，
// 日 PV 4000 就吃光。曲目数据本来就是构建期产物（scripts/build-data.cjs 每次构建重写
// public/data/songs.json），把它留在请求期查库是把静态事实天天重算。
//
// 三级读，命中即止：
//   ① 模块内存快照（同 isolate、同版本、同修订号）
//   ② Cache API（每个 PoP 一份，命中零 D1、零资源层）
//   ③ ASSETS 静态文件（?v= 带内容版本，资源层自己也缓存）
//
// 失效靠两种 key 变化，缺一不可：
//   · 构建版本 BUILD_VERSION —— 部署时变（曲库随构建刷新）
//   · song_rev 修订号（D1 单行，60s isolate 缓存）—— 后台改曲时 +1
// 只靠前者的话，后台改完一条曲目要等下次部署才生效；
// 只靠后者的话，新部署会被旧修订号下的边缘缓存钉住。
//
// D1 在这条路径上只剩「读一行修订号」，单 isolate 60s 一次，与 1248 行的全表扫不是一个量级。

import ASSET_VERSION from '../data/songs-version.json';

export type Song = {
  id: string;
  t: string;
  a: string | null;
  lv: { bsc: number | null; adv: number | null; ext: number | null };
  cover: string | null;
  d: string | null;
  bpm: string | null;
  gen: string;
  jp: boolean;
  cn: boolean;
  cat: string;
  alt: number;
  unlock: string | null;
  kind: string | null;
  /** 限时曲结束日 YYYY-MM-DD；null = 非限时。判定按真实今天算，不在数据里焊死。 */
  lu?: string | null;
  /**
   * 搜索用的读音索引：【2026-10-30 主人要求「搜索适配假名·罗马字」】
   * 「平假名读音 + 罗马字」，已去掉空白并小写，只用于前端子串匹配。
   * 纯派生数据（源就是 title/artist），无值 = 读音与原文相同（纯英文曲名），不需要额外字段。
   */
  sk?: string | null;
  /**
   * 是否长押谱：【2026-10-31 主人要求，数据来自 remywiki 的 jubeat 谱面表】
   * 1 = 至少一个难度有长押；0 = 三难度都没有；null = 没抓到（未知）。
   * **与 alt 无关**：alt=1 只表示「这行是 [ 2 ] 谱面」（主人 2026-10-31 纠正）。
   * 判空一律用 === null / == null，别用 falsy —— 0 是「确定没有长押」，和未知不是一回事。
   */
  hasHold?: 0 | 1 | null;
  /** 各难度总键数，如 { bsc: 414, adv: 491, ext: 805 }；null = 未知。 */
  notecounts?: Record<string, number> | null;
  /** 各难度长押数，形状同 notecounts。 */
  holds?: Record<string, number> | null;
};

/** 资源路径。带内容版本的查询串由 cacheKey 拼，别在别处硬编码。 */
export const SONGS_PATH = '/data/songs.json';

// 搜索读音索引（song_id → 平假名/罗马字），**生成物，别手改**，见 scripts/build-search-key.cjs。
// 为什么读静态 JSON 而不是在查询期算：kuroshiro 要带约 17 MB 的 kuromoji 词典，
// 打进 Worker 不现实；而加一列 D1 要线上 ALTER + 重灌，忘跑就成了「改了没生效」的静默失效。
import searchKeys from '../data/search-keys.json';
const SEARCH_KEYS = searchKeys as Record<string, string>;

/** 给一首曲挂上读音索引；无值就原样返回（纯英文曲名不需要额外字段）。 */
const withKeys = (s: Song): Song => {
  const sk = SEARCH_KEYS[s.id];
  return sk ? { ...s, sk } : s;
};

const BUILD_VERSION = (ASSET_VERSION as { v: string }).v;

/**
 * D1 最小结构类型：本模块只读一行修订号，声明到用到为止，
 * 这样 CI 里塞假实现不用冒充整个 D1Database。
 */
type RevDB = { prepare(sql: string): { first<T>(): Promise<T | null> } };

// song_rev 单行。读不到（老库还没建表 / 没种数据）就当 0，不能因为修订号缺失让整站 500。
const SQL_REV = 'SELECT rev FROM song_rev WHERE id = 1';
const REV_TTL_MS = 60_000;
let revCache: { v: number; at: number } | null = null;

/** 读修订号（isolate 内缓存 60s）。DB 缺失或查询失败都退 0，保证只影响新鲜度、不影响可用性。 */
async function readRev(db: D1Database | undefined): Promise<number> {
  if (!db) return 0;
  const now = Date.now();
  if (revCache && now - revCache.at < REV_TTL_MS) return revCache.v;
  let v = 0;
  try {
    const row = await (db as unknown as RevDB).prepare(SQL_REV).first<{ rev: number }>();
    v = row?.rev ?? 0;
  } catch {
    v = revCache?.v ?? 0;
  }
  revCache = { v, at: now };
  return v;
}

const cacheKey = (origin: string, rev: number) =>
  origin + SONGS_PATH + '?v=' + BUILD_VERSION + '&r=' + rev;

// 内存快照：只在版本与修订号都对上时才用，换了任何一个就重读。
let snap: Song[] | null = null;
let snapKey = '';
let byId: Map<string, Song> | null = null;
let inflight: Promise<Song[]> | null = null;

type CachesLike = { default: Cache };
const edgeCache = () => (caches as unknown as CachesLike).default;

/** 静态文件读取。ASSETS 是资源层绑定，走它才能吃到 CF 边缘缓存。 */
async function fetchAsset(assets: Fetcher, key: string): Promise<Song[]> {
  const res = await assets.fetch(new Request(key));
  if (!res.ok) throw new Error('songs.json ' + res.status);
  return (await res.json()) as Song[];
}

/**
 * 全量曲目（按 gen_name, ext DESC 排好序，直接喂给页面分组）。
 *
 * assets：env.ASSETS。origin：调用页的 Astro.url.origin（拼缓存 key 用）。
 * cf：可选的 ExecutionContext，用来把「写边缘缓存」丢到响应之后。
 */
export async function getAllSongs(
  assets: Fetcher,
  origin: string,
  db?: D1Database,
  cf?: { waitUntil(p: Promise<unknown>): void }
): Promise<Song[]> {
  const key = cacheKey(origin, await readRev(db));
  if (snap && snapKey === key) return snap;
  if (inflight && snapKey === key) return inflight;

  const task = (async (): Promise<Song[]> => {
    // ② 边缘缓存：每个 PoP 一份，命中时连资源层都不碰
    const cache = edgeCache();
    let body: Song[] | null = null;
    try {
      const hit = await cache?.match(key);
      if (hit) body = (await hit.json()) as Song[];
    } catch {
      body = null;
    }

    // ③ 静态文件：仍没有就真读一次，并把结果灌给该 PoP
    if (!body) {
      body = (await fetchAsset(assets, key)).map(withKeys);
      const put = cache
        ?.put(key, new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }))
        .catch(() => {});
      if (put) {
        if (cf?.waitUntil) cf.waitUntil(put);
        else await put;
      }
    }

    snap = body;
    snapKey = key;
    byId = null;
    return body;
  })().finally(() => {
    if (inflight === task) inflight = null;
  });

  inflight = task;
  return task;
}

/**
 * 单曲（详情页用）。
 * 从同一份快照里查，不再单独走主键查询 —— 全量数据反正已经在手，
 * 再发一次 D1 反而多一次往返；Map 只在快照换掉时重建一次。
 */
export async function getSongById(
  assets: Fetcher,
  origin: string,
  id: string,
  db?: D1Database,
  cf?: { waitUntil(p: Promise<unknown>): void }
): Promise<Song | null> {
  const list = await getAllSongs(assets, origin, db, cf);
  if (!byId) byId = new Map(list.map((s) => [s.id, s]));
  return byId.get(id) ?? null;
}

/**
 * 本地清缓存（后台保存后调用）。
 * key 里带修订号，删除只是为了不白等那 60s 的修订号缓存。
 */
export function invalidateSongsCache(origin?: string) {
  const old = snapKey;
  snap = null;
  snapKey = '';
  byId = null;
  revCache = null;
  inflight = null;
  if (old) edgeCache()?.delete(old)?.catch?.(() => {});
}
