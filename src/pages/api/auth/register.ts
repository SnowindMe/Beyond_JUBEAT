// 注册接口：POST /api/auth/register
//
// 设计要点：
//   * 用表单直提交（<form method="post">），不用 fetch + JSON——无 JS 也能注册，
//     渐进增强，出错时能直接渲染回表单页并把错误带回去。
//   * 每个字段都在服务端重新校验，不信任前端：前端校验只是体验。
//   * Turnstile 在写库之前校验，失败直接拒绝，不落任何数据。
//   * 失败一律回 303 到 /register/?e=<code>，成功回 303 到 /account/。
//     不用 200 + HTML：POST 后重定向能避免用户刷新重复提交。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  hashPassword,
  normalizeEmail,
  randomId,
  createSession,
  sessionCookie,
  uaFingerprint,
  verifyTurnstile,
  SESSION_MAX_AGE,
} from '../../../lib/auth';

const MIN_PASS = 8;
const MAX_PASS = 128;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (code: string) =>
  new Response(null, { status: 303, headers: { location: `/register/?e=${code}` } });


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
  const name = String(form.get('name') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const password2 = String(form.get('password2') ?? '');
  const captcha = String(form.get('cf-turnstile-response') ?? '') || null;

  // 先校验人机验证：机器人不该有机会触发一次密码哈希（那是 CPU 成本）
  const ip = request.headers.get('cf-connecting-ip');
  const turn = await verifyTurnstile(captcha, secret, ip);
  if (!turn.ok) return fail(turn.error ?? 'captcha-failed');

  if (!EMAIL_RE.test(email) || email.length > 254) return fail('bad-email');
  if (name.length < 1 || name.length > 24) return fail('bad-name');
  if (password.length < MIN_PASS) return fail('weak-password');
  if (password.length > MAX_PASS) return fail('long-password');
  if (password !== password2) return fail('password-mismatch');

  // 邮箱查重：不区分大小写（已在写入前 lower）
  const exists = await db
    .prepare('SELECT 1 FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (exists) return fail('email-taken');

  const now = new Date().toISOString();
  const userId = randomId('u');
  const passHash = await hashPassword(password);

  try {
    await db
      .prepare(
        `INSERT INTO users (user_id, email, display_name, pass_hash, role, status, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, 'player', 'active', ?, ?, ?)`
      )
      .bind(userId, email, name, passHash, now, now, now)
      .run();
  } catch {
    // 唯一索引冲突（并发注册同一个邮箱）也归到 email-taken，不暴露数据库细节
    return fail('email-taken');
  }

  const ua = request.headers.get('user-agent');
  const token = await createSession(db, userId, await uaFingerprint(ua));

  return new Response(null, {
    status: 303,
    headers: {
      location: '/account/?welcome=1',
      'set-cookie': sessionCookie(token, SESSION_MAX_AGE),
    },
  });
};
