# Beyond ↑ JUBEAT · Web Interface Guidelines 审查报告

审查对象：`C:\Users\19457\Desktop\Beyond_JUBEAT`（Astro 7 静态站，3 个页面）
规则来源：vercel-labs/web-interface-guidelines `command.md`（2026-10-21 现取，8015 字符）
审查方式：源码逐行通读 + ego-browser 真实渲染实测（8 轮，含 CDP 无障碍树、CDP 设备模拟、PerformanceObserver）
构建状态：`npm run build` 成功（3 页，34.27s）· `npm run check` 通过（refs=23 ok=23 / dist refs=47 ok=47）
日期：2026-10-21

> 标注约定：**[实测]** = 浏览器里量到的真实值；**[源码]** = 静态阅读结论；**[推算]** = 按 WCAG 公式算出的比值。

---

## 严重

### 1. 首页 h1 对读屏完全空白 [实测]

- `src/components/Hero.astro:10` — h1 的结构是：
  `<h1 class="word" id="wordMark"><span class="word-t">jubeat</span><span class="word-l" aria-hidden="true"><img id="wordLogo" alt="" ... /></span></h1>`
- `src/styles/theme.css:552-607` — 14 组 `html[data-g="X"] .word-t, html[data-g="X"] .sub { display: none }`，把唯一有文字的 `.word-t` 全部藏掉。
- `.word-l` 带 `aria-hidden="true"`，里面的 img 又是 `alt=""`。

**实测证据**：CDP `Accessibility.getPartialAXTree` 取到 h1 的真实 AX 节点为
`{ role: "heading", name: "", level: 1, ignored: false }` —— 可访问名是空字符串。
对 14 个世代逐个切 `data-g` 后测量，`wordT` 恒为 `none`、`wordL` 恒为 `flex`、`sub` 恒为 `none`，无一例外。

**改法**（任选其一）：
- h1 加 `aria-label="jubeat 音乐魔方"`；
- 或把 `.word-t` 从 `display:none` 改成 sr-only（视觉仍隐藏，但留在无障碍树里）。

### 2. 浅色世代 `--ink3` 对比度全线不达标，且承载 10px 小字 [推算 + 实测]

| 世代 | 令牌行 | 前景色 | 背景色 | 对比度 | 门槛 |
| --- | --- | --- | --- | --- | --- |
| knit | `theme.css:1323` | `#8c8271` | `#f2eee4` | **3.27** | 4.5 |
| knit（叠 veil 后实测底色 rgb(236,232,222)） | 同上 | `#8c8271` | — | **3.09** | 4.5 |
| prop | `theme.css:1341` | `#8a8a90` | `#f7f6f4` | **3.18** | 4.5 |
| qubell | `theme.css:1359` | `#8d7f6b` | `#f4f1ea` | **3.46** | 4.5 |
| saucer | `theme.css:1377` | `#7d8b94` | `#eceff1` | **3.03** | 4.5 |
| ripples | `theme.css:1408` | `#5c7a75` | `#dfeeea` | **3.90** | 4.5 |

深色 9 代（含 saucerfulfill）**没有覆写 `--ink3`**，全部继承 `theme.css:4` 的 `:root { --ink3: #7e97a4 }`，对各自 `--base` 实测 6.01–6.28（最低 saucerfulfill 6.01，最高 clan_purple / copious 6.28），**全部达标**。

**问题放大**：`--ink3` 恰好被用在这些小字号上——
`.st span`（`theme.css:701-707`，10px）、`.band-h em`（`theme.css:840-846`，10.5px）、
`.foot-ver`（`theme.css:1191`，10px）、`.foot-slogan`（`theme.css:1195`，10px）、
`.wip-s`（`theme.css:904`，10.5px）、`.mark span`（`theme.css:312`，10px）。
10px 的正文级文字本来就已经低于任何可读性建议，再叠 3.0:1 的对比度，实际近乎不可读。

**建议**：五套浅色 `--ink3` 统一收到 `#6b6257` 一档，复算结果 knit 4.89 / prop 5.54 / saucer 5.18 / qubell 5.30，全部过线。

### 3. 全站没有 `<main>`，也没有 skip-link [实测]

- `src/layouts/Base.astro:109-127` — `.wrap` 里只有 `<Header />`、`<slot />`、`<footer>`，没有 `<main>`。
- 实测三页：首页 `main:0, skip:false`；`/recent/` `main:0, skip:false`；404 `main:0, skip:false`。
- 后果：读屏用户无法用「跳到主内容」绕过导航，也无法用 landmark 快捷键定位正文。

**改法**：`<slot />` 外面包一层 `<main id="main">`，并在 `<body>` 首个元素加
`<a class="skip" href="#main">跳到主内容</a>`（配合 `theme.css:1479` 的 `:focus-visible` 双环即可复用现有焦点样式）。

### 4. 触控目标普遍低于 44×44（WCAG 2.5.5）[实测]

桌面 1440×900 实测 **11 个**目标 < 44px：

| 元素 | 实测尺寸 | 定义处 |
| --- | --- | --- |
| `.top nav a`（曲目 / Jubility / Emblem / 伙伴 / 成就 / 最近更改） | 55/81/87/55/55/85 × **38** | `theme.css:332-342`（`padding: 7px 12px`） |
| `.mark`（顶栏品牌标） | 230 × **37** | `theme.css:218-225`（无 min-height） |
| `.nav-i`（GitHub / 关于 / 登录 / 最近更改图标） | **30 × 30** | `theme.css:361-371`（`width/height: 30px` 写死） |
| `.tsw-btn`（世代切换按钮） | 52 × **30** | `theme.css:1489-1505`（`padding: 7px 10px` + `line-height: 1`） |
| `.tsw-g button`（14 个世代按钮） | 147 × **28** | `theme.css:1584-1605`（`padding: 7px 8px` + `font-size: 12.5px` + `line-height: 1`） |

移动端 390×844 实测：`.mark` **154 × 16**（最严重）、四个 `.nav-i` **28 × 28**、`.tsw-btn` 50 × 30。

**建议**：`.nav-i` 提到 44×44（或加 `::after` 扩大热区）；`.mark` 加 `min-height: 44px`；`.tsw-g button` 的 `padding` 提到 `11px 8px`。

### 5. 没有 `color-scheme`，深色主题下原生控件仍是亮色 [实测]

- 全 `src/` 搜索 `color-scheme`：**0 处**。
- `src/layouts/Base.astro:51` — `<html lang="zh-CN" data-g={gen} data-font={font}>`，没有 `color-scheme`。
- **实测** `getComputedStyle(document.documentElement).colorScheme` = `"normal"`，`body` 同为 `"normal"`。
- 后果：bta 世代（body 背景实测 `rgb(25,15,8)`）下，滚动条、`<select>`、`<input>`、日期选择器等原生控件仍按亮色渲染。

**改法**：`Base.astro:51` 的 `<html>` 上加 `style="color-scheme: dark"`（深色世代）或按 `data-g` 在 CSS 里分派；浅色 5 代对应 `light`。

---

## 高

### 6. 16 张图片全部没有 width/height [实测]

- `src/components/Hero.astro:10` — 字标 `<img id="wordLogo" alt="" ... />` 无尺寸属性。
- `src/components/Hero.astro:30` — `{data.gen.map((g) => <i><img src={jacket(g.rep?.cover)} alt={g.k} /></i>)}`，15 张曲绘同样无尺寸属性。
- **实测**：`noDims: 16`、`broken: 0`、字标原生 285×210 渲染 285×210、曲绘原生 144×144 渲染 83×83。
- **CLS 实测为 0**，但那是因为 `theme.css:755` 的 `.cube i { aspect-ratio: 1 }` 恰好撑住了容器，属于**运气合规**：一旦图片加载失败、替换资源或改布局，尺寸声明缺失会立刻暴露为跳动。

**改法**：曲绘加 `width="144" height="144"`（配合 CSS 缩放），字标加 `width="285" height="210"`。

### 7. 全站零懒加载 [源码]

- 全 `src/` 搜索 `loading=`：**0 处**。
- **实测** `lazy: 0`（16 张 img 全部 `loading="eager"` 默认值）。
- 首页 16 张图合计 171,730 字节，其中背景 bta.webp 62,656、字标 16,946；曲绘在首屏外仍全部进首包。
- 字标已经正确用了 `fetchpriority="high"`（`Hero.astro:10`），但曲绘没有对应的 `loading="lazy"`。

### 8. `theme-color` 硬编码单一色，与 14 套主题不符 [源码]

- `src/layouts/Base.astro:57` — `<meta name="theme-color" content="#0b1a22" />`。
- 实测 bta 世代的 body 背景是 `rgb(25,15,8)`（`#190f08` 暖棕），与 `#0b1a22` 完全不同；浅色 5 代更是完全不沾边。
- 后果：移动端浏览器地址栏颜色在 14 个世代里只有 0 个是对的。

**改法**：`ThemeScript.astro` 的 `apply()` 里同步更新 `meta[name=theme-color]` 的 `content`，取当前世代的 `--base`。

### 9. `/recent/` 与 404 页标题层级不完整 [实测]

- `src/pages/recent.astro:20` — 页面第一个标题是 `<h2>最近更改</h2>`，**没有 h1**。实测 `h1count: 0`、`h2: ["最近更改"]`。
- `src/pages/404.astro:10-11` — 整页只有 `.wip-t` 和 `.wip-s` 两个 `<p>`/`<span>`，**h1、h2 都没有**。实测 `h1count: 0`、`h2: []`。
- 首页 h1 存在但可访问名为空（见第 1 条），等于三页没有一页有可读的 h1。

### 10. 世代弹层没有焦点管理 [源码 + 实测]

- `src/components/ThemeScript.astro:148-162` — 打开时只切 `data-open` 和 `aria-expanded`，**不把焦点移入弹层**；关闭时也不把焦点还给 `#tswBtn`。
- **实测合规的部分**：关闭态 `#tswPop` 是 `visibility: hidden`，对内部 button 调 `focus()` 无效（`document.activeElement` 仍是 BODY），14 个按钮**确实不在 Tab 序列里**。真实 Tab 序列只有 11 个元素：`["Beyond ↑ JUBEAT 首页","曲目","Jubility","Emblem","伙伴","成就","最近更改","GitHub 仓库","关于","登录","切换世代主题"]`。
- **仍然缺的**：键盘用户打开弹层后焦点还停在按钮上，得再 Tab 一次才进得去；Esc 关闭（`ThemeScript.astro:160-162` 的 keydown 监听）后焦点丢失到 body。
- `src/components/Header.astro:33` — 容器是 `role="group"` 而非 `menu`，没有 `aria-modal`；考虑到它是非模态下拉，`group` 可以接受，但焦点闭环仍需补。

### 11. 浅色世代 `--acc` 作为焦点环对比度严重不足 [推算]

`:focus-visible` 用的是 `outline: 2px solid var(--acc)`（`theme.css:1480`）。`--acc` 在浅色底上的对比度：

| 世代 | 令牌行 | `--acc` | 对 `--base` 的对比度 |
| --- | --- | --- | --- |
| knit | `theme.css:1316` | `#e0a92e` | **1.83** |
| ripples | `theme.css:1401` | `#4fae9e` | **2.23** |
| saucer | `theme.css:1370` | `#3aa8c8` | **2.39** |
| qubell | `theme.css:1352` | `#c98a3c` | **2.59** |
| prop | `theme.css:1334` | `#e0338f` | **3.86** |

深色 8 代（`theme.css:1241/1251/1261/1270/1279/1288/1297/1306/1387`）：最低是 clan_blue 的 `#5c8dff` 5.89，其余 6.62–13.18，**全部达标**。WCAG 2.4.11/2.4.13 对焦点指示器要求 3:1，浅色 5 代有 4 代不满足。

**改法**：焦点环单独走一个 `--focus` 令牌，浅色代取深色变体，不要复用装饰性的 `--acc`。

### 12. 17 处字号小于 12px，最小 9px [实测]

实测 computed font-size 分布：`10.0px × 9`、`10.5px × 7`、`9.0px × 1`。

源码对应行（`src/styles/theme.css`）：
- `theme.css:312-313` `.mark span` 10px
- `theme.css:701-703` `.st span` 10px
- `theme.css:803-804` `.cube i.sum span` **9px**（全站最小）
- `theme.css:840-842` `.band-h em` 10.5px
- `theme.css:904-907` `.wip-s` 10.5px
- `theme.css:985-986` `.gl span` 10.5px
- `theme.css:1013-1015` `.rk > i` 10px
- `theme.css:1042-1045` `.rk em` 10.5px
- `theme.css:1151-1154` `.lc span` 10px
- `theme.css:1162-1170` `.foot` 10.5px
- `theme.css:1191-1192` `.foot-ver` 10px
- `theme.css:1195-1196` `.foot-slogan` 10px
- `theme.css:1686-1687` / `theme.css:1697-1698` 窄屏 `.st span` 9px
- `theme.css:1728-1729` `.strip i span` 10px（死代码，见第 16 条）
- `theme.css:1901-1904` `.rc-tag` 10px

---

## 中

### 13. 世代状态不进 URL，无法深链 [源码]

- `src/components/ThemeScript.astro:143-146` — 只从 `localStorage.getItem('jubeat-gen')` 恢复，从不写回 URL，也不读 URL。
- 后果：无法把「某个世代的首页」发给别人；浏览器后退不还原世代。

### 14. 触屏三项几乎全缺 [源码]

- `touch-action`：**0 处**（没有 `manipulation`，双击缩放延迟仍在）。
- `overscroll-behavior`：**0 处**（没有下拉刷新/滚动链隔离）。
- `-webkit-tap-highlight-color`：**仅 1 处**，`src/components/BootScreen.astro:61`（只在开屏遮罩上，全站其他可点元素仍是默认高亮块）。
- `env(safe-area-inset-*)`：**0 处**（刘海屏/圆角屏下 footer 与导航贴边）。

### 15. 数字列缺 `tabular-nums` [源码]

- 全站只有 `theme.css:190`（`.mono`）加了 `font-variant-numeric: tabular-nums`。
- `.st b`（`theme.css:708-715`）用了 `--font-data` 但没加，四张统计卡的数字宽度会随值抖动。
- `.foot-ver`、`.rc-time`、`.rc-tag` 同理。

### 16. 约 322 行 CSS 是完全未引用的死代码 [源码]

脚本比对 `theme.css` 全部 77 个类 vs `src/` 的 markup（`grep` 交叉验证：markup 里只命中 `Base.astro:124` 的 `foot-slogan`，与 `.lede.slogan` 无关），**13 个类令牌零引用**：
`cd`、`dist`、`dr`、`gl`、`glegend`、`lat`、`lc`、`lede`、`rank`、`rk`、`slogan`、`strip`、`tr`。

归并为 6 个死区块，合计 **291 行**（有效代码 286 行）：

| 区块 | 行号 | 行数 |
| --- | --- | --- |
| `.lede` / `.lede b` / `.lede.slogan` | `theme.css:651-673` | 23 |
| `.strip`（timeline） | `theme.css:920-954` | 35 |
| `.glegend` / `.gl` | `theme.css:955-990` | 36 |
| `.rank` / `.rk` | `theme.css:992-1061` | 70 |
| `.dist` / `.dr` / `.tr` | `theme.css:1063-1100` | 38 |
| `.lat` / `.lc` / `.cd` | `theme.css:1102-1159` | 58 |

另有散落在响应式媒体查询里的 **31 行**同源死规则：
`theme.css:1668-1672`（1080px 的 `.lat`）、`:1707-1709` / `:1731-1734`（860px 与 768px 的 `.glegend`）、
`:1710-1714`（860px 的 `.rank`）、`:1715-1717`（860px 的 `.lat`）、`:1718-1721`（860px 的 `.dr`）、
`:1724-1730`（768px 的 `.strip`）。

这些是给已下线的「世代的层 / 定数顶格 / 定数分布 / 最近收录」四个区块写的（`README.md:15` 已说明四个区块下线，数据仍在 `src/data/data.json`）。删掉可减 **约 322 行**，也顺带消灭第 2、12 条里的部分违规。

### 17. 用户可见文案用了 6 个半角点代替省略号 [源码]

- `src/pages/404.astro:10` — 「这里还没有铺路，前面的区域以后再来探索吧......」
- `src/pages/index.astro:18` — 「正在施工中，前面的区域以后再来探索吧......」
- `src/pages/recent.astro:64` — 同款文案
- `src/components/BootScreen.astro:263` — `Loading<span class="boot-dots"><i>.</i>×6</span>`

中文排版应使用单个 `…`（U+2026）。开屏那处如果是为了逐点动画，可用 `aria-hidden` 包住点、给外层补 `aria-label="Loading…"`。

### 18. 品牌字没标 `translate="no"` [源码]

- 全站搜索 `translate=`：**0 处**。
- `Beyond ↑ JUBEAT ♪~`（`Header.astro:6`、`Base.astro:121`、`title.ts`）是品牌名，浏览器自动翻译会把它拆坏。加 `translate="no"`。

### 19. 注释与文案数字过期 [源码]

- `src/components/Header.astro:2` — 注释写「点击弹出 13 个世代」，`ThemeScript.astro:10-25` 的 GEN 数组实际是 **14 项**。
- `src/pages/index.astro:11` 与 `src/layouts/Base.astro:29` — description 写「{data.stat.gens} 个世代 …… 支持 14 套世代主题切换」，`data.stat.gens` 实测为 **15**（`data.json` 里 `gen` 数组 15 项，含 saucer fulfill），于是同一句里并列「15 个世代」和「14 套主题」，读者会以为自相矛盾。两个数字各自都对（README:13 明确写「15 个世代 / 513 首曲目 / 1512 个谱面」，README:27 明确写「14 套世代主题」），问题在于同一句里缺主语，建议改成「15 个世代、513 首曲目、1512 张谱面，其中 14 套世代可切换主题」。

### 20. 无效 CSS 与死链 [源码]

- `theme.css:1203` — `.foot .mark-sm { cursor: default }`。但 `Base.astro:118` 的 `.mark.mark-sm` 是 `<span>`，本来就没有点击行为，这条声明无作用（也提示过「这里曾经是链接」）。
- `Header.astro:10` — 六条导航文字链里 **5 条**（`/songs/` `/jubility/` `/emblem/` `/partners/` `/achievements/`）没有对应页面，全部落进自定义 404。这是 `Header.astro:9` 注释里写明的有意行为，但对用户是空点击；建议至少给未完成项加 `aria-disabled` 或「施工中」角标。

---

## 低

### 21. 版本号两处不一致 [源码]

- `src/data/site.json` 的 `"version": "1.5.0"` → 页脚渲染 `v1.5.0`（`Base.astro:115`）。
- `package.json` 是 `4.0.0`。
- README:29 已明确说明「版本号是网页自己的迭代版本，读 src/data/site.json 的 version（从 1.0.0 起，改功能时手动 +1，与 npm 包版本无关）」——属有意分离且文档已记。此项降为提示：页脚读者看不到 README，可给 `.foot-ver` 加 `title="站点迭代版本，与 npm 包版本无关"`。

### 22. 日期格式化未用 `Intl` [源码]

- `src/layouts/Base.astro:43` — `toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })`。全 `src/` 搜索 `Intl.`：**0 处**。当前写法能工作，但 `en-CA` 依赖运行环境 ICU，建议改用 `Intl.DateTimeFormat('zh-CN', ...)` 显式构造。

---

## 已通过

- `:focus-visible` 有自定义双环，且**全站 0 处 `outline: none`**（`theme.css:1479-1483`）。
- `transition: all`：**0 处**；动效只用 `transform` / `opacity`。
- `prefers-reduced-motion` 覆盖完整：`BootScreen.astro:16`（head 脚本直接不启动）、`BootScreen.astro:244`（CSS 关动画）、`ThemeScript.astro:54`（JS 跳过过渡）、`theme.css:916`、`theme.css:1662`。
- 弹层关闭态用 `visibility: hidden` 把 14 个按钮移出 Tab 序列（实测确认）。
- 四个图标链全部有 `aria-label` + `title`，内部 svg 全部 `aria-hidden="true"`（`Header.astro:14-26`）。
- `#tswBtn` 的 `aria-expanded` / `aria-haspopup` / `aria-controls` / `aria-label` 齐备（`Header.astro:29`），且 `ThemeScript.astro:151` 同步更新。
- 14 个世代按钮有 `aria-pressed`（`ThemeScript.astro:39`，`:109` 同步），可访问名来自按钮内可见文本。
- 长文本截断齐备：`.rk .t`（`theme.css:1027-1029`）有 `min-width: 0`，`.rk b`（`:1030-1038`）、`.lc b`（`:1142-1150`）、`.lc span`（`:1151-1159`）、`.gl b`（`:976-984`）、`.rk em`（`:1042-1050`）都是 `nowrap` + `overflow:hidden` + `ellipsis`；`.rc-before` / `.rc-after` 有 `overflow-wrap: anywhere`（`:1888-1894`）。
- `lang="zh-CN"` 正确（`Base.astro:51`）；viewport 无 `user-scalable=no`（`Base.astro:54`）。
- 无 `onPaste` preventDefault、无 `autoFocus`、无 `<div onClick>` 导航、无 inline onClick。
- 图片 alt 全覆盖：16 张 img 中 15 张有语义 alt，1 张字标 `alt=""` 属装饰性，合规。
- 空态处理完整：`/recent/` 无数据时有 `.rc-empty` 三行说明（`recent.astro:26-34`）。
- `<time datetime={c.time}>` 语义正确（`recent.astro:40`）。
- `noindex` 用得克制：只加在 `/recent/` 和 404 上，首页正常索引（`Base.astro:58`）。
- 14 个世代配色运行时取值与源码完全一致（逐代验证），无遗漏世代。
- 响应式五档视口（1440/1024/768/414/360）**全部无横向溢出**。

---

## 附录：实测环境与原始数据

- dev server：`npx astro dev --port 4331 --host 127.0.0.1`（启动前必须清空 `ALL_PROXY`/`HTTP_PROXY`/`HTTPS_PROXY`，否则首次请求要 68.8s）
- 浏览器：ego-browser 2.1.0（Chromium），taskSpace "jubeat audit 20261021b"（id=33）
- 窄屏模拟：`CDP Emulation.setDeviceMetricsOverride`（该版本无 `setViewportSize`）
- 原始数据：`scripts/tmp/audit3.json`（DOM/字号/触控/主题令牌）、`audit4.json`（多页面 + 移动端）、`audit5.json`（14 代配色）、`audit6.json`（CDP 无障碍树）、`audit7.json`（性能/CLS）、`audit8.json`（14 代 `.word-t` display）、`resp.json`（五档视口）、`pages.json`（全站爬取）、`a11y.json`（可访问性指标）
- 性能基线：DOMContentLoaded 1356ms、load 1911ms、transferSize 78,654、CLS 0、图片总字节 171,730

## 修复优先级建议

1. **h1 可访问名**（第 1 条）—— 一行 `aria-label` 即可，影响最大。
2. **`<main>` + skip-link**（第 3 条）—— 结构性，改动小。
3. **浅色 5 代 `--ink3`**（第 2 条）—— 换一个色值即可修掉 6 处小字违规。
4. **`color-scheme`**（第 5 条）—— 一行属性。
5. **触控目标 44px**（第 4 条）—— 改 4 个选择器。
6. **图片 width/height + lazy**（第 6、7 条）。
7. 其余按条推进；第 16 条的死代码清理可顺手做完。
