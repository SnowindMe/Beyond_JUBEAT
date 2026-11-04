// 登录接口：POST /api/auth/login
//
// 【限流 T4 2026-11-04】本文件同时是三个鉴权端点的限流父本（注册、改密从这里抄同一套）。
// 三个端点必须限流的理由：PBKDF2 十万次是故意慢的（见 lib/auth.ts 迭代次数的注释），
// 每个密码请求都是一笔实打实的 CPU 支出；Turnstile 只挡自动机，挡不住
// 「人已经过了验证，再拿脚本循环打 500 次」。
//
// 闸门口径（任何一条命中直接 429 + Retry-After，不进入人机验证，更不进入密码哈希）：
//   1. 单 IP 每分钟 10 次 —— 挡洪水的主闸；
//   2. 单 IP 每小时 200 次，另有一层按 IPv4 前三段并表的粗粒度闸门（每片每小时 1000 次）——
//      市面上的代理池常常整段整段轮换，单 IP 那两层的意义有限，
//      真正兜住总量的是每小时这一层；而 Cloudflare 边缘节点背后可能一片地址共用一个出口，
//      按单 IP 记会把整片邻居一起算死，所以另加一层粗粒度闸门来放宽它；
//      （时间窗本身也有取舍：分钟层 10 次配小时层 200 次，平均 20 秒一次，比分钟窗宽 3 倍——
//       正常人的手速远够不着，它真正的作用是把攻击总量压在 200 次/小时这个量级上。）
//   3. 同一邮箱 + 同一 IP：每小时 20 次、每天 200 次 —— 同一台机子换号爆破；
//   4. 同一邮箱不分 IP：每小时 20 次 —— 换机场、换网络接着打同一个号。
//      邮箱两层只针对「锁死一个号」，所以上限都不比单 IP 那层更严：
//      单人手动试密码，先撞的一定是每分钟那层，不会莫名其妙被邮箱层多关一小时。
//
// 【先记后判】计数都是「本次先记上，再看回读取值有没有超上限」，所以是超了上限再放行一次
// 才回 429（每分钟 10 次 = 第 11 次撞墙，并且第 11 次本身也记在账上）。
// 第 11 次撞墙而不是第 10 次，是因为计数出自上一次请求，而计数还偏偏发生在人机验证之前 ——
// 若卡在第 10 次，正常用户填错一次密码就没得试了。
//
// 【近似性】一次计数只发一条 upsert，但各道闸门是逐个计数、逐个判断、撞了就提前 return：
// 并发下两笔请求的回读取值可能相同，于是同一时刻超限的几笔会一起放行过去，而不是只放一笔。
// 挡洪峰要的正是这个效果，所以别把它当精确记账用——真要「一小时只准 10 次」那种硬承诺，
// 得在 RETURNING 上加守卫，或者换 Durable Object。
//
// 【存储】照抄 hot/hit.ts 的 D1 计数（那边 2026-11-04 已从 KV 迁到 D1，KV 免费版 1000 写/天
// 挡不住鉴权量）。三张表线上用 db/migrate-auth.sql 建：鉴权表不随 cron 清理——每日任务扩表时
// 重新敲一遍 schema 的成本，比让一张跨天跨小时的脏表越积越厚高得多。清理由本文件下方的
// dropSweep() 顺手做，每次请求删掉窗口里已经没有的旧行。
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
import { dayOf } from '../../../lib/hot';

const fail = (code: string) =>
  new Response(null, { status: 303, headers: { location: `/login/?e=${code}` } });

/* ---------------- 限流（三个鉴权端点共用，见文件头口径） ---------------- */

const IP_PER_MIN = 10;
const IP_PER_HOUR = 200;
const UNIT_PER_HOUR = 1000;
const EMAIL_IP_PER_HOUR = 20;
const EMAIL_IP_PER_DAY = 200;
const EMAIL_PER_HOUR = 20;

/** 撞了哪一道闸。代码本身不四处传，靠 src 决定给用户哪句提示与 Retry-After。 */
type RateHit = { src: 'min' | 'hour' | 'unit' | 'email-ip-hour' | 'email-ip-day' | 'email-hour' };

/** IP 粗粒度并表基址：只认 IPv4 前三段，其余返回 null（那层就不记）。
 *  前三段换算成一个整数（即相邻 256 个地址算一片），末尾缀一个 * 与裸 IP 区分开——
 *  并表行和单 IP 行同住 auth_ip_hours，键必须不可能撞上，否则一片的流量会全记到某个 IP 头上。 */
function unitOf(ip: string): string | null {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(ip);
  if (!m) return null;
  const [a, b, c] = m[1].split('.').map(Number);
  return `${a * 65536 + b * 256 + c}*`;
}

const tooMany = (to: string, hit: RateHit, next: string) => {
  // 窗口越大等得越久：分钟层给 60 秒都好得差不多，小时层让用户直接去干别的。
  const wait = hit.src === 'min' ? 60 : hit.src === 'email-ip-day' ? 86400 : 3600;
  // 撞分钟闸只要等一分钟，撞小时/日闸等得久，提示文案分开。
  // next 一定要带着：不然后头重新登录成功也不回原来那一页了。
  const code = hit.src === 'min' ? 'too-many' : 'too-many-long';
  return new Response(null, {
    status: 429,
    headers: {
      location: `${to}?e=${code}${next === '/account/' ? '' : `&next=${encodeURIComponent(next)}`}`,
      'retry-after': String(wait),
      'cache-control': 'no-store',
    },
  });
};

/**
 * 闸门：本次先记上，再把读数取回来跟上限比。任一条超了就把结果带回去。
 * email 传 null 表示这条路径没有可靠的邮箱（注册时表单还没校验），只走 IP 那两层。
 * 每道闸门各用各的表，登录与改密因此各算各的，不互相挤占配额。
 */
async function rateLimit(
  db: D1Database,
  ip: string,
  email: string | null,
  minute: string,
  hour: string,
  day: string
): Promise<RateHit | null> {
  const unit = unitOf(ip);
  const hourly = email ? `${email}|${ip}` : null; // 邮箱在前：同一个号的记录在表里挨着
  const daily = email ? `${ip}|${email}` : null; // IP 在前：同一台机子的记录挨着

  // 每条闸门都是一次 upsert + RETURNING 拿回计数：INSERT 建行，冲突时窗口没换就 +1、换了就重置。
  // 注意这里的 +1 与上面的建行常量 1 是**二选一**的关系（冲突才走 UPDATE 分支），
  // 千万别在 INSERT 之后再补一条 UPDATE —— 那样第一次就数到 2，上限等于少一半。
  const hit = async (sql: string, ...binds: string[]) => {
    const row = await db.prepare(sql).bind(...binds).first<{ n: number | null }>();
    return row?.n ?? 0;
  };

  const perMin = await hit(
    `INSERT INTO auth_ip_minutes (key, minute, n) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       n   = CASE WHEN minute = excluded.minute THEN n + 1 ELSE 1 END,
       minute = excluded.minute
     RETURNING n`,
    ip,
    minute
  );
  // 先判分钟层：真撞上了就不必再多写两笔
  if (perMin > IP_PER_MIN) return { src: 'min' };

  const perHour = await hit(
    `INSERT INTO auth_ip_hours (key, hour, n) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       n    = CASE WHEN hour = excluded.hour THEN n + 1 ELSE 1 END,
       hour = excluded.hour
     RETURNING n`,
    ip,
    hour
  );
  if (perHour > IP_PER_HOUR) return { src: 'hour' };

  if (unit && unit !== ip) {
    const perUnit = await hit(
      `INSERT INTO auth_ip_hours (key, hour, n) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         n    = CASE WHEN hour = excluded.hour THEN n + 1 ELSE 1 END,
         hour = excluded.hour
       RETURNING n`,
      unit,
      hour
    );
    if (perUnit > UNIT_PER_HOUR) return { src: 'unit' };
  }

  if (hourly && daily && email) {
    const perEmailIpHour = await hit(
      `INSERT INTO auth_email_ip_hours (key, hour, n) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         n    = CASE WHEN hour = excluded.hour THEN n + 1 ELSE 1 END,
         hour = excluded.hour
       RETURNING n`,
      hourly,
      hour
    );
    if (perEmailIpHour > EMAIL_IP_PER_HOUR) return { src: 'email-ip-hour' };

    const perEmailIpDay = await hit(
      `INSERT INTO auth_email_ip_days (key, day, n) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         n   = CASE WHEN day = excluded.day THEN n + 1 ELSE 1 END,
         day = excluded.day
       RETURNING n`,
      daily,
      day
    );
    if (perEmailIpDay > EMAIL_IP_PER_DAY) return { src: 'email-ip-day' };

    const perEmailHour = await hit(
      `INSERT INTO auth_email_hours (key, hour, n) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         n    = CASE WHEN hour = excluded.hour THEN n + 1 ELSE 1 END,
         hour = excluded.hour
       RETURNING n`,
      email,
      hour
    );
    if (perEmailHour > EMAIL_PER_HOUR) return { src: 'email-hour' };
  }

  return null;
}

/**
 * 顺手清掉窗口里已经没有的旧行：行上记的窗口时间戳早于窗口本身，那条记录就再也用不上了。
 * 每张表都是 key 唯一，所以一行只代表一个键的当前状态，删起来就是一路 WHERE 扫——
 * 表本来就小（只装活跃窗口），比每天多挂一条 cron 便宜。
 * 删失败绝不能连累请求：调用方一律用 ctx.waitUntil 兜着。
 */
async function dropSweep(db: D1Database, minute: string, hour: string): Promise<void> {
  const hourAgo = new Date(Date.parse(`${hour}:00Z`) - 3600000).toISOString().slice(0, 13);
  // 分钟行只留最近两分钟：分钟窗只有一分钟，留一格余量防时钟抖动
  const twoMinAgo = new Date(Date.parse(`${minute}:00Z`) - 2 * 60000).toISOString().slice(0, 16);
  await db.batch([
    db.prepare('DELETE FROM auth_ip_minutes WHERE minute < ?').bind(twoMinAgo),
    db.prepare('DELETE FROM auth_ip_hours WHERE hour < ?').bind(hourAgo),
    db.prepare('DELETE FROM auth_email_ip_hours WHERE hour < ?').bind(hourAgo),
    db.prepare('DELETE FROM auth_email_ip_days WHERE day < ?').bind(dayOf(Date.parse(`${minute}:00Z`) - 86400000)),
    db.prepare('DELETE FROM auth_email_hours WHERE hour < ?').bind(hourAgo),
  ]);
}

/** 取客户端 IP。生产上 CF 一定会带 cf-connecting-ip，x-forwarded-for 只给本地 dev 兜底：
 *  本机走 127.0.0.1 时两个头都可能没有，最后兜到固定串——本地单人开发没人抢配额。 */
const clientIp = (headers: Headers): string =>
  headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';

const nowOf = () => {
  const iso = new Date().toISOString();
  return { minute: iso.slice(0, 16), hour: iso.slice(0, 13), day: dayOf() };
};


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
  const password = String(form.get('password') ?? '');
  const captcha = String(form.get('cf-turnstile-response') ?? '') || null;
  // 回跳目标先算出来：429 与成功都要用它，而且两处必须用同一个值
  // （避免被 429 挡掉后，用户再登录成功却回不到原来那一页）。
  // 只接受站内相对路径（单个 / 开头），否则一律回 /account/ —— 不做这层就是开放重定向。
  const nextRaw = String(form.get('next') ?? '');
  const next = /^\/(?!\/)/.test(nextRaw) ? nextRaw : '/account/';

  // 空提交先挡掉，不占限流配额（否则手滑点两次空的就没得试了）
  if (!email || !password) return fail('empty');

  const ip = clientIp(request.headers);
  const { minute, hour, day } = nowOf();

  // 限流排在 Turnstile 之前：Turnstile token 是一次性的，若先验完再被 429 挡掉，
  // 用户下次提交就得重新过一遍人机验证——那比错误信息难看得多。
  const hit = await rateLimit(db, ip, email, minute, hour, day);
  if (hit) return tooMany('/login/', hit, next);

  const turn = await verifyTurnstile(captcha, secret, ip);
  if (!turn.ok) return fail(turn.error ?? 'captcha-failed');

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

  // 登录成功才清空「同一邮箱 + 同一 IP」的两条计数。
  // 单 IP 那两层不清：三个鉴权端点共用它们，清掉等于给自己开后门。
  await db
    .batch([
      db.prepare('DELETE FROM auth_email_ip_hours WHERE key = ?').bind(`${email}|${ip}`),
      db.prepare('DELETE FROM auth_email_ip_days WHERE key = ?').bind(`${ip}|${email}`),
    ])
    .catch(() => null); // 清不掉只是少一次清零，绝不能因此登录失败

  // 顺手保洁：挂在响应之后跑，不占用户等待时间
  locals.cfContext?.waitUntil?.(dropSweep(db, minute, hour).catch(() => null));

  return new Response(null, {
    status: 303,
    headers: {
      location: next,
      'set-cookie': sessionCookie(token, SESSION_MAX_AGE),
    },
  });
};
