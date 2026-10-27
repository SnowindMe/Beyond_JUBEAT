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
  unlock_note TEXT,                      -- 解禁池或联动来源，人类可读
  -- 【2026-10-28 主人要求「显示限时曲」】限时曲的结束日（YYYY-MM-DD）；NULL = 非限时。
  -- 只存日期、不存布尔：判定要按**真实今天**算（主人定的口径是「区间结束才算限时」），
  -- 存布尔会在数据生成那天就焊死，之后永远不变。前端拿它和当天日期比。
  limited_until TEXT
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

-- ---------------------------------------------------------------------------
-- 用户系统（2026-10-23，v1.14.0 起）
--
-- 身份模型（主人 2026-10-23 定）：
--   游客   = 没登录，只能看；不是表里的行。
--   玩家   = 注册即得 role='player'。
--   维护者 = role='maintainer'，玩家自己自荐（走 role_requests 表），站长审批。
--   站长   = role='owner'，只有主人一个，直接在 D1 里改，站点不提供提权入口。
--
-- 密码不存明文也不存可逆加密：存 PBKDF2-SHA256 派生结果 + 每个用户独立的盐，
-- 迭代次数一起存进 hash 字符串（算法可随年份升级，老用户下次登录时自动重算）。
-- 会话同样不存 token 明文：cookie 里放随机 token，表里存它的 SHA-256，
-- 库被拖走也拿不到能直接用的 cookie。
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  user_id       TEXT PRIMARY KEY,        -- 内部稳定 id（随机，不暴露邮箱）
  email         TEXT NOT NULL,           -- 登录名，统一小写后存
  display_name  TEXT NOT NULL,           -- 站内昵称（可改，不必唯一）
  pass_hash     TEXT NOT NULL,           -- pbkdf2$<迭代次数>$<salt-b64>$<hash-b64>
  role          TEXT NOT NULL DEFAULT 'player'
                CHECK (role IN ('player','maintainer','owner')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','suspended')),
  created_at    TEXT NOT NULL,           -- ISO 时间
  updated_at    TEXT NOT NULL,
  last_login_at TEXT
);
-- 邮箱唯一且大小写不敏感：统一在写入前 lower()，这里再兜一道唯一索引。
CREATE UNIQUE INDEX idx_users_email ON users(email);

DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,         -- sha256(cookie token)，不是 token 本体
  user_id      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,            -- ISO 时间，过期即无效（顺手清理）
  ua_hash      TEXT,                     -- 可选：UA 指纹，变了视为可疑（暂不作废，只记录）
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_exp  ON sessions(expires_at);

-- 第三方登录（GitHub 等）。二期才接回调，但表先建好：
-- 一个用户可绑多个第三方账号，(provider, provider_uid) 全局唯一。
DROP TABLE IF EXISTS oauth_accounts;
CREATE TABLE oauth_accounts (
  provider      TEXT NOT NULL,           -- github / （以后可扩展）
  provider_uid  TEXT NOT NULL,           -- 对方平台上的用户 id
  user_id       TEXT NOT NULL,
  linked_at     TEXT NOT NULL,
  PRIMARY KEY (provider, provider_uid),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);

-- 维护者自荐与审批（主人 2026-10-23：维护者由玩家自己推荐，站长审批）。
-- 不建独立申请表就只能在 D1 里手工改 role，玩家连申请入口都没有。
DROP TABLE IF EXISTS role_requests;
CREATE TABLE role_requests (
  request_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  want_role    TEXT NOT NULL DEFAULT 'maintainer' CHECK (want_role IN ('maintainer')),
  reason       TEXT NOT NULL,            -- 玩家写的自荐理由（站长审批时看）
  state        TEXT NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending','approved','rejected')),
  created_at   TEXT NOT NULL,
  decided_at   TEXT,
  decided_by   TEXT,                     -- 审批人 user_id
  decision_note TEXT,                    -- 驳回理由 / 备注
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
-- 同一用户同时只允许一条待审申请（部分索引：D1/SQLite 都支持 WHERE 子句）
CREATE UNIQUE INDEX idx_role_req_pending ON role_requests(user_id) WHERE state = 'pending';
CREATE INDEX idx_role_req_state ON role_requests(state, created_at DESC);