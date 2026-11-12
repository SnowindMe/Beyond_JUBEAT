# Beyond_JUBEAT

jubeat（音乐魔方）中文资料站。收录日服 12 个世代与国服 1 个世代的曲库、谱面定数、Jubility 理论值与世代沿革。

![deploy](https://img.shields.io/badge/Cloudflare_Workers-live-F38020) ![astro](https://img.shields.io/badge/Astro-7.4-ff5d01) ![repo](https://img.shields.io/badge/GitHub-Beyond__JUBEAT-181717)

线上：<https://wiki.byd-ub.top> · 备用：<https://beyond-jubeat.1945743455.workers.dev>

---

## 这是什么

一个资料查询站，不是游戏本体。主要内容：

| 页面                                         | 做什么                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/`                                          | 首页。世代主题 Hero、站点链接、站点标识区（今日运势与热门歌曲 2026-11-12 起下线，见下文）                   |
| `/songs/`                                    | 曲目库。日服/国服切换、分区与世代分组、搜索、难度档 / 定数区间 / 谱面类型 / 世代筛选、限时曲开关、六种排序 |
| `/songs/[songId]/`                           | 曲目详情。曲绘、定数与难度参照系、谱面密度条、BGM 试听                                                     |
| `/jubility/`                                 | Jubility 层级页。理论值、12 档阶梯、公式与口径                                                             |
| `/recent/`                                   | 最近更改。维护者编辑记录与前后差异                                                                         |
| `/login/` `/register/` `/account/` `/admin/` | 用户系统与维护者面板                                                                                       |

站点用 **16 套世代主题**（配色 + 字体 + 背景图，随世代切换，选择存 localStorage）。主题挂在世代名下，但两者不是一回事：**世代 13 个是数据口径**（曲库归属），主题 16 套是视觉口径（`clan` 一个世代拆成红蓝绿紫 4 套）——要数就取各自的 `length`（`src/lib/gens.ts` / `src/lib/themes.ts`），别手抄。

规模：**1248 首曲目 / 3744 张谱面**，其中日服 1151 首、国服 534 首（同一首可双服上线）。数据截至国服 2026-10 更新表。

## 技术栈与运行形态

Astro 7，`output: 'static'` + `@astrojs/cloudflare` 适配器，部署在 Cloudflare Workers。

**绝大多数页面在构建期预渲染成静态 HTML**，由 Workers Assets 静态资源层零开销直出。只有需要运行时数据的路径走 Worker 边缘 SSR：

- 曲目库与详情、Jubility、最近更改、首页（读 D1）
- 登录/注册/账户/管理（读会话）
- `/api/*` 全部端点

哪些路径进 Worker 由 `wrangler.jsonc` 的 `assets.run_worker_first` 决定。**漏写的表现是「本地 build 成功、线上访问却回 404」**——资源层会按 `not_found_handling = "404-page"` 直接截成 404.html，根本进不了 Worker。新增 SSR 页时必须同步加进那张表。

Worker 入口是仓库自己的 `src/worker.ts`（2026-11-03 起）。它把 `fetch` 原样转发给适配器，只在旁边多导出一个 `scheduled` 供每日封榜的 cron 使用；适配器自带的入口只导出 `fetch`，挂不了定时任务。

> 中间件里**不能顶层 `import { env } from 'cloudflare:workers'`**：本机预渲染走 Node（`prerenderEnvironment: 'node'`），Node 的 ESM loader 不认识 `cloudflare:` 协议，会在预渲染 `/404` 这一步崩 `ERR_UNSUPPORTED_ESM_URL_SCHEME`。改成在 SSR 分支里动态 `await import()`。同理，所有 API 端点都要标 `export const prerender = false`。

## 本地开发

需要 Node 22+ 与本机可用的 `wrangler` 授权（改线上数据时要登录）。

```bash
npm ci                   # 装依赖
npm run db               # 重建本地曲库（首次必须，或从别人那里拿一份 data/jubeat.db）
npx astro dev --port 4321
```

### 本地 D1 必须先灌

`npm run dev` 用的是本地持久化 D1，**空库会让 `/songs`、`/recent` 直接 500**（`D1_ERROR: no such table`）。第一次起站前跑：

```bash
npx wrangler d1 execute beyond-jubeat --local --file=db/schema.sql
npx wrangler d1 execute beyond-jubeat --local --file=db/seed.sql
```

⚠️ 别跟着 `astro.config.mjs` 的 `persistState` 路径加 `--persist-to E:/tmp/...`：那是 miniflare 的缓存与 DO 存储，dev server 的 D1 实际落在 `.wrangler/state/v3/d1/`，灌到别处等于没灌。不加 `--persist-to` 才是同一个位置。

`db/schema.sql` 开头有 `DROP TABLE songs`，重灌无副作用。它已含用户系统、热度计数与鉴权限流的全部表，不需要再单独跑迁移文件。

查本地库用 `node:sqlite`，比 `wrangler d1 execute` 快得多（后者每次启动 workerd，动辄十几秒）：

```bash
node -e "const D=require('node:sqlite');const db=new D.DatabaseSync('<库文件>',{readOnly:true});console.log(db.prepare('SELECT count(*) FROM songs').get())"
```

### 本机 workerd 的两个坑

适配器自带的 miniflare/workerd 在这台 Windows 上会在启动阶段崩：

```
Fatal uncaught kj::Exception: kj/filesystem-disk-win32.c++:773: failed: CreateDirectory: #5 拒绝访问。; path = miniflare-email-store
```

1. **构建期预渲染**：默认用 workerd 跑预渲染，上面这条直接让 `npm run build` 挂掉。解法是 `astro.config.mjs` 的 `prerenderEnvironment: 'node'`，改用 Node 跑，产物完全一致，云端（Linux）不受影响。
2. **dev server 启动**：未配 `persistState` 时同一崩溃落在 `npm run dev` / `npm run preview` / `npx wrangler dev` 的启动阶段——miniflare 在 `os.tmpdir()` 建临时目录，workerd 要在里面建 DO 存储目录被权限拒绝（设 `TEMP`/`TMPDIR`、手动建空目录都无效）。现在配置里写了 `persistState.path`，把存储挪到自带完全控制权的盘就绕过去了。

### 验本地站的三个约定

- **`curl` 必须带 `--noproxy '*'`**：本机环境变量里有代理，不加会把 `localhost:4321` 甩去代理回 `000`，看着像服务没起（其实在 `netstat` 里正常 LISTENING）。dev 只监听 `::1`，要用 `localhost` 而不是 `127.0.0.1`。
- **首页、`/songs/`、`/jubility/`、`/recent/` 走中间件边缘缓存**，看响应头 `x-jb-cache`：`HIT` 是缓存命中、`STALE` 是陈旧兜底、没有这个头才是真渲染。改完模板看不见效果时，带一个 `Cookie: jb_session=x` 绕过缓存，别急着改代码。
- **`CF-Connecting-IP` 在本机会被拦成 403**（`error code: 1000`）。要冒充来源 IP 验限流，改用 `X-Forwarded-For`——取 IP 的代码本来就是 `cf-connecting-ip ?? x-forwarded-for`。

### dev server 在带代理的环境里

带 `HTTP_PROXY`/`ALL_PROXY` 启动会 `read ECONNRESET`：`fetchWorkerExportTypes` 要 fetch `http://localhost/__vite_plugin_cloudflare_get_export_types__`，被 undici 的 EnvHttpProxyAgent 塞进了代理。用 `env -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY` 启动才稳。

## 项目结构

```
src/
├─ pages/
│  ├─ index.astro            首页（SSR：为将来恢复运势/热榜保留）
│  ├─ songs.astro            曲目库（SSR：双服切换 / 分区 / 搜索 / 筛选 / 排序）
│  ├─ songs/frag.astro       曲目分段端点（SSR：供曲目库懒加载）
│  ├─ songs/[songId].astro   曲目详情（SSR：按 song_id 查单行）
│  ├─ jubility.astro         Jubility 层级页（SSR：现算理论值）
│  ├─ recent.astro           最近更改（SSR：查 recent_changes）
│  ├─ login / register / account / admin / admin/songs/
│  ├─ api/                   auth · account · admin · audio · hot · csp-report
│  └─ 404.astro
├─ components/               Hero / SongCard / GenBlock / Fortune / HotBoard /
│                            SongAudio / BootScreen / Header / ThemeScript / …
├─ layouts/Base.astro        全站外壳（.wrap 撑满一屏、main 吃掉剩余高度，内容不满时页脚贴底）
├─ middleware.ts             会话 cookie → locals.user、边缘缓存、限流前置
├─ worker.ts                 Worker 入口（fetch 转发 + scheduled）
├─ styles/                   theme · songs · fortune · jubility · auth · server-card
├─ lib/                      数据访问、认证、缓存、主题/世代表、算法
└─ data/                     生成物：曲库快照、聚合数据、映射表
public/                       _headers · manifest · sw.js · assets（背景/曲绘/站标/字体）
data/                         管线输入（xlsx 源表、上游快照）与本地库
db/                           schema · seed · 迁移 · 增量补丁
scripts/                      构建、抓取、CI 自检
docs/                         统计口径、库表说明、管线、站点结构、审计记录
```

## 脚本

| 命令            | 作用                                                             |
| --------------- | ---------------------------------------------------------------- |
| `npm run dev`   | 本地开发服务器                                                   |
| `npm run build` | 生成难度统计、拆分谱面数据、构建戳、SEO 文件，然后 `astro build` |
| `npm run db`    | 重建曲库：xlsx 解析 → `data/jubeat.db` → 站点 JSON               |
| `npm run patch` | 对比 HEAD 的 seed 与当前 seed，只把改动行写进 `db/patch.sql`     |
| `npm run data`  | 只重生成 `src/data/` 的聚合数据与曲绘                            |
| `npm run check` | 八段自检，任何一段红都不能放行                                   |
| `npm run opt`   | 压缩 `public/assets/images` 下的图片                             |

**改曲库不要手改 `data/jubeat.db`**：换 `data/xlsx/source.xlsx` 或 `data/upstream/*.json`，跑 `npm run db`，再跑 `npm run patch` 把生成的补丁灌进 D1。

**改主题色是一处改七件 `theme.css` 令牌**（`--acc` `--focus` `--acc2` `--ink2` `--ink3` `--edge` `--glass` 一套），外加 `lib/themes.ts` 里的色点 `c`。只改 `--acc` 会留下半套旧色系。改完必须跑 `node scripts/ci/check-contrast.mjs`——它是唯一会拦住「强调色对比度不足 3:1」的关口。

⚠️ 主题相关的表必须写成 `html[data-g="x"][data-g]`。`check-contrast.mjs` 取每个主题**第一个** `html[data-g="x"]{` 块，同形选择器写在前面的会被抢先命中，取到只有一两个变量的空块、令牌全回退 `:root`，17 组断言全按深色算——**这是假绿灯，比红灯危险**。

## 数据管线

```
data/xlsx/source.xlsx ─parse→ data/xlsx/sheet*.json ─┐
data/upstream/*.json ──────────────────────────────┼→ data/jubeat.db → src/data/*.json
                                                    ┘        ↓
                                                        db/seed.sql（全量）
                                                        db/patch.sql（增量，灌线上用）
```

`data/jubeat.db` 是本地权威曲库（约 580 KB，生成物、不入库，`npm run db` 随时重建，不需要网络）。线上真实数据在 Cloudflare D1 库 `beyond-jubeat`，内容与之一致。

**日常改线上数据用 `npm run patch` 生成的增量补丁，不要重放 `db/seed.sql`**——后者会 `DELETE FROM songs` 再整表插入。细节见 [docs/data-pipeline.md](docs/data-pipeline.md)。

抓取类脚本需要联网，**不进 build 流程**，曲库更新后手动重跑并提交产物：

- `scripts/ub/build-ub-audio.cjs` → `src/data/ub-audio.json`（BGM 映射，1248 首命中 1219 首、97.7%；未命中 29 首是上游确实没有的国服独占曲与两首 BTA- 占位曲。上游「音乐魔方」目录的音频改成带内容哈希的文件名 `bgm.<hash>.ogg`，脚本按上游返回的 assets 原样取值，不影响匹配方式）
- `scripts/ub/build-ub-charts.cjs` → 谱面密度数据，再由 `split-ub-charts.cjs` 拆成每首一个静态 JSON；**密度条画之前必须校验键数**（算出的键数要与库里的官方物量相等，否则不画——实测 3744 个档位里有 251 档上游根本没有谱面文件，宁可少一张图也不给自相矛盾的图。定数不作为判据，库里的定数是官方的，ub 那栏标签会滞后）

## 用户系统

四层身份：**游客**（只读）/ **玩家**（注册即得）/ **维护者**（自荐 + 站长审批）/ **站长**（在 D1 里直接改 `role`，站点不提供提权入口）。邮箱 + 密码注册，不发验证邮件，邮箱只作登录名。

| 项       | 做法                                                                     | 为什么                                                         |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 密码     | PBKDF2-SHA256，每用户独立盐，迭代次数写进 hash 串                        | 不存明文；将来提强度时老用户下次登录自动重算                   |
| 会话     | cookie 放随机 token，库里只存 SHA-256                                    | 库被拖走也拿不到能直接用的 cookie                              |
| cookie   | `HttpOnly; SameSite=Lax; Secure`                                         | 挡 XSS 窃取与跨站 POST 类 CSRF                                 |
| 登录枚举 | 邮箱不存在也跑一次假 hash                                                | 响应时间一致，不能靠耗时探测注册与否                           |
| 改密     | 验旧密码 + 清空该用户全部会话                                            | 防 cookie 被盗后直接改密锁人                                   |
| 人机验证 | Turnstile，secret 走 `wrangler secret`，缺 secret 时生产 fail-closed     | 宁可拒绝也不裸奔                                               |
| 回跳     | `?next=` 只接受单个 `/` 开头的站内路径                                   | 不做就是开放重定向                                             |
| 限流     | 每 IP 10/分、200/时、IPv4 前三段 1000/时；登录另加邮箱维度 20/时、200/天 | 单行 upsert + `CASE WHEN` 换窗 + `RETURNING`，一次往返完成计数 |

限流排在 Turnstile **之前**：Turnstile token 是一次性的，先验人机再被 429 挡掉，用户要重新过一遍挑战。超限回 429 + `retry-after`，文案走 `auth-messages.ts`。

静态页没有会话（构建期生成时无人登录），所以**不要在静态页里写死按用户变化的文案**。登录态由 `/api/auth/me` + Header 内联脚本在客户端升级成账户菜单。

> 约定：被 JS 接管、点击后不导航的 `<a>` 必须带 `data-boot-skip`。BootScreen 的监听器挂在 `document` 的 capture 阶段，看到 href 还在就当「要跳走了」而亮进度条。

## 首页的两块运行时内容（2026-11-12 起下线）

**现状**：主人 2026-11-12 说「【今日运势】和【热门歌曲】先隐藏了，以后可能换个实现」，两块已从首页摘掉。组件（`src/components/Fortune.astro`、`HotBoard.astro`）、样式（`styles/fortune.css`、`styles/hot.css`）、数据层（`lib/hotPage.ts`、`lib/hot.ts`、D1 埋点、KV 快照、`scripts/ci/check-fortune-dist.mjs`）全部原样保留，恢复时把 `src/pages/index.astro` 里注释掉的 import 与 `<div class="fh-split">` 取消注释即可。下面两段是下线前的实现记录，留着供换实现时参考。

**今日运势**：种子 = 日期 + 访客（游客恒为 `guest`，所以可被边缘缓存）。一天一个运气值（0–120，页面印在卡上并画成刻度尺），三首由它派生：运气越好越可能抽到挑战难度，三首的评价要求也整体抬高（第 1 首比运气低一级、第 3 首高一级，两端截平）。3 级以下的谱面会把要求再往上抬一格到两格（低等级的谱不难，用高评价补回份量）。候选**从各服自己的曲库里按日哈希摊开抽**，不走热榜；日服与国服除了运气值相同以外，歌曲、难度、达成评价都可以不同。评级图是 `public/assets/images/grade/*.webp`。

手气分布与两条联动判据由 `scripts/ci/check-fortune-dist.mjs` 把守（`npm run check` 末段），改采样、改阈值、改档位权重都要重跑它。

**热门歌曲**：前 25 名滚动榜，整块可点（行内绝对定位的链接层，读屏名只有曲名）。热度口径是**独立听众数**，一人一曲一天只算一次（主键 `(day, song_id, visitor)` + `INSERT OR IGNORE`），埋点在 `SongAudio.astro`：真出声满 8 秒才打点，暂停即作废。

窗口是**游标不是实时**：每天 00:05（UTC `5 16 * * *`）把「昨天为末日的前 7 天」封成快照，当天全天读这一份，所以榜天然滞后一小时，当场刷量刷不动。窗口内**不同曲数**不足 6 首时快照标记 `seeded=1`，页面降级成新曲推荐（判据是曲数不是行数：每曲听众几乎恒等于 1，按行数等于要求 6 首以上不同的曲；阈值 6 是按实际流量定的，7 天窗口一周也就十几首）。名次按行序重排，不直接信快照里的绝对名次（曲库删除会留下孤儿 id、名次跳号）。

冷启动的空态是**空态不是坏掉**：右栏这时只剩一行提示，比左侧矮 193px。修法是把提示块本身撑高居中当整块的空态，不是给面板补 padding（`.fh-hot:has(.fh-note){padding-bottom}` 会被 `.fh` 的 `padding` 简写整条盖掉）。

## 缓存与响应头

**站点自己设的缓存分三层**：

1. Worker 内 isolate 级内存缓存：`src/lib/song-data.ts` 的曲库快照 + 60s 的 `song_rev` 修订号（后台改曲会把修订号 +1，快照随即失效），`src/lib/db.ts` 的最近更改则故意不缓存——改一条要立刻看见
2. 中间件边缘缓存，只对白名单路径、只对 GET、**带 `Set-Cookie` 的绝不入库**（`src/middleware.ts`）。首页与 `/songs/frag` 还要看登录态（运势用 `user.id` 当种子），行长时绕过
3. BGM 反代进 `caches.default`，只缓存完整 200，Range 由缓存字节本地切 206

> 流式响应要进 `caches.default`，壳里**必须同时带 `content-length` 与 `cache-control`**。缺 `content-length` 会退回 chunked 存储、HEAD 拿不到长度；缺 `cache-control` 则 TTL 取 0，写进去下一毫秒就过期——两层都要有，否则表现为「在库里但永远 MISS」。

`public/_headers` 管静态资源头，**但 CF 的 `_headers` 不作用于 Worker 生成的响应**，所以 SSR 页与 API 的头由 `src/lib/csp.ts` 在中间件里补，两份值必须逐字一致、同时改。

`_headers` 是**逐条命中、同名头累加**，不是后写覆盖：`/assets/images/x` 同时命中 `/assets/*` 与 `/assets/images/*` 会回两个 `Cache-Control`。所以长缓存只留一条 `/assets/*`。通配符写单星号，`/assets/**` 会让整条规则失效。

CSP 目前是 **Report-Only**（只报不拦），报告发到 `/api/csp-report`，只摘六个字段打 `console.log('[csp]')`，不落库——违规量是「改一次内联脚本冒几条」级别，先看 `wrangler tail`。**跨源类违规清零后**才去掉头名里的 `-Report-Only`。逐项放行理由写在 `_headers` 顶部注释里，收口时逐行对着删。

### 品牌资源版本

图片扩展名的 `Cache-Control` 曾被上一跳（腾讯 EdgeOne）统一压成 3600，已于 2026-11-01 改为遵循源站。但**已被缓存的旧图不随部署失效**——这就是「明明换了 favicon 却看不到」的真凶。所以换图标只能靠 URL 变化：品牌资源一律带 `?v=N`，改图时 `Base.astro` 四处图标链接、`Header.astro` 与 `index.astro` 的品牌图、`manifest.webmanifest` 三个 icons、`sw.js` 的 `ASSET_V` 四处同改并把 N 加一。

`manifest.webmanifest` 自身与 `sw.js` 都必须 `max-age=0, must-revalidate`（前者列着带 `?v=N` 的 icons，缓存住会让换图标不生效；后者长缓存会让旧 SW 永远不更新）。

zone 的 `browser_cache_ttl` 已设为 **0**（Respect Existing Headers）。原值是 14400，会把源站的 `max-age=300` 顶成 4 小时，日更的运势与热榜零点后还被压住。

## 检查与 CI

`npm run check` 八段，顺序固定：引用完整性（源码）→ 引用完整性（dist）→ 曲目编辑越权/参数校验 → 对比度自检（脚本报 17 套：16 条主题表 + `:root` 默认）→ 库表与文档的列一致 → 搜索键上限 → 技法覆盖 → 运势分布与两条联动判据。

任何一段红都不能放行。对比度脚本输出的是公式理论值（不含背景图），验收仍以实机渲染为准——它只作回归护栏。真实渲染链有四层（`--base` → 背景底图 → `--veil` → 顶部 `--scrim`），只读 `getComputedStyle` 的 `backgroundColor` 会漏掉底图。

`.github/workflows/build-check.yml` 在每次 push / PR 上跑 `npm ci` → 重建本地曲库 → `npm run build` → `npm run check`。**check 与 build 顺序不能换**（第二次 check-refs 正是要扫 dist）。干净 clone 里没有 `data/jubeat.db`（它被 `data/.gitignore` 挡在版本库外），所以 CI 里按管线重建，约 3 秒、不需要网络。

## 部署

push 到 main，Cloudflare 的 Git 集成自动构建 + 部署（`wrangler.jsonc` 的 `main` 是 `src/worker.ts`，`assets.directory` 是 `./dist/client`）。

**上线前必须先跑的迁移**（都是幂等的 `IF NOT EXISTS` / `IF EXISTS`，与 `db/schema.sql` 里对应的建表段逐字同源）：

```bash
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-users.sql  # 用户系统
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-hot.sql    # 热度打点：漏跑则 /api/hot/hit 500
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-auth.sql   # 鉴权限流：漏跑则登录/注册/改密全 500
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-p0.sql     # 限流计数表 + 删冗余索引
```

新开一份迁移要同时改 `db/schema.sql` 的对应段落，两份别分叉——本地靠 schema 一次建全，线上只能一条条跑迁移。

**不要拿 `db/schema.sql` 对线上跑**，它开头有 `DROP TABLE songs`。

四份都已于 2026-11-04 在线上跑过（鉴权五表与热度计数三表均已存在，`idx_hot_hits_day_song` 已删）。当时 wrangler 没登录，走的是 Cloudflare MCP 的 D1 query 通道；`wrangler d1 execute --remote` 需要先 `npx wrangler login`。**已上线的库不会因为 schema.sql 改了而自己补表**，换环境或回滚后重跑这四条是常规动作。

Turnstile secret 用 `npx wrangler secret put TURNSTILE_SECRET --name beyond-jubeat`；site key 是公开值，写在 `src/lib/turnstile-config.ts`（不走构建期环境变量，省掉「控制台忘配 → widget 不渲染 → 注册静默失败」）。

这个 zone 开着 Browser Integrity Check，`curl` 裸请求自定义域名（不带 UA）会被拦成 403 `Cf-Mitigated: challenge`，带浏览器 UA 才正常。浏览器访问不受影响。

## 性能

实测（本机 `dist/` 静态服务器，1280×800，冷加载 3 次取中位数）：20 个请求、160 KB、TTFB 20ms、FCP 440ms、load 470ms。首屏只取当前世代的 1 张背景 + 1 张站标 + 16 张曲绘，曲绘全部 `loading="lazy"`……**除了首页的榜单与运势**：那两处在 260px 高的滚动视窗里，20 行在遮挡区，懒加载只会让图在滚动时才闪出来，而单张曲绘只有 7 KB。

做过的事：站标由「全部渲染靠 CSS 隐藏」改成单个 `<img>` 按世代换 src（少下 10 张）；曲绘缩到 144×144；背景缩到 1440 宽 q62；PNG 转 WebP；`/_astro/*` 与 `/assets/*` 长缓存；head 内联预热脚本先读 localStorage 再渲染。

`npm run opt` 与字体子集化都是**原地覆盖**，重复跑会越压越糊，要重压先从 git 历史取原图。字体已于 2026-11-02 改为站内自托管（`public/assets/fonts/`，10 款 woff2）——原来走 CDN，跨域往返直接压在 FCP 上，实测单次要 1.0–1.4s。

## 文档

`docs/` 下有几份**开工前该读**的：`measurement-caliber.md`（任何计数前先读，含 grep 陷阱与口径判据）、`database-schema.md`（表结构）、`data-pipeline.md`（管线与 D1 上线顺序）、`site-structure.md`（页面层级）。`CONTEXT.md` 是术语表，写代码命名前对一下。`docs/audit-*.md` 与 `docs/database-review-*.md` 是历次审查的台账——每条问题后面都跟着处理结论，接手时按它对齐进度，别重做已收口的条目。

## 说明

`archive/` 是四代旧项目与候选素材（约 738 MB）：根 `.gitignore:77` 整体忽略该目录，`archive/.gitignore` 再忽略其中的 `materials/` 与 `legacy/`，只有目录说明与一份留档模板仍在版本控制里。本地留副本即可。

---

本项目在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中开发。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
