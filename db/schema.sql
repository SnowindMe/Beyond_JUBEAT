-- jubeat 资料站数据库（本地 SQLite 与 Cloudflare D1 共用同一份 DDL）
-- 只保留两张业务表：歌曲表、最近更改表。
-- 约定：
--   * 主键用源数据里的稳定 id（官方 songId；少数拿不到官方 id 的日服新曲用 BTA-<曲绘id> 占位）
--   * 缺失值一律 NULL，不猜测填充
--   * 世代不做独立表：直接存「世代名 + 服务器标志」列，前端按世代 group by 即可
--   * 服务器不用单列枚举：一行 = 一份谱面记录，server_jp / server_cn 标这首歌「出现在哪个服」。
--     日服行 (1,0)；国服独有行 (0,1)；国服「KONAMI原创」= 两服都有 (1,1)——
--     页面口径：两服都有的曲目在音乐魔方里显示在 KONAMI原创 分区（主人 2026-10-22 指定）。

DROP TABLE IF EXISTS songs;
CREATE TABLE songs (
  song_id     TEXT PRIMARY KEY,          -- 官方 songId；占位 id 形如 BTA-44711214
  id_kind     TEXT,                      -- official / synthetic（synthetic = 官方 id 拿不到的占位）
  title       TEXT NOT NULL,
  artist      TEXT,
  bpm         TEXT,                      -- 源数据是字符串（有 "145" 这类纯数字，也有空）
  gen_name    TEXT NOT NULL,             -- 世代名：jubeat / ripples / … / beyond the Ave. / 音乐魔方
  server_jp   INTEGER NOT NULL DEFAULT 0 CHECK (server_jp IN (0,1)),  -- 1 = 这首歌在日服有谱
  server_cn   INTEGER NOT NULL DEFAULT 0 CHECK (server_cn IN (0,1)),  -- 1 = 这首歌在国服有谱
  category    TEXT NOT NULL,             -- 日服：版权 / 原创；国服：KONAMI原创 / 音乐魔方原创 / 音乐魔方流行
  bsc         REAL,
  adv         REAL,
  ext         REAL,
  alt         INTEGER NOT NULL DEFAULT 0, -- 1 = 长押谱（标题带 [ 2 ]）
  cover       TEXT,                      -- 曲绘文件名（日服 jkt/id 图，国服 webp）
  added_at    TEXT,                      -- 上线/解禁日期 YYYY-MM-DD
  unlock_note TEXT                       -- 解禁池或联动来源，人类可读
);
CREATE INDEX idx_songs_jp_gen  ON songs(server_jp, gen_name);
CREATE INDEX idx_songs_cn_cat  ON songs(server_cn, category);
CREATE INDEX idx_songs_title   ON songs(title);
-- 主导出查询（ORDER BY gen_name, ext DESC）专用：两列复合索引直接按序输出，
-- 免掉 TEMP B-TREE 全表排序（1241 行 ×16 列）。
CREATE INDEX idx_songs_order ON songs(gen_name, ext DESC);

DROP TABLE IF EXISTS recent_changes;
CREATE TABLE recent_changes (
  change_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  changed_at   TEXT NOT NULL,            -- ISO 时间
  user         TEXT NOT NULL,            -- 谁改的
  target_label TEXT NOT NULL,            -- 改了哪个页面（显示用）
  target_href  TEXT NOT NULL,            -- 页面链接
  summary      TEXT,                     -- 改了什么
  before_text  TEXT,                     -- 改前
  after_text  TEXT                       -- 改后
);

CREATE INDEX idx_recent_changed_at ON recent_changes(changed_at DESC);