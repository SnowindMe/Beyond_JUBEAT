// 站长审批维护者自荐：POST /api/admin/decide
//
// 关键：审批是「改 role」这种高权限动作，必须在服务端复核身份——
// 不能只靠 /admin/ 页面里藏按钮（按钮只是不给点的机会，接口才是防线）。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isOwner } from '../../../lib/auth';


// API 端点必须标 prerender = false：本站 output 是 'static'，
// 端点默认会被当静态路由在构建期预渲染——那样它既拿不到请求体，
// 也会在 Node 预渲染环境里 import cloudflare:workers 直接崩。
export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(null, { status: 303, headers: { location: '/login/?next=/admin/' } });

  // 只有站长能审批：维护者进得了 /admin/，但点不了这个动作
  if (!isOwner(user)) {
    return new Response(null, { status: 303, headers: { location: '/admin/?e=no-permission' } });
  }

  const db = (env as { beyond_jubeat?: D1Database })?.beyond_jubeat;
  if (!db) return new Response('D1 binding missing', { status: 500 });

  const form = await request.formData().catch(() => null);
  if (!form) return new Response(null, { status: 303, headers: { location: '/admin/?e=bad-form' } });

  const requestId = Number(form.get('request_id'));
  const action = String(form.get('action') ?? '');
  if (!Number.isInteger(requestId) || (action !== 'approve' && action !== 'reject')) {
    return new Response(null, { status: 303, headers: { location: '/admin/?e=bad-form' } });
  }

  // 只处理 pending：重复点「通过」不会把别的状态改乱
  const req = await db
    .prepare("SELECT user_id, state FROM role_requests WHERE request_id = ?")
    .bind(requestId)
    .first<{ user_id: string; state: string }>();
  if (!req) return new Response(null, { status: 303, headers: { location: '/admin/?e=not-found' } });
  if (req.state !== 'pending') {
    return new Response(null, { status: 303, headers: { location: '/admin/?e=not-pending' } });
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    // 用 batch 保证「改 role」与「改申请状态」一起成功或一起失败
    await db.batch([
      db
        .prepare("UPDATE users SET role = 'maintainer', updated_at = ? WHERE user_id = ?")
        .bind(now, req.user_id),
      db
        .prepare(
          `UPDATE role_requests
              SET state = 'approved', decided_at = ?, decided_by = ?
            WHERE request_id = ? AND state = 'pending'`
        )
        .bind(now, user.id, requestId),
    ]);
    return new Response(null, { status: 303, headers: { location: '/admin/?ok=approved' } });
  }

  const note = String(form.get('note') ?? '').trim().slice(0, 200) || null;
  await db
    .prepare(
      `UPDATE role_requests
          SET state = 'rejected', decided_at = ?, decided_by = ?, decision_note = ?
        WHERE request_id = ? AND state = 'pending'`
    )
    .bind(now, user.id, note, requestId)
    .run();
  return new Response(null, { status: 303, headers: { location: '/admin/?ok=rejected' } });
};
