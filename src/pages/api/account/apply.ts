// 维护者自荐：POST /api/account/apply
//
// 主人 2026-10-23 定的规则：维护者由玩家自己推荐，站长审批。
// 一次只允许一条 pending（靠 schema 里的部分唯一索引保证，并发也不会重复）。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const MIN_REASON = 20;
const MAX_REASON = 800;


// API 端点必须标 prerender = false：本站 output 是 'static'，
// 端点默认会被当静态路由在构建期预渲染——那样它既拿不到请求体，
// 也会在 Node 预渲染环境里 import cloudflare:workers 直接崩。
export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(null, { status: 303, headers: { location: '/login/?next=/account/' } });

  const db = (env as { beyond_jubeat?: D1Database })?.beyond_jubeat;
  if (!db) return new Response('D1 binding missing', { status: 500 });

  // 已是维护者/站长就没必要申请
  if (user.role !== 'player') {
    return new Response(null, { status: 303, headers: { location: '/account/?e=no-permission' } });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return new Response(null, { status: 303, headers: { location: '/account/?e=bad-form' } });

  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return new Response(null, { status: 303, headers: { location: '/account/?e=bad-reason' } });
  }

  const now = new Date().toISOString();

  // 被驳回后要冷静几天再提：防止刷申请打扰站长。
  //
  // schema 里也有 idx_role_req_pending 这个部分唯一索引兜底：
  // 即使这里是两个请求同时通过检查，插入时也会被数据库挡下（catch 里归到 already-applied）。
  const rejected = await db
    .prepare(
      `SELECT created_at FROM role_requests
        WHERE user_id = ? AND state = 'rejected' AND created_at >= ?`
    )
    .bind(user.id, new Date(Date.now() - 7 * 86400000).toISOString())
    .first()
    .catch(() => null);
  if (rejected) {
    return new Response(null, { status: 303, headers: { location: '/account/?e=applied-recently' } });
  }

  try {
    await db
      .prepare(
        `INSERT INTO role_requests (user_id, want_role, reason, state, created_at)
         VALUES (?, 'maintainer', ?, 'pending', ?)`
      )
      .bind(user.id, reason, now)
      .run();
  } catch {
    return new Response(null, { status: 303, headers: { location: '/account/?e=already-applied' } });
  }

  return new Response(null, { status: 303, headers: { location: '/account/?ok=applied' } });
};
