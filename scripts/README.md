# scripts — 工具脚本

2026-11-18 精简过一轮：只保留构建、数据管线、抓取、CI 自检与运维会用到脚本；一次性生成器（品牌资产、字体子集、Beyond Ave 抓取）已删，需要时从 git 历史取回。

## 构建与数据（build / db）

- `build-data.cjs`：从 `data/jubeat.db` 生成 `src/data/data.json` 与 `src/data/songs.json`（`npm run data`）
- `build-search-key.cjs`：生成 `src/data/search-keys.json`（`{song_id: "读音|罗马字"}`）。读音在**生成期**用 kuroshiro + kuromoji 算好，片假名归一到平假名、罗马字去掉音调符号，供搜索用假名 / 罗马字命中
- `build-difficulty-stats.cjs`：由库算定数分布统计
- `db/parse-xlsx.cjs`：解包 `data/xlsx/source.xlsx` → `data/xlsx/sheet*.json`
- `db/build-db.cjs`：`data/upstream/*.json` + `data/xlsx/sheet*.json` → `data/jubeat.db`；加 `--seed` 再导出 `db/seed.sql`。全量文件含 `DELETE FROM songs`，不要日常重放
- `db/diff-seed.cjs`：`npm run patch`。只把受影响的行写成 `db/patch.sql`，末尾自检「不允许整表 DELETE」
- `db/apply-patch.cjs`：`npm run apply:patch`，走 D1 REST `/query` 分批灌线上
- 整条管线一条命令 `npm run db`；输入约定与口径见 [`docs/database-schema.md`](../docs/database-schema.md)

## 数据分离（data）

- `data/push.cjs` / `data/pull.cjs`：把白名单内的数据文件推到私有 R2 / 拉回来。
  push 平时要带 `--changed`（按 md5 比远端 ETag，只传变化的）；CI 里由 `data-push.yml` 自动跑。见 README「数据与代码分离」节

## 抓取（ub / yyj / remy）

- `ub/build-ub-audio.cjs`、`ub/build-ub-charts.cjs`、`ub/split-ub-charts.cjs`：BGM 映射与谱面密度数据
- `yyj/*.mjs`：音游街抓取（`capture-and-fetch.mjs` 是入口，带 PAC 录制；`fetch-pics.mjs` 下载曲绘）
- `db/remy/*.cjs`：RemyWiki 快照与词条页生成

## CI 自检（`npm run check`）

- `ci/check-refs.cjs`：src/href/url() 全部可解析
- `ci/check-contrast.mjs`：16 套主题的对比度，取 min；只改 `--acc` 必须跑
- `ci/check-schema-doc.cjs`：`docs/database-schema.md` 里的每个计数与库现算值断言
- `ci/check-song-edits.mjs`：曲目编辑面板的越权 / 校验 / 列名对齐（起内存库冒充 D1）
- `ci/check-search-keys.cjs`：读音条目的孤儿键、缺条目、大小写
- `ci/check-bar-coverage.cjs`、`ci/check-fortune-dist.mjs`：密度条覆盖率、运势分布

## 其它

- `optimize-images.cjs`：图片压缩（原地覆盖，重压前先从 git 取原图）
- `cdn-jackets.cjs`：曲绘补传到图床
- `gen-seo.cjs`、`gen-build-stamp.cjs`：robots/sitemap 与构建戳，`npm run build` 自动跑
- `ops/purge-edgeone.mjs`：清 EdgeOne 缓存（需 `EDGEONE_ZONE_ID` 与两个腾讯云 secret）
- `probe/`：一次性探测脚本
