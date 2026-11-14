# wiki.byd-ub.top 现代 Web 审查报告

- 审查工具：modern-web-guidance（Chrome / Edge / Mozilla / MDN 团队共同维护，250 条规范）
- 审查对象：https://wiki.byd-ub.top 首页 与 /songs（实际视口 792×696，Playwright 实测 + 源码取证）
- 站点性质：Astro 静态站 + Cloudflare，jubeat 中文资料站
- 审查时间：2026-11-15

## 先说做得好的地方

这套站点的**基础设施底子比大多数个人站都硬**，几条最容易翻车的地方都守住了：

1. **缓存策略教科书级**。静态资源一律 `Cache-Control: public, max-age=31536000, immutable`，实测命中 `CF-Cache-Status: HIT`。图片和 HTML 绑定哈希，回访几乎零流量。
2. **安全头齐备**：CSP（report-only）、permissions-policy、x-content-type-options、upgrade-insecure-requests。
3. **Speculation-Rules 响应头已下发**（`/cdn-cgi/speculation`），浏览器空转预取已经暗中提速。
4. **无障碍骨架正确**：`lang="zh-CN"`、每页恰好 1 个 `h1`、有 skip link、376 处 `aria-label`、67 个真 `<button>`（不是可点 div）、6 处 `prefers-reduced-motion` 兜底、无横向溢出。
5. **PWA 完整**：manifest + serviceWorker 均正常（sw.js 200）。
6. **图片尺寸属性齐全**：315 张图全带 `width`，无 CLS 隐患。
7. **深色由 `color-scheme: dark` 统一声明**，原生控件不发白、无主题闪烁。
8. jacket 统一 `alt=""`。卡内已有可读曲名文字，把封面当装饰处理是对的，不会重复朗读——保持即可。

---

## 需要修的，按严重度排

### 🔴 P0 · 8 条图片 preload 全部指错，还都抢了 high

**证据**
- `/songs` 有 8 条 `<link rel="preload" as="image" fetchpriority="high">`。
- 这 8 个 URL 在 DOM 里距第一张卡约 **39,000 字符**，落在 `ripples` 世代的第 20 多张卡上——**一张都不在首屏**。
- 反过来，真正的首屏图（brand.webp、两张 logo、首屏 4 张 jacket）**一条 preload 都没有**。
- 实测：最早的图片请求 startTime = **550ms**，48 个图片请求全部 ≥791ms，**没有一张图在 500ms 内发起**。

**违反**：`optimize-preload-priority` —— *MANDATORY: 关键图片 preload 最多 1–2 条*；*DO: 全页图片 preload 上限 2 张*。这里超了 4 倍，且 8 个名额全给了看不见的图。

**修**
```html
<!-- 删掉那 8 条，换成首屏 LCP 候选 -->
<link rel="preload" href="/images/logo/brand.webp?v=2" as="image" fetchpriority="high">
```
非首屏 jacket 不该占 preload 名额。

### 🔴 P0 · 首屏 LCP 图被 `lazy` + `fetchpriority=low` 双重降级

**证据**：首屏可见图 7 张，其中 4 张首屏 jacket 全是 `loading="lazy" fetchpriority="low"`；`/songs` 315 张图里 299 张是这个组合。

**违反**：`optimize-image-priority` —— *Never use loading="lazy" on the LCP image*；`fetchpriority="low"` 只留给「首屏内但初始不可见」的图（轮播隐藏页、mega menu）。普通屏下图 `lazy` 就够了，加 `low` 会让它滚到眼前时仍以低优先级爬。

**修**
- 首屏可见 jacket：去掉 `fetchpriority="low"`，至少前 4 张去掉 `loading="lazy"`。
- 屏下 jacket：只留 `loading="lazy"`，删 `fetchpriority="low"`。

### 🟠 P1 · `content-visibility: auto` 套到了首屏元素上

**证据**：24 个 `.sc-gen` 全部 `content-visibility: auto`，其中 **13 个在首屏内**。

**违反**：`defer-rendering-heavy-content` —— *DO NOT 把该属性用于首屏视口内的元素*，会把可见性判定提前到渲染前，反倒拖慢关键路径。

**另**：`contain-intrinsic-size` 用了 `auto` 关键字是对的（浏览器能记住真实尺寸），但初始估值 460px 对着真实 1104px–10266px，加载时文档高 7889px、滚到底 37274px，滚动条一路变长。这是估值偏差，不是缺属性。

**修**：首个 `.sc-gen` 去掉 `content-visibility`（或加 `.sc-gen:first-child { content-visibility: visible }`），其余保留；同时把 `contain-intrinsic-size` 的占位值调到接近真实中位数（约 3200px）而不是 460px。

### 🟡 P2 · 其余可以顺手拿的分

| 项 | 证据 | 说明 |
|---|---|---|
| `fetchpriority="auto"` 冗余 | 首页 12 处 | 指南：默认优先级应**直接省略**属性 |
| 无响应式图 | 0 处 `srcset` / `<picture>` | 一张 jacket 原图 1180×1180 塞进 144px 卡位 |
| 首页 37 张图无 `lazy` | 首页 38 张 img | 首屏之外的全量 eager，首次请求数偏高 |
| 同一图重复引用 | 16 张 jacket 各引用 2 次（32 处 URL=16） | 双份 DOM 只是不额外请求，但白占解析 |
| 内联脚本 90KB | 单块最大 64KB | 挡首屏解析，建议 `defer` 外链或拆包 |
| 缺 `preconnect` | 0 处 | 加一条到图床域 |
| 强制暗色 | 无 `prefers-color-scheme` 查询、无 `data-theme` | 无法跟随系统亮色 |

### 🔵 P3 · 一个 API 都没用上的现代特性

全站 0 处：view transitions / `@view-transition` / `startViewTransition` / `speculationrules`（HTML 内）/ `prefetch` / `hidden="until-found"` / `@container` / `oklch` / scroll-driven animations / `text-wrap` / `subgrid`。

对一个卡片列表站，`@container` 做卡片内布局、`hidden="until-found"` 做可折叠详情、`startViewTransition` 做卡↔详情过渡，都是低成本高回报的落点。`Speculation-Rules` 头已经有了，页面内再补一份 `<script type="speculationrules">` 把预渲染明确到曲目详情 URL，收益会直接落在导航速度上。

---

## 一句话总结

安全、缓存、无障碍骨架都已经到位，**性能上的失分几乎全部集中在「资源优先级判断反了」**：给看不见的图开 high 绿灯，给眼前的图踩 low 刹车。P0 两条改完，首屏图片请求时间会有肉眼可见的前移。

> 附注：截图前请先 `localStorage.removeItem('jb-songs-filter-v1')`，残留搜索词会让页面渲染成空列表，容易误测。
