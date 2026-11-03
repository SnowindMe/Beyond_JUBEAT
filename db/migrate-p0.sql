-- P0 增量迁移（2026-11-04，数据库审查 P0-2 / P0-4）
-- 只动结构、不碰数据。与 db/migrate-hot.sql 同一套增量约定：只建/删、不 DROP。
-- 用法：npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-p0.sql
--
-- 1) 删 idx_hot_hits_day_song：主键 (day, song_id, visitor) 的最左前缀已完全覆盖。
--    hot_hits 是全站写量最大的表，每条索引都要在每次 INSERT 上摊成本。
DROP INDEX IF EXISTS idx_hot_hits_day_song;

-- 2) IP 限流计数从「每次打点 SELECT COUNT(*) 扫」改成「写一张计数表」。
--    原来一次打点 = 1 次 COUNT 扫 + 1 次 INSERT + 2 次 KV 写；
--    KV 免费版只有 1000 写/天，一次打点写 2 次 = 500 次打点就撞墙，且超限是直接报错。
--    改成 upsert 计数行后：KV 写入归零，COUNT 从读路径挪到写路径。
--    与 hot_hits 一样按天切、随 cron 一起清理。
--    分钟限流（每分钟 30 次）与日计数（每天 400 次）并在同一行的两个列上：
--    一次 upsert + RETURNING 同时拿两个数，打点路径不再有 COUNT 扫描。
CREATE TABLE IF NOT EXISTS hot_ip_days (
  day     TEXT NOT NULL,                -- 北京时间日历日 YYYY-MM-DD
  ip_hash TEXT NOT NULL,                -- sha256(IP + 盐) 前 16 位
  n       INTEGER NOT NULL DEFAULT 0,   -- 当天该 IP 的打点次数
  min_key TEXT NOT NULL,                -- 最近一次打点所在分钟（ISO 到分钟）
  min_n   INTEGER NOT NULL DEFAULT 0,   -- 那一分钟内的次数
  PRIMARY KEY (day, ip_hash)
);

-- 3) 同人同曲 60 秒内的重复打点（原先是 KV 的 hot:gap:* 键）也落在这张表上，
--    key 用 visitor|song_id，按分钟精度存，过期靠 cron 一起清。
CREATE TABLE IF NOT EXISTS hot_gaps (
  key      TEXT PRIMARY KEY,            -- '<visitor>|<song_id>'
  minute   TEXT NOT NULL,               -- ISO 到分钟，用来判断是否还在窗口内
  expires  TEXT NOT NULL                -- ISO 时间，早于它就可以删
);

CREATE INDEX IF NOT EXISTS idx_hot_ip_days_day ON hot_ip_days(day);
CREATE INDEX IF NOT EXISTS idx_hot_gaps_exp   ON hot_gaps(expires);

-- 4) 曲目缓存修订号（2026-11-04 P0-1）：曲目改由静态快照提供后，
--    后台改一条曲目必须同时把 rev +1，缓存 key 才会换（见 src/lib/song-data.ts）。
--    用独立行而不是 songs 的 MAX(rowid)：只改字段不加行时 rev 也得变。
CREATE TABLE IF NOT EXISTS song_rev (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  rev        INTEGER NOT NULL DEFAULT 0,
  changed_at TEXT
);
INSERT OR IGNORE INTO song_rev (id, rev) VALUES (1, 0);

-- 5) recent_changes 从来没有归档，表会一直长。
--    加一条 cron 清理，这里只补一个便于按时间删的索引。
CREATE INDEX IF NOT EXISTS idx_recent_changed_at_asc ON recent_changes(changed_at);
