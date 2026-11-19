-- 曲目别名（俗称）。2026-11-20 主人「别名复用标签的设计」。
-- 运行时数据：不进 seed 清空范围（同 song_tags）。
-- 无需审核 → 没有 pending 列；不展示创建者 → by_user 只用于「谁能删」。
CREATE TABLE IF NOT EXISTS song_alias (
  song_id    TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  by_user    TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (song_id, name)
);
CREATE INDEX IF NOT EXISTS idx_song_alias_song ON song_alias(song_id);
