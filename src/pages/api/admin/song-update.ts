// 曲目编辑提交：POST /api/admin/song-update
//
// 这是整个编辑面板**唯一**的写入口，也是唯一真正的防线：
//   * 未登录 → 401；已登录但 role 不在 (maintainer, owner) → 403。
//     页面里藏按钮只是不给人误点的机会，接口才拦得住直接构造的 POST。
//   * 角色复核后的全部逻辑（参数校验 / songId 存在性 / 差异比对 /
//     同事务写 songs + recent_changes）在 src/lib/song-admin-server.ts 的
//     handleSongUpdate 里——那份逻辑不依赖 Astro，CI 能直接调用验越权分支。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { invalidateSongsCache } from '../../../lib/db';
import { handleSongUpdate } from '../../../lib/song-admin-server';
import { isMachineRequest } from '../../../lib/song-admin';

// API 端点必须标 prerender = false：本站 output 是 'static'，
// 端点默认会被当静态路由在构建期预渲染——那样它既拿不到请求体，
// 也会在 Node 预渲染环境里 import cloudflare:workers 直接崩。
export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (env as { beyond_jubeat?: D1Database })?.beyond_jubeat;
  // 机器请求（curl/fetch）-> 401/403 + JSON；浏览器表单 -> 303 跳登录。
  // 判定逻辑集中在 isMachineRequest（accept: application/json 或 x-requested-with: XMLHttpRequest）。
  // 注意：curl 默认 Accept: */* 不算机器请求，验收时要显式带头（脚本里已这么写）。
  const wantsJson = isMachineRequest(request.headers);

  const result = await handleSongUpdate({
    user: locals.user,
    db: db as unknown as Parameters<typeof handleSongUpdate>[0]['db'],
    // 传函数而不是解析好的表单：越权请求连请求体都不必解析
    readForm: () => request.formData().catch(() => null),
    wantsJson,
    now: new Date().toISOString(),
  });

  // 页面读的是 lib/db.ts 的 isolate 缓存，改完必须清掉，
  // 否则 /songs/ 会继续显示旧值直到缓存过期（60s）。
  if (result.status === 303 && result.location?.includes('ok=saved')) {
    invalidateSongsCache();
  }

  const headers = new Headers({ 'cache-control': 'no-store' });
  if (result.status === 303 && result.location) {
    headers.set('location', result.location);
    return new Response(null, { status: 303, headers });
  }
  if (result.json) {
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(result.json), { status: result.status, headers });
  }
  headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(result.message ?? '', { status: result.status, headers });
};