# Beyond_JUBEAT

jubeat（音乐魔方）中文资料站。纯静态单页，零运行时依赖，构建工具只用 Node 内置模块。

![deploy](https://img.shields.io/badge/Cloudflare_Workers-planned-F38020) ![size](https://img.shields.io/badge/static-17192_bytes-3ee6ff)

---

## 这是什么

把 jubeat 从 2008 年（jubeat）到 2023 年（jubeat 音乐魔方）**15 个世代 / 513 首曲目 / 1512 个谱面**整理成一个可浏览的资料页：

- **世代的层**：15 个世代按曲数排成柱带，每代给一首代表作与代表作曲绘
- **定数顶格**：ext / adv / bsc 三档最高定数的曲目榜
- **定数分布**：按 ext 定数（6 / 7 / 8 / 9 / 10 / 10.5）统计谱面数量
- **最近收录**：按 addedAt 倒序列出新近收录曲

页面支持 **13 套世代主题**（切换时背景交叉淡入、字体与强调色整套更换），选择存在 localStorage。

## 项目清单

```
Beyond_JUBEAT/
├─ src/                       站点源码（部署时上传的就是这一层 + assets/）
│  ├─ index.html              构建产物，线上页面（17192 字节）
│  ├─ template.html           页面模板，含 {{占位符}}（7525 字节）
│  ├─ theme.css               全站样式（37147 字节）
│  └─ _build/                 构建工具链（不参与部署）
│     ├─ build.cjs            模板 + 数据 → ../index.html
│     ├─ build-data.cjs       songs.json → data.json
│     └─ data.json            页面所需的聚合数据（10834 字节）
│
├─ assets/                    静态资源（按类型分组，部署时要一起上传）
│  ├─ images/bg/              13 张世代主题背景 webp（988 KB）
│  ├─ images/jackets/         78 张曲绘 webp（1344 KB）
│  ├─ images/logo/            10 张世代站标 png（421 KB）
│  ├─ fonts/                  7 个 woff2 主题/装饰字体（168 KB）
│  ├─ data/  docs/  media/    预留空目录
│  └─ README.md
│
├─ scripts/                   探测脚本与过程产物（不部署）
│  ├─ probe/                  Playwright / sharp 写的探测脚本
│  ├─ screenshots/            渲染截图
│  ├─ logs/  tmp/             日志与临时文件
│  └─ README.md
│
├─ archive/                   暂不使用的素材与旧项目（不部署，已 gitignore）
│  ├─ materials/              候选素材：曲绘原图、更新情报、版本资料
│  └─ legacy/                 jubeat-wiki / -v2 / -v3 / -v4 四代旧项目
│
├─ .dsh-meow/  .dsh-ops/      本地工具数据（已 gitignore，勿提交）
├─ .gitignore
└─ README.md
```

## 数据来源

| 字段 | 来源 |
| --- | --- |
| 曲名 / 谱师 / 三档定数 / 曲绘 | `archive/legacy/jubeat-wiki-v3/data/songs.json`（513 曲 / 1512 谱面） |
| 世代归属与年份 | `_build/build-data.cjs` 里的 `META` 表（15 条，jubeat → 音乐魔方） |
| 收录日期 | `songs.json` 的 `addedAt`，缺失则为 `null` |

`data.json` 是上面数据的**聚合快照**，字段：`stat`（总数）、`top`（定数顶格）、`gen`（世代层）、`dist`（定数分布）、`latest`（最近收录）、`dots` / `pad`（散点与填充）、`gen10` / `gen105`（定数 ≥10 / ≥10.5 计数）。

## 构建

```bash
cd src/_build

node build-data.cjs      # songs.json → data.json，并把曲绘复制到 assets/images/jackets/
node build.cjs           # data.json + ../template.html → ../index.html（线上版，17192 字节）
node build.cjs 11        # 可选：换用旧模板 template11，深青配色（29543 字节）
```

- 只依赖 Node 内置模块（`fs` / `path`），**没有 npm 依赖，不用装包**。
- 改版式改 `src/template.html`，改主题色改 `src/theme.css`，改数据改 `src/_build/build-data.cjs` 的 META 或源头 songs.json。
- 站点里所有资源引用都写 `../assets/...`，所以 **`src/` 必须连 `assets/` 一起用**。

## 部署

目标：**GitHub 仓库 + Cloudflare Workers（后续可能接 D1 数据库）**。

部署时只需要两份：

```
src/      → 站点文件（index.html / theme.css）
assets/   → 静态资源
```

`_build/`、`scripts/`、`archive/`、`.dsh-*/` 都不上线。

### 待办（尚未落地）

- [ ] 建 GitHub 仓库并推首次提交（当前工作区**还没有 `.git`**）
- [ ] `wrangler.jsonc` 配置：静态资源用 Workers Assets 托管，把 `src` 与 `assets` 挂到同一路由下
- [ ] 页面对 `assets/` 的引用是 `../assets/...`，与线上 URL 层级需对齐——要么保持同样的两目录结构，要么构建时改写前缀
- [ ] 若要接 D1：把 `data.json` 迁到数据库表，页面改为 fetch 接口，同时保留 `file://` 直开的退化路径
- [ ] GitHub Actions（可选）：push 时跑 `node build.cjs` 校验产物与提交一致

## 本地预览

```bash
start src/index.html
```

页面零依赖，`file://` 协议下即可完整运行。历史渲染基线：49 张图全加载、0 broken、视口 1440×2486（需本机装有 playwright 才能复测）。

## 说明

`archive/` 里四代旧项目体积约 447 MB，由 `archive/.gitignore` 忽略（内含 `materials/`、`legacy/`），不会进仓库。
