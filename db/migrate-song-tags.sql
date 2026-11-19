-- 曲目标签表（2026-11-19）。线上 D1 用这个增量脚本，本地库走 build-db 重建。
-- 与 songs 不同：玩家提交的标签是运行时数据，seed.sql 不清它。
CREATE TABLE IF NOT EXISTS song_tags (
  song_id    TEXT NOT NULL,
  diff       TEXT NOT NULL CHECK (diff IN ('bsc','adv','ext')),
  kind       TEXT NOT NULL CHECK (kind IN ('cfg','lv','eval')),
  name       TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 1,
  by_user    TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (song_id, diff, kind, name)
);
CREATE INDEX IF NOT EXISTS idx_song_tags_song ON song_tags(song_id, diff, kind);
