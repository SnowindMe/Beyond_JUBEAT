-- 用户系统表（2026-10-23，v1.14.0）
-- 只建新表、不 DROP 任何东西：这份是给线上 D1 用的增量迁移。
-- 用法：npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-users.sql
-- （db/schema.sql 是本地建库用的全量 DDL，里面有 DROP TABLE songs，别对线上跑）

CREATE TABLE IF NOT EXISTS users (
  user_id       TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  pass_hash     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','maintainer','owner')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  last_login_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ua_hash    TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider     TEXT NOT NULL,
  provider_uid TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  linked_at    TEXT NOT NULL,
  PRIMARY KEY (provider, provider_uid),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS role_requests (
  request_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  want_role     TEXT NOT NULL DEFAULT 'maintainer' CHECK (want_role IN ('maintainer')),
  reason        TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected')),
  created_at    TEXT NOT NULL,
  decided_at    TEXT,
  decided_by    TEXT,
  decision_note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_req_pending ON role_requests(user_id) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS idx_role_req_state ON role_requests(state, created_at DESC);
