// Worker 入口：在适配器默认的 fetch 之外，补一个 scheduled（每日 00:05 封榜）。
//
// 为什么要自己写入口：@astrojs/cloudflare/entrypoints/server 只导出 { fetch }，
// 没有 scheduled 可挂，而 cron 必须由 Worker 顶层导出。适配器的
// cloudflareConfigCustomizer 是 `main: config.main ?? 默认`，所以只要 wrangler.jsonc
// 里写明 main，就用我们这个文件；fetch 仍原样转发给适配器的 handle，
// Astro 的路由/中间件/session 全都不受影响。
//
// 定时任务做的事：封今日快照（含清旧数据），并顺手做三件日常清理。
// 日历日按北京时区算，与页面读的是同一个 dayOf() ——
// 两侧口径一旦分叉，就会出现"任务封了 A 天、页面查 B 天"。

import handler from '@astrojs/cloudflare/entrypoints/server';
import { sealToday } from './lib/hotPage';
import { dbOf, pruneExpiredSessions, pruneRecentChanges, type Env } from './lib/hotStore';

/** recent_changes 留多久。它只在后台最近更改里给管理员看上百条，30 天足够。 */
const RECENT_KEEP_DAYS = 30;

const fetchHandler = (handler as { fetch: (req: Request, env: unknown, ctx: unknown) => Promise<Response> }).fetch;

/** 失效期比保留期短的东西在这里清。任何一条失败都不影响其它条。 */
async function cleanup(env: Env): Promise<void> {
  const db = dbOf(env);
  const nowISO = new Date().toISOString();
  const archiveBefore = new Date(Date.now() - RECENT_KEEP_DAYS * 86400000).toISOString();

  await pruneExpiredSessions(db, nowISO).catch((e) => console.error('prune sessions failed', e));
  await pruneRecentChanges(db, archiveBefore).catch((e) => console.error('prune recent_changes failed', e));
}

export default {
  fetch: fetchHandler,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // 封榜（sealToday 内部顺带清埋点行、IP 计数、过期节流键）+ 两件日常清理。
    // 原先过期会话是在每次登录时清一遍，等于把整表 DELETE 摊进登录延迟；
    // recent_changes 则从来没清过。都搬到这里，定时任务才是日内该做这事的人。
    ctx.waitUntil(
      sealToday(env).catch((e) => {
        // 任务失败不能让第二天的页面跟着崩：页面发现当天没有快照会自己补一份，
        // 这里只留日志供 wrangler tail 排查。
        console.error('sealToday failed', e);
      }),
    );
    ctx.waitUntil(cleanup(env));
  },
};
