# scripts — 工具脚本与过程产物

- `build-data.cjs`：从 `data/jubeat.db` 生成 `src/data/data.json` 与 `src/data/songs.json`，并同步曲绘到 `public/assets/images/jackets/`（`npm run data`）
- `db/parse-xlsx.cjs`：解析 `data/xlsx/source.xlsx`（自带 ZIP 解包）→ `data/xlsx/sheet*.json`
- `db/build-db.cjs`：`data/upstream/*.json` + `data/xlsx/sheet*.json` → `data/jubeat.db`；加 `--seed` 再导出 `db/seed.sql`（幂等 DDL + 按 D1 单语句 100 KB 上限切分的 INSERT）
- 整条管线一条命令：`npm run db`；输入约定、7 张表口径、dualKey 见 [`docs/data-pipeline.md`](../docs/data-pipeline.md)
- `optimize-images.cjs`：图片压缩（曲绘 168px / 背景 1600 宽 / 站标转 WebP），原地覆盖；跑之前先 `npm i -D sharp`（sharp 未列入 devDependencies，避免 CI 装原生依赖）
- `ci/check-refs.cjs`：引用完整性检查，扫源码或 `dist/` 里的 src/href/url()，确认全部可解析（`npm run check`）
- `ci/check-contrast.mjs`：对比度自检（`npm run check`）。从 theme.css 读出 16 套主题的 `--base/--ink/--ink2/--ink3/--glass`，把 --glass 按 alpha 合到底色上，对「小字 × 背景」组合算 WCAG 对比度并取 **min**。输出公式理论值（不含背景图），验收以真实渲染为准。存在的理由：同一个令牌在深色/浅色主题下能差 3 倍，只看默认主题必漏（t5 实测 .rc-before 深色 7.03、浅色 2.63）
- `ci/check-song-edits.mjs`：曲目编辑面板的规则自检（`npm run check`）。用 `node:sqlite` 起内存库冒充 D1，直接调 `src/lib/song-admin-server.ts` 的 `handleSongUpdate`，断言越权 401/403、参数校验、recent_changes 列名与 schema 完全对齐。本机起不了 workerd，这些结论只能靠它跑出来
- `probe/`：历史探测脚本（Playwright 时代的截图/测量脚本，多已失效，留作参考）
- `screenshots/`：脚本产出的截图（已 gitignore）
- `logs/`：运行日志（已 gitignore）
- `tmp/`：临时中间文件，随时可清（已 gitignore）
## 新增脚本
- `gen-seo.cjs`：生成 `public/robots.txt` 与 `public/sitemap.xml`（`npm run build` 前自动跑，lastmod 取当天）
- `gen-brand-assets.cjs`：生成 og 分享图（1200x630）与 apple-touch-icon（180x180）；只在背景/站标/favicon 变动后手跑
