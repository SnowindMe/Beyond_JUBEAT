-- 【2026-11-16 主人要求「数据库方面，added_at 字段拆成 added_at_jp 和 added_at_cn，
--   原在 added_at 有日期数据的全进 added_at_cn」】
--
-- 顺序不能反：先加列、再搬数据、最后删旧列。搬之前 added_at_cn 是空的，
-- 所以 UPDATE 不需要 WHERE 保护以外的东西；删旧列放最后，中途失败重跑也不会丢日期
-- （重跑时 added_at_cn 已有值，UPDATE 用 COALESCE 兜住再写一遍同样是那 171 行）。
--
-- 实测这 171 行全在国服侧（双服 80 / 国服独有 91 / 日服独有 0），所以 added_at_jp 迁移后为空。
-- 本地库与 db/seed.sql 由 scripts/db/build-db.cjs 重建，不用跑这份；它只给线上 D1 用。
ALTER TABLE songs ADD COLUMN added_at_jp TEXT;
ALTER TABLE songs ADD COLUMN added_at_cn TEXT;
UPDATE songs SET added_at_cn = added_at WHERE added_at IS NOT NULL;
ALTER TABLE songs DROP COLUMN added_at;
