// D1 数据访问层：运行时从 Cloudflare D1 读取曲目数据。
// 只由 SSR 页面（prerender = false）调用，构建期静态页不碰它。
//
// 为什么要缓存：D1 是远程查询，songs 全量 1248 行每次请求都读会拖慢首屏。
// 用模块级变量在 isolate 内缓存，配合 Cache API 的 HTTP 缓存头，
// 同一 isolate 内后续请求直接命中内存，跨 isolate 走 CF 边缘缓存。

// 搜索读音索引（song_id → 平假名/罗马字），**生成物，别手改**，见 scripts/build-search-key.cjs。
// 为什么读静态 JSON 而不是在查询期算：kuroshiro 要带约 17 MB 的 kuromoji 词典，
// 打进 Worker 不现实；而加一列 D1 要线上 ALTER + 重灌，忘跑就成了「改了没生效」的静默失效。
import searchKeys from '../data/search-keys.json';
const SEARCH_KEYS = searchKeys as Record<string, string>;

/** 给一首曲挂上读音索引。D1 与 dev 快照两条路径都过这里，避免只改一边。 */
const withKeys = (s: Song): Song => {
  const sk = SEARCH_KEYS[s.id];
  return sk ? { ...s, sk } : s;
};

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
};

type D1Row = {
  song_id: string; id_kind: string | null; title: string; artist: string | null;
  bpm: string | null; gen_name: string; server_jp: number; server_cn: number; category: string;
  bsc: number | null; adv: number | null; ext: number | null; alt: number;
  cover: string | null; added_at: string | null; unlock_note: string | null;
  limited_until: string | null;
};

// isolate 级缓存：D1 数据只在部署后变，进程存活期内缓存是安全的。
let cache: Song[] | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

const rowToSong = (r: D1Row): Song => ({
  id: r.song_id,
  t: r.title,
  a: r.artist,
  lv: { bsc: r.bsc, adv: r.adv, ext: r.ext },
  // D1 里日服 cover 存的是源文件原名 idN.gif；站点素材统一转成 .webp（build-data 同名转换）。
  // 在这里归一化，页面直接拼 URL 就不会 404。
  cover: r.cover ? String(r.cover).replace(/\.gif$/i, '.webp') : null,
  d: r.added_at,
  bpm: r.bpm,
  gen: r.gen_name,
  jp: r.server_jp === 1,
  cn: r.server_cn === 1,
  cat: r.category,
  alt: r.alt ? 1 : 0,
  unlock: r.unlock_note,
  kind: r.id_kind,
  // 限时曲的结束日（YYYY-MM-DD）；null = 非限时。前端按真实今天判断是否已结束。
  lu: r.limited_until || null,
});

/** 全量曲目（按 gen_name, ext DESC 排好序，直接喂给页面分组） */
const SQL_ALL = `SELECT song_id, id_kind, title, artist, bpm, gen_name, server_jp, server_cn, category,
              bsc, adv, ext, alt, cover, added_at, unlock_note, limited_until
         FROM songs
        ORDER BY gen_name, ext DESC`;

export async function getAllSongs(db: D1Database | undefined): Promise<Song[]> {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;

  if (db) {
    const { results } = await db.prepare(SQL_ALL).all<D1Row>();
    cache = (results ?? []).map(rowToSong).map(withKeys);
  } else {
    // 开发期退路：`astro dev` 没有 D1 绑定（本机 workerd 起不来，platformProxy 关着），
    // 这时读构建期快照 src/data/songs.json（与 D1 同一份数据、同样字段）。
    // import.meta.env.DEV 在构建期是常量 false，这段连同 JSON 一起被摇掉，不进 Worker 包。
    if (!import.meta.env.DEV) throw new Error('D1 binding "beyond_jubeat" is missing');
    const { default: snap } = await import('../data/songs.json');
    cache = (snap as unknown as Song[]).map((s) => withKeys({ ...s }));
  }

  cacheAt = now;
  return cache;
}

// 单曲查询：走 PRIMARY KEY 索引。与 getAllSongs 分开缓存——详情页只取一行，
// 拉全量 1248 行太浪费；但热门曲会反复命中，同样在 isolate 内缓存。
const songCache = new Map<string, { song: Song | null; at: number }>();

const SQL_ONE = `SELECT song_id, id_kind, title, artist, bpm, gen_name, server_jp, server_cn, category,
              bsc, adv, ext, alt, cover, added_at, unlock_note, limited_until
         FROM songs
        WHERE song_id = ?`;

export async function getSongById(
  db: D1Database | undefined,
  id: string
): Promise<Song | null> {
  const now = Date.now();
  const hit = songCache.get(id);
  if (hit && now - hit.at < TTL_MS) return hit.song;

  let song: Song | null = null;
  if (db) {
    const row = await db.prepare(SQL_ONE).bind(id).first<D1Row>();
    song = row ? withKeys(rowToSong(row)) : null;
  } else {
    if (!import.meta.env.DEV) throw new Error('D1 binding "beyond_jubeat" is missing');
    const { default: snap } = await import('../data/songs.json');
    const base = (snap as unknown as Song[]).find((s) => s.id === id);
    song = base ? withKeys({ ...base }) : null;
  }

  songCache.set(id, { song, at: now });
  return song;
}

/** 最近更改（/recent/ 用）：写入方是 /api/admin/song-update，这里只读 */
export type RecentChange = {
  time: string; user: string; target: { label: string; href: string };
  summary: string | null; before: string | null; after: string | null;
};

/**
 * 最近更改列表：按 changed_at 倒序，最多 200 条。
 *
 * 不缓存：改一条记录要立刻出现在 /recent/ 上，60s 的 isolate 缓存会让编辑者
 * 「刚保存完却看不到自己那一行」。这条查询走 idx_recent_changed_at 索引，
 * 200 行的代价可以忽略；HTTP 层的 30s 浏览器缓存已足够挡重复请求。
 */
export async function getRecentChanges(db: D1Database | undefined): Promise<RecentChange[]> {
  if (!db) {
    // 与 getAllSongs 同一套退路：dev 阶段没有 D1 绑定，读构建期快照；
    // 生产环境缺绑定则明确抛错（fail loud），不要静默显示「没有更改」——
    // 那会让人误以为站点没被改过，而不是基础设施出了问题。
    if (!import.meta.env.DEV) throw new Error('D1 binding "beyond_jubeat" is missing');
    const { default: snap } = await import('../data/recent-changes.json');
    const list = (snap as { changes?: RecentChange[] }).changes ?? [];
    return list.map((c) => ({ ...c }));
  }

  const { results } = await db
    .prepare(
      `SELECT changed_at, user, target_label, target_href, summary, before_text, after_text
         FROM recent_changes ORDER BY changed_at DESC LIMIT 200`
    )
    .all<{
      changed_at: string; user: string; target_label: string; target_href: string;
      summary: string | null; before_text: string | null; after_text: string | null;
    }>();

  return (results ?? []).map((r) => ({
    time: r.changed_at,
    user: r.user,
    target: { label: r.target_label, href: r.target_href },
    summary: r.summary,
    before: r.before_text,
    after: r.after_text,
  }));
}

/** 清缓存（数据更新后调用；目前没有写入路径，留给将来的编辑功能） */
export function invalidateSongsCache() {
  cache = null;
  cacheAt = 0;
  songCache.clear();
}