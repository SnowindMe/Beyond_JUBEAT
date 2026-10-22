# Beyond_JUBEAT

jubeat（音乐魔方）中文资料站。用 **Astro 7** 构建的多页站点：绝大多数页面构建期预渲染成静态 HTML，只有曲目页在边缘 SSR 时读 Cloudflare D1。线上托管在 Cloudflare Workers。

![deploy](https://img.shields.io/badge/Cloudflare_Workers-live-F38020) ![astro](https://img.shields.io/badge/Astro-7.4-ff5d01) ![repo](https://img.shields.io/badge/GitHub-Beyond__JUBEAT-181717)

线上地址：<https://wiki.byd-ub.top>（自定义域名） · <https://jubeat-wiki-home.1945743455.workers.dev>（workers.dev）

---

## 这是什么

把 jubeat 从 2008 年（jubeat）到 2023 年（jubeat 音乐魔方）**13 个世代（日服/国际服 12 + 国服 1）/ 1241 首曲目 / 3723 张谱面**整理成一个可浏览的资料站。

> 当前版本：四个数据区块（世代的层 / 定数顶格 / 定数分布 / 最近收录）已下线，正文换成一句「正在施工中，前面的区域以后再来探索吧......」的占位告示。数据仍在 `src/data/data.json` 里，随时可以接回来。
>
> 导航里的「曲目」已是真实页面（`src/pages/songs.astro`，日服/国际服/国服三卡切换 + 分区筛选）。这是唯一 `prerender = false` 的页面：曲库放在 Cloudflare D1，请求时在边缘查库渲染（见「数据来源」与「部署」）。
>
> **导航只列真实存在的页面，没有死链**（v1.9.1 起）。「Jubility / Emblem / 伙伴 / 成就 / 关于 / 登录」六个二级页还没做，此前挂在顶栏、访问落进自定义 404，现已全部撤下；等页面开做时补 `src/pages/*.astro`，再到 `Header.astro` 的 `.nav-txt`（宽屏文字链）和 `.nav-drawer`（窄屏抽屉）**两处同步加回**，图标类入口还要加 `.nav-ico`。「最近更改」是已做出来的页面，见下。

页面标题统一是「XXX · Beyond ↑ JUBEAT ♪~」，由 `src/lib/title.ts` 的 `pageTitle(name)` 生成（首页 =「首页 · Beyond ↑ JUBEAT ♪~」），别再手写整串。

**曲目详情 /songs/[songId]/**（v1.10.0 上线，与曲目页同为 `prerender = false` 的 SSR 页，按 `song_id` 查 D1 单行）：两栏唱片内页式版面——左窄栏曲绘封套 + 识别信息（songId / 世代 / 分区 / 服务器），右栏曲名与艺人，三档定数做成 0–11 刻度的横条，底部横铺 BPM / 上线 / 解禁 / 备注。不存在的 id 在原 URL 返回真正的 404 状态（不 302 跳 /404，否则复制出去的链接会丢 songId）同时 `noindex`。曲目卡整卡可点，实现是卡内一层绝对定位铺满的 `.sc-link`，而不是把整卡包成 `<a>`——点击覆盖全卡，读屏链接名也只有曲名。

> 详情页曾内嵌 ub.thregren.world 的「谱面确认」播放器（v1.12.0–1.12.2，靠 `/ub-proxy` 前缀代理剥掉对方的 X-Frame-Options 才能嵌进同源 iframe）。**该功能已于 v1.13.0 整体下线**：`src/pages/ub-proxy/`、`src/data/ub-index.json`、`scripts/ub/build-ub-index.mjs` 与 `wrangler.jsonc` 的 `/ub-proxy` 运行时路由一并移除。保留的两样东西：①详情页右下角的「在谱面确认中打开」外链去掉后，页面上不再有任何 ub 入口；②`ub-index.json` 映射表（1169 条 songId → ub 曲目 id）与生成脚本留在 `archive/materials/ub/` 备用。以后要重启，把文件搬回原位、恢复 `run_worker_first` 那条路由即可。

**/recent/ 最近更改**：用来记录已登录用户的编辑。列表数据在 `src/data/recent-changes.json`，每条含 `time` / `user` / `target{label,href}` / `summary` / `before` / `after`（前后差异折叠展示）。站点目前是纯静态、没有登录与写入后端，所以数组是空的，页面显示空状态；将来接 Cloudflare D1 + Workers 时只要产出同样结构即可，页面不用改。该页 `noindex`，宽屏走导航文字链接，窄屏走图标组里的时钟图标。

**开屏 LOADING**：`src/components/BootScreen.astro` 是街机开机风的整站开屏遮罩（4×4 方块逐格点亮 + `LOADING......` + 进度条 + 扫描线），同一套视觉有**三种触发**，但只有「真的要等」时才亮：①首访开屏——每个会话第一次进入才出现（`sessionStorage` 记 `jb-boot`），最少停 900ms（太快闪一下像故障）、最多 3s（`load` 被慢资源拖住时不锁人）；②点导航去下一页——延迟 160ms 才亮，新页在此之前到达就完全不出现（本地点击到 `pagehide` 约 68ms，正常网速下看不到遮罩）；③切世代主题——先查本页是否已经拿到过这两张图（背景 + 字标），拿到就零延迟直换、一点不闪；没拿到才挂 160ms 延迟遮罩，图到齐立刻收（兜底 2.6s）。

**遮罩的进出是径向圆孔**：进场「四周→中间」、退场「中间→四周」。实现是 `mask-image: radial-gradient(...)` + 注册成可插值属性的 `--boot-r`（`@property syntax: "<percentage>"`）：`-30%` 时圆孔不存在、遮罩盖满，`130%` 时圆孔超出四角、完全看不见，中间的 `--boot-soft: 26%` 是过渡带（羽化边缘，不然边界是硬圆）。进场 `bootIrisIn` 半径 130%→-30% 且 opacity 0→1，退场 `bootIrisOut` 反过来；**退场的 opacity 必须由动画收到 0**，否则动画播完摘 `boot-out` 那一帧会退回基础态（遮罩盖满 + opacity 1），屏幕会黑一下。基础态是常驻 `display: grid` + `opacity: 0` + `visibility: hidden`（`display` 不参与过渡，切 `none↔grid` 会吃掉淡入），收场 `visibility` 延后 0.32s 才 hidden。浏览器缺 `@property`/`mask-image` 能力时自动退回整体透明度淡入淡出（`bootIn`）。首访的 `boot-run` 由主脚本双 `rAF` 加，head 脚本只留 `boot-first` 标记——早期版本 head 直接加 class，第一帧就是 `opacity:1`，看着像「啪」地糊上来。`is-wait` 态进度条改成来回扫（不知道多久就不假装知道进度）。`pageshow` 的 `persisted` 分支会清掉残留的 `boot-out`/`boot-run`，防止 bfcache 恢复时 `overflow: hidden` 把滚动锁死。设了 `prefers-reduced-motion: reduce` 的用户整站不启动。样式与脚本都是 `is:inline`，必须在首帧前生效。

页面支持 **15 套世代主题**（切换时背景交叉淡入、字体与强调色整套更换；2026-10-21 新增国服「音乐魔方」），选择存在 localStorage。背景填充为 cover 按视口比例自适应。

页脚两列：左边是「最后一次编辑 日期 + 版本号」，版本号是**网页自己的迭代版本**，读 `src/data/site.json` 的 `version`（从 `1.0.0` 起，改功能时手动 +1，与 npm 包版本无关），右边是品牌字 + 小灰字 `Enjoy Yourself`。日期取构建当天（北京时间），云端每次 push 自动构建，所以等价于最后上线时间。

## 项目清单

```
Beyond_JUBEAT/
├─ src/                       Astro 源码
│  ├─ pages/
│  │  ├─ index.astro          首页（Hero + 施工中占位）
│  │  ├─ songs.astro          曲目页（SSR：运行时查 D1，三卡切换 + 分区筛选）
│  │  ├─ songs/[songId].astro 曲目详情（SSR：按 song_id 查 D1 单行）
│  │  ├─ recent.astro         最近更改（已登录用户编辑记录，现为空状态）
│  │  └─ 404.astro            404 页
│  ├─ components/
│  │  ├─ Header.astro         顶部导航 + 主题切换按钮
│  │  ├─ BootScreen.astro     开屏 LOADING 遮罩（每会话一次，is:inline）
│  │  ├─ Hero.astro           主视觉（站标 / 统计 / 曲绘方块）
│  │  └─ ThemeScript.astro    世代主题切换脚本（内联进页面）
│  ├─ layouts/Base.astro      全站骨架（head / 背景板 / footer）
│  ├─ styles/theme.css        全站样式（约 38 KB）
│  ├─ lib/
│  │  ├─ title.ts             页面标题格式「XXX · Beyond ↑ JUBEAT ♪~」
│  │  ├─ db.ts                D1 数据访问层（getAllSongs 全量查询 + isolate 缓存）
│  │  └─ gens.ts              世代顺序表（13 条，含日服 / 国服归属）
│  └─ data/
│     ├─ data.json            页面聚合数据（约 11 KB）
│     ├─ songs.json           构建期曲目快照（1241 条，本地无 D1 时的兜底）
│     ├─ site.json            站点自有版本号（页脚 v X.X.X）
│     └─ recent-changes.json  最近更改的记录（现为空数组，待接后端）
│
├─ public/                    原样拷进 dist 根的内容
│  ├─ assets/
│  │  ├─ images/bg/           15 张世代主题背景 webp（383 KB，1440 宽）
│  │  ├─ images/jackets/      1305 张曲绘 webp（11 MB，144px）
│  │  ├─ images/logo/         12 张世代站标 webp（244 KB，570 宽 DPR2）
│  │  ├─ images/og/           og:image 分享图（1200x630 png）
│  │  ├─ fonts/               7 个 woff2 主题/装饰字体（113 KB，拉丁子集）
│  │  └─ data/ docs/ media/   预留空目录
│  ├─ _headers                Cloudflare 静态资源响应头
│  ├─ apple-touch-icon.png    iOS 主屏图标（180x180，由 favicon 渲染）
│  ├─ robots.txt  sitemap.xml SEO（构建时由 scripts/gen-seo.cjs 生成）
│  └─ favicon.svg             站点图标
│
├─ data/
│  └─ jubeat.db               权威曲库（SQLite 360 KB / 1241 曲 / 3723 谱面，不部署）
├─ db/
│  ├─ schema.sql              D1 建表语句（songs + recent_changes + 索引）
│  ├─ seed.sql                本地导出，可整体重放到 D1（不提交）
│  └─ seed-parts/             分段导出（D1 单条语句约 100 KB 上限，按段发）
├─ scripts/                   工具脚本（不部署）
│  ├─ build-data.cjs          data/jubeat.db → src/data/data.json + songs.json + 同步曲绘
│  ├─ db/build-db.cjs         建库导入（旧 json / xlsx → data/jubeat.db，末尾 ANALYZE）
│  ├─ db/parse-xlsx.cjs       xlsx 更新情报解析
│  ├─ ci/check-refs.cjs       引用完整性检查（源码 / dist 两用）
│  ├─ gen-seo.cjs            生成 robots.txt / sitemap.xml（build 前自动跑）
│  ├─ gen-brand-assets.cjs   生成 og 分享图与 apple-touch-icon（素材变了才跑）
│  ├─ optimize-images.cjs     图片压缩（logo / bg / 曲绘）
│  ├─ subset-fonts.py         字体子集化（woff2 只留拉丁字符）
│  ├─ probe/                  历史探测脚本（Playwright 时代留下的）
│  ├─ screenshots/ logs/ tmp/ 过程产物
│  └─ README.md
│
├─ archive/                   暂不使用的素材与旧项目（不部署，已 gitignore）
│  ├─ materials/              候选素材：曲绘原图、更新情报、版本资料
│  └─ legacy/                 jubeat-wiki / -v2 / -v3 / -v4 四代旧项目
│
├─ .github/workflows/        build-check.yml（push/PR 校验构建与引用完整性）
├─ astro.config.mjs          Astro 配置（output: static + @astrojs/cloudflare 适配器）
├─ tsconfig.json
├─ wrangler.jsonc            Cloudflare Workers 配置（Worker 入口 + ./dist/client 静态资源 + D1 / KV 绑定）
├─ package.json              依赖：astro、@astrojs/cloudflare、wrangler、sharp
├─ dist/                     构建产物，gitignore，部署时上传的就是它
├─ .dsh-meow/  .dsh-ops/      本地工具数据（已 gitignore，勿提交）
├─ .gitignore  .gitattributes
└─ README.md
```

## 数据来源

| 字段 | 来源 |
| --- | --- |
| 曲名 / 谱师 / 三档定数 / 曲绘 | `data/jubeat.db`（SQLite 360 KB，1241 曲 / 3723 谱面；`scripts/db/build-db.cjs` 导入，`db/schema.sql` 建表） |
| **线上实际读的曲库** | Cloudflare D1 数据库 `beyond-jubeat`（id `91a48a18-62b2-4933-9214-788205926744`），内容与上面那份 SQLite 一致；重灌用 `db/seed.sql`（先 `db/schema.sql` 建表） |
| 世代归属与年份 | `src/lib/gens.ts` 的 `GEN_ORDER`（13 条：日服 12 + 国服 1），`scripts/build-data.cjs` 里有同源的一张表 |
| 收录日期 | `songs.added_at`（D1 列名），缺失则为 `null` |

`src/data/data.json` 是上面数据的**聚合快照**，字段：`stat`（总数）、`top`（定数顶格）、`gen`（世代层）、`dist`（定数分布）、`latest`（最近收录）、`dots` / `pad`（散点与填充）、`gen10` / `gen105`（定数 ≥10 / ≥10.5 计数）。

## 开发

```bash
npm install              # astro + wrangler
npm run dev              # 本地开发服务器（本机起不来，见「本机 workerd 的两个坑」）
npm run data             # 重新生成 src/data/data.json 并同步曲绘
npm run build            # 构建到 dist/
npm run check            # 校验源码与 dist 的引用完整性
npm run opt              # 压缩 public/assets/images 下的图片
npm run fonts            # woff2 字体子集化（需 python + fonttools）
```

改版式改 `src/pages` 与 `src/components`，改主题色改 `src/styles/theme.css`，改曲库改 `data/jubeat.db`（本地库）并把同样的数据灌进 D1，改聚合快照跑 `npm run data`。

资源引用一律写站点绝对路径（`/assets/...`）：Astro 会把 CSS 打到 `/_astro/*.css`，相对路径会失效。

`npm run dev` / `npm run preview` **在本机起不来**（workerd 环境问题，见下「本机 workerd 的两个坑」）。改完只能 `npm run build` 后看产物：`dist/client` 是预渲染出来的静态文件（可用任意静态服务器打开），`dist/server` 是 Worker 侧代码；`/songs/` 走 SSR，本地静态服务器里看不到，要验就 push 后看线上。

## 部署

仓库：<https://github.com/SnowindMe/Beyond_JUBEAT>（main 分支）
线上：<https://wiki.byd-ub.top>（自定义域名，绑在 `byd-ub.top` zone 下）
备用：<https://beyond-jubeat.1945743455.workers.dev>

用的是 **Cloudflare Workers（混合渲染）**：`dist/client` 走 Workers Assets 静态资源层（零运行时开销），只有 `/songs/` 落进 Worker 脚本在边缘 SSR 时查 D1。

- Worker 名 `beyond-jubeat`，由 **Cloudflare 的 Git 集成（Workers Builds）在 push 到 main 后自动构建 + 部署**。
- `wrangler.jsonc`：`assets.directory = "./dist/client"`、`not_found_handling = "404-page"`、`main = "@astrojs/cloudflare/entrypoints/server"`。
- 两个绑定必须和 Cloudflare 侧一致，漏了会部署失败：`SESSION`（KV；适配器给 Astro Sessions 自动挂的，暂时没用也得写 id）、`beyond_jubeat`（D1）。
- Astro 以 `output: "static"` 构建：没标 `prerender = false` 的页面照旧预渲染成 HTML，只有曲目页进 Worker。所以 `dist/client/songs/index.html` 不存在，这是正常的。
- `dist/server/wrangler.json` 才是带绑定的那份配置，`wrangler deploy` 通过 `.wrangler/deploy/config.json` 指过去。
- 曲目页的 HTTP 缓存自己设：`cache-control: public, max-age=30, s-maxage=300, stale-while-revalidate=60`；Worker 内还有 60s 的 isolate 级内存缓存（`src/lib/db.ts`）。
- `dist/` 与 `node_modules/`、`.astro/`、`.wrangler/` 都在 `.gitignore`，产物由云端构建生成。

也就是说：**只需要 push，剩下的云端自己干**。

```bash
git push                 # Cloudflare 自动构建 + 部署
```

本地手动部署（一般用不到，等价于云端做的事）：

```bash
npm run deploy           # build + wrangler deploy
```

> 旧的 `jubeat-wiki-home` worker 已删除；GitHub Actions 的 `deploy.yml` 也已移除，避免和 Cloudflare 的自动构建重复部署。

### 本机 workerd 的两个坑（适配器为什么这么配）

接 D1 必须装回 `@astrojs/cloudflare`，但它自带的 miniflare/workerd 在这台 Windows 上会崩：

```
Fatal uncaught kj::Exception: kj/filesystem-disk-win32.c++:773: failed: CreateDirectory: #5 拒绝访问。; path = miniflare-email-store
```

**坑 1 · 构建期预渲染**：适配器默认用 workerd 跑预渲染，上面这条直接让 `npm run build` 挂掉。解法是 `astro.config.mjs` 里写 `prerenderEnvironment: 'node'`，改用 Node 跑预渲染，产物完全一致，云端（Linux）也不受影响。

**坑 2 · 本地 dev server 起不来**：同一个崩溃发生在 `npm run dev`、`npm run preview`、`npx wrangler dev` 的**启动阶段**——miniflare 在 `os.tmpdir()` 下建临时目录，然后 workerd 自己要在里面建 Durable Object 存储目录，被本机权限拒绝（设 `TEMP`/`TMP`/`TMPDIR`、手动建同名空目录都无效）。所以本机没有可用的 dev server，改动一律靠 `npm run build` + 线上验证；CI 与 Cloudflare 的构建都在 Linux 上跑，不受影响。

同理，`platformProxy: { enabled: false }` 也是为了避免 dev 时连本地 D1 代理；没有 D1 绑定时代码会退回读 `src/data/songs.json`（仅 DEV，构建期会被摇掉，不进 Worker 包）。

### 自定义域名

已把 `wiki.byd-ub.top` 挂到 worker（Workers Custom Domain，证书与 DNS 记录自动生成；当前 `service` 已指向 `beyond-jubeat`）：

```bash
PUT /accounts/{account_id}/workers/domains
{"environment":"production","hostname":"wiki.byd-ub.top","service":"beyond-jubeat","zone_id":"..."}
```

注意：这个 zone 开着 Browser Integrity Check，用 curl 裸请求（不带 UA）访问自定义域名会被 CF 拦成 403 `Cf-Mitigated: challenge`；带浏览器 UA 就是正常 200。浏览器访问不受影响。

### 响应头（`public/_headers`）

Cloudflare 静态资源会自动读取 dist 根下的 `_headers`：

| 路径 | 策略 |
| --- | --- |
| `/*` | nosniff、SAMEORIGIN、strict-origin-when-cross-origin、收紧 Permissions-Policy |
| `/assets/fonts/*`、`/assets/images/*` | `max-age=31536000, immutable`（内容不变，长缓存） |
| `/_astro/*` | `max-age=31536000, immutable`（文件名带内容 hash，天然不可变） |
| `/index.html`、`/404.html` | `max-age=0, must-revalidate`（每次都回源确认） |
| `/favicon.svg` | `max-age=86400` |

### SEO 与站点图标

| 项 | 位置 | 说明 |
| --- | --- | --- |
| `robots.txt` / `sitemap.xml` | `public/`（构建时生成） | `npm run build` 先跑 `scripts/gen-seo.cjs`，lastmod 是当天；只收录首页，施工中的二级页不进 sitemap |
| og:image | `public/assets/images/og/cover.png` | 1200x630，字标反相后压在 ave 背景上；`scripts/gen-brand-assets.cjs` 生成 |
| apple-touch-icon | `public/apple-touch-icon.png` | 180x180，由 `favicon.svg` 渲染 |
| canonical / og / twitter | `src/layouts/Base.astro` | 默认拼 `https://wiki.byd-ub.top` + `canonicalPath`；404 页传 `canonicalPath=""` 且 `noindex`，不输出 canonical |

素材（背景/站标/字体）换了之后跑一次 `node scripts/gen-brand-assets.cjs` 重生成分享图。

### CI（GitHub Actions）

| 工作流 | 触发 | 做什么 |
| --- | --- | --- |
| `build-check.yml` | push / PR | `npm ci` → `npm run build` → 校验源码与 dist 的引用完整性 |

部署不再走 GitHub Actions，交给 Cloudflare Workers Builds。

## 性能

实测（本机 `dist/` 静态服务器 + ego 浏览器，1280x800，冷加载跑 3 次取中位数）：

| 指标 | 值 |
| --- | --- |
| 请求数 | 20 |
| 解码后总字节 | 160 KB |
| TTFB | 20 ms |
| FCP | 440 ms |
| DOMContentLoaded | 208 ms |
| load | 470 ms |

字节构成：图片 11 KB + CSS/字体 6 KB（首屏只取当前世代的 1 张背景 + 1 张站标 + 9 张曲绘；背景 32 KB 与站标 11 KB 走 head 里的 preload，和 CSS 并行）。

做过这几件事：

| 项 | 做法 | 效果 |
| --- | --- | --- |
| 字标 | 世代站标原本全部渲染、靠 CSS 隐藏 → 改成单个 `<img id="wordLogo">` 按当前世代设 src | 少下 10 张，约 -160 KB |
| 曲绘 | 78 张缩到 144x144（显示 84 CSS px，够了） | 1344 → 438 KB |
| 背景 | 世代背景缩到 1440 宽 q62 | 单张 5–62 KB |
| 站标 | PNG → WebP，360 宽 q88 | 421 → 179 KB |
| 字体 | woff2 子集化到拉丁区（U+0020-007E） | 168 → 113 KB |
| 缓存 | `_headers` 给 `/_astro/*` 加一年 immutable | 二次访问不再回源取 CSS |
| 主题 | head 里内联预热脚本，先读 localStorage 再渲染 | 老用户刷新不闪 ave |

压缩用 `npm run opt`（sharp）、子集化用 `npm run fonts`（fonttools）。注意两个脚本都是**原地覆盖**，重复跑会越压越糊；要重压先从 git 历史取原图（`91e698e` 是最后一批原图）。

图片是体积大头；整站素材（15 张背景 + 12 张站标 + 1305 张曲绘 + 7 个字体）约 11.7 MB，但首屏只取当前世代的 1 张站标 + 1 张背景 + 9 张曲绘，曲目页的曲绘全部 `loading="lazy"`，其余按需。

曲目页在 v1.7.0 前是构建期把 1241 首全量烘进 HTML（`dist/songs/index.html` 592 KB raw / brotli 49.8 KB）；改成 SSR 读 D1 之后这份 HTML 不再存在，首屏字节由浏览器按需索取，代价是 Worker 冷启时多一次 D1 查询（命中 isolate 缓存则省掉）。

## 本地预览构建产物

```bash
npm run build
# dist/client 里的静态页：随便起个静态服务器即可
npx wrangler dev         # 本机起不来（见上），要验 SSR 只能看线上
```

## 说明

`archive/` 里四代旧项目体积约 1.6 GB，由 `archive/.gitignore` 忽略（内含 `materials/`、`legacy/`），不会进仓库。