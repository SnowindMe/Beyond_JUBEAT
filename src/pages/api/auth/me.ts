// 当前登录态查询：GET /api/auth/me
//
// 为什么需要这个接口：本站绝大多数页面是构建期预渲染的静态 HTML，
// 生成时没有会话，所以顶栏渲染出来永远是「登录」。
// 客户端脚本加载后调这个接口，把顶栏换成「昵称 / 我的账户」。
// 只回最小信息（不带邮箱），因为它对任何同源页面可见。
import type { APIRoute } from 'astro';

// 见 register.ts 的说明：端点必须标 SSR，否则会被预渲染。
export const prerender = false;

export const GET: APIRoute = ({ locals }) => {
  const u = locals.user;
  if (!u) {
    return new Response(JSON.stringify({ user: null }), {
      headers: {
        'content-type': 'application/json',
        // 登录态不能给边缘/浏览器缓存，否则一个人登录后别人也看到他的昵称
        'cache-control': 'private, no-store',
      },
    });
  }
  return new Response(
    JSON.stringify({ user: { name: u.name, role: u.role, staff: u.role !== 'player' } }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } }
  );
};
