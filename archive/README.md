# archive — 素材库与过时项目

放**当前不用、但将来可能还要**的东西。原则：主目录（assets / web / scripts）只留正在用的，冗余和旧版本一律沉到这里。

## 结构

- `materials/` — 可能用到的素材（候选字体、备选背景、图标源文件、外部下载的参考图）
  - 按项目名再分子目录，如 `materials/wiki-v4/`
- `legacy/` — 过时的项目 / 整代旧版本
  - 按项目名分子目录，如 `legacy/wiki-v4/`
  - 内部常见子目录：`templates/`（历史模板）、`style-backup/`（废弃样式）、`duplicates/`（内容重复的截图）

## 当前内容

| 路径 | 内容 |
| --- | --- |
| `legacy/wiki-v4/templates/` | 9 个历史模板 template*.html（build.cjs 引 template11，build2.cjs 引 template12） |
| `legacy/wiki-v4/style-backup/` | theme.css.bak、theme.css.bak2、logo.css |
| `legacy/wiki-v4/duplicates/` | 13 张与其他截图内容完全相同的重复图 |
