<p align="center">
  <img src="public/assets/images/logo/brand.webp" alt="Beyond ↑ JUBEAT ♪~ 站标" width="252">
</p>

# Beyond_JUBEAT

**jubeat（音乐魔方）中文资料站** —— 双服曲库、谱面定数、Jubility 理论值与世代沿革。

[![build-check](https://github.com/SnowindMe/Beyond_JUBEAT/actions/workflows/build-check.yml/badge.svg)](https://github.com/SnowindMe/Beyond_JUBEAT/actions/workflows/build-check.yml)
[![release](https://img.shields.io/github/v/release/SnowindMe/Beyond_JUBEAT)](https://github.com/SnowindMe/Beyond_JUBEAT/releases)
![Astro](https://img.shields.io/badge/Astro-7.4-ff5d01)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-live-F38020)
![license](https://img.shields.io/badge/license-MIT-green)

线上：<https://wiki.byd-ub.top> · 国内加速：<https://wiki-cn.byd-ub.top>

> 2026-11-19 起关闭 `*.workers.dev` 与 preview URL（`wrangler.jsonc` 的 `workers_dev` / `preview_urls` 均为 false），
> 两条 workers.dev 地址已不通，只能走上面两个自有域名。Workers Logs 也一并关闭。

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

**规模**（2026-11-22 实测）：**1269 首曲目 / 3807 张谱面**；其中日服独占 725 首、双服 440 首、国服独有 104 首（同一首可双服上线）。长押谱 332 张，另有 12 张长押状态未知。数据截至国服 2026-10 更新表；日服 `U'nit` 世代 2026-11-22 接入，曲目取自 RemyWiki 的 Location Test 列表，暂用占位 id。

**世代与主题不是一回事**：**世代 14 个是数据口径**（13 个日服世代 + 国服「音乐魔方」），**主题 17 套是视觉口径**（`clan` 一个世代拆成红蓝绿紫 4 套）。要数就取各自的 `length`（`src/lib/gens.ts` / `src/lib/themes.ts`），别手抄。

## 功能特性

- **双服曲库**：日服 / 国服各自成库，同一首曲可双服上线；服务器选项卡与世代分组一一对应。
- **筛选与排序**：难度、定数区间、谱面类型（STD / HOLD / [2]）、世代、上线日期（日历只放开真实上架日）；六种排序（songId 升降、定数升降、曲名升降），默认 songId 升序。筛选状态可一键重置。
- **曲目详情**：定数条 + 难度参照系、Notes/Holds 读数与全库分位、谱面密度条（键数校验不过就不画）、别名与标签、BGM 试听与来源标注。
- **Jubility 理论值**：12 档阶梯与公式口径，页面现算。
- **17 套世代主题**：配色 + 字体 + 背景图，切换存 localStorage；同一主题下字标宽度、墨迹基线、徽章配色都跟世代走。没选过主题时跟随系统明暗（系统浅色给 `yymf`，其余默认 `bta`）。
- **用户系统**：游客 / 玩家 / 维护者 / 站长四层，注册登录、账户设置、维护者编辑与最近更改。
- **工程护栏**：9 段自检与三条 GitHub Actions 流水线，见 [docs/quality.md](docs/quality.md)。

### 已下线：今日运势与热门歌曲

2026-11-12 从首页摘掉，组件、样式、数据层（`lib/hotPage.ts`、`lib/hot.ts`、D1 埋点、KV 快照）与 `check-fortune-dist.mjs` 全部原样保留，恢复时取消 `index.astro` 里注释掉的 import 与 `<div class="fh-split">` 即可。两条关键口径，换实现时别丢：

- **今日运势**：种子 = 日期 + 访客（游客恒为 `guest`，所以可被边缘缓存）。一天一个运气值（0–120），三首由它派生（第 1 首比运气低一级、第 3 首高一级，两端截平），3 级以下谱面再把要求抬一到两格；候选从各服自己的曲库按日哈希摊开抽，不走热榜。
- **热门歌曲**：热度口径是**独立听众数**，一人一曲一天只算一次（主键 `(day, song_id, visitor)` + `INSERT OR IGNORE`），真出声满 8 秒才打点。每天 00:05 把「昨天为末日的前 7 天」封成快照，当天读这一份；窗口内不同曲数不足 6 首时降级成新曲推荐（判据是曲数不是行数）。

## 快速开始

需要 Node 22+（`npm ci` → 重建本地曲库 → `npm run dev`，且**本地 D1 必须先灌两份 sql**，否则 `/songs` 直接 500）。

```bash
npm ci
npm run db    # 重建本地曲库（首次必须，或从别人那里拿一份 data/jubeat.db）
npm run dev   # astro dev，默认 4321
```

命令行、workerd 的 Windows 坑、代理环境、环境变量与密钥全表 → [docs/development.md](docs/development.md)。

## 目录结构

```
src/
├─ pages/            index · songs（含 [songId] 与 frag）· jubility · recent · login/register/account/admin · api/*
├─ components/       Hero / SongCard / GenBlock / SongAudio / Header / ThemeScript / …
├─ layouts/Base.astro、middleware.ts、worker.ts、styles/、lib/、data/（生成物，不入库）
public/              _headers · manifest · sw.js · assets（背景/曲绘/站标/字体/js）
data/                管线输入（xlsx 源表、上游快照）与本地库（不入库）
db/                  schema · seed · 增量补丁 · 8 份迁移
scripts/             构建、数据管线、抓取、CI 自检、运维（见 scripts/README.md）
docs/                库表、架构、开发、数据管线、用户系统、检查与 CI
```

各目录职责、`src/pages` 逐文件说明见 [docs/architecture.md](docs/architecture.md)。

## 深入了解

| 文档                                      | 内容                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- |
| [architecture.md](docs/architecture.md)    | 技术栈与运行形态、绑定、目录职责、缓存与响应头、曲绘反代、品牌资源版本 |
| [development.md](docs/development.md)      | 常用命令、本地 D1、workerd 坑、验站约定、环境变量与密钥               |
| [data.md](docs/data.md)                    | 数据与代码分离、数据管线、部署与发布、版本标签与说明、上线前迁移       |
| [users.md](docs/users.md)                  | 用户四层身份与八条安全口径、维护者编辑                                |
| [quality.md](docs/quality.md)              | 9 段自检、三条流水线、常见问题                                        |
| [database-schema.md](docs/database-schema.md) | 表结构与灌库规则，任何计数前先读，含 grep 陷阱与口径判据            |
| [site-structure.md](docs/site-structure.md)   | 页面层级与各页职责                                                  |
| [CONTEXT.md](docs/CONTEXT.md)                 | 术语表，写代码命名前对一下                                          |
| [releases/](docs/releases/)                   | 一份发版一个文件，Release 正文的来源                                 |

## 性能

实测（2026-11-17，本机 `dist/` 静态服务器，1280×800，冷加载 3 次取中位数）：20 个请求、160 KB、TTFB 20ms、FCP 440ms、load 470ms。首屏只取当前世代的 1 张背景 + 1 张站标 + 16 张曲绘，曲绘全部 `loading="lazy"`……**除了首页方阵**：那 16 格在遮挡区，懒加载只会让图在滚动时才闪出来，而单张曲绘只有 7 KB。

做过的事：站标由「全部渲染靠 CSS 隐藏」改成单个 `<img>` 按世代换 src（少下 10 张）；曲绘缩到 144×144；背景缩到 1440 宽 q62；PNG 转 WebP；`/_astro/*` 与 `/assets/*` 长缓存；head 内联预热脚本先读 localStorage 再渲染。

列表排序（2026-11-17 按 modern-web-guidance 改）：原本只写 `style.order`、DOM 顺序永不变化，键盘 Tab 与读屏的顺序和眼睛看到的相反。现在改为移动真实节点（`moveBefore`，不支持时 `append`），重排后用一条 `role="status"` 报一次结果，焦点留在触发控件上。

动效：只动 `opacity`/`transform`；系统开「减少动态效果」时关掉全部位移与缩放（唱片停转、卡片不放大、定数条不做宽度过渡），颜色过渡保留——**不要**用全局 `animation-duration:0.01ms`，那会把带 delay 的错开入场压塌。

`npm run opt` 与字体子集化都是**原地覆盖**，重复跑会越压越糊，要重压先从 git 历史取原图。字体已于 2026-11-02 改为站内自托管（`public/assets/fonts/`，当前 11 款 woff2）——原来走 CDN，跨域往返直接压在 FCP 上，实测单次要 1.0–1.4s。

## 许可与致谢

**许可**：本仓库的**代码**以 [MIT](LICENSE) 授权，可自由使用、修改、分发，保留版权与许可声明即可。

但 MIT **不覆盖站内内容**：曲名、曲绘、音频、谱面数据、商标等版权归 KONAMI 及各权利人所有，本站为非官方资料站，与 KONAMI 无隶属关系。二次部署请自行确认内容的使用边界——「代码开源」不等于「内容可用」。

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
