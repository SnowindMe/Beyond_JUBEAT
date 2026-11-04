// 修改密码：POST /api/account/password
//
// 安全要点：改密必须验旧密码（防止 cookie 被盗后直接改密锁人），
// 且改完要踢掉其它设备的会话——只保留当前这一个。
//
// 【限流 T4 2026-11-04】这个端点原先连 Turnstile 都没有，是三个鉴权端点里最裸的一个，
// 而且每次失败都要跑一遍 PBKDF2 验旧密码。闸门与登录同一套（口径与「先记后判」「近似性」
// 的说明见 src/pages/api/auth/login.ts 文件头）。
// 不记邮箱维度：这里的邮箱取自会话、不是用户当场填的，拿它当键挡不住对自己账号的爆破。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  hashPassword,
  verifyPassword,
  createSession,
  sessionCookie,
  uaFingerprint,
  SESSION_MAX_AGE,
} from '../../../lib/auth';

const MIN_PASS = 8;
const MAX_PASS = 128;

/* ---------------- 限流（与 login.ts 同一套，改动要三处一起改） ---------------- */

// 口径与登录完全一致（每分钟 10 次 / 每小时 200 次 / 并表每小时 1000 次），
// 且三个鉴权端点共用同一批计数表与同一个键（只按 IP）——
// 一个 IP 在这一分钟里能打的总次数就是 10，换个端点不会白送一份新配额。
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
      location: `/account/?e=${hit.src === 'min' ? 'too-many' : 'too-many-long'}`,
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

/** 顺手清掉窗口外的旧行（逻辑与 login.ts 的 dropSweep 一致） */
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

  // 限流放在最后：格式错误是本地就能判的，不该占配额
  const ip = clientIp(request.headers);
  const iso = new Date().toISOString();
  const minute = iso.slice(0, 16);
  const hour = iso.slice(0, 13);
  const hit = await rateLimit(db, ip, minute, hour);
  if (hit) return tooMany(hit);

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

  locals.cfContext?.waitUntil?.(dropSweep(db, minute, hour).catch(() => null));

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
