// 认证底层：密码哈希、会话、Turnstile 人机验证。
// 只在 Worker 运行时使用（SSR 页 / API 路由 / middleware），不参与静态预渲染。
//
// 设计取舍（2026-10-23）：
//   * 密码不存明文，也不存可逆加密——存 PBKDF2-SHA256 派生值 + 每用户独立盐。
//   * 迭代次数写进 hash 字符串本身（pbkdf2$sha256$<iter>$<salt>$<hash>），
//     以后要提强度只改 PBKDF2_ITER，老用户在下次登录成功时自动重算升级。
//   * 会话不存 token 明文：cookie 放随机 token，库里存它的 SHA-256。
//     库被拖走也拿不到能直接用的 cookie。
//   * 全程用 WebCrypto（Workers 原生），不引第三方库——包体不涨、无供应链风险。

/** PBKDF2 迭代次数。
 *  Workers 有 CPU 时间上限（免费计划每请求约 10ms CPU，付费 30s），而 PBKDF2 是故意慢的，
 *  这就是「抗爆破」和「能跑」的取舍点：
 *  - OWASP 对 PBKDF2-SHA256 的建议是 600k，免费 Workers 撑不住（会 1102 CPU 超限）；
 *  - 本机实测 10 万次 ≈ 150–195ms（Node WebCrypto），免费计划余量本就极小，
 *    所以取 10 万 —— 配合「密码至少 8 位 + Turnstile + 每用户独立盐」够用；
 *  - 升级付费计划后把 PBKDF2_ITER 改大即可：迭代次数写进 hash 串，
 *    老用户下次登录成功时自动按新强度重算（verifyPassword 的 needsRehash）。
 *  红线：线上若出现 1102 CPU 超限，优先下调此值，绝不能去掉密码哈希。 */
const PBKDF2_ITER = 100_000;
const PBKDF2_MIN_ITER = 10_000; // 校验时防御异常值，避免被构造 hash 拖死
const SALT_BYTES = 16;
const KEY_BITS = 256;

/** 会话 cookie 名与有效期（30 天，滑动续期见 touchSession） */
export const SESSION_COOKIE = 'jb_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Role = 'player' | 'maintainer' | 'owner';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

// ---------- 编码工具 ----------

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc64 = (bytes: Uint8Array) => toB64(bytes);

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** 随机 id：去掉易混字符，便于人工核对（用户 id / token 都用它） */
export function randomId(prefix = ''): string {
  const alphabet = '0123456789abcdefghijkmnpqrstuvwxyz';
  const bytes = randomBytes(20);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return prefix ? prefix + '_' + out : out;
}

/** 定长时间比较：避免按字节不同的提前返回泄露信息 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- 密码哈希 ----------

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: iter, hash: 'SHA-256' },
    key,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/** 生成入库用的密码 hash 字符串 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2$sha256$${PBKDF2_ITER}$${enc64(salt)}$${enc64(derived)}`;
}

/**
 * 校验密码。返回 { ok, needsRehash }：
 * needsRehash = true 表示这条 hash 的迭代次数低于当前标准，登录成功后应重算。
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<{ ok: boolean; needsRehash: boolean }> {
  const parts = stored.split('$');
  // 格式不对当作校验失败，不去猜
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    return { ok: false, needsRehash: false };
  }
  const iter = Number(parts[2]);
  if (!Number.isFinite(iter) || iter < PBKDF2_MIN_ITER) return { ok: false, needsRehash: false };

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromB64(parts[3]);
    expected = fromB64(parts[4]);
  } catch {
    return { ok: false, needsRehash: false };
  }

  const actual = await pbkdf2(password, salt, iter);
  const ok = timingSafeEqual(actual, expected);
  return { ok, needsRehash: ok && iter < PBKDF2_ITER };
}

// ---------- 会话 ----------

/** 签发会话：返回要写进 cookie 的 token（明文只出现这一次） */
export async function createSession(
  db: D1Database,
  userId: string,
  uaHash: string | null
): Promise<string> {
  const token = enc64(randomBytes(32));
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ua_hash)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      tokenHash,
      userId,
      new Date(now).toISOString(),
      new Date(now + SESSION_TTL_MS).toISOString(),
      uaHash
    )
    .run();
  // 顺手清掉这个用户的过期会话，避免表无限增长（无 cron 的小站够用）
  await db
    .prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?')
    .bind(userId, new Date(now).toISOString())
    .run();
  return token;
}

/** 用 cookie 里的 token 换用户；无效/过期返回 null */
export async function getUserByToken(db: D1Database, token: string): Promise<AuthUser | null> {
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT u.user_id, u.email, u.display_name, u.role, u.status, s.expires_at
         FROM sessions s JOIN users u ON u.user_id = s.user_id
        WHERE s.token_hash = ?`
    )
    .bind(tokenHash)
    .first<{
      user_id: string;
      email: string;
      display_name: string;
      role: Role;
      status: string;
      expires_at: string;
    }>();

  if (!row) return null;
  if (row.status !== 'active') return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  return { id: row.user_id, email: row.email, name: row.display_name, role: row.role };
}

/** 退出登录：删掉这一条会话 */
export async function destroySession(db: D1Database, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

/** UA 指纹（只用来记录/关联，不作为强制作废依据——手机 UA 会随系统更新变） */
export async function uaFingerprint(ua: string | null): Promise<string | null> {
  if (!ua) return null;
  return (await sha256Hex(ua)).slice(0, 32);
}

// ---------- Cookie ----------

export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== SESSION_COOKIE) continue;
    const v = part.slice(i + 1).trim();
    return v || null;
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSec: number): string {
  // HttpOnly：JS 读不到，XSS 也偷不走；SameSite=Lax：跨站 POST 不带，挡 CSRF；
  // Secure 在 https 下才发；Path=/ 让全站可用。
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax; Secure`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

export const SESSION_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);

// ---------- Turnstile 人机验证 ----------

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * 校验 Turnstile token（注册/登录表单提交时调用）。
 * secret 走 Workers secret（env.TURNSTILE_SECRET），不进仓库。
 * 未配置 secret 时：
 *   - 生产环境一律拒绝（fail-closed，不能让线上裸奔）；
 *   - 本地 DEV 放行，方便开发。
 */
export async function verifyTurnstile(
  token: string | null,
  secret: string | undefined,
  remoteIp: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!secret) {
    if (import.meta.env.DEV) return { ok: true };
    return { ok: false, error: 'captcha-not-configured' };
  }
  if (!token) return { ok: false, error: 'captcha-missing' };

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success) return { ok: true };
    return { ok: false, error: (data['error-codes'] ?? []).join(',') || 'captcha-failed' };
  } catch {
    // 网络故障按失败处理：宁可让用户重试，也不放行可疑请求
    return { ok: false, error: 'captcha-unreachable' };
  }
}

// ---------- 角色 ----------

export const ROLE_RANK: Record<Role, number> = { player: 1, maintainer: 2, owner: 3 };

export const isStaff = (u: AuthUser | null): boolean => !!u && ROLE_RANK[u.role] >= 2;
export const isOwner = (u: AuthUser | null): boolean => !!u && u.role === 'owner';

/** 统一的小写邮箱规范化（注册/登录/查重都用它，避免大小写造成重复账号） */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
