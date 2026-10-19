# assets — 项目资源

按**类型**分组（2026-10-19 主人重排），所有项目共用同一套结构。

| 目录 | 内容 | 当前占用 |
| --- | --- | --- |
| `images/` | 图片资源，下分 `bg/`（背景）、`jackets/`（曲绘）、`logo/`（站标） | 101 个 / 2.69 MB |
| `fonts/` | 字体文件，含各项目的主题字体与装饰字体 | 7 个 / 168 KB |
| `data/` | 数据文件（json / csv 等） | 空 |
| `docs/` | 文档、PDF、参考资料 | 空 |
| `media/` | 音视频 | 空 |

## images/ 明细

| 子目录 | 内容 | 使用方 |
| --- | --- | --- |
| `bg/` | 13 张世代主题背景 webp | `src/theme.css` 的 `--bgauto` + index.html 脚本切主题 |
| `jackets/` | 78 张 jubeat 曲绘 webp | `src/index.html` 的 32 处 + `_build/build-data.cjs` 生成 |
| `logo/` | 10 个世代站标 png | `src/index.html` 的 10 处 |

## fonts/ 明细

`caveat-700`、`jost-500`、`playfair-700`、`rye-400`、`shrikhand-400`、`yellowtail-400`（主题字体，被 theme.css 引用）、`smiley.woff2`（装饰字体，仅 template11 版页面引用）。

## 引用约定

站点里统一写 `../assets/<类型>/<子目录>/`，不再有 `assets/wiki-v4/` 这种按项目分的层级。
