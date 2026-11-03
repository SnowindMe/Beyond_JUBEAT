// D1 数据访问层：运行时从 Cloudflare D1 读取**最近更改**。
// 曲目数据（占绝大多数查询）已经在 2026-11-04 搬到静态资产，见 src/lib/song-data.ts —
// songs 表全表 1248 行每次请求扫一遍会把 D1 免费额度（5,000,000 rows read/天）打穿；
// 这里现在只剩 /recent/ 一条按索引取的 200 行查询。
//
// 只由 SSR 页面（prerender = false）调用，构建期静态页不碰它。
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