// 注册接口：POST /api/auth/register
//
// 设计要点：
//   * 用表单直提交（<form method="post">），不用 fetch + JSON——无 JS 也能注册，
//     渐进增强，出错时能直接渲染回表单页并把错误带回去。
//   * 每个字段都在服务端重新校验，不信任前端：前端校验只是体验。
//   * Turnstile 在写库之前校验，失败直接拒绝，不落任何数据（注册不跑 PBKDF2，
//     挡的是"批量灌号"，成本主要是 D1 写入与之后被灌进来的脏数据）。
//   * 失败一律回 303 到 /register/?e=<code>，成功回 303 到 /account/。
//     不用 200 + HTML：POST 后重定向能避免用户刷新重复提交。
//
// 【限流 T4 2026-11-04】与登录同一套 IP 闸门（口径与「先记后判」「近似性」的说明见
// src/pages/api/auth/login.ts 文件头）。这里少了邮箱维度的两条：注册时表单还没校验，
// 邮箱串是脏的，而且注册本来就是低频操作，按 IP 卡住已经很够。
// 三个端点共用同一批计数表、同一个键（只按 IP），一个 IP 每分钟能打的总次数就是 10，
// 换端点不会白送一份新配额。
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

/* ---------------- 限流（与 login.ts 同一套，改动要三处一起改；此处无邮箱维度） ---------------- */

const IP_PER_MIN = 10;
const IP_PER_HOUR = 200;
const UNIT_PER_HOUR = 1000;

type RateHit = { src: 'min' | 'hour' | 'unit' };

/** IP 粗粒度并表基址：只认 IPv4 前三段，其余返回 null（那层就不记）。
 *  前三段换算成一个整数（相邻 256 个地址算一片），末尾缀 * 与裸 IP 区分——
 *  并表行和单 IP 行同住 auth_ip_hours，键撞上就会把一片的流量记到某个 IP 头上。 */
function unitOf(ip: string): string | null {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(ip);
  if (!m) return null;
  const [a, b, c] = m[1].split('.').map(Number);
  return `${a * 65536 + b * 256 + c}*`;
}

const tooMany = (hit: RateHit) =>
  new Response(null, {
    status: 429,
    headers: {
      location: `/register/?e=${hit.src === 'min' ? 'too-many' : 'too-many-long'}`,
      'retry-after': String(hit.src === 'min' ? 60 : 3600),
      'cache-control': 'no-store',
    },
  });

/** 闸门：本次先记上，再按回读取值跟上限比（近似计数，说明见 login.ts） */
async function rateLimit(db: D1Database, ip: string, minute: string, hour: string): Promise<RateHit | null> {
  // 一条 upsert + RETURNING：INSERT 建行，冲突时窗口没换就 +1、换了就重置。
  // 别在 INSERT 之后另补 UPDATE —— 首次就数到 2，上限等于少一半。
  const hit = async (table: 'auth_ip_minutes' | 'auth_ip_hours', key: string, at: string) => {
    const col = table === 'auth_ip_minutes' ? 'minute' : 'hour';
    const row = await db
      .prepare(
        `INSERT INTO ${table} (key, ${col}, n) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET
           n = CASE WHEN ${col} = excluded.${col} THEN n + 1 ELSE 1 END,
           ${col} = excluded.${col}
         RETURNING n`
      )
      .bind(key, at)
      .first<{ n: number | null }>();
    return row?.n ?? 0;
  };

  if ((await hit('auth_ip_minutes', ip, minute)) > IP_PER_MIN) return { src: 'min' };
  if ((await hit('auth_ip_hours', ip, hour)) > IP_PER_HOUR) return { src: 'hour' };

  const unit = unitOf(ip);
  if (unit && unit !== ip && (await hit('auth_ip_hours', unit, hour)) > UNIT_PER_HOUR) return { src: 'unit' };

  return null;
}

/** 顺手清掉窗口里已经没有的旧行（逻辑与 login.ts 的 dropSweep 一致，只是没有邮箱那几张表） */
async function dropSweep(db: D1Database, minute: string, hour: string): Promise<void> {
  const hourAgo = new Date(Date.parse(`${hour}:00Z`) - 3600000).toISOString().slice(0, 13);
  const twoMinAgo = new Date(Date.parse(`${minute}:00Z`) - 2 * 60000).toISOString().slice(0, 16);
  await db.batch([
    db.prepare('DELETE FROM auth_ip_minutes WHERE minute < ?').bind(twoMinAgo),
    db.prepare('DELETE FROM auth_ip_hours WHERE hour < ?').bind(hourAgo),
  ]);
}

/** 取客户端 IP：生产靠 cf-connecting-ip，本地 dev 兜到固定串（详见 login.ts 同名函数） */
const clientIp = (headers: Headers): string =>
  headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';


// API 端点必须标 prerender = false：本站 output 是 'static'，
// 端点默认会被当静态路由在构建期预渲染——那样它既拿不到请求体，
// 也会在 Node 预渲染环境里 import cloudflare:workers 直接崩。
export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
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

  // 限流排在 Turnstile 之前，和登录同一顺序：Turnstile token 一次性，
  // 先验完再被 429 挡掉，用户下次提交就得重新过一遍人机验证。
  const ip = clientIp(request.headers);
  const iso = new Date().toISOString();
  const minute = iso.slice(0, 16);
  const hour = iso.slice(0, 13);
  const hit = await rateLimit(db, ip, minute, hour);
  if (hit) return tooMany(hit);

  // 再验人机验证：机器人不该有机会触发一次密码哈希（那是 CPU 成本）
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

  locals.cfContext?.waitUntil?.(dropSweep(db, minute, hour).catch(() => null));

  return new Response(null, {
    status: 303,
    headers: {
      location: '/account/?welcome=1',
      'set-cookie': sessionCookie(token, SESSION_MAX_AGE),
    },
  });
};
