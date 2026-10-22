// 登录接口：POST /api/auth/login
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  normalizeEmail,
  verifyPassword,
  hashPassword,
  createSession,
  sessionCookie,
  uaFingerprint,
  verifyTurnstile,
  SESSION_MAX_AGE,
} from '../../../lib/auth';

const fail = (code: string) =>
  new Response(null, { status: 303, headers: { location: `/login/?e=${code}` } });


// API 端点必须标 prerender = false：本站 output 是 'static'，
// 端点默认会被当静态路由在构建期预渲染——那样它既拿不到请求体，
// 也会在 Node 预渲染环境里 import cloudflare:workers 直接崩。
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const db = (env as { beyond_jubeat?: D1Database })?.beyond_jubeat;
  const secret = (env as { TURNSTILE_SECRET?: string })?.TURNSTILE_SECRET;
  if (!db) return new Response('D1 binding missing', { status: 500 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('bad-form');
  }

  const email = normalizeEmail(String(form.get('email') ?? ''));
  const password = String(form.get('password') ?? '');
  const captcha = String(form.get('cf-turnstile-response') ?? '') || null;

  const ip = request.headers.get('cf-connecting-ip');
  const turn = await verifyTurnstile(captcha, secret, ip);
  if (!turn.ok) return fail(turn.error ?? 'captcha-failed');

  if (!email || !password) return fail('empty');

  const row = await db
    .prepare('SELECT user_id, pass_hash, status FROM users WHERE email = ?')
    .bind(email)
    .first<{ user_id: string; pass_hash: string; status: string }>();

  // 无论邮箱是否存在都走一次哈希校验的对手件，避免通过响应时间枚举已注册邮箱。
  // （用户不存在时用一个固定的假 hash 跑一遍，耗时接近真实校验）
  const FAKE_HASH =
    'pbkdf2$sha256$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const stored = row?.pass_hash ?? FAKE_HASH;
  const result = await verifyPassword(password, stored);

  // 账号被停用：密码对了也不放行，但错误信息对外统一，不暴露「这个号存在但被封」
  if (!row || !result.ok) return fail('bad-credentials');
  if (row.status !== 'active') return fail('suspended');

  // 迭代次数升级：老 hash 用旧强度验过之后，按当前标准重算一次
  if (result.needsRehash) {
    const fresh = await hashPassword(password);
    await db
      .prepare('UPDATE users SET pass_hash = ?, updated_at = ? WHERE user_id = ?')
      .bind(fresh, new Date().toISOString(), row.user_id)
      .run();
  }

  const ua = request.headers.get('user-agent');
  const token = await createSession(db, row.user_id, await uaFingerprint(ua));

  await db
    .prepare('UPDATE users SET last_login_at = ? WHERE user_id = ?')
    .bind(new Date().toISOString(), row.user_id)
    .run();

  // 登录后回跳：只接受站内相对路径（单个 / 开头），否则一律回 /account/。
  // 不做这层校验就是开放重定向漏洞——?next=//evil.com 会把刚登录的用户送去钓鱼站。
  const nextRaw = String(form.get('next') ?? '');
  const next = /^\/(?!\/)/.test(nextRaw) ? nextRaw : '/account/';

  return new Response(null, {
    status: 303,
    headers: {
      location: next,
      'set-cookie': sessionCookie(token, SESSION_MAX_AGE),
    },
  });
};
