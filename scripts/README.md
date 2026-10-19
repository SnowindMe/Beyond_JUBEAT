# scripts — 工具脚本与过程产物

- `build-data.cjs`：从 `archive/legacy/jubeat-wiki-v3/data/songs.json` 生成 `src/data/data.json`，并同步曲绘到 `public/assets/images/jackets/`（`npm run data`）
- `ci/check-refs.cjs`：引用完整性检查，扫源码或 `dist/` 里的 src/href/url()，确认全部可解析（`npm run check`）
- `probe/`：历史探测脚本（Playwright 时代的截图/测量脚本，多已失效，留作参考）
- `screenshots/`：脚本产出的截图（已 gitignore）
- `logs/`：运行日志（已 gitignore）
- `tmp/`：临时中间文件，随时可清（已 gitignore）
