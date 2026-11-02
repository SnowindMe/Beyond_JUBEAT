-- 热门榜埋点（2026-11-03，v1.62.0）
-- 只建新表、不 DROP：与 db/migrate-users.sql 同一套增量约定。
-- 用法：npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-hot.sql
--
-- 为什么"一人一曲一天一行"：热度口径按主人 2026-11-03 拍板取**独立听众数**
-- （同一人同一首当天只算一次），刷 100 次也只贡献 1；换 cookie 才叠加。
-- 表因此天然可以做去重，不靠应用层查重；每行还带 ip_hash 供限流与事后排查。
CREATE TABLE IF NOT EXISTS hot_hits (
  day       TEXT NOT NULL,              -- 北京时间日历日 YYYY-MM-DD（窗口与去重都按它切）
  song_id   TEXT NOT NULL,
  visitor   TEXT NOT NULL,              -- 已登录 = user_id；游客 = 匿名 cookie 的随机 id
  ip_hash   TEXT,                       -- sha256(IP + 盐) 前 16 位，不存明文 IP
  created_at TEXT NOT NULL,             -- ISO 时间，仅用于排查
  PRIMARY KEY (day, song_id, visitor)
);
-- 出榜查询：按天 + 曲目聚合，走这条索引就够
CREATE INDEX IF NOT EXISTS idx_hot_hits_day_song ON hot_hits(day, song_id);
-- 限流查询：同一 IP 某天打过多少发
CREATE INDEX IF NOT EXISTS idx_hot_hits_day_ip ON hot_hits(day, ip_hash);

-- 每日快照：榜单当日固定，00:05 封存一次，页面只读这一份，不在请求里现算。
-- entries 是 JSON 数组 [{songId, rank, delta, isNew}]，已算好名次变化：
-- 出榜时再做比对意味着每次请求都要多查一个窗口，还会让同一页面两次刷新结果不同。
-- seeded=1 表示冷启动兜底（装的是最近上架、不是热度排序），页面据此标"热度统计中"。
CREATE TABLE IF NOT EXISTS hot_snapshots (
  date       TEXT PRIMARY KEY,          -- 快照代表的那一天，与查询的"今天"对齐
  from_day   TEXT NOT NULL,             -- 窗口起（含）
  to_day     TEXT NOT NULL,             -- 窗口止（含），恒等于 date 的前一天
  entries    TEXT NOT NULL,
  seeded     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
