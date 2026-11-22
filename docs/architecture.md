# 架构与运行形态

返回 [根 README](../README.md)。

## 技术栈与运行形态

Astro 7，`output: 'static'` + `@astrojs/cloudflare` 适配器，部署在 Cloudflare Workers。

**绝大多数页面在构建期预渲染成静态 HTML**，由 Workers Assets 静态资源层零开销直出。只有需要运行时数据的路径走 Worker 边缘 SSR：

- 曲目库与详情、Jubility、最近更改、首页（读 D1）
- 登录/注册/账户/管理（读会话）
- `/api/*` 全部端点

哪些路径进 Worker 由 `wrangler.jsonc` 的 `assets.run_worker_first` 决定。**漏写的表现是「本地 build 成功、线上访问却回 404」**——资源层会按 `not_found_handling = "404-page"` 直接截成 404.html，根本进不了 Worker。新增 SSR 页时必须同步加进那张表。

Worker 入口是仓库自己的 `src/worker.ts`（2026-11-03 起）。它把 `fetch` 原样转发给适配器，只在旁边多导出一个 `scheduled` 供每日封榜的 cron 使用；适配器自带的入口只导出 `fetch`，挂不了定时任务。

运行时绑定（`wrangler.jsonc`）：

| 绑定             | 类型          | 用途                                        |
| ---------------- | ------------- | ------------------------------------------- |
| `ASSETS`         | Workers Assets | 静态产物 `./dist/client`，404 交给 `404.html` |
| `AUDIO`          | R2            | 私有桶 `beyond-jubeat-data`，只读音频与数据  |
| `SESSION`        | KV            | 热度封榜快照（`hotStore`，72h TTL）           |
| `beyond_jubeat`  | D1            | 曲库、用户、热度、限流                       |

> 中间件里**不能顶层 `import { env } from 'cloudflare:workers'`**：本机预渲染走 Node（`prerenderEnvironment: 'node'`），Node 的 ESM loader 不认识 `cloudflare:` 协议，会在预渲染 `/404` 这一步崩 `ERR_UNSUPPORTED_ESM_URL_SCHEME`。改成在 SSR 分支里动态 `await import()`。同理，所有 API 端点都要标 `export const prerender = false`。

## 缓存与响应头

**站点自己设的缓存分三层**：

1. Worker 内 isolate 级内存缓存：`src/lib/song-data.ts` 的曲库快照 + 60s 的 `song_rev` 修订号（后台改曲会把修订号 +1，快照随即失效），`src/lib/db.ts` 的最近更改则故意不缓存——改一条要立刻看见
2. 中间件边缘缓存，只对白名单路径、只对 GET、**带 `Set-Cookie` 的绝不入库**（`src/middleware.ts`）。首页与 `/songs/frag` 还要看登录态，行长时绕过。**非 200 不入库但也不重渲**：快照带着原本的 status 直接交出去（2026-11-12 前的写法是遇到非 200 就再 `next()` 一次，第二次渲染会把 `Astro.response.status=404` 吃掉，表现为不存在的 songId 回 200 + 404 页）
3. BGM 反代进 `caches.default`，缓存完整 200，Range 由缓存字节本地切 206；Range 未命中时先透传，**6 秒后**在 `waitUntil` 里补一份整份缓存（延迟 + 单飞，不抢首播带宽）

**音频来源顺序是 缓存 → R2 → 上游**：国服音乐魔方代那批原文件已搬进 R2（`beyond-jubeat-data/public/songs/<id>.mp3`，与数据同桶、`AUDIO` 绑定只读），命中就直接从 R2 流出去并 `tee` 一份进边缘缓存，下一跳起就是 HIT。R2 没对象（其余一千多首）照旧回落到 ub.thregren.world，回退路径一行没删。R2 那条的 `content-type` 固定 `audio/mpeg`——传对象时必须按扩展名给，否则默认的 `application/json` 会被 `<audio>` 当成未知类型。

**音源预热**（2026-11-18）：详情页在空闲时（requestIdleCallback，兜底 2.5s）发一个 `Range: bytes=0-0` 的请求，指针悬停/聚焦播放键时也会先建 `Audio`（只取文件头）。Worker 拿到 R2 对象后是**整份** tee 进边缘缓存的，所以这一发 1 字节等于把后面的分段请求全变成 HIT，而浏览器只花 1 字节；失败一律静默。

> 流式响应要进 `caches.default`，壳里**必须同时带 `content-length` 与 `cache-control`**。缺 `content-length` 会退回 chunked 存储、HEAD 拿不到长度；缺 `cache-control` 则 TTL 取 0，写进去下一毫秒就过期——两层都要有，否则表现为「在库里但永远 MISS」。

`public/_headers` 管静态资源头，**但 CF 的 `_headers` 不作用于 Worker 生成的响应**，所以 SSR 页与 API 的头由 `src/lib/csp.ts` 在中间件里补，两份值必须逐字一致、同时改。

`_headers` 是**逐条命中、同名头累加**，不是后写覆盖：`/assets/images/x` 同时命中 `/assets/*` 与 `/assets/images/*` 会回两个 `Cache-Control`。所以长缓存只留一条 `/assets/*`。通配符写单星号，`/assets/**` 会让整条规则失效。

**首屏曲绘**（2026-11-13）：`/songs/` 在 `<head>` 里给前 8 张曲绘发 preload，走 `Base.astro` 的 `<slot name="head">`；列表由 `songs.astro` 的 `PRELOAD_JACKETS` 从 EAGER 那 18 首里现算。**地址必须与 SongCard 的 src 逐字一致**，差一个字符浏览器就当两个 URL、图会被下载两次。取 8 张而不是 18 张：首屏可见的只有最上面两三行，更多的 preload 会和世代底图 / 字体抢同一条慢链路。

`public/sw.js` 的静态资源失败兜底也一起修了：原来 `fetch(...).catch(() => hit)` 里的 `hit` 在这个分支一定是 undefined，`respondWith(undefined)` 等于「没有响应」，浏览器直接判失败、图变破图且不重试。现在退 250ms 重取一次，两次都失败才回 504。

CSP 目前是 **Report-Only**（只报不拦），报告发到 `/api/csp-report`，只摘六个字段打 `console.log('[csp]')`，不落库——违规量是「改一次内联脚本冒几条」级别，先看 `wrangler tail`。**跨源类违规清零后**才去掉头名里的 `-Report-Only`。逐项放行理由写在 `_headers` 顶部注释里，收口时逐行对着删。

## 曲绘托管

曲绘（1269 首曲 + 1 张国服占位的映射，其中 `U'nit` 9 首共用同一张占位图）存在公益图床 <https://tc.mofashi.ltd> 的源站，但**页面不直连它**：一律取 `src/data/cdn.json` 的映射走同源反代 `/api/jacket/<规范名>`（见 `src/pages/api/jacket/[name].ts`），映射里没有的才回退 `/assets/images/jackets/<规范名>`。读取一律走 `src/lib/covers.ts` 的 `jacketUrl()`，模板里不再出现硬编码路径。

**为什么要反代（2026-11-16）**：图床没有防盗链开关，跨境直连单张 p50 也要 356ms、48 张并发在浏览器里排队 8 秒以上（移动端实测 load 8.9s），它给的缓存只有 5 小时。反代把这两件事都挪到边缘：`s-maxage=2592000` 缓存一个月、命中后不再回源；防盗链判 Referer（无 Referer 放行、解析不出拒、host 必须是本站或本机），不合规直接 403 且**不查也不写缓存**——热链多了也不会把本站的缓存位顶成 403。只代理 free-img 一个主机，目标路径由服务端从映射表拼，不接用户传入的 URL。

**缓存写入必须挂 `waitUntil`**：`cache.put` 既不能 `await`（整张图要等落盘才回，白搭一次往返），也不能裸调不接（响应一交出去、这次请求就被判结束，put 被掐掉，于是每次都 MISS、每次都回源）。做法与 `src/middleware.ts`、`api/audio/[songId].ts` 一致：交给 `locals.cfContext.waitUntil`，请求生命周期撑到写盘结束，但不占本次响应耗时。改前 8 并发 16 张 p50 1877ms、同批二次请求仍全 MISS；改后同批二次请求 p50 1348ms、单张连打三次 146/258/286ms。

**规范名 = `id<歌id>.webp`**。本地文件、`songs.cover`、映射键、CDN 落盘名四处同名，换床或回滚能逐条对上；`U'nit` 的占位 id 形如 `idunit-001.webp`，反代白名单 `NAME_OK` 已放行（另有国服占位 `idph-cn.webp`）。

- 上传用 `node scripts/cdn-jackets.cjs`：按 `songs.json` 顺序补缺、逐张写映射、把本地原图 rename 进 `archive/materials/jackets/`（本地留档，不入库）。配额与断点存 `.cdn-quota.json`。
- 图床三道闸：**1200 张/天、600 张/小时、120 张/分钟**，脚本按 1200/590/115 自我节流；限流（42900）不计失败，推窗口后退避重抓同一张。`42216` 是并发写库抖动，重试即过。
- 映射命中前不要删本地图，否则页面回退到 404。CSP 的 `img-src` 仍放行 `https://free-img.400040.xyz`（Report-Only）——正常路径已用不上，留着是给反代缓存与转发都异常时那次 302 回退兜底。

### 品牌资源版本

图片扩展名的 `Cache-Control` 曾被上一跳（腾讯 EdgeOne）统一压成 3600，已于 2026-11-01 改为遵循源站。但**已被缓存的旧图不随部署失效**——这就是「明明换了 favicon 却看不到」的真凶。所以换图标只能靠 URL 变化：品牌资源一律带 `?v=N`，改图时 `Base.astro` 四处图标链接、`Header.astro` 与 `index.astro` 的品牌图、`manifest.webmanifest` 三个 icons、`sw.js` 的 `ASSET_V` 四处同改并把 N 加一。

`manifest.webmanifest` 自身与 `sw.js` 都必须 `max-age=0, must-revalidate`（前者列着带 `?v=N` 的 icons，缓存住会让换图标不生效；后者长缓存会让旧 SW 永远不更新）。

zone 的 `browser_cache_ttl` 已设为 **0**（Respect Existing Headers）。原值是 14400，会把源站的 `max-age=300` 顶成 4 小时，日更的运势与热榜零点后还被压住。
