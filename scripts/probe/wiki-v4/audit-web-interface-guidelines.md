# wiki-v4 · Web Interface Guidelines 审查

审查对象：`D:\dsh_data\.dsh\ungrouped\wiki-home-v4\`（index.html 147 行 / theme.css 1329 行 / logo.css 245KB 未引用）
规则来源：vercel-labs/web-interface-guidelines `command.md`（本次现取）
日期：2026-10-19

## 严重

- `index.html:36` — **h1 对读屏完全空白**。`.word-t` 在每一个 `data-g` 下都是 `display:none`（`theme.css:331-382`），`.word-l` 又带 `aria-hidden="true"`，h1 的可访问名为空。改法：h1 加 `aria-label="jubeat 音乐魔方"`，或把 `.word-t` 改成 sr-only 而非 display:none。
- `theme.css:1142-1165` — 主题弹层关闭态只有 `opacity:0` + `pointer-events:none`，里面 13 个按钮仍可被 Tab 聚焦，键盘焦点会跑进看不见的菜单。改法：关闭态补 `visibility:hidden` 或 `inert`；展开时移焦入内，Esc 后焦点回按钮。
- `theme.css:972 / 990 / 1026 / 1008` — 浅色四代 `--ink3` 全部低于 4.5:1，而它承载的是 10~10.5px 小字：
  - knit `#8c8271` on `#f2eee4` = **3.27**
  - prop `#8a8a90` on `#f7f6f4` = **3.18**
  - saucer `#7d8b94` on `#eceff1` = **3.03**
  - qubell `#8d7f6b` on `#f4f1ea` = **3.46**
  使用方：`.st span`(10px) / `.lc span`(10px) / `.band-h em`(10.5px) / `.foot`(10.5px) / `.gl span`(10.5px)。且这四代还叠了 `--veil` 压暗与 `.glass` 半透明，真实对比只会更低。建议四代 `--ink3` 统一收到 ≥4.5 的一档（约 `#6b6257`）。
- `index.html:15, 65` — 17 个 `href="#"` 死链（导航 5 个 + 最近收录 12 个），点击跳回页顶。

## 高

- `index.html:7` — 只 link 了 `theme.css`，`logo.css`（245KB base64 字标遮罩）**没有任何地方引用**，而 `theme.css:1085` 的注释还在描述它。字标现在走 `<img>`，logo.css 是死资产，删或恢复引用二选一。
- `index.html:36,45,55,65` — 49 个 `<img>` **全部无 width/height**，首屏 CLS 风险。
- 同上 — 49 个 `<img>` **全部无 `loading="lazy"`**，首屏外 30+ 张曲绘一起进首包。
- `theme.css` 全库 **0 处 `color-scheme`**，`index.html` 无 `<meta name="theme-color">` → 深色主题下滚动条与原生控件仍是亮色。

## 中

- 全站 **0 处 `:focus-visible`** 自定义样式，只靠 UA 默认焦点环，在深色玻璃底上几乎不可见。
- `theme.css:107-109` — `body::after` 对 `background-image` 做 `transition`，该属性不可动画，这条是静默无效代码（世代切换时背景是硬切，不是渐隐）。
- `index.html:111` — 主题只写 localStorage，URL 不反映状态：不能深链某个世代，返回键也不还原。
- `index.html` — 无 `<main>`、无 skip link。
- 触屏三项全缺：0 处 `touch-action: manipulation`、0 处 `-webkit-tap-highlight-color`、0 处 `overscroll-behavior`。
- 字号偏小：28 条 `font-size` 声明里 **14 条 <12px**，最小 9px（`theme.css:574` `.cube i.sum span`），10px 用了 5 次（`.st span`/`.lc span`/`.gl span`/`.rk em`/`.band-h em`）。
- 数字列缺 `tabular-nums`：`.st b`(`theme.css:478`)、`.dr span`(`:800`)、`.rk .v`(`:756`) 用了 `--font-data` 却没加 `font-variant-numeric`，只有 `.mono`(`:121`) 加了。
- 首屏 cube 图无 `fetchpriority="high"`。

## 低 / 结构

- `theme.css:253-382` — 130 行是 13 代各写一遍的重复选择器（`.word-l` / `.lg-xxx` / `.word-t+.sub` 三组各 13 遍），可折叠成属性选择器；全文件重复选择器 31 组。
- `theme.css:421-443` — `.lede` / `.slogan` 两个类在 index.html 里完全没用（口号现在挂在 `.chip`，`index.html:35`），死代码。
- `index.html:45` — cube 里 15 张封面都写了 `alt="jubeat/ripples…"`，这组是装饰性封面墙，应 `alt=""`，否则读屏会念一串曲名。
- `theme.css:488-578` — `backdrop-filter` 共 5 处（`.chip`/`.st`/`.cubewrap`/`.panel`/`.tsw-pop`），其中 `.panel` 是全宽大面板且背景是固定图，N5105 核显上有掉帧风险，值得实测一次滚动。

## 已通过

- `prefers-reduced-motion` 有兜底（`theme.css:1250`）。
- 0 处 `transition: all`；hover 动效只用 transform/opacity。
- 长标题截断齐备（`.rk b` / `.gl b` / `.lc b` 都有 min-width:0 + ellipsis）。
- 无 em-dash/en-dash；`lang="zh-CN"` 正确；`.tsw-btn` 的 `aria-expanded/aria-controls` 完整。
