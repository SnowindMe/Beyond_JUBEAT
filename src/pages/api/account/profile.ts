// 修改昵称：POST /api/account/profile
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';


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

  const name = String(form.get('name') ?? '').trim();
  if (name.length < 1 || name.length > 24) {
    return new Response(null, { status: 303, headers: { location: '/account/?e=bad-name' } });
  }

  await db
    .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE user_id = ?')
    .bind(name, new Date().toISOString(), user.id)
    .run();

  return new Response(null, { status: 303, headers: { location: '/account/?ok=profile' } });
};
