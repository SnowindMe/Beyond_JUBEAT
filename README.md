# Beyond_JUBEAT

**jubeat（音乐魔方）中文资料站** —— 双服曲库、谱面定数、Jubility 理论值与世代沿革。

[![build-check](https://github.com/SnowindMe/Beyond_JUBEAT/actions/workflows/build-check.yml/badge.svg)](https://github.com/SnowindMe/Beyond_JUBEAT/actions/workflows/build-check.yml)
[![release](https://img.shields.io/github/v/release/SnowindMe/Beyond_JUBEAT)](https://github.com/SnowindMe/Beyond_JUBEAT/releases)
![Astro](https://img.shields.io/badge/Astro-7.4-ff5d01)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-live-F38020)
![license](https://img.shields.io/badge/license-unlicensed-9ca3af)

线上：<https://wiki.byd-ub.top> · 国内加速：<https://wiki-cn.byd-ub.top>

> 2026-11-19 起关闭 `*.workers.dev` 与 preview URL（`wrangler.jsonc` 的 `workers_dev` / `preview_urls` 均为 false），
> 两条 workers.dev 地址已不通，只能走上面两个自有域名。Workers Logs 也一并关闭。

## 目录

- [这是什么](#这是什么)
- [功能特性](#功能特性)
- [技术栈与运行形态](#技术栈与运行形态)
- [目录结构](#目录结构)
- [本地开发](#本地开发)
- [环境变量与密钥](#环境变量与密钥)
- [数据与代码分离](#数据与代码分离)
- [数据管线](#数据管线)
- [用户系统](#用户系统)
- [缓存与响应头](#缓存与响应头)
- [曲绘托管](#曲绘托管)
- [检查与 CI](#检查与-ci)
- [部署与发布](#部署与发布)
- [常见问题](#常见问题)
- [性能](#性能)
- [文档](#文档)
- [许可与致谢](#许可与致谢)

---

## 这是什么

一个资料查询站，不是游戏本体。收录日服与国服的曲库、谱面定数、Jubility 理论值，以及世代主题与沿革。

| 页面                                                | 做什么                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `/`                                                 | 首页：世代主题 Hero、4×4 曲绘方阵、站点链接与标识区                 |
| `/songs/`                                           | 曲目库：双服切换、世代分组、搜索与筛选、六种排序、卡片/列表两种排列 |
| `/songs/[songId]/`                                  | 曲目详情：曲绘、定数与难度参照系、密度条、别名与标签、BGM 试听      |
| `/jubility/`                                        | Jubility 层级：理论值、12 档阶梯、公式与口径                        |
| `/recent/`                                          | 最近更改：维护者编辑记录与前后差异                                  |
| `/login/` `/register/` `/account/` `/admin/`      | 用户系统与维护者面板                                                |

曲目库的筛选条件：难度、定数区间（难度选中后出现）、谱面类型（STD / HOLD / [2]）、世代、上线日期（日历，只放开真实上架日，可点年月切视图），外加隐藏删除曲开关。**分段加载**：收窄到某个世代就只补拉那一段，其余骨架留在 DOM 里，切回「全部」可再拉起。首页的今日运势与热门歌曲 2026-11-12 起下线，见[常见问题](#常见问题)。

**规模**（2026-11-22 实测）：**1269 首曲目 / 3807 张谱面**；其中日服独占 725 首、双服 440 首、国服独有 104 首（同一首可双服上线）。长押谱 332 张，另有 12 张长押状态未知。数据截至国服 2026-10 更新表；日服 `U'nit` 世代 2026-11-22 接入，曲目取自 RemyWiki 的 Location Test 列表，暂用占位 id。

**世代与主题不是一回事**：**世代 14 个是数据口径**（13 个日服世代 + 国服「音乐魔方」），**主题 17 套是视觉口径**（`clan` 一个世代拆成红蓝绿紫 4 套）。要数就取各自的 `length`（`src/lib/gens.ts` / `src/lib/themes.ts`），别手抄。

**没选过主题时跟随系统明暗**（2026-11-15）：系统偏好浅色给 `yymf`，其余情况默认 `bta`。两个坑：①判定写在 `Base.astro` 首帧脚本里，而且必须在最前面——下面那段筛选存档用 `return` 提前退出，返回的是整个 IIFE，写在后面等于永远跑不到；②`localStorage` 只在用户点主题按钮时写，首屏那次 `apply()` 不写，否则「系统浅色 → yymf」会被当场固化成用户选择，之后系统切回暗色就不再跟随。

## 功能特性

- **双服曲库**：日服 / 国服各自成库，同一首曲可双服上线；服务器选项卡与世代分组一一对应。
- **筛选与排序**：难度、定数区间、谱面类型（STD / HOLD / [2]）、世代、上线日期（日历只放开真实上架日）；六种排序（songId 升降、定数升降、曲名升降），默认 songId 升序。筛选状态可一键重置。
- **曲目详情**：定数条 + 难度参照系、Notes/Holds 读数与全库分位、谱面密度条（键数校验不过就不画）、别名与标签、BGM 试听与来源标注。
- **Jubility 理论值**：12 档阶梯与公式口径，页面现算。
- **17 套世代主题**：配色 + 字体 + 背景图，切换存 localStorage；同一主题下字标宽度、墨迹基线、徽章配色都跟世代走。
- **用户系统**：游客 / 玩家 / 维护者 / 站长四层，注册登录、账户设置、维护者编辑与最近更改。
- **工程护栏**：9 段自检（数据一致性、引用完整性、对比度、文档数字、搜索键、密度覆盖、运势分布等）与三条 GitHub Actions 流水线。

### 已下线：今日运势与热门歌曲

2026-11-12 从首页摘掉，组件、样式、数据层（`lib/hotPage.ts`、`lib/hot.ts`、D1 埋点、KV 快照）与 `check-fortune-dist.mjs` 全部原样保留，恢复时取消 `index.astro` 里注释掉的 import 与 `<div class="fh-split">` 即可。两条关键口径，换实现时别丢：

- **今日运势**：种子 = 日期 + 访客（游客恒为 `guest`，所以可被边缘缓存）。一天一个运气值（0–120），三首由它派生（第 1 首比运气低一级、第 3 首高一级，两端截平），3 级以下谱面再把要求抬一到两格；候选从各服自己的曲库按日哈希摊开抽，不走热榜。
- **热门歌曲**：热度口径是**独立听众数**，一人一曲一天只算一次（主键 `(day, song_id, visitor)` + `INSERT OR IGNORE`），真出声满 8 秒才打点。每天 00:05 把「昨天为末日的前 7 天」封成快照，当天读这一份；窗口内不同曲数不足 6 首时降级成新曲推荐（判据是曲数不是行数）。

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

## 目录结构

```
src/
├─ pages/
│  ├─ index.astro            首页（SSR）
│  ├─ songs.astro            曲目库（SSR：双服切换 / 分区 / 搜索 / 筛选 / 排序）
│  ├─ songs/frag.astro       曲目分段端点（SSR：供曲目库懒加载）
│  ├─ songs/[songId].astro   曲目详情（SSR：按 song_id 查单行）
│  ├─ jubility.astro         Jubility 层级页（SSR：现算理论值）
│  ├─ recent.astro           最近更改（SSR：查 recent_changes）
│  ├─ login / register / account / admin / admin/songs/
│  ├─ api/                   auth · account · admin · audio · hot · jacket · song-alias · song-tags · csp-report
│  └─ 404.astro
├─ components/               Hero / SongCard / GenBlock / SongAudio / BootScreen / Header / ThemeScript / …
├─ layouts/Base.astro        全站外壳（.wrap 撑满一屏、main 吃掉剩余高度，内容不满时页脚贴底）
├─ middleware.ts             会话 cookie → locals.user、边缘缓存、限流前置
├─ worker.ts                 Worker 入口（fetch 转发 + scheduled）
├─ styles/                   theme · songs · fortune · jubility · auth · server-card
├─ lib/                      数据访问、认证、缓存、主题/世代表、算法
└─ data/                     生成物：曲库快照、聚合数据、映射表（**不入库**，见下）
public/                       _headers · manifest · sw.js · assets（背景/曲绘/站标/字体/js）
data/                         管线输入（xlsx 源表、上游快照）与本地库（**不入库**，见下）
db/                           schema · seed · 增量补丁 · 7 份迁移
scripts/                      构建、数据管线、抓取、CI 自检、运维（清单见 scripts/README.md）
docs/                         库表与灌库规则、站点结构、术语表，以及 releases/ 发版说明
```

`scripts/` 下 `ci/`（9 段自检）、`db/`（解析与建库）、`data/`（R2 拉推）、`ops/`（发版标签、EdgeOne 清理、微信校验文件）、`ub/`（上游音频/谱面抓取）是正式链路；`tmp/`、`probe/`、`logs/`、`screenshots/` 是本地调试与产物。

## 本地开发

需要 Node 22+；改线上数据或跑 `wrangler` 远程命令时需要 `npx wrangler login`（或给 API token）。

```bash
npm ci                   # 装依赖
npm run db               # 重建本地曲库（首次必须，或从别人那里拿一份 data/jubeat.db）
npm run dev              # astro dev，默认 4321
```

### 常用命令

| 命令                              | 作用                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                     | 本地开发服务器                                                       |
| `npm run build`                   | 难度统计 → 拆分谱面 → 构建戳 → SEO → `astro build`                    |
| `npm run preview`                 | `build` 后用 `wrangler dev` 跑本地 Worker                          |
| `npm run db`                      | xlsx 解析 → `data/jubeat.db` → 站点 JSON（重建本地曲库）             |
| `npm run data`                    | 只重生成 `src/data/` 的聚合数据与曲绘                                |
| `npm run patch` / `apply:patch`   | 生成 / 应用线上增量补丁                                              |
| `npm run check`                   | 9 段自检，任何一段红都不能放行                                       |
| `npm run opt`                     | 压缩 `public/assets/images` 下的图片（原地覆盖）                     |
| `npm run data:pull`               | 从 R2 拉回移出版本库的数据（`prebuild` 会自动跑）                     |
| `npm run data:push -- --changed`  | 把本地改过的数据推到 R2（按 md5 比远端 ETag，没变的跳过）             |
| `npm run deploy`                  | `build` + `wrangler deploy` 本地直传；正常发版走 push，不用它         |

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
- **首页、`/songs/`、`/jubility/`、`/recent/` 走中间件边缘缓存**，看响应头 `x-jb-cache`：`HIT` 是缓存命中、`STALE` 是陈旧兜底、`MISS` 是这次真渲染并写入了缓存、`PASS` 是真渲染但**不入库**（非 200，比如不存在的曲）。改完模板看不见效果时，带一个 `Cookie: jb_session=x` 绕过缓存，别急着改代码。
- **`CF-Connecting-IP` 在本机会被拦成 403**（`error code: 1000`）。要冒充来源 IP 验限流，改用 `X-Forwarded-For`——取 IP 的代码本来就是 `cf-connecting-ip ?? x-forwarded-for`。

### dev server 在带代理的环境里

带 `HTTP_PROXY`/`ALL_PROXY` 启动会 `read ECONNRESET`：`fetchWorkerExportTypes` 要 fetch `http://localhost/__vite_plugin_cloudflare_get_export_types__`，被 undici 的 EnvHttpProxyAgent 塞进了代理。用 `env -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY` 启动才稳。

## 环境变量与密钥

| 名称                                                | 用途                                              | 配在哪                                  | 缺了会怎样                                        |
| --------------------------------------------------- | ------------------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                              | R2 读写（`data:pull` / `data:push`）与 D1 Edit     | 本机环境变量；Actions 用仓库 secret      | 拉推数据直接跳过并打印提示                        |
| `CLOUDFLARE_ACCOUNT_ID`                             | R2 / D1 API 的账号上下文                          | 同上                                    | 同上                                              |
| `WECHAT_SITE_VERIFY`                                | 微信网站管理员校验文件的 40 位内容                | Actions secret；另在 R2 存同路径副本     | 构建跳过生成，保留仓库外已有文件；线上校验失败    |
| `TURNSTILE_SECRET`                                  | Cloudflare Turnstile 服务端校验                   | `wrangler secret put`                   | 生产 fail-closed（登录/注册不可用）               |
| `TENCENTCLOUD_SECRET_ID` / `_SECRET_KEY`            | EdgeOne 缓存刷新（国内加速站）                    | Actions secret                          | 该步骤失败但 job 不红；加速站可能吐旧页           |
| `IMG_TOKEN`                                         | 图床上传（`scripts/cdn-jackets.cjs`）             | 本机环境变量或 `--token`                | 曲绘上传失败，只能手动补                          |
| `EDGEONE_ZONE_ID`                                   | 手动清 EdgeOne 缓存时指定站点                     | 本机临时变量                            | 手动清缓存不可用                                  |
| `GITHUB_TOKEN`                                      | 打 tag / 建 Release                               | Actions 内置                            | 发版流水线失败                                    |

密钥一律不进仓库：本机凭据放 `.devhome/`（已被 `.gitignore` 忽略），CI 走仓库 secret，Worker 走 `wrangler secret`。`src/data/site.json` 里只有版本号，没有任何凭据。

## 数据与代码分离

**仓库里没有数据。** 2026-11-18 起，所有清单输入（`data/xlsx` 源表、`data/upstream` 上游快照、`data/remy` 谱面快照、各个覆盖层）与生成物（`db/seed.sql`、`src/data/*.json`）都移出版本库，改存 Cloudflare R2 私有桶 `beyond-jubeat-data`。

理由：仓库是 PUBLIC 的，数据留在库里等于把整站源码可读的副本白送出去；而且每改一首曲都要在几十个数据文件上留下 diff，功能 review 会被淹掉；数据还在每次更新里让仓库持续变大。

- **克隆后**：`npm run data:pull` 拉回（`prebuild` 已挂上，`npm run build` 会自动先跑它，缺凭据时跳过并打印提示）。
- **改完数据**：`npm run data:push -- --changed` 推回去，否则 CI 与别人的 clone 拿不到你的改动。
  加 `--changed` 是必须的——不加会全量重推（当前 78 个音频约 304 MB，大头是音频），跑十几分钟。
  它逐条比内容的 md5 与远端 ETag，没变的不传；想要全量才省略这个参数。
- **代码引起的数据变化不用手动推**：`.github/workflows/data-push.yml` 在 push main 后自动 pull → 重建 → `--changed` 推，只在 `data/`、`scripts/db/`、`schema.sql` 一类路径变动时触发。覆盖层这类只在本地改的文件它看不到，仍由本机推。
- 白名单在 `scripts/data/push.cjs` 的 `WHITELIST`：新增长期数据文件时要登记，否则推不上去。`db/schema.sql` 与 `src/data/site.json` 仍留在仓库——它们跟代码一起 review 才有意义。
- R2 免费额度足够：数据文件是 MB 级、音频约 300 MB（78 个），只有构建与手动推送会访问，不对外暴露读端点，天然不担心被刷。

## 数据管线

```
data/xlsx/source.xlsx ─parse→ data/xlsx/sheet*.json ─┐
data/upstream/*.json ──────────────────────────────┼→ data/jubeat.db → src/data/*.json
data/unit-songs.json ─────────────────────────────┘        ↓
                                                    db/seed.sql（全量）
                                                    db/patch.sql（增量，灌线上用）
```

`data/jubeat.db` 是本地权威曲库（生成物、不入库，`npm run db` 随时重建，不需要网络）。线上真实数据在 Cloudflare D1 库 `beyond-jubeat`，内容与之一致。

**日常改线上数据用 `npm run patch` 生成的增量补丁，不要重放 `db/seed.sql`**——后者会 `DELETE FROM songs` 再整表插入。细节见 [docs/database-schema.md](docs/database-schema.md) §6。

三条特殊输入：

- `data/unit-songs.json`：日服 `U'nit` 世代（2026-11-22 接入）。官方曲库还没有这批曲，所以用占位 id `unit-001`…`unit-014`，`id_kind='synthetic'`；不并进 `jp-resolved.json`（那份会被 `data:pull` 覆盖）。其中 5 首有真曲绘，其余 9 首共用一张占位图。
- `src/data/audio-sources.json`：新入库音源的上传者（Fruity / Album），详情页来源徽章据此显示，未登记的回落到 `Jack大本`。
- `src/data/cdn.json`：曲绘规范名 → 图床 URL 的映射（1270 条，含 1 张国服占位图），不入库但在 R2 白名单里。

抓取类脚本需要联网，**不进 build 流程**，曲库更新后手动重跑并提交产物：

- `scripts/ub/build-ub-audio.cjs` → `src/data/ub-audio.json`（BGM 映射，1269 首命中 1219 首、96.1%；未命中的 50 首是上游确实没有的国服独占曲与占位曲。上游「音乐魔方」目录的音频改成带内容哈希的文件名 `bgm.<hash>.ogg`，脚本按上游返回的 assets 原样取值，不影响匹配方式）
- `scripts/ub/build-ub-charts.cjs` → 谱面密度数据，再由 `split-ub-charts.cjs` 拆成每首一个静态 JSON；**密度条画之前必须校验键数**（算出的键数要与库里的官方物量相等，否则不画——实测 3807 个档位里有 314 档上游根本没有谱面文件、84 首完全没有密度数据，宁可少一张图也不给自相矛盾的图。定数不作为判据，库里的定数是官方的，ub 那栏标签会滞后）

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

**规范名 = `id<歌id>.webp`**。本地文件、`songs.cover`、映射键、CDN 落盘名四处同名，换床或回滚能逐条对上；`U'nit` 的占位 id 形如 `idunit-001.webp`，反代白名单已放行。

- 上传用 `node scripts/cdn-jackets.cjs`：按 `songs.json` 顺序补缺、逐张写映射、把本地原图 rename 进 `archive/materials/jackets/`（本地留档，不入库）。配额与断点存 `.cdn-quota.json`。
- 图床三道闸：**1200 张/天、600 张/小时、120 张/分钟**，脚本按 1200/590/115 自我节流；限流（42900）不计失败，推窗口后退避重抓同一张。`42216` 是并发写库抖动，重试即过。
- 映射命中前不要删本地图，否则页面回退到 404。CSP 的 `img-src` 仍放行 `https://free-img.400040.xyz`（Report-Only）——正常路径已用不上，留着是给反代缓存与转发都异常时那次 302 回退兜底。

### 品牌资源版本

图片扩展名的 `Cache-Control` 曾被上一跳（腾讯 EdgeOne）统一压成 3600，已于 2026-11-01 改为遵循源站。但**已被缓存的旧图不随部署失效**——这就是「明明换了 favicon 却看不到」的真凶。所以换图标只能靠 URL 变化：品牌资源一律带 `?v=N`，改图时 `Base.astro` 四处图标链接、`Header.astro` 与 `index.astro` 的品牌图、`manifest.webmanifest` 三个 icons、`sw.js` 的 `ASSET_V` 四处同改并把 N 加一。

`manifest.webmanifest` 自身与 `sw.js` 都必须 `max-age=0, must-revalidate`（前者列着带 `?v=N` 的 icons，缓存住会让换图标不生效；后者长缓存会让旧 SW 永远不更新）。

zone 的 `browser_cache_ttl` 已设为 **0**（Respect Existing Headers）。原值是 14400，会把源站的 `max-age=300` 顶成 4 小时，日更的运势与热榜零点后还被压住。

## 检查与 CI

`npm run check` **9 段**，顺序固定：

1. 数据一致性（`check-data-consistency.cjs`：行数、悬空 cover、top16 与 songs.json 互一致、top16 不许空 cover）
2. 引用完整性（源码）
3. 引用完整性（dist）
4. 曲目编辑越权 / 参数校验
5. 对比度自检（`check-contrast.mjs`，当前 18 套：17 条主题表 + `:root`）
6. 库表与文档的列一致（`check-schema-doc.cjs`，文档里的计数是断言，不是描述）
7. 搜索键上限
8. 谱面密度覆盖
9. 运势分布与两条联动判据

任何一段红都不能放行。对比度脚本输出的是公式理论值（不含背景图），验收仍以实机渲染为准——它只作回归护栏。真实渲染链有四层（`--base` → 背景底图 → `--veil` → 顶部 `--scrim`），只读 `getComputedStyle` 的 `backgroundColor` 会漏掉底图。

三条流水线（`.github/workflows/`）：

| 工作流           | 触发                                                    | 做什么                                                                 |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `build-check.yml` | push / PR main                                          | `npm ci` → 重建曲库 → `npm run build` → `npm run check` → 清 EdgeOne 缓存 |
| `data-push.yml`  | push main 且改动 `data/`、`scripts/db/`、`scripts/ci/` 等 | pull → 重建 → `--changed` 推 R2（代码引起的数据变化不用手动推）        |
| `release-tag.yml` | `build-check` 成功后（`workflow_run`）或手动 dispatch      | 按 `site.json` 的版本号打注释标签 + 建 Release，正文取 `docs/releases/v<版本>.md` |

**check 与 build 顺序不能换**（第二次 check-refs 正是要扫 dist）。干净 clone 里没有 `data/jubeat.db`（它被 `data/.gitignore` 挡在版本库外），所以 CI 里按管线重建，约 3 秒、不需要网络。

## 部署与发布

push 到 main，Cloudflare 的 Git 集成（Workers Builds，worker 名 `beyond-jubeat`）自动构建 + 部署（`wrangler.jsonc` 的 `main` 是 `src/worker.ts`，`assets.directory` 是 `./dist/client`）。

**线上构建不跑 GitHub Actions**：Actions 只做检查、推数据、清缓存、打标签。两条线相互独立，**Actions 绿 ≠ 线上已更新**——实测部署需要 90–120 秒，页脚版本号变了才算上线。构建期需要的凭据（如微信校验文件）要同时保证 CF 与 Actions 两条链路都能拿到。

**EdgeOne 缓存的自动清除**：加速站 `wiki-cn.byd-ub.top` 是 EdgeOne 前置，旧 HTML 会被它按源站 `max-age` 缓存住，源站已发新版、加速站却继续吐旧页（2026-11-17 事故即此）。所以 `build-check` 在 push 到 main 时会跑 `scripts/ops/purge-edgeone.mjs`：先轮询源站 `wiki.byd-ub.top`（直连 CF）直到页脚出现本次版本号，再对站点 `zone-3we3ellu1uc3` 发 `purge_all`。本机临时清一次：`EDGEONE_ZONE_ID=… TENCENTCLOUD_SECRET_ID=… TENCENTCLOUD_SECRET_KEY=… node scripts/ops/purge-edgeone.mjs --now`，`--dry` 只打印请求不发送。

**Worker 侧的 `caches.default` 不用管**：缓存 key 里带 `SITE_VERSION`（`src/middleware.ts` 的 `CACHE_PREFIX`），发版换版本号即自动换 key，旧条目自然失效。

**发版清单**：

1. 改 `src/data/site.json` 的 `version`（页脚同源）；
2. 写 `docs/releases/v<版本>.md`（模板见下）；
3. commit + push main；`build-check` 绿后 `release-tag` 自动打 tag 并建 Release。

### 版本标签

每次发版对应一个 git tag 和一个 GitHub Release，由 `.github/workflows/release-tag.yml` 自动生成——人工只改版本号，不再手写 tag。它是 `build-check` 的 `workflow_run` 下游，只有 main 上的 push 且构建 + 自检全绿才打；构建失败的那一次不会有 tag。

标签打在「这次构建对应的那个提交」上（`workflow_run.head_sha`），而**不是**此刻 main 的最新提交——发版提交后面又跟了一个样式提交时，两个 sha 会不一样。版本号从那个提交里的 `site.json` 读，和页脚同源。

tag 命名：

- 默认 `v1.2.3`，与 `site.json` 的版本号一致（不带前缀、不改写）。
- 该版本号已被**别的提交**占着（版本号没变就继续提交）时，默认 **silent 模式跳过**、日志写明「已指向 abc1234」——同一版本号的后续提交本来就还属于这次发布，tag 只代表这个版本号第一次出现。
- 要在每个提交上都留标记就换 **strict 模式**：退化成 `v1.2.3-abc1234`，可追溯、不静默丢弃。两种模式都**不移动**已存在的标签，所以标签永远指向某个真实出厂过的提交。

### 版本说明

Release 正文取自 `docs/releases/v<版本号>.md`（随代码提交，一份发版一个文件），末尾自动附上「上一个标签…本标签」的提交对比链接。发版前把这份文件写好，别人在 Releases 页面就能直接看出这一版改了什么。

- 文件名的版本号必须与 `site.json` 的 `version` 一致，否则不算写到（会被当成没写）。
- 没写的时候不会留空白页：正文退化成自动整理的提交列表，并在顶部与 job summary 里都标出「这一版没有写版本说明」——是兜底，不是免写。
- 已经发出去的版本要补说明：`gh release edit v1.2.3 --notes-file docs/releases/v1.2.3.md`。

模板（`docs/releases/v1.67.2.md` 是现成例子）：

```markdown
## 新增

- **做了什么**：为什么改、改完用户看到什么变化。

## 修复

- **现象**：一句话说清原来哪里不对，以及现在的行为。
```

本地先看一眼正文长什么样：`node scripts/ops/release-tag.mjs --ref HEAD --dry`（会打印 tag 名与正文前 24 行）。
注释标签要作者身份，而 runner 上没有全局 `git config`（2026-11-22 首次真跑死在 `fatal: empty ident name`）。脚本用 `git -c user.name/user.email` 就地给 `github-actions[bot]`，只作用于那一条命令，不写 runner 的全局配置。

失败是红的，不是 `continue-on-error`——tag 是发布凭据，静默失败比红更坏。失败的 step 会把 stderr 原文和补救命令写进 job summary：

```bash
git push origin refs/tags/v1.2.3                    # 标签建了但没推上去
gh release create v1.2.3 --verify-tag --notes-file docs/releases/v1.2.3.md   # 标签推上去了但 Release 建失败
gh workflow run release-tag -f sha=<commit> -f mode=strict   # 那次构建没被触发，整段漏跑
```

### 上线前必须先跑的迁移

都是幂等的 `IF NOT EXISTS` / `IF EXISTS`，与 `db/schema.sql` 里对应的建表段逐字同源：

```bash
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-users.sql      # 用户系统
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-hot.sql        # 热度打点：漏跑则 /api/hot/hit 500
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-auth.sql       # 鉴权限流：漏跑则登录/注册/改密全 500
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-p0.sql         # 限流计数表 + 删冗余索引
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-song-tags.sql  # 曲目标签：漏跑则详情页标签 500
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-song-alias.sql # 曲目别名：漏跑则详情页别名 500
```

另有 `db/migrate-added-at-split.sql` 是**一次性**迁移（把 `added_at` 拆成 `added_at_jp` / `added_at_cn`），线上已跑过；新库由 `schema.sql` 直接建全，重复跑会因列已存在失败，不要再执行。

新开一份迁移要同时改 `db/schema.sql` 的对应段落，两份别分叉——本地靠 schema 一次建全，线上只能一条条跑迁移。

**日常改数据用补丁，别重放 seed**：`node scripts/db/diff-seed.cjs --base=<上次部署的 seed>` 生成 `db/patch.sql`（只含受影响的行），再 `node scripts/db/apply-patch.cjs --token=<CF token>` 灌进去。后者走 D1 REST `/query`、每批 100 条失败即停，不依赖 `wrangler` 的本地登录态——这台机器上 `wrangler d1 execute --remote` 会因缺授权直接失败，而 token 只要给了 D1 Edit 权限就能用同一条路径。

**不要拿 `db/schema.sql` 对线上跑**，它开头有 `DROP TABLE songs`。

Turnstile secret 用 `npx wrangler secret put TURNSTILE_SECRET --name beyond-jubeat`；site key 是公开值，写在 `src/lib/turnstile-config.ts`（不走构建期环境变量，省掉「控制台忘配 → widget 不渲染 → 注册静默失败」）。

这个 zone 开着 Browser Integrity Check，`curl` 裸请求自定义域名（不带 UA）会被拦成 403 `Cf-Mitigated: challenge`，带浏览器 UA 才正常。浏览器访问不受影响。

## 常见问题

**新增了 SSR 页，本地 build 成功、线上 404？**
`wrangler.jsonc` 的 `assets.run_worker_first` 漏了那条路径，资源层按 `404-page` 直接截断。加进去再部署。

**`/songs` 或 `/recent` 回 500，日志 `no such table`？**
本地 D1 没灌。按[本地开发](#本地开发)跑 `schema.sql` + `seed.sql`，注意别加 `--persist-to`。

**`npm run build` 或 `npm run dev` 报 workerd `CreateDirectory: 拒绝访问`？**
Windows 上的已知坑，见[本机 workerd 的两个坑](#本机-workerd-的两个坑)。

**`curl localhost:4321` 回 000，但服务明明在跑？**
没加 `--noproxy '*'`，请求被代理吃了；dev 只监听 `::1`，用 `localhost` 而不是 `127.0.0.1`。

**改了模板/样式，本地或线上看不到变化？**
本地先看 `x-jb-cache`，带 `Cookie: jb_session=x` 绕缓存；线上详情页有边缘缓存，加 `?cb=<随机数>` 才是新版本。

**换了 favicon / 站标却看不到？**
品牌图 URL 没带新的 `?v=N`。四处同改（Base、Header、index、manifest、sw 的 `ASSET_V`）。

**对比度自检「全部达标」能当验收依据吗？**
不能。脚本是公式值、不含背景图；真实渲染链有四层，压在图上的文字可能远低于 3:1。它只拦回归。

**曲绘 404？**
先看 `src/data/cdn.json` 有没有 `id<歌id>.webp` 映射，再看反代白名单 `NAME_OK` 是否放行该 id 形态（占位 id `unit-NNN` 需要单独放行）。

**Actions 绿了，线上还是旧版本？**
线上由 Cloudflare Workers Builds 构建，与 Actions 是两条线，等 90–120 秒并确认页脚版本号；加速站另有 EdgeOne 缓存，`build-check` 会自动清。

**`/songs/` 的世代数、主题数写死在哪？**
不要写死。取 `GEN_JP.length` / `GEN_ORDER.length` 与 `THEMES.length`；注释里提到数字时也要跟着改。

## 性能

实测（2026-11-17，本机 `dist/` 静态服务器，1280×800，冷加载 3 次取中位数）：20 个请求、160 KB、TTFB 20ms、FCP 440ms、load 470ms。首屏只取当前世代的 1 张背景 + 1 张站标 + 16 张曲绘，曲绘全部 `loading="lazy"`……**除了首页方阵**：那 16 格在遮挡区，懒加载只会让图在滚动时才闪出来，而单张曲绘只有 7 KB。

做过的事：站标由「全部渲染靠 CSS 隐藏」改成单个 `<img>` 按世代换 src（少下 10 张）；曲绘缩到 144×144；背景缩到 1440 宽 q62；PNG 转 WebP；`/_astro/*` 与 `/assets/*` 长缓存；head 内联预热脚本先读 localStorage 再渲染。

列表排序（2026-11-17 按 modern-web-guidance 改）：原本只写 `style.order`、DOM 顺序永不变化，键盘 Tab 与读屏的顺序和眼睛看到的相反。现在改为移动真实节点（`moveBefore`，不支持时 `append`），重排后用一条 `role="status"` 报一次结果，焦点留在触发控件上。

动效：只动 `opacity`/`transform`；系统开「减少动态效果」时关掉全部位移与缩放（唱片停转、卡片不放大、定数条不做宽度过渡），颜色过渡保留——**不要**用全局 `animation-duration:0.01ms`，那会把带 delay 的错开入场压塌。

`npm run opt` 与字体子集化都是**原地覆盖**，重复跑会越压越糊，要重压先从 git 历史取原图。字体已于 2026-11-02 改为站内自托管（`public/assets/fonts/`，当前 11 款 woff2）——原来走 CDN，跨域往返直接压在 FCP 上，实测单次要 1.0–1.4s。

## 文档

`docs/` 只留三份**开工前该读**的：

- [`database-schema.md`](docs/database-schema.md)：表结构与灌库规则，任何计数前先读，含 grep 陷阱与口径判据
- [`site-structure.md`](docs/site-structure.md)：页面层级与各页职责
- [`CONTEXT.md`](docs/CONTEXT.md)：术语表，写代码命名前对一下

另有 `docs/releases/`：一份发版一个文件，Release 正文的来源。历次审查的台账（audit / database-review / data-pipeline / measurement-caliber 等）2026-11-18 已合并进上面三份，剩下的一律从 git 历史取。

## 许可与致谢

**许可**：本仓库**未附 LICENSE 文件**，因此默认保留所有权利，不构成开源授权；如需复用代码请先联系仓库所有者。站内的曲名、曲绘、音频、商标等版权归 KONAMI 及各权利人所有，本站为非官方资料站，与 KONAMI 无隶属关系。

**数据与素材来源**：

- 曲目、谱面、定数与世代信息：[RemyWiki](https://remywiki.com/)（社区维基）
- BGM 与谱面密度上游：ub.thregren.world（Thregren）
- 部分音源：Jack大本
- 曲绘图床：[tc.mofashi.ltd](https://tc.mofashi.ltd)（公益图床，仅作源站，页面走同源反代）
- 字体：各字体厂商/作者，站内自托管子集

**技术**：[Astro](https://astro.build/)、[Cloudflare Workers](https://workers.cloudflare.com/)、[Cloudflare D1 / R2](https://developers.cloudflare.com/)。

---

本项目在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中开发。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
