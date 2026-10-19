# Beyond_JUBEAT

jubeat（音乐魔方）中文资料站。用 **Astro 7** 构建的静态多页站点，线上托管在 Cloudflare Workers。

![deploy](https://img.shields.io/badge/Cloudflare_Workers-live-F38020) ![astro](https://img.shields.io/badge/Astro-7.4-ff5d01) ![repo](https://img.shields.io/badge/GitHub-Beyond__JUBEAT-181717)

线上地址：<https://wiki.byd-ub.top>（自定义域名） · <https://jubeat-wiki-home.1945743455.workers.dev>（workers.dev）

---

## 这是什么

把 jubeat 从 2008 年（jubeat）到 2023 年（jubeat 音乐魔方）**15 个世代 / 513 首曲目 / 1512 个谱面**整理成一个可浏览的资料站。

> 当前版本：四个数据区块（世代的层 / 定数顶格 / 定数分布 / 最近收录）已下线，正文换成一句「正在施工中，前面的区域以后再来探索吧......」的占位告示。数据仍在 `src/data/data.json` 里，随时可以接回来。

页面支持 **13 套世代主题**（切换时背景交叉淡入、字体与强调色整套更换），选择存在 localStorage。

## 项目清单

```
Beyond_JUBEAT/
├─ src/                       Astro 源码
│  ├─ pages/
│  │  ├─ index.astro          首页（Hero + 施工中占位）
│  │  └─ 404.astro            404 页
│  ├─ components/
│  │  ├─ Header.astro         顶部导航 + 主题切换按钮
│  │  ├─ Hero.astro           主视觉（站标 / 统计 / 曲绘方块）
│  │  └─ ThemeScript.astro    世代主题切换脚本（内联进页面）
│  ├─ layouts/Base.astro      全站骨架（head / 背景板 / footer）
│  ├─ styles/theme.css        全站样式（约 38 KB）
│  └─ data/data.json          页面聚合数据（约 11 KB）
│
├─ public/                    原样拷进 dist 根的内容
│  ├─ assets/
│  │  ├─ images/bg/           13 张世代主题背景 webp（988 KB）
│  │  ├─ images/jackets/      78 张曲绘 webp（1344 KB）
│  │  ├─ images/logo/         10 张世代站标 png（421 KB）
│  │  ├─ fonts/               7 个 woff2 主题/装饰字体（168 KB）
│  │  └─ data/ docs/ media/   预留空目录
│  ├─ _headers                Cloudflare 静态资源响应头
│  └─ favicon.svg             站点图标
│
├─ scripts/                   工具脚本（不部署）
│  ├─ build-data.cjs          songs.json → src/data/data.json + 同步曲绘
│  ├─ ci/check-refs.cjs       引用完整性检查（源码 / dist 两用）
│  ├─ probe/                  历史探测脚本（Playwright 时代留下的）
│  ├─ screenshots/ logs/ tmp/ 过程产物
│  └─ README.md
│
├─ archive/                   暂不使用的素材与旧项目（不部署，已 gitignore）
│  ├─ materials/              候选素材：曲绘原图、更新情报、版本资料
│  └─ legacy/                 jubeat-wiki / -v2 / -v3 / -v4 四代旧项目
│
├─ .github/workflows/        build-check.yml（校验构建）+ deploy.yml（push 即上线）
├─ astro.config.mjs          Astro 配置（output: static，无 adapter）
├─ tsconfig.json
├─ wrangler.jsonc            Cloudflare Workers 配置（静态资源托管 ./dist）
├─ package.json              devDependencies：astro、wrangler
├─ dist/                     构建产物，gitignore，部署时上传的就是它
├─ .dsh-meow/  .dsh-ops/      本地工具数据（已 gitignore，勿提交）
├─ .gitignore  .gitattributes
└─ README.md
```

## 数据来源

| 字段 | 来源 |
| --- | --- |
| 曲名 / 谱师 / 三档定数 / 曲绘 | `archive/legacy/jubeat-wiki-v3/data/songs.json`（513 曲 / 1512 谱面） |
| 世代归属与年份 | `scripts/build-data.cjs` 里的 `META` 表（15 条，jubeat → 音乐魔方） |
| 收录日期 | `songs.json` 的 `addedAt`，缺失则为 `null` |

`src/data/data.json` 是上面数据的**聚合快照**，字段：`stat`（总数）、`top`（定数顶格）、`gen`（世代层）、`dist`（定数分布）、`latest`（最近收录）、`dots` / `pad`（散点与填充）、`gen10` / `gen105`（定数 ≥10 / ≥10.5 计数）。

## 开发

```bash
npm install              # astro + wrangler
npm run dev              # 本地开发服务器（热更新）
npm run data             # 重新生成 src/data/data.json 并同步曲绘
npm run build            # 构建到 dist/
npm run check            # 校验源码与 dist 的引用完整性
```

改版式改 `src/pages` 与 `src/components`，改主题色改 `src/styles/theme.css`，改数据改 `scripts/build-data.cjs` 的 `META` 或源头 `songs.json`。

资源引用一律写站点绝对路径（`/assets/...`）：Astro 会把 CSS 打到 `/_astro/*.css`，相对路径会失效。

## 部署

仓库：<https://github.com/SnowindMe/Beyond_JUBEAT>（main 分支）
线上：<https://wiki.byd-ub.top>（自定义域名，绑在 `byd-ub.top` zone 下）
备用：<https://jubeat-wiki-home.1945743455.workers.dev>

用的 **Cloudflare Workers 静态资源托管**（Workers Assets），没有 Worker 脚本逻辑：

- `wrangler.jsonc` 指向 `assets.directory = "./dist"`，`not_found_handling = "404-page"`。
- Astro 以 `output: "static"` 构建，产物就是纯静态文件，`wrangler deploy` 直接上传。
- `dist/` 与 `node_modules/`、`.astro/`、`.wrangler/` 都在 `.gitignore`，产物由流水线生成。

日常改动上线：

```bash
git push                 # GitHub Actions 自动构建 + 部署（约 20 秒）
```

或本地手动：

```bash
npm run deploy           # build + wrangler deploy
```

### 为什么没有 `@astrojs/cloudflare` 适配器

装了会在本机 build 阶段崩：

```
Fatal uncaught kj::Exception: kj/filesystem-disk-win32.c++:773: failed: CreateDirectory: #5 拒绝访问。; path = miniflare-email-store
```

适配器会起 miniflare/workerd 建临时目录，被本机权限拦掉。当前全部页面都是预渲染静态页，用不上 SSR，所以直接卸掉、走 `output: 'static'`。以后要接 D1 或 API 路由时再装回来，并把需要的页面设为 `export const prerender = false`。

### 自定义域名

已把 `wiki.byd-ub.top` 挂到 worker（Workers Custom Domain，证书与 DNS 记录自动生成）：

```bash
PUT /accounts/{account_id}/workers/domains
{"environment":"production","hostname":"wiki.byd-ub.top","service":"jubeat-wiki-home","zone_id":"..."}
```

注意：这个 zone 开着 Browser Integrity Check，用 curl 裸请求（不带 UA）访问自定义域名会被 CF 拦成 403 `Cf-Mitigated: challenge`；带浏览器 UA 就是正常 200。浏览器访问不受影响。

### 响应头（`public/_headers`）

Cloudflare 静态资源会自动读取 dist 根下的 `_headers`：

| 路径 | 策略 |
| --- | --- |
| `/*` | nosniff、SAMEORIGIN、strict-origin-when-cross-origin、收紧 Permissions-Policy |
| `/assets/fonts/*`、`/assets/images/*` | `max-age=31536000, immutable`（内容不变，长缓存） |
| `/index.html`、`/_astro/*` | `max-age=0, must-revalidate` |

### CI（GitHub Actions）

| 工作流 | 触发 | 做什么 |
| --- | --- | --- |
| `build-check.yml` | push / PR | `npm ci` → `npm run build` → 校验源码与 dist 的引用完整性 |
| `deploy.yml` | push main / 手动 | `npm ci` → 构建 → `wrangler-action` 部署 |

`deploy.yml` 需要两个仓库 Secret，未配置时会打 warning 并跳过部署，不会报红：

| Secret | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 控制台 → My Profile → API Tokens → Create Token，模板选 Edit Cloudflare Workers |
| `CLOUDFLARE_ACCOUNT_ID` | `6327ccf25660e1b2bde4a731ff9d68c0` |

### 待办

- [x] 建 GitHub 仓库并推首次提交 —— `SnowindMe/Beyond_JUBEAT`
- [x] `wrangler.jsonc` 配置 Workers Assets 托管 `dist/`
- [x] 自定义域名 `wiki.byd-ub.top`
- [x] GitHub Actions 自动部署
- [x] 迁移到 Astro 7（多页可扩展）
- [ ] 图片优化：曲绘按显示尺寸降到 168px、背景缩到 1600 宽转 WebP、站标 PNG→WebP（预计首屏体积减半）
- [ ] 接回四个数据区块（世代的层 / 定数顶格 / 定数分布 / 最近收录）
- [ ] 若要接 D1：把 `data.json` 迁到数据库表，页面改走接口
- [ ] 补曲目列表 / 谱面详情 / 定数表等子页面

## 本地预览构建产物

```bash
npm run build
npx wrangler dev         # 或 npm run preview（build + dev）
```

## 说明

`archive/` 里四代旧项目体积约 1.6 GB，由 `archive/.gitignore` 忽略（内含 `materials/`、`legacy/`），不会进仓库。
