// 修改密码：POST /api/account/password
//
// 安全要点：改密必须验旧密码（防止 cookie 被盗后直接改密锁人），
// 且改完要踢掉其它设备的会话——只保留当前这一个。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  hashPassword,
  verifyPassword,
  readSessionToken,
  createSession,
  sessionCookie,
  destroySession,
  uaFingerprint,
  SESSION_MAX_AGE,
} from '../../../lib/auth';

const MIN_PASS = 8;
const MAX_PASS = 128;


// API 端点必须标 prerender = false：本站 output 是 'static'，
// 端点默认会被当静态路由在构建期预渲染——那样它既拿不到请求体，
// 也会在 Node 预渲染环境里 import cloudflare:workers 直接崩。
export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(null, { status: 303, headers: { location: '/login/' } });

  const db = (env as { beyond_jubeat?: D1Database })?.beyond_jubeat;
  if (!db) return new Response('D1 binding missing', { status: 500 });

  const form = await request.formData().catch(() => null);
  if (!form) return new Response(null, { status: 303, headers: { location: '/account/?e=bad-form' } });

  const oldPass = String(form.get('old') ?? '');
  const pass = String(form.get('password') ?? '');
  const pass2 = String(form.get('password2') ?? '');

  if (pass.length < MIN_PASS) return redirectErr('weak-password');
  if (pass.length > MAX_PASS) return redirectErr('long-password');
  if (pass !== pass2) return redirectErr('password-mismatch');

  const row = await db
    .prepare('SELECT pass_hash FROM users WHERE user_id = ?')
    .bind(user.id)
    .first<{ pass_hash: string }>();
  if (!row) return new Response(null, { status: 303, headers: { location: '/login/' } });

  const check = await verifyPassword(oldPass, row.pass_hash);
  if (!check.ok) return redirectErr('bad-credentials');

  const fresh = await hashPassword(pass);
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET pass_hash = ?, updated_at = ? WHERE user_id = ?')
    .bind(fresh, now, user.id)
    .run();

  // 踢掉所有旧会话，再给当前设备发一个新的
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  const ua = request.headers.get('user-agent');
  const token = await createSession(db, user.id, await uaFingerprint(ua));

  return new Response(null, {
    status: 303,
    headers: {
      location: '/account/?ok=password',
      'set-cookie': sessionCookie(token, SESSION_MAX_AGE),
    },
  });
};

function redirectErr(code: string) {
  return new Response(null, { status: 303, headers: { location: `/account/?e=${code}` } });
}
