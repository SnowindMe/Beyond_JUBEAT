# 检查、CI 与常见问题

返回 [根 README](../README.md)。

## 检查

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

写断言的两个硬要求：①**必须先做反向验证**，喂一个已知坏值看它是否 FAIL——只会输出绿色的脚本没有意义；②断言读的输入必须与它声称的对象是同一集合（用 `data-cat` 数卡片那次就多算了按钮与 section）。

## 常见问题

**新增了 SSR 页，本地 build 成功、线上 404？**
`wrangler.jsonc` 的 `assets.run_worker_first` 漏了那条路径，资源层按 `404-page` 直接截断。加进去再部署。

**`/songs` 或 `/recent` 回 500，日志 `no such table`？**
本地 D1 没灌。按 [development.md](development.md) 跑 `schema.sql` + `seed.sql`，注意别加 `--persist-to`。

**`npm run build` 或 `npm run dev` 报 workerd `CreateDirectory: 拒绝访问`？**
Windows 上的已知坑，见 [development.md](development.md#本机-workerd-的两个坑)。

**`curl localhost:4321` 回 000，但服务明明在跑？**
没加 `--noproxy '*'`，请求被代理吃了；dev 只监听 `::1`，用 `localhost` 而不是 `127.0.0.1`。

**改了模板/样式，本地或线上看不到变化？**
本地先看 `x-jb-cache`，带 `Cookie: jb_session=x` 绕缓存；线上详情页有边缘缓存，加 `?cb=<随机数>` 才是新版本。

**换了 favicon / 站标却看不到？**
品牌图 URL 没带新的 `?v=N`。四处同改（Base、Header、index、manifest、sw 的 `ASSET_V`），见 [architecture.md](architecture.md#品牌资源版本)。

**对比度自检「全部达标」能当验收依据吗？**
不能。脚本是公式值、不含背景图；真实渲染链有四层，压在图上的文字可能远低于 3:1。它只拦回归。

**曲绘 404？**
先看 `src/data/cdn.json` 有没有 `id<歌id>.webp` 映射，再看反代白名单 `NAME_OK` 是否放行该 id 形态（占位 id `unit-NNN` 与 `ph-cn` 单独放行的规则别删）。

**Actions 绿了，线上还是旧版本？**
线上由 Cloudflare Workers Builds 构建，与 Actions 是两条线，等 90–120 秒并确认页脚版本号；加速站另有 EdgeOne 缓存，`build-check` 会自动清。

**`/songs/` 的世代数、主题数写死在哪？**
不要写死。取 `GEN_JP.length` / `GEN_ORDER.length` 与 `THEMES.length`；注释里提到数字时也要跟着改。

**新增一个世代要改哪些地方？**
`src/lib/gens.ts`、`src/lib/themes.ts`、`scripts/build-data.cjs` 的世代表、`Hero.astro` 的 `THEME2GEN`、详情页的 `GEN_LOGO` 与 `GEN_COLOR`、`Base.astro` 的 `FONTFILE` 与 `JB_BGVER`、`songs.astro` 的 `SRV_CARDS`、`api/jacket` 的 `NAME_OK`、`theme.css` 的主题块与 `--wl-ar`、`--bgauto`，外加数据源与 `cdn.json` 映射。漏 `GEN_COLOR` 会让世代徽章跟着主题乱变色。
