-- 鉴权限流计数表（2026-11-04，安全审查 T4 severity 5）
-- 与 db/migrate-p0.sql 同一套增量约定：只建、不改已有表。
-- 用法：npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-auth.sql
--
-- 三个鉴权端点（登录 / 注册 / 改密）零限流，且每个都跑 PBKDF2（10 万轮），
-- 不挡就是「一次请求换一次 CPU」。五张表各管一道闸，键里不带端点，所以三个端点共用配额：
--   1. auth_ip_minutes  单 IP 每分钟 10 次 —— 主闸；
--   2. auth_ip_hours    单 IP 每小时 200 次 / 每片（IPv4 前三段）每小时 1000 次 —— 挡代理池；
--   3. auth_email_ip_hours / auth_email_ip_days  同一邮箱 + 同一 IP 每小时 20 次、每天 200 次；
--      邮箱在小时表里排在 IP 前面（同一个号的记录在表里挨着），日表里反过来（同一台机子的挨着）；
--   4. auth_email_hours 同一邮箱不分 IP 每小时 20 次 —— 换机场接着打同一个号。
--
-- 邮箱两层只有登录用（注册时表单还没校验，改密时邮箱取自会话），
-- 改密与注册只走上面 IP 那三张表。
--
-- 每张表都是 key 唯一：一行只代表一个键的当前窗口状态，
-- 计数靠 upsert 的 CASE WHEN 换窗 + RETURNING 回读，一次往返，没有 COUNT 扫描。
-- 与业务表一样不挂索引：查询永远是主键等值，清理是 WHERE 区间扫，表里只有活跃窗口，撑得住。
CREATE TABLE IF NOT EXISTS auth_ip_minutes (
  key    TEXT PRIMARY KEY,             -- IP
  minute TEXT NOT NULL,                -- 窗口所在的分钟（ISO 到分钟）
  n      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS auth_ip_hours (
  key  TEXT PRIMARY KEY,               -- IP，或并表基址（形如 8323072*）
  hour TEXT NOT NULL,                  -- 窗口所在的小时（ISO 到小时）
  n    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS auth_email_ip_hours (
  key  TEXT PRIMARY KEY,               -- 邮箱|IP
  hour TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS auth_email_ip_days (
  key TEXT PRIMARY KEY,                -- IP|邮箱
  day TEXT NOT NULL,                   -- 北京时间日历日 YYYY-MM-DD
  n   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS auth_email_hours (
  key  TEXT PRIMARY KEY,               -- 邮箱
  hour TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 1
);
