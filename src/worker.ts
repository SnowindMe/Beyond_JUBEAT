// Worker 入口：在适配器默认的 fetch 之外，补一个 scheduled（每日 00:05 封榜）。
//
// 为什么要自己写入口：@astrojs/cloudflare/entrypoints/server 只导出 { fetch }，
// 没有 scheduled 可挂，而 cron 必须由 Worker 顶层导出。适配器的
// cloudflareConfigCustomizer 是 `main: config.main ?? 默认`，所以只要 wrangler.jsonc
// 里写明 main，就用我们这个文件；fetch 仍原样转发给适配器的 handle，
// Astro 的路由/中间件/session 全都不受影响。
//
// 定时任务只做两件事：封今日快照（含清旧数据）。日历日按北京时区算，
// 与页面读的是同一个 dayOf() —— 两侧口径一旦分叉，就会出现"任务封了 A 天、页面查 B 天"。

import handler from '@astrojs/cloudflare/entrypoints/server';
import { sealToday } from './lib/hotPage';
import type { Env } from './lib/hotStore';

const fetchHandler = (handler as { fetch: (req: Request, env: unknown, ctx: unknown) => Promise<Response> }).fetch;

export default {
  fetch: fetchHandler,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      sealToday(env).catch((e) => {
        // 任务失败不能让第二天的页面跟着崩：页面发现当天没有快照会自己补一份，
        // 这里只留日志供 wrangler tail 排查。
        console.error('sealToday failed', e);
      }),
    );
  },
};
