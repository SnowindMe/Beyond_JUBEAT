# Beyond ↑ JUBEAT · 网站层级结构

> 状态图例：**✅ 已上线** · **💭 待做**（含「规划中」与「候选」两类；v1.9.1 起未做的页面**不再挂导航**，没有死链）
> 生成依据：`src/pages/` 实际文件、`src/components/Header.astro:10` 导航、`src/data/data.json` 字段、`README.md:15-21` 的下线说明、历史项目 `archive/legacy/jubeat-wiki-v2` 的页面清单。
> 日期：2026-10-21

---

## 一、层级树

```
Beyond ↑ JUBEAT（https://wiki.byd-ub.top）
│
├─ ✅ 首页 /
│   ├─ Hero 主视觉（站标 / 4 张统计卡 / 15 宫格曲绘方块）
│   ├─ 世代主题切换（顶栏 #tswBtn → 15 套主题弹层）
│   └─ 施工中占位（index.astro:15-21）
│
├─ ✅ 曲目 /songs/（2026-10-21 上线，v1.6.0；v1.7.0 起改 SSR 读 D1）
│   ├─ ✅ 日服 / 国际服 / 国服三卡切换（logo 上、名在下；国际服暂共用日服曲库）
│   ├─ ✅ 分区筛选（日服：版权/原创；国服：KONAMI原创/音乐魔方原创/音乐魔方流行）+ 世代分组
│   ├─ ✅ 数据来源：运行时查 Cloudflare D1（`beyond_jubeat` 绑定），1241 首走 `idx_songs_order` 覆盖索引；
│   │   页面 `prerender = false` 是本站唯一 SSR 页，缓存 `max-age=30, s-maxage=300, stale-while-revalidate=60` + isolate 内 60s 内存缓存
│   ├─ ✅ 曲目详情 /songs/[songId]/（2026-10-22 上线，v1.10.0；与 /songs/ 同为 SSR 查 D1）
│   │   ├─ ✅ 曲绘 / 曲名 / 作曲者 / 三档定数刻度条 / songId / 世代 / 分区 / 服务器 / BPM / 上线 / 解禁
│   │   ├─ ✅ 不存在的 id 在原 URL 回 404 状态 + noindex
│   │   ├─ 💭 Jubility 理论值
│   │   └─ 💭 上一首 / 下一首
│   │   ⤷ 谱面预览：v1.12.0 曾内嵌 ub.thregren.world 播放器（经 /ub-proxy 代理），v1.13.0 已整体下线
│   └─ 💭 世代筛选 /songs/gen/[gen]/（15 个世代）
│
├─ 🚧 Jubility /jubility/
│   ├─ 💭 理论值总表（按定数排序）
│   └─ 💭 与曲目详情双向链接
│
├─ 🚧 Emblem /emblem/
│   └─ 💭 称号 / 徽章图鉴（数据尚未进入 data.json）
│
├─ 🚧 伙伴 /partners/
│   └─ 💭 伙伴系统资料（数据尚未进入 data.json）
│
├─ 🚧 成就 /achievements/
│   └─ 💭 成就 / 任务列表（数据尚未进入 data.json）
│
├─ ✅ 最近更改 /recent/
│   ├─ ✅ 空状态（recent.astro:26-34）
│   ├─ 💭 变更列表（time / user / target / summary / before / after）
│   └─ 💭 前后差异折叠（details.rc-diff，已写样式未接数据）
│
├─ 🚧 关于 /about/
│   ├─ 💭 数据口径与来源
│   ├─ 💭 构建信息（BUILD_DATE / site.version）
│   └─ 💭 已知缺口说明
│
├─ 🚧 登录 /login/
│   ├─ 💭 登录
│   ├─ 💭 注册
│   ├─ 💭 找回密码 / 重置密码 / 邮箱验证
│   └─ 💭 账户设置（改密）
│
└─ ✅ 404 /404
    └─ 自定义「这里还没有铺路」页（404.astro:7-13）

────────────────────────────────────────────
以下为数据已具备、页面尚未规划的候选层级（💭）

├─ 💭 世代 /gens/               ← data.json 的 gen（15 项）、stat.gens
│   └─ 💭 世代详情 /gens/[gen]/ ← gen[].y 年份、gen[].n 曲数、gen[].rep 代表作
├─ 💭 定数分布 /charts/         ← data.json 的 dist（6 档）、dots（散点）、gen10 / gen105
├─ 💭 定数顶格 /top/            ← data.json 的 top（12 条）
├─ 💭 最近收录 /latest/         ← data.json 的 latest（12 条，含 addedAt）
├─ 💭 搜索 /search/             ← 需要构建期生成 search-index.json
├─ 💭 玩法与判定 /gameplay/     ← 沿用 v2 的「基础玩法与用语表」
├─ 💭 版本沿革 /versions/       ← 沿用 v2 的「版本阅读索引」
├─ 💭 隐藏曲充能 /unlock/       ← 沿用 v2 的「五个充能池」
├─ 💭 段位图鉴 /dans/           ← 沿用 v2 的「段位与练习入口」
├─ 💭 新手上路 /guide/          ← 沿用 v2 的「新手阅读指南」
└─ 💭 更新情报 /updates/        ← 沿用 v2 的「数据快照与更新记录」
```

---

## 二、当前导航实际指向

来源：`src/components/Header.astro` 的 `.nav-txt`（宽屏文字链）、`.nav-drawer`（窄屏抽屉）、`.nav-ico`（图标链）

| 位置 | 链接 | 目标 | 实际状态 |
| --- | --- | --- | --- |
| 文字链 1 | 曲目 | `/songs/` | ✅ 已上线 |
| 文字链 2 | 最近更改 | `/recent/` | ✅ 已上线 |
| 图标 1 | GitHub 仓库 | 外部仓库 | ✅ 外链 |
| 图标 2 | 最近更改 | `/recent/` | ✅ 窄屏专用入口 |

**结论（v1.9.1 起）**：导航只列真实存在的页面，**没有一条死链**。

Jubility / Emblem / 伙伴 / 成就 / 关于 / 登录 六条在 v1.9.0 及以前挂在顶栏，指向尚未实现的二级页、落进自定义 404。主人 2026-10-22 拍板「先砍死链，以后计划做再加回来」——这六条已从 `.nav-txt`、`.nav-drawer`、`.nav-ico` 三处一并撤下；页面做出来后再同步加回（宽屏 + 抽屉两处都要加）。

> 加新页规则：见记忆里的「导航三处」准则——宽屏 `.nav-txt` + 窄屏 `.nav-drawer` + `.nav-ico`，缺一处手机上进不去。

---

## 三、层级与数据字段的对应关系

| 页面层级 | 需要的字段 | 现状 |
| --- | --- | --- |
| 首页统计卡 | `stat.songs` `stat.charts` `stat.gens` `gen10` | ✅ 已有 |
| 首页曲绘方块 | `gen[].rep.cover` `gen[].k` | ✅ 已有 |
| 曲目列表 | D1 `songs` 表的全量字段（曲名 / 作曲 / 三档定数 / 曲绘 / 世代 / 分区 / 收录日期） | ✅ 已有（v1.7.0 起运行期读 D1，`src/lib/db.ts` 的 `getAllSongs`） |
| 曲目详情 | 同上 + `added_at` + `unlock_note` | ✅ 已用上；谱面预览功能已于 v1.13.0 下线 |
| Jubility 理论值 | 定数 → 理论值映射表 | ❌ `data.json` 无此字段 |
| Emblem / 伙伴 / 成就 | — | ❌ `data.json` 无此字段 |
| 定数分布 | `dist` `dots` `gen105` | ✅ 已有（当前无页面消费） |
| 世代详情 | `gen[].y` `gen[].n` `gen[].rep` | ✅ 已有 |
| 最近更改 | `recent-changes.json` 的 `changes[]` | ✅ 结构已定，数组为空 |

---

## 四、与历史项目的层级对照

历史项目页面清单（`archive/legacy/jubeat-wiki-v2/src/pages/`），可作为新站层级的参照：

| v2 页面 | 标题 | 新站对应 | 差异 |
| --- | --- | --- | --- |
| `index.astro` | 首页 | ✅ 首页 | 新版改成单屏 Hero + 主题切换 |
| `songs.astro` | 曲目库 | ✅ /songs/ | 已上线（三卡切换 + 分区筛选） |
| `songs/[songId].astro` | 曲目详情 | ✅ /songs/[songId]/ | 已上线（v1.10.0）；谱面预览 v1.13.0 下线 |
| `jubility.astro` | Jubility 理论值 | 💭 /jubility/ | 待实现，导航已撤 |
| `versions.astro` | 版本沿革 | 💭 /versions/ | 导航未列，候选 |
| `gameplay.astro` | 玩法与判定 | 💭 /gameplay/ | 导航未列，候选 |
| `unlock.astro` | 隐藏曲充能 | 💭 /unlock/ | 导航未列，候选 |
| `guide.astro` | 新手上路 | 💭 /guide/ | 导航未列，候选 |
| `dans.astro` | 段位图鉴 | 💭 /dans/ | 导航未列，候选 |
| `updates.astro` | 更新情报 | 💭 /updates/ | 导航未列，候选 |
| `about.astro` | 关于本站 | 💭 /about/ | 待实现，导航图标已撤 |
| `404.astro` | — | ✅ /404 | 已实现 |

**v2 有、新站导航没列的**：版本沿革 / 玩法与判定 / 隐藏曲充能 / 新手上路 / 段位图鉴 / 更新情报 —— 共 6 个页面在历史项目里存在，新站顶栏没有对应入口。是保留还是砍掉，需要主人拍板。

**新站有、v2 没有的**：世代主题切换（15 套）、开屏 LOADING、最近更改、曲目库三卡切换、曲目页 SSR 读 D1。

**渲染架构（v1.7.0 起）**：`output: 'static'` + `@astrojs/cloudflare` 适配器的混合渲染——没标 `prerender = false` 的页面照旧在构建期预渲染，产物进 `dist/client` 由 Workers Assets 直出；只有 `/songs/` 进 Worker 脚本，请求时查 D1 再渲染。所以 `dist/client/songs/index.html` 不存在，这是有意为之。数据权威源是 `data/jubeat.db`（本地 SQLite）→ `db/seed.sql` 重放进 D1。

---

## 五、建议的落地顺序

1. ~~**/songs/ 曲目库**~~ ✅ 已完成（v1.6.0；v1.7.0 改成读 D1 的 SSR）
2. ~~**/songs/[songId]/ 曲目详情**~~ ✅ 已完成（v1.10.0；谱面预览 v1.13.0 下线）
3. **/jubility/**（数据需先补进 `data.json`）
4. **/about/**（纯文案，成本最低，可先做）
5. **/login/**（需要后端，建议等 D1 + Workers 接入后再做）
6. **/emblem/ · /partners/ · /achievements/**（数据尚未整理，最后做）
