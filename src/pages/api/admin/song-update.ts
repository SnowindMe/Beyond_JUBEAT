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
import { invalidateSongsCache } from '../../../lib/song-data';
import { handleSongUpdate } from '../../../lib/song-admin-server';
import { isMachineRequest } from '../../../lib/song-admin';

// API 端点必须标 prerender = false：本站 output 是 'static'，
// 端点默认会被当静态路由在构建期预渲染——那样它既拿不到请求体，
// 也会在 Node 预渲染环境里 import cloudflare:workers 直接崩。
export const prerender = false;

/**
 * 修订号 +1。用独立行而不是 songs 表的 MAX(rowid)，是因为曲目改成静态快照之后
 * 表里的行不再直接反映线上内容，需要一个显式的「该换缓存了」信号。
 * 失败只记日志：曲目已经存进去了，缓存过期（1 年 + 60s 修订号缓存）不该让人以为保存失败。
 */
async function bumpSongRev(db: D1Database | undefined) {
  if (!db) return;
  try {
    await db
      .prepare('UPDATE song_rev SET rev = rev + 1, changed_at = ? WHERE id = 1')
      .bind(new Date().toISOString())
      .run();
  } catch (e) {
    console.error('song_rev bump failed', e);
  }
}

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

  /* 曲目缓存 eviction —— 两件事，缺一不可：
     ① song_rev 修订号 +1：缓存 key 里带着它（见 lib/song-data.ts），
        换了号，所有 PoP 的旧边缘缓存与内存快照同时失效。
        只清本 isolate 的内存是不够的——别的 PoP 手里仍有 1 年的副本。
     ② 本 isolate 立刻清内存并删刚写过的那个 key，免得自己白等 60s 修订号缓存。 */
  if (result.status === 303 && result.location?.includes('ok=saved')) {
    await bumpSongRev(db);
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