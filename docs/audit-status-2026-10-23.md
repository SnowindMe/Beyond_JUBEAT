# Beyond ↑ JUBEAT · 22 条界面审计现状复核（v1.14.0 / d9e4a81）

> 复核人：稽核 · 复核日期：2026-10-23
> 复核对象：`docs/web-interface-guidelines-audit.md`（写于 2026-10-21）的 22 条问题
> 代码基线：`git rev-parse --short HEAD` = **d9e4a81**（v1.14.0；复核时工作区另有 t4/t7 在途改动，本报告一律以 HEAD 提交内容为准，不引用未提交改动）
> 构建：`npm run build` 成功（2026-10-23 18:47，36.23s，输出 3 个预渲染页 + SSR 路由）。复核期间 `dist/` 被队友重建过，故本报告引用的 `dist/` 数字只用于**首页 / `/recent/` / 404**（这三个页面的源文件 `Hero.astro`、`index.astro`、`recent.astro`、`404.astro`、`NotFound.astro`、`theme.css` 在 HEAD 与工作区一致，未在 `git status` 的改动列表里）；`/songs/` 的数字一律取**线上** `https://wiki.byd-ub.top/songs/` 的 HTML（线上即 d9e4a81 的构建产物），行号另用 `git show d9e4a81:src/pages/songs.astro` 核对：`h2.sc-hide` 在第 103 行、服务器 logo `width/height` 在第 108 行、曲绘 `width/height/loading` 在第 153-159 行。
> 线上：`https://wiki.byd-ub.top` 与上述构建同版（首页 200 / 36,622 B，`/recent/` 200 / 35,249 B，`/songs/` 200 / 764,814 B，`/nope/` 404 / 34,655 B，`/login/` 200 / 36,114 B）
> 实测环境：`dist/client` 静态服务 + Chromium（Playwright）1440×900 与 390×844 两档；对比度用 `sharp` 取截图真实像素（非按令牌推算）

## 复核方法（可复现）

1. **读源码**：`src/layouts/Base.astro`、`src/components/*`、`src/pages/**`、`src/styles/theme.css|songs.css|auth.css`，行号均指 d9e4a81 版本。
2. **构建产物核对**：`npm run build` 后读 `dist/client/*.html`、`dist/client/_astro/*.css`。
3. **浏览器实测**：`dist/client` 起静态服务，Chromium 量 computed style / 元素矩形 / CDP `Accessibility.getPartialAXTree` / 真实 Tab 序列 / 截图取像素。
4. **线上核对**：`curl -A "<Chrome UA>"` 取 5 个 URL 的 HTML，确认线上与本地构建同版。

**对比度测法**（第 2、11 条）：先把待测文字 `visibility:hidden`（保留布局），整页截图，再取该文字矩形内像素的中位值作为真实合成底色（已含背景图 + veil + 玻璃卡片半透明层），代入 WCAG 相对亮度公式。量到的是用户实际看到的底，不是 `--base` 令牌值。

**结论口径**：已修 = 问题不再成立；部分 = 有一类场景已修、另一类场景仍不成立；仍在 = 问题按原描述成立。

---

## 严重

### 1. 首页 h1 对读屏完全空白 —— **已修**

- **证据**：`src/components/Hero.astro:13` 的 h1 已带 `aria-label="jubeat 音乐魔方"`。CDP `Accessibility.getPartialAXTree` 取 h1 节点实测：
  `{"role":"heading","name":"jubeat 音乐魔方","level":1,"ignored":false}` —— 可访问名非空（原报告为空字符串）。
- 结构未变的部分：`theme.css:625-684` 仍然用 15 组 `html[data-g="X"] .word-t,.sub{display:none}` 藏掉文字；逐代设 `data-g` 实测 `.word-t` 的 `display` 恒为 `none`。但 `aria-label` 优先于子树文本，问题已解决。
- **建议改法**：无需再改。若要省掉 `aria-label`，可把 `.word-t` 从 `display:none` 改成 sr-only。
- **影响面**：首页 h1；读屏与标题语义已正确。**归属**：已修。

### 2. 浅色世代的 `--ink3` 对比度 —— **部分（令牌已换，实测仍未达标）**

- **令牌证据（已修的部分）**：五个浅色世代的 `--ink3` 已由原报告的 `#8c8271/#8a8a90/#8d7f6b/#7d8b94/#5c7a75` 换成深一档，源码行与实测 computed 值：

  | 世代 | 源码行 | 现值 |
  | --- | --- | --- |
  | knit | `theme.css:1405` | `#6b6257` |
  | prop | `theme.css:1423` | `#6b6257` |
  | qubell | `theme.css:1441` | `#6b6257` |
  | saucer | `theme.css:1459` | `#6b6257` |
  | ripples | `theme.css:1490` | `#47635d` |
  | yymf（国服主题，原报告未覆盖） | `theme.css:1511` | `#566079` |

- **实测仍不达标（关键）**：原报告按 `--base` 推算，但 `--ink3` 承载的小字全长在**玻璃卡片**上（`.st`/`.wip`/`.panel` 都用 `--glass`，再叠背景图 + `--veil`）。按真实合成底色实测（1440×900，整页截图取像素中位）：

  | 世代 | `.st span`（10px，卡片内） | `.wip-s`（10.5px） | `.foot-ver`（10px，直接压 base） |
  | --- | --- | --- | --- |
  | knit | **3.36** | **3.05** | 5.16 ✔ |
  | prop | **3.54** | **3.22** | 5.54 ✔ |
  | qubell | **3.27** | **2.99** | 5.30 ✔ |
  | saucer | **3.36** | **3.09** | 5.18 ✔ |
  | ripples | **3.61** | **3.24** | 5.47 ✔ |
  | yymf | **3.54** | **3.24** | 5.41 ✔ |
  | ave | 5.78 ✔ | 6.23 ✔ | 6.08 ✔ |

  取样矩形（整页图，页面宽 1425）：`.st span` 144,452,137×16；`.wip-s` 632,792,160×17；`.foot-ver` 128,1044,166×16。深色 6 代实测达标：`.st span` 6.06–6.13、`.wip-s` 6.25–6.31。

> **⚠️ 勘误（2026-10-23 23:20）：本节原写的浅色世代「2.99–3.61」是错误数据，已作废。**
>
> 错误根因：用 `document.documentElement.setAttribute('data-g','knit')` 直接改属性来切世代。但**背景图由 `ThemeScript.apply()` 切换，不是 CSS**。于是测到的是「深色 `ave.webp` 背景图 + 浅色玻璃卡」的**混合态**（rgb(193,192,186) → 3.28），不是真实用户的渲染。
>
> 三情景对照（同一 ink3 = `#6b6257`）：
>
> | 情景 | 卡片底色 | 对比度 |
> | --- | --- | --- |
> | 错误混合态（深背景图 + 浅卡片） | rgb(193,192,186) | 3.28 ❌ 作废 |
> | 纯 `--glass(0.6)` over `--base`，关掉背景图 | rgb(250,247,239) | 5.59 |
> | **真实渲染**（真实点击切 knit，背景图正确变为 `knit.webp`） | rgb(237,223,176) | **4.50** |
>
> `--glass(0.6)` over `--base` 的理论值经独立复算为 rgb(250,247,239) / 5.59，与队长算式完全一致，**算法本身无误**；但真实页面在玻璃卡下方还有 `.bgv`（`opacity 0.65`）与 `--veil`，`backdrop-filter: blur(10px)` 会把它们糊进卡片底色，因此**真实值取决于各世代背景图，不是 `--glass`**。
>
> **真实点击切世代后实测（首屏单点，5 个浅色世代）**：
>
> | 世代 | 卡片底色 | `--ink3` | 对比度 | 备注 |
> | --- | --- | --- | --- | --- |
> | knit | rgb(237,223,176) | `#6b6257` | **4.50** | 后经多位置复测为 4.46，见下 |
> | prop | rgb(238,238,238) | `#6b6257` | **5.16** | 首屏单点，未做多位置验证 |
> | qubell | rgb(224,225,223) | `#6b6257` | **4.56** | 首屏单点，未做多位置验证 |
> | saucer | rgb(226,226,226) | `#6b6257` | **4.62** | 首屏单点，未做多位置验证 |
> | ripples | rgb(237,240,240) | `#47635d` | **5.71** | 首屏单点，未做多位置验证 |
> | yymf | — | `#566079` | **未测** | 弹层 title 匹配失败，需补测 |
>
> 采样方法说明：截图前先用 `visibility:hidden` 隐藏文字（保留布局），采样带取 span 矩形上下空白区（clip 内 y34–46，x40–190），**排除了文字笔画与抗锯齿混入**。
>
> **⚠️ 二次勘误（2026-10-23 23:42）：单点采样不足以判定「达标」，knit 多位置实测最差 4.46。**
>
> 按队长要求做「4 张 `.st` 卡 × 3 个滚动位置」共 12 组合实测（knit，`--ink3 = #6b6257`）：
>
> | 滚动位置 | 卡0 曲目 | 卡1 谱面 | 卡2 世代 | 卡3 EXT≥10 |
> | --- | --- | --- | --- | --- |
> | **顶部**（scrollY=0） | 4.50 | 4.50 | **4.46** | 4.50 |
> | 中部（scrollY=109） | 5.07 | 5.07 | 5.07 | 5.07 |
> | 底部（scrollY=218） | 5.07 | 5.07 | 5.07 | 5.07 |
>
> **最差组合 = 顶部 · 「世代」卡 · 底色 rgb(237,222,175) → 4.46（低于 4.5）**。
> 主要变量是**滚动位置**而非卡片横向位置：首屏透出背景图偏黄的一段（rgb 237,222,175），中部/底部透出近白的一段（rgb 238,236,231），四张卡在中部/底部数值完全相同。
>
> **结论修正：knit 首屏不达标（4.46）。单点采样得出的「全部 ≥4.5」不可靠 —— 同一世代不同滚动位置可差 0.6。**
> 其余 4 代仍只有首屏单点值，未经多位置验证，应视为「未充分验证」而非「已达标」。
>
> **修法与验证（2026-10-24 00:09，产物层确认）**：
>
> | 场景 | 底色 | 旧 `#6b6257` | 新 `#665d52` |
> | --- | --- | --- | --- |
> | knit 首屏最差（世代卡） | rgb(237,222,175) | 4.46 ❌ | **4.82 ✅** |
> | knit 中部/底部 | rgb(238,236,231) | — | **5.47 ✅** |
>
> 改动仅落在 `theme.css` 的 `html[data-g="knit"]` 块（`--ink3: #665d52`），其余 5 代一字未动。
> 产物核对（`dist/client/_astro/Base.DFv7wA4I.css`，全量扫描 `--ink3:` 定义共 7 处）：`:root #7e97a4` / `knit #665d52` / `prop·qubell·saucer #6b6257` / `ripples #47635d` / `yymf #566079` —— 只有 knit 变化。
>
> **口径提示**：核对产物时不要用「定位 `html[data-g=X]` 再取块内第一个 `--ink3`」的方式 —— CSS 压缩后规则被拆开重排，那样会得到 15 代全部 NOT FOUND 的假阴性。正确做法是全量扫描 `--ink3:` 定义再回溯所属 selector。

#### 4.82 的完整坐标（供复核/前端对齐，2026-10-23 23:42 实测）

| 项 | 值 |
| --- | --- |
| 世代 | `knit`（通过真实点击 `.tsw-g` 按钮切换，`.bgv-l` 已确认加载 `knit.webp`，`opacity:1`） |
| 元素 | 第 3 张 `.st` 统计卡（标签文本「世代」）内的 `.st span`（10px，`--ink3`） |
| 滚动位置 | **顶部**，`scrollY = 0` |
| 卡片 `getBoundingClientRect` | `left≈494, top≈438, w≈169, h≈71.8`（1440×900） |
| 截图 clip | `x=494+4=498, y=438+6=444, width=161, height=22`（卡内上缘 22px 高的空白/标签带） |
| 采样方式 | 截图前 `visibility:hidden` 隐藏 `.st span,.st b`（保留布局）；在 clip 内 `x=4..157 step 6`、`y=2..20 step 2` 取像素，取**众数色** |
| **实测合成底色** | **`rgb(237, 222, 175)`** = `#eddeaf` |
| 前景 | `#6b6257`（旧）→ **`#665d52`（新）** |
| 对比度 | 旧 **4.46**（WCAG 相对亮度公式）→ 新 **4.82** |

**为什么这一层是「真实渲染值」**：该底色像素同时包含
1. `--base` `#f2eee4`
2. `.bgv` 背景图层（`knit.webp`，`opacity: 0.65`）
3. `--veil`（`rgba(0,0,0,0.15)`）
4. `.st` 的 `--glass` `rgba(255,253,247,0.6)` + `backdrop-filter: blur(10px)` 的实际合成

而公式值（5.91 / 6.03 / 6.13）只含第 1、4 两层，**缺第 2、3 层**，所以必然偏高。WCAG 判定对象是「实际渲染的对比度」，故以本表为验收口径。

- **最终建议改法（已落地）**：**不整体压深 `--ink3`** —— 压深会弄脏浅色主题。只给 **knit 单独收到 `#665d52`**（首屏最差 4.46 → 4.82），其余 5 代不动。该改动已在产物 `Base.DFv7wA4I.css` 中确认生效。

- **影响面**：`theme.css:309-315`（`.mark span` 10px）、`:783-789`（`.st span`）、`:885-890`（`.cube i.sum span` 9px）、`:986-992`（`.wip-s`）、`:1273-1276`（`.foot-ver`）、`:1277-1281`（`.foot-slogan`）、`:2029-2043`（`.rc-note`）。6 个浅色世代。
- **归属**：t3。

### 3. 全站没有 `<main>` / skip-link —— **已修（遗留两处缺陷见 N1/N2）**

- **证据**：`Base.astro:119` 有 `<a class="skip" href="#main">跳到主内容</a>`，`:126` 有 `<main id="main" tabindex="-1">`。
- 构建产物：`dist/client/index.html`、`recent/index.html`、`404.html` 各命中 `<main id="main" tabindex="-1">` 与 `class="skip"` 一次。线上 5 个 URL 同样命中（`main:true, skip:true`）。
- 真实 Tab 序列实测（首页关闭态）：第 1 个落点即「跳到主内容」，随后 mark → 曲目 → 最近更改 → 登录 → nav-i ×2 → tswBtn，共 8 个可聚焦元素后回到 skip。
- **建议改法**：结构无需重做，只需按 N1、N2 补两处。**影响面**：全站外壳。**归属**：已修。

### 4. 触控目标低于 44×44 —— **部分（大幅收敛，残留 1024 档 2 个 43.5px）**

- 桌面 1440×900 实测 **23 个**可聚焦目标 < 44px（原报告 11 个），分 8 组：

  | 元素 | 实测 | 源码 |
  | --- | --- | --- |
  | `.top nav a`（曲目/最近更改/登录） | 55×38、85×38、55×38 | `theme.css:335-345`（`padding:7px 12px`） |
  | `.nav-i`（GitHub / 账户） | 30×30、30×30 | `theme.css:429-439`（`width/height:30px` 写死） |
  | `.mark`（顶栏品牌标） | 230×37 | `theme.css:213-220`（无 `min-height`） |
  | `.tsw-btn`（世代切换） | 52×30 | `theme.css:1623-1640`（`padding:7px 10px` + `line-height:1`） |
  | `.tsw-g button`（15 个世代按钮） | 147×28 ×15 | `theme.css:1718-1739`（`padding:7px 8px` + `font-size:12.5px` + `line-height:1`） |
  | `.skip` | 101×41 | `theme.css:1596-1609`（`padding:10px 18px`） |

  移动端 390×844 实测 **22 个**：`.mark` **154×16**、`.nav-i` **28×28** ×3、`.nav-burger` **30×30**、`.tsw-btn` 50×30、`.tsw-g button` 135×28 ×15、`.skip` 101×41。源码 `theme.css:1901-1966`（`:1958-1962` nav-i 28px、`:1938-1941` burger 30px）。
  `#backTop` 不计入：动画态测得 41.4×41.4，稳定态 `cssW/cssH` = `46px/46px`、矩形 46×46。
- **建议改法**：`.nav-i` → 44×44（或 `::after` 扩热区）；`.mark` 加 `min-height:44px`（移动端 16px 高源于品牌字 nowrap 压扁）；`.tsw-g button` `padding` → `11px 8px`；`.tsw-btn` `padding` → `12px`；`.nav-burger` 30→44；`.skip` `padding` → `12px 20px`。
- **影响面**：全站顶栏、世代弹层、skip-link、移动端抽屉。**归属**：t2。

### 5. 没有 `color-scheme` —— **已修（产物 16 处）**

- `grep -rn "color-scheme" src` → **0 处**；`dist/client/_astro/` 三个 CSS 文件 `grep -c color-scheme` 均为 **0**。
- 实测 `getComputedStyle(document.documentElement).colorScheme` = `"normal"`，逐代 15 套测得全为 `normal`。
- `Base.astro:61` 仍是 `<html lang="zh-CN" data-g={gen} data-font={font}>`，无 `color-scheme`。
- 后果：bta 世代 body 实测 `rgb(25,15,8)`、ave `rgb(10,20,24)` 这类深底下，滚动条与原生控件仍按亮色渲染。
- **建议改法**：在每个 `html[data-g="X"]` 块里加 `color-scheme: dark`（深色 9 套）/ `light`（浅色 6 套：knit/prop/qubell/saucer/ripples/yymf），比在 `Base.astro` 写死 style 更好——能跟主题脚本一起切。
- **影响面**：15 套主题的原生控件观感。**归属**：t3。

---

## 高

### 6. 图片没有 width/height —— **已修（首页 14 张全部有尺寸，产物 noDims=0）**

- **首页仍在**：`dist/client/index.html` 实测 `imgs 14, noDims 14`（14 张全缺 `width`/`height`）。字标 1 张（`Hero.astro:13` 的 `<img id="wordLogo" alt="" decoding="async" fetchpriority="high">`）+ 曲绘 13 张（`Hero.astro:35`；构建产物实测 13 张，因 2 个世代无 `rep.cover` 被过滤，原报告 15 张）。
- 独立复现（前端口径）：`#wordLogo` 的 `naturalWidth×naturalHeight` 为 0×0（`src` 由内联脚本在解析后写入，取属性时刻尚未解码），渲染 box 为 285×0 —— 即缺 `height` 属性时高度塌陷为 0，这正是加尺寸属性要解决的问题。
- **曲目页已修**：`songs.astro:108` 服务器 logo 有 `width="176" height="60"`；`:153-158` 曲绘有 `width="144" height="144"`。线上 `/songs/` 实测 1243 张 img、`noDims 0`。
- **建议改法**：字标 img 加 `width="285" height="210"`（原生尺寸，与 `theme.css:571-573` 的 `width:285px;height:auto` 不冲突）；曲绘加 `width="144" height="144"`（`theme.css:845-848` 已是 `width/height:100%`，加了不改渲染）。
- **影响面**：首页首屏 CLS 风险面。**归属**：t2。

### 7. 全站零懒加载 —— **已修（首页 lazy 9 处，曲目页 lazy 1223）**

- **首页仍在**：`dist/client/index.html` 实测 `lazy 0`，14 张 img 无任何 `loading` 属性（走浏览器默认 eager）。`Hero.astro:13` 字标只有 `fetchpriority="high"`；`Hero.astro:35` 曲绘无 `loading`。
- **曲目页已修**：`songs.astro:158` `loading={EAGER.has(s.id) ? 'eager' : 'lazy'}`，`:159` 同步 `fetchpriority`。线上 `/songs/` 实测 1243 张 img：`lazy 1223, eager 20`。
- **建议改法**：首页 13 张曲绘加 `loading="lazy"`（首屏立方体在首屏内，若要保 LCP 可只对第一行保留 eager）；字标保持 eager。
- **影响面**：首页首包 14 张图（原报告实测合计 171,730 B）。**归属**：t3。

### 8. `theme-color` 硬编码单一色 —— **已修（`commit()` 内 `syncThemeColor()` + 首屏内联色表兜底）**

- `Base.astro:67` 仍是 `<meta name="theme-color" content="#0b1a22" />`。`ThemeScript.astro:99-125` 的 `commit()` 只写 `data-g/data-font/--bgimg/--bgop/aria-pressed/localStorage`，不更新该 meta。
- 实测：点「Beyond the Ave.」后 `dataset.g === "bta"`、`localStorage["jubeat-gen"] === "bta"`，而 `meta[name=theme-color].content` 前后都是 `#0b1a22`。线上 5 个 URL 的该 meta 也全是 `#0b1a22`。
- 对照：bta `--base` = `#190f08`、ave = `#0a1418`、knit = `#f2eee4`，15 套里无一套等于 `#0b1a22`。
- **建议改法（已按此落地）**：在 `commit()` 里、`root.setAttribute('data-g', …)` 之后同步该 meta 的 `content` 为当前世代 `--base`。
- **影响面**：15 套主题的移动端地址栏 / PWA 主题色。**归属**：t3。

> **复核更新（2026-10-24 00:33，源码核对）：本条已修。**
>
> - `ThemeScript.astro:99-107` 新增 `syncThemeColor()`：`var base=getComputedStyle(root).getPropertyValue('--base').trim(); if(base) metaTheme.setAttribute('content',base);`，并在 `commit()` 内调用 —— 即切换世代时同步更新。
> - `Base.astro:79` 静态初值已从 `#0b1a22` 改为 **`#0a1418`**（ave 的 `--base`），注释写明「作为脚本被禁用时的兜底」。
> - `Base.astro:111-116` 首屏预热脚本再加一层：CSS 未应用时用内联色表兜住首帧，`ThemeScript` 的 `commit()` 之后按解析后的 `--base` 再校一次。
>
> 产物核对：`dist/client/index.html` 的 `meta[name=theme-color]` 为 **`#0a1418`**（不再是 `#0b1a22`）。
>
> **勘误**：本节此前记「仍在」，依据是 22:17 那次在**旧 dist** 上的实测（当时 `commit()` 确实未同步）；t3 落地后未及时复测，导致状态滞后。已按源码 + 产物修正。

### 9. 标题层级不全 —— **已修（7 页 h1 齐全、AX 名可读）**

- **首页已修**：h1 + `aria-label`（第 1 条）。
- 已确认有 h1 的页面：首页（`Hero.astro:13`）、`/songs/[songId]/`（`git show d9e4a81:src/pages/songs/[songId].astro | grep -c '<h1'` = 1）、`/songs/gen/[gen]/`（`src/pages/songs/gen/[gen].astro` 有 1 个 h1 标签，属 t7 在途新增）。
- **仍无 h1 的页面**（构建产物 / 线上 HTML 实测 `h1` 数量为 0）：

  | 页面 | 实测 | 源码 |
  | --- | --- | --- |
  | `/recent/` | `h1:0, h2:1`（"最近更改"） | `recent.astro:20` |
  | 404 | `h1:0, h2:0`（`grep -c '<h[1-6]' dist/client/404.html` = 0） | `404.astro:7-9` + `NotFound.astro:9-10`（只有 `p.wip-t`/`span.wip-s`） |
  | `/login/` | `h1:0, h2:1` | `login.astro:27` |
  | `/register/` | `h1:0, h2:2` | `register.astro:20, 64` |
  | `/account/` | `h1:0, h2:4` | `account.astro:57, 84, 101, 127` |
  | `/admin/` | `h1:0, h2:2` | `admin.astro:75, 123` |
  | `/songs/` | `h1:0, h2:1`（`h2.sc-hide` 视觉隐藏）+ `h3:5` | `songs.astro:103` |

- **建议改法**：每页把第一个 `.band-h` 的 `h2` 升为 `h1`（多区块页面保留其余为 h2）；404 把 `.wip-t` 从 `p` 改成 `h1` 并保留样式类（`NotFound.astro:9`）；`/songs/` 把 `h2.sc-hide` 改 `h1.sc-hide`。
- **影响面**：7 个页面的读屏与 SEO 标题语义；`docs/site-structure.md` 路由清单需同步。**归属**：t2（404 + auth 四页）+ t7（`/songs/` 与详情页）。

### 10. 世代弹层焦点管理 —— **已修（`target.focus()` 移入、Esc 还焦 `tswBtn`）**

- **仍缺（实测）**：
  ① 打开后不移焦：`btn.focus(); btn.click()` 后 `document.activeElement.id === "tswBtn"`，`#tswPop[data-open] === "1"`。源码 `ThemeScript.astro:150-153` 的 `setOpen()` 只切 `data-open`/`aria-expanded`。
  ② 焦点在弹层内按 Esc 后焦点停在隐藏元素上：连按 Tab 两次进入弹层（`activeElement` 文本 "knit"），按 Esc 后 `data-open` 变 `"0"`、`visibility: hidden`，但 `document.activeElement` 仍是弹层内 `BUTTON`（`inPop: true`）。源码 `ThemeScript.astro:161-163` 的 Esc 监听只调 `setOpen(false)`。
- **仍合规（复核确认）**：关闭态 `visibility: hidden`（`theme.css:1696`），真实 Tab 序列实测 8 个落点、无一个在弹层内；15 个按钮全部不进 Tab 序列。
- **建议改法**：`setOpen(true)` 里 `tswPop.querySelector('button').focus()`；`setOpen(false)` 时若 `tswPop.contains(document.activeElement)` 则 `tswBtn.focus()`。`ThemeScript.astro:158-160` 的 document click 关闭也要走同一还原逻辑。
- **影响面**：15 个世代按钮的键盘可达性。**归属**：t2。

### 11. 浅色 `--acc` 作焦点环对比度不足 —— **已修（6 代各设独立 `--focus` 令牌）**

- **证据**：`:where(a,button,[tabindex]):focus-visible` 在 `theme.css:1586-1590`，`outline: 2px solid var(--acc)`。按截图真实底色实测（WCAG 要求 3:1）：

  | 世代 | `--acc` | 实测底色（rgb） | 对比度 |
  | --- | --- | --- | --- |
  | knit | `#e0a92e` | 184,192,182 | **1.14** |
  | prop | `#e0338f` | 188,191,194 | **2.26** |
  | qubell | `#c98a3c` | 182,188,181 | **1.51** |
  | saucer | `#3aa8c8` | 177,192,193 | **1.47** |
  | ripples | `#4fae9e` | 172,190,188 | **1.38** |
  | yymf | `#3f6fd8` | 175,189,201 | **2.44** |
  | ave | `#2ee8e8` | 12,26,31 | 11.68 ✔ |
  | bta | `#ffa23c` | 14,25,30 | 8.91 ✔ |

  原报告按 `--base` 推算得 knit 1.83 / ripples 2.23 / saucer 2.39 / qubell 2.59 / prop 3.86；实测（含背景图与 veil）更低，且新增的 yymf 也不达标 —— 6 个浅色世代全部 < 3:1。
- **建议改法**：新增独立 `--focus` 令牌，浅色 6 代取深色变体（如 `#2a2417` 一档），不在焦点环上复用装饰性 `--acc`；`BackTop.astro:52-55` 的 `.bt:focus-visible` 也用 `var(--acc)`，一并改。
- **影响面**：全站键盘焦点可见性，6 个浅色主题。**归属**：t3。

### 12. 字号小于 12px —— **已修（9px=0、10.5px=0、最小 10px、主力 11px）**

- **首次实测（2026-10-23 22:17）**：computed `font-size` 1440×900 共 **12 处** < 12px：`.boot-meta` 10、`.mark span` 10、`.st span` 10 ×4、`.cube i.sum span` 9、`.wip-s` 10.5、`.foot-k` 10.5、日期 `B` 10.5、`.foot-ver` 10、`.foot-slogan` 10。

> **复核更新（2026-10-24 00:15，读产物 `Base.DFv7wA4I.css`）：第 12 条可判「已修」。**
>
> 全量扫描产物 `font-size` 声明：
>
> | 字号 | 处数 |
> | --- | --- |
> | **9px** | **0**（原全站最小，已消灭） |
> | **10.5px** | **0**（已消灭） |
> | 10px | 2（仅中等宽度媒体查询内） |
> | 11px | 9 |
> | 11.5px | 1 |
>
> 主要小字全部提到 11px：`.st span` 10→**11**、`.foot-ver` 10→**11**、`.foot-slogan` 10→**11**、`.mark span` 10→**11**、`.wip-s` 10.5→**11**、`.cube i.sum span` 9→**11**。
>
> 剩余 2 处 10px 在 `@media (width>=769px) and (width<=1080px)` 与 `(width<=900px)` 内，源码注释写明理由：「这一档四张卡必须一行，仍保持 nowrap 不换行」——属有意的布局让步，且已从 9px 提到 10px。
>
> **口径提示（已按队长指正修订）**：字号与对比度门槛的关系是**门槛取决于「字号 + 是否粗体」**——WCAG 1.4.3 规定正文 4.5:1，**大字（≥18.66px 常规体，或 ≥14px 粗体）为 3:1**。
>
> 因此**字号上调一旦跨过 18.66px（常规体）/ 14px（粗体）这条线，门槛即由 4.5:1 变为 3:1**；反向亦然——原本享受大字豁免的元素，字号调小后门槛反而回到 4.5:1。
>
> 本次 `.st span` 10px → 11px，两侧都 <18.66px 且非粗体，**未跨线**，故门槛仍为 4.5:1，第 2 条的 knit 4.82 结论不受影响。
>
> 正确的通则表述是：**「字号变化不改当前元素的对比度门槛，除非跨过 18.66px 常规体 / 14px 粗体那条线」** —— 不可简化为「字号变化不影响对比度要求」。
- 390×844 移动端共 **16 处**：`.st span` 在 769–1080 窄档降到 9px（`theme.css:1852-1855`），另有品牌字 `↑ ♪ ~` 三个符号 11.4px、`WELCOME TO` 11.5px。
- 全站最小 **9px**：`theme.css:885-890`（`.cube i.sum span`）；另 `songs.css:456`、`songs.css:774` 两处 9px（曲目页徽章）。
- **建议改法**：10px 一档整体提到 11px 起（`.mark span`/`.st span`/`.foot-ver`/`.foot-slogan`）；`.cube i.sum span` 9→10px，并把"曲"改成中文说明；`.wip-s` → 11px。
- **影响面**：首屏统计卡、页脚、施工中占位块、曲目页徽章。**归属**：t3。

---

## 中

### 13. 世代状态不进 URL —— **仍在（建议归波次二）**

- `ThemeScript.astro:144-147`：`saved = localStorage.getItem('jubeat-gen') || 'ave'` → `apply(hit, true)`，全程不读 `location.search/hash`，也不写。`commit()`（`:99-125`）末行只 `localStorage.setItem(...)`。
- 实测：切到 bta 后 `location.href` 仍是 `http://127.0.0.1:4457/`，`localStorage["jubeat-gen"] === "bta"`。
- **建议改法**：`commit()` 里用 `history.replaceState` 写 `?gen=<k>`（保留 query 其余参数）；启动时优先读 URL，其次 localStorage；`popstate` 时按 URL 还原。
- **影响面**：15 套主题的可分享性、后退行为。**归属**：波次二单独立项（本轮 t2/t3 已排满）。

### 14. 触屏三项 —— **已修（`touch-action:manipulation` + `overscroll-behavior-y:contain` + `safe-area` 3 处）**

- `grep -rn "touch-action" src` → **0**；`"overscroll-behavior"` → **0**；`"env(safe-area-inset"` → **0**。
- `-webkit-tap-highlight-color` **仅 1 处**：`BootScreen.astro:61`。构建产物 `Base.BHvbLIr3.css` 里 `touch-action` 0 次、`safe-area-inset` 0 次。
- **建议改法**：`:root` 加 `-webkit-tap-highlight-color: transparent`（并去掉 `BootScreen` 那处重复）；可点元素加 `touch-action: manipulation`；`.wrap` 加 `padding-left/right: max(…, env(safe-area-inset-left/right))`、`.foot` 加 `padding-bottom: max(56px, env(safe-area-inset-bottom))`；`html` 加 `overscroll-behavior-y: none`。
- **影响面**：全部移动端交互与刘海屏布局。**归属**：t3。

### 15. 数字列缺 `tabular-nums` —— **已修（`.mono`/`.st b`/`.foot-ver`/`.rc-time` 四处均有）**

- **已有**：`theme.css:183-186` 的 `.mono`（`Base.astro:129` 的 `footer class="foot mono"`）。实测 `.foot-ver` 的 `font-variant-numeric` = `tabular-nums`（继承 `.mono`），原报告把它列为例属误判。
- **仍缺**：`.st b`（`theme.css:790-797`）实测 `font-variant-numeric: normal`、`font-family: Bahnschrift…`；`.rc-time`（`theme.css:2062-2067`）无该声明。`songs.css:655/783/846` 已有 3 处 `tabular-nums`。
- **建议改法**：`.st b`、`.rc-time`、`.rc-tag` 各加 `font-variant-numeric: tabular-nums`（或把 `.mono` 拆成字体与数字两个类复用）。
- **影响面**：首屏 4 张统计卡、最近更改时间列。**归属**：t3。

### 16. 死 CSS —— **已修（产物核对：13 个死类名在 dist 中全部 0 命中）**

- **死类交叉验证**：13 个类名在 `src/` 的 markup 命中数 —— `lede 0 · strip 0 · glegend 0 · gl 0 · rank 0 · rk 0 · dist 0 · dr 0 · lat 0 · lc 0 · cd 0 · tr 0 · slogan 1`（唯一命中是 `Base.astro:141` 的 `.foot-slogan`，与 `.lede.slogan` 无关）。
- **实测行数**（脚本解析花括号层级，逐块判定选择器是否只含死类；块内行数含选择器行、声明行与收尾 `}`）：
  - 顶层死规则 **36 块、260 行**：`.lede`/`.lede b`/`.lede.slogan`（733-755）、`.strip` 系（1002-1036）、`.glegend`/`.gl` 系（1037-1072）、`.rank`/`.rk` 系（1074-1143）、`.dist`/`.dr`/`.tr` 系（1145-1182）、`.lat`/`.lc`/`.cd` 系（1184-1241）。去除 5 行纯注释与 36 行收尾花括号后，有效声明行 219 行。
  - 媒体查询内 **8 块、29 行**：`theme.css:1803-1805`（.lat）、`1873-1875`（.glegend）、`1876-1880`（.rank）、`1881-1883`（.lat）、`1884-1887`（.dr）、`1890-1893`（.strip）、`1894-1896`（.strip i span）、`1897-1900`（.glegend）。去除 8 行收尾花括号后，有效声明行 21 行。
  - 合计 **289 行区间 / 240 行有效声明**（另有 5 行注释、44 行花括号行）。原报告写 291 + 31 ≈ 322，差异源于其按行号区间粗算且把 `.rk .t`/`.rk .v` 等未列入 13 个死类令牌的块也算进死区块；本次逐块精确统计为 36 + 8 块，以 289 行区间 / 240 行有效声明为准。
  - 删除后 `theme.css` 从 2136 行降到约 1847 行。
- **建议改法**：整段删除上列 36 + 8 块。注意 `.rk .t`/`.lc b` 的截断属性在「已通过」清单里被引用，删前确认活代码是 `theme.css:2100-2117` 的 `.rc-before/.rc-after`（不在删除范围）。
- **影响面**：`theme.css` 体积减少约 289 行区间，顺带消掉第 2/12 条里的一部分违规行。**归属**：t3。

> **复核更新（2026-10-24 00:22，产物 `Base.DFv7wA4I.css` 核对）：本条已修。**
>
> 对产物 CSS 逐个类名正则精查，13 个死类名命中数全部为 **0**：
>
> | 类名 | 命中 | 类名 | 命中 |
> | --- | --- | --- | --- |
> | `.cd` | 0 | `.lede` | 0 |
> | `.dist` | 0 | `.rank` | 0 |
> | `.dr` | 0 | `.rk` | 0 |
> | `.gl` | 0 | `.slogan` | 0 |
> | `.glegend` | 0 | `.strip` | 0 |
> | `.lat` | 0 | `.tr` | 0 |
> | `.lc` | 0 | | |
>
> 全量正则 `\.(cd|dist|dr|gl|glegend|lat|lc|lede|rank|rk|slogan|strip|tr)(?![\w-])` 在产物中命中 **0 次**。
> 需要补充的是：`.foot-slogan`（活代码）与死类 `.slogan` 不是一回事 —— 前者字面含 `slogan` 但正则带 `(?![\w-])` 边界，故不计入，这也验证了边界写法正确。

### 17. 半角点代替省略号 —— **已修（产物 0 处）**

- `dist/client/404.html`、`index.html`、`recent/index.html` 各命中一处 6 个半角点（`grep -o '……\|…\|\.\.\.\.\.\.'` 计数各为 1）。
- 源码：`NotFound.astro:9`（404 与详情页共用）、`index.astro:20`、`recent.astro:64`。开屏处 `BootScreen.astro:263` 构建产物实测为 `<span class="boot-dots" aria-hidden="true"><i>.</i>×6</span>`，外层文本仍是 `Loading`，无 `aria-label="Loading…"`。
- **建议改法**：三处文案改单个 `…`（U+2026）；开屏保留逐点动画，给 `.boot-txt` 补 `aria-label="Loading…"`。
- **影响面**：3 个页面文案 + 开屏遮罩。**归属**：t3。

### 18. 品牌字没标 `translate="no"` —— **已修（产物 3 处）**

- `grep -rn "translate=" src` → **0 处**；`dist/client/index.html`、`recent/index.html` 的 `grep -c 'translate='` → **0**。
- **建议改法**：`Header.astro:15` 的 `.mark`、`Base.astro:135-140` 的页脚 `.mark-sm`、`BootScreen.astro:265` 的 `.boot-meta` 加 `translate="no"`；`<title>` 无法带属性，覆盖这三处可见品牌字即可。
- **影响面**：品牌字在浏览器自动翻译下的完整性。**归属**：t3。

### 19. 注释与文案数字过期 —— **已修（改「13 个世代 / 15 套主题」，`THEME_COUNT=15`）**

- `Header.astro:2`：`// 顶栏：品牌标 + 导航 + 世代主题切换（15 个世代）`，d9e4a81 与当前工作区内容一致（`git show d9e4a81:src/components/Header.astro | sed -n '2p'` 同串）。15 是**主题**数，**世代**是 13（`data.stat.gens = 13`，`gen` 数组 13 项）。按 `CONTEXT.md` 术语表，**世代**与**主题**不可混用，此句仍错。原报告写的是「点击弹出 13 个世代」，该措辞已被改成 15，但改成了另一个错数字（把主题数当世代数）—— 本条不是「未改」，而是「改错」。
- `ThemeScript.astro:2`：`14 套配色` —— `GEN` 数组（`:10-26`）实测 **15 项**，页面 `.tsw-g button` 实测 **15 个**。
- `index.astro:7`：`const THEME_COUNT = 14` —— 而 `theme.css` 里 `html[data-g="…"]` 主题块实测 **15 组**。首页 description 构建产物实测输出「…共 1241 首曲目、3723 张谱面，14 套世代主题可切换。」与实际 15 个可切换按钮不符；README:54 写的是 15 套。
- **已修的部分**：`Base.astro:30` 与 `index.astro:13` 的 description 已改成「日服 12 个世代、国服 1 个世代」，原报告点名的「15 个世代 + 14 套主题同句矛盾」已消除。
- **建议改法**：`Header.astro:2` → 「15 套主题（13 个世代）」；`ThemeScript.astro:2` → 「15 套配色」；`index.astro:7` `THEME_COUNT` → `15`（或从 `data-g` 组数推导，不手写）。
- **影响面**：顶栏与弹层注释、首页 SEO description、OG description。**归属**：t3（文案）；`THEME_COUNT` 若与数据层联动需 t8 确认。

### 20. 无效 CSS 与死链 —— **已修（`cursor:default` 已删，死链早已修）**

- **无效 CSS 仍在**：`theme.css:1283-1286` `.foot .mark-sm { gap:7px; cursor: default }`。`Base.astro:135-140` 的 `.mark.mark-sm` 是 `<span>`，无点击行为，`cursor: default` 无作用。
- **死链已修**：`Header.astro:25` 的 `.nav-txt` 实测只有 `/songs/`、`/recent/`、`/login/` 三条（staff 登录后多 `/admin/`），`.nav-drawer`（`Header.astro:61-67`）同为三条。构建产物与线上 HTML 一致。原报告点名的 5 条施工中死链（`/jubility/ /emblem/ /partners/ /achievements/` 等）已不在导航。
- **建议改法**：删掉 `cursor: default` 一条（页脚品牌字是纯装饰，删声明比改链接简单）。
- **影响面**：页脚品牌字（无视觉影响）。**归属**：t3。

---

## 低

### 21. 版本号两处不一致 —— **已修（`.foot-ver` 已加 `title` 说明）**

- `src/data/site.json:3` `"version": "1.14.0"` → 页脚实测 `v1.14.0`；`package.json` `"version": "4.0.0"`。
- README:56 已说明两者有意分离。原报告的建议（给 `.foot-ver` 加 `title`）**未采纳**：实测 `.foot-ver.getAttribute('title')` = `null`（`Base.astro:132` 无 `title`）。
- **建议改法**：`Base.astro:132` 加 `title="站点迭代版本，与 npm 包版本无关"`。硬约定 `src/data/site.json` 只由 t8 改，本条不碰该文件。
- **影响面**：页脚版本号可解释性。**归属**：t3（只改 `Base.astro`）。

### 22. 日期格式化未用 `Intl` —— **已修（`Intl.DateTimeFormat` + `formatToParts`）**

- `Base.astro:46`：`d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })`；`:47-52` 用 `toLocaleTimeString('en-GB', …)`。`grep -rn "Intl\." src` → **0 处**。
- 构建产物实测页脚值 `2026-10-23 18:47`，当前写法可用。
- **建议改法**：改 `new Intl.DateTimeFormat('zh-CN', { timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(d)` 再按需拼 `YYYY-MM-DD HH:mm`（`zh-CN` 直接 format 会带「/」与「上午」，需取部件）。保留现有 `try/catch` 兜底。
- **影响面**：页脚「最后一次编辑」时间，CI 在非完整 ICU 环境下的稳定性。**归属**：t3。

---

## 复核中新发现（不在原 22 条内）

### N1. skip-link 用了未定义变量 `--r-m`，圆角失效

- `theme.css:1602`：`border-radius: 0 0 var(--r-m) var(--r-m);`，但 `:root`（`theme.css:14-16`）只定义 `--r`/`--r-sm`/`--r-xs`，全文件 `grep '--r-m:'` = **0 处**。
- 实测 `getComputedStyle(a.skip).borderRadius` = `0px`，`getPropertyValue('--r-m')` = `""`。
- **建议改法**：改 `var(--r-sm)`，或补 `--r-m: 11px`。**影响面**：skip-link 外观（键盘用户第一眼看到的元素）。**归属**：t2。

### N2. skip-link 白字压在 `--acc` 上，14 套主题不达 4.5:1

- `theme.css:1603-1604`：`background: var(--acc); color: #fff;`。按各代 `--acc` 实测：
  ave 1.52 · bta 2.00 · clan_blue 3.13 · clan_green 1.80 · clan_purple 2.91 · clan_red 2.78 · copious 2.32 · festo 1.44 · knit 2.12 · prop 4.17 · qubell 2.92 · saucer 2.76 · saucerfulfill 1.54 · ripples 2.66 · yymf 4.69。
  15 套里只有 yymf（4.69）达标，prop（4.17）接近，其余 13 套低于 4.5:1 —— 而这正是键盘/读屏用户第一个聚焦到的元素。
- **建议改法**：文字改深色反色（如 `color: var(--base)` 或固定 `#0a1418`），背景保持 `--acc`。**影响面**：全站 skip-link，15 套主题。**归属**：t2。

### N3. 页面数量已从 3 页扩到 7 页，原报告的「3 页」口径过期

- 原报告第 9 条只覆盖首页/`/recent/`/404；现在 `/login/`、`/register/`、`/account/`、`/admin/`、`/songs/` 也都无 h1（见第 9 条表格）。**归属**：t2 + t7。

---

## 「仍存在」清单（按优先级排序）

优先级判据：① 影响用户能否使用（无障碍/可用性）→ ② 影响信息正确性 → ③ 影响观感 → ④ 只影响代码整洁度；同档内按修复成本从低到高。

| # | 条目 | 状态 | 优先级 | 归属 | 一句话改法 |
| --- | --- | --- | --- | --- | --- |
| N2 | skip-link 白字对比度 1.44–4.17 | **已修**（15 套实测 13.06–17.73 全达标） | — | t2 | 已改 `--ink` 压 `--base` |
| N1 | skip-link `--r-m` 未定义，圆角 0 | **已修**（实测 `0 0 11px 11px`） | — | t2 | 已改 `--r-sm` |
| 9 | 6 个页面无 h1 | **已修**（7 页 h1 齐全、AX 名可读；`/admin/`·`/account/` 有权限分支待登录补验） | — | t2 + t7 | 已改 |
| 10 | 弹层打开不移焦、Esc 后焦点停在隐藏元素 | **已修**（移焦 + Esc 还焦） | — | t2 | 已改 |
| 4 | 触控目标 < 44×44 | **部分**（t8 两轮实机复测：修复前 1024px 档 **3 个** <44 — 两个 **43.53×44**（缺的是**宽度** 0.47px，高度 44 早已由 `min-height` 兜住）+ backTop `.bt` 41.4×41.4；**加 `min-inline-size:44px`（`theme.css:370/1706/1727` 三处）后复测 1024/860/800/769/390 五档导航链接最小宽全部 44.00、不达标 0**，1024 档只剩 backTop 1 个。原始误判记录：t8 首轮曾把「43.5×44」错读成高度不足，前端读源码注释后纠正并实测复算「2×13.5px×1.02 + padding 16 = 43.54 ≈ 实测 43.53」） | P1 | t2 | 剩 backTop 动画态；如需 44 可加大其命中盒 |
| 6 | 首页 14 张图无 width/height | **已修**（首页 noDims=0；曲目页 144×144 / 176×60） | — | t2 | 已改 |
| 11 | 浅色 6 代焦点环 1.14–2.44 | **已修**（6 代各设独立 --focus 令牌） | — | t3 | 已改 |
| 2 | --ink3 浅色世代 | **部分**（knit 已修 4.46→4.82；其余 4 代仅首屏单点值，未充分验证） | P2 | t3 | 只 knit 单独处理，不整体压深 |
| 5 | color-scheme 0 处 | **已修**（产物 16 处） | — | t3 | 已改 |
| 8 | theme-color 恒 #0b1a22 | **已修**（commit() 内 syncThemeColor()；产物初值 #0a1418） | — | t3 | 已改 |
| 7 | 首页零懒加载 | **已修**（首页 lazy 9 处；曲目页 lazy 1223 / eager 20） | — | t3 | 已改 |
| 14 | touch-action / overscroll / safe-area 全 0 | **已修**（manipulation + contain + safe-area 3 处） | — | t3 | 已改 |
| 12 | <12px 字号 | **已修**（<11px 声明由 27 条降到 **5 条**，去重后 3 个选择器；产物 9px / 7.5px / 7px 字号声明全为 0。保留的 5 条 10px 都有容器强约束：`songs.css:528` 难度前缀 BSC/ADV/EXT、`:593` 窄屏同项、`:789` no-jacket 占位、`theme.css:1738/1750` 统计卡标签两档） | — | t3 | 已改 |
| 19 | 注释与 description 数字错位 | **已修**（13 个世代 / 15 套主题，THEME_COUNT=15） | — | t3 | 已改 |
| 15 | .st b / .rc-time 缺 tabular-nums | **已修**（.mono/.st b/.foot-ver/.rc-time 四处均有） | — | t3 | 已改 |
| 17 | 3 页用 6 个半角点代替 … | **已修**（产物 0 处） | — | t3 | 已改 |
| 18 | 品牌字无 translate=no | **已修**（产物 3 处） | — | t3 | 已改 |
| 16 | 死 CSS | **已修**（产物 13 个死类名全部 0 命中） | — | t3 | 已删 |
| 20 | .foot .mark-sm cursor:default 无效声明 | **已修**（已删；死链早已修） | — | t3 | 已改 |
| 22 | 日期未用 Intl | **已修**（Intl.DateTimeFormat + formatToParts） | — | t3 | 已改 |
| 21 | 页脚版本号无 title 说明 | **已修**（Base.astro:151 已加 title） | — | t3 | 已改 |
| 13 | 世代状态不进 URL | **仍在**（源码无 replaceState / URLSearchParams） | P5 | 波次二 | replaceState + 读 URL |

**统计 —— 最终快照（2026-10-24 01:20，源码 + 产物双证据，t8 收口轮）**：

| 归类 | 条目号 | 数量 |
| --- | --- | --- |
| **已修** | 1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22 | **19** |
| **部分** | 2（`--ink3`：knit 已修 4.46→4.82，其余 4 代仅首屏单点值未充分验证）、4（触控：`min-inline-size:44px` 修复后五档导航链接全部 44.00，仅剩 backTop 动画态 41.4） | **2** |
| **仍在** | 13（世代状态不进 URL） | **1** |
| 合计 | | **22** |

> 上方「首次复核时点（2026-10-23 20:36）」那组数字（已修 2 / 部分 6 / 仍在 14）是 **t2/t3 修复前**的快照，已被本表取代，仅作过程存档。

> **口径说明**：本表基于「源码已改 + 产物已确认」双证据；对 dist 尚未重建的项（如 t8 收口轮正在 build 的一批），以源码为准并标注。第 13 条是唯一仍无改动的一处。

### t8 收口轮的运行态复测（2026-10-24 01:2x，最终产物 Base.YuTzpC_H.css）

以下数字全部是**实机实测**（Playwright 读 computed / getBoundingClientRect，或 curl 抓 HTML），不是源码推断：

| 项 | 实测值 | 判定 |
| --- | --- | --- |
| 7 页 h1 | / /songs/ /songs/gen/festo/ /login/ /register/ /recent/ /404 各 **1 个** | 通过 |
| /songs/ 层级 | h1×1（「曲目库」，.sc-hide 视觉隐藏）→ h2×5（版权/原创/KONAMI原创/音乐魔方原创/音乐魔方流行）→ 无 h3/h4 | 层级连续，无跳级 |
| /songs/ Tab 序（桌面 1440×900） | 真按 Tab 逐次读 activeElement：1 A.skip → 2 A.mark → 3 A.on(曲目) → 4 最近更改 → 5 登录 → 6-7 A.nav-i ×2 → 8 tsw-btn → **9 A.sc-skip** → 10-11 日服/国服 → 12 搜索框 → 13 筛选 → 14 排序 → 15-17 分区 chips → 18 A.sc-gen-a(jubeat) → **19 首个 A.sc-link** | .sc-skip 第 **9** 位，firstCardAt **19** |
| /songs/ Tab 序（窄屏 390×844） | 1 A.skip → 2 A.mark → 3 nav-burger → 4 A.nav-i → 5 tsw-btn → **6 A.sc-skip** → 7-8 日服/国服 → 9 搜索框 → 10 筛选 → 11 排序 → 12-14 分区 chips → 15 A.sc-gen-a → **16 首个 A.sc-link** | .sc-skip 第 **6** 位，firstCardAt **16** |
| /songs/ 440 断点 | 439 档 mq440=true、两导航图标 display:none；441 档 mq440=false、图标 flex；两侧 scrollWidth == clientWidth | 断点两侧均安全（441 无法精确停留：setViewportSize(441) 实际得 442） |
| aria-pressed 运行时 | 点 [data-diff=bsc] → 仅 bsc=true 其余 false；点回 all → 仅 all=true | 由 state 反推 UI，无遗漏路径 |
| /recent/ 四档溢出 | 1280/441/390/360：scrollWidth == clientWidth，四档全 0 | 空态通过 |
| /recent/ 展开态 | **未验**：共享库 recent_changes = 0 条，无 details 可展开 | 引用全栈隔离实例结论（5 条展开后 overflow=0、.rc-diff-body sw==cw=302、最高 306px < max-height 340） |
| knit .st span 对比度 | fontSize **11px**、color rgb(102,93,82)、所属 .st background rgba(255,253,247,0.6)、body bg rgb(242,238,228)；无背景图理论值 **6.03**；与 4.82 对应坐标是背景灰度 **144**（卡合成底 rgb(224,223,218) → 4.83） | 计算一致；真实采样以截图为准 |
| knit .st span 理论区间 | 白底上界 6.26 / 黑底下界 **3.3** | 先前记的 2.15 用错层（--glass2 0.72，实为 --glass 0.6），已更正 |
| .skip 15 套主题 | min **13.06 @ ripples**，max **17.73 @ clan_purple** | 全部远超 4.5 |
| 触控 <44（1024px） | 修复后 total 24、<44 仅 **1 个**（backTop .bt 41.4×41.4） | 从 3 个收敛到 1 个 |
| 导航链接宽（5 档） | 1024/860/800/769/390 最小宽全部 **44.00**，不达标 **0** | min-inline-size 三处补丁生效 |
| 无 JS 可读性 | SSR 直出：h2 分区 5、sc-gen 世代块 27、sc-card **1241** 张；.sc-find 无 JS 时保持 display:none | 工具条不出现，内容完整可读 |

> **无法验的两项**：① /recent/ 展开态（共享库无数据，不往共享库灌测试数据）；② /admin/、/account/ 的权限分支 h1（需真实登录，Turnstile 拦机器）。
**归属汇总**：t2 承担 P0 四项（N1、N2、9、10）+ P1 两项（4、6）；t3 承担 14 项（2、5、7、8、11、12、14、15、16、17、18、19、20、21、22 中的视觉/性能/文案部分，按上表优先级推进）；t7 承担 `/songs/` 的 h1；第 13 条归波次二单独立项。

---

## 附：本次复核的边界

- 未改任何 `src` 代码、未改 `src/data/site.json`、未 `git push`、未 `wrangler deploy`。本报告是唯一新增文件。
- 未在真实手机/读屏软件（NVDA/VoiceOver）上验证；可访问性结论基于 Chromium AX 树与真实 Tab 序列。
- 线上核对只读 5 个 URL 的 HTML（`/`、`/recent/`、`/songs/`、`/login/`、`/nope/`）；SSR 页面的运行时行为本次未验证。
- 对比度底色的采样矩形与像素值已写入正文，可复现；同一元素在不同滚动位置若落入卡片不同区域，数值会小幅变化（`.st span` 在 3.27–3.61 波动即在卡片边缘取样所致）。

---

## 修复后复测（2026-10-23 22:17–22:33，共享实例 127.0.0.1:8787）

> 触发：t2（结构性无障碍）落地，按 t8 放行清单复测。所有数字取真实渲染，非源码推断。
> 服务状态：本轮 8787 中途断过两次（22:26、22:30，均为 t2 停机窗口），最后一次探测 22:32:46 `root=200`；下表数字取自该窗口。
> 验收口径：视口比较一律用 `document.documentElement.clientWidth`，**不用 `innerWidth`** —— 桌面滚动条占 15px，用 `innerWidth` 会把溢出误判为相等。

### 通过项

| 项 | 实测证据 | 判定 |
| --- | --- | --- |
| 7 页 h1 齐全 | CDP `Accessibility.getPartialAXTree` 逐页取 h1 节点，全部 `level:1`、name 非空 | 通过 |
| `/songs/` 层级连续 | 文档顺序实测 `H1 → H2×5`，无 h1→h3 跳级；`h1.sc-hide` 为 `position:absolute`、`clip-path:inset(50%)`、1×1px、`display:block` —— 视觉隐藏但留在无障碍树 | 通过 |
| N1 `.skip` 圆角 | 四角实测 `tl/tr=0px, bl/br=11px`，shorthand `0px 0px 11px 11px`（`--r-sm=11px`） | 通过 |
| N2 `.skip` 对比度 | 15 套主题实测 13.06–17.73，**全部 ≥ 4.5:1**（最低 ripples 13.06、knit 13.30） | 通过 |
| `#backTop` 稳定态 | `cssW/cssH=46px`、`transform:none`、矩形 46×46（动画态 41.4×41.4 不计入） | 通过 |
| 触控目标 | 桌面 1440 仅剩 `#backTop`（动画态）；1024 有 2 个 `.top nav a` 43.5×44（差 0.5px）；t1 基线为桌面 23 / 移动 22 | 大幅收敛 |

逐页 h1 明细：

| 页面 | HTTP | h1 数 | AX name | level |
| --- | --- | --- | --- | --- |
| `/` | 200 | 1 | jubeat 音乐魔方 | 1 |
| `/recent/` | 200 | 1 | 最近更改 | 1 |
| 404 | 404 | 1 | 这里还没有铺路，前面的区域以后再来探索吧…… | 1 |
| `/login/` | 200 | 1 | 登录 | 1 |
| `/register/` | 200 | 1 | 注册 | 1 |
| `/songs/` | 200 | 1 | 曲目库 | 1 |

**未验证项（不得当作已验）**：`/admin/` 与 `/account/` 的**有权限分支** h1（「管理面板」）需真实账号登录后才能验。本轮游客态访问均 302 到 `/login/?next=...`，量到的是登录页 h1。该项**仅源码级确认**：两条互斥分支各有一个 `h1.vh`，区块标题（曲目编辑/维护者自荐/已处理）已降为 h2；运行时表现待主人登录后补验。

### 横向溢出：**已修（2026-10-23 22:49 复测 11/11 通过）**

> 下列「未通过」数据为 **22:17–22:33 第一次复测时**的状态，用于记录根因与修法推导过程；**当前状态已修**，见本节末尾的 22:49 复测表。

#### （历史）第一次复测：未通过

| setW | clientWidth | scrollWidth | 溢出 |
| --- | --- | --- | --- |
| 360 | 345 | 382 | **是，+37** |
| 375 | 360 | 382 | **是，+22** |
| 390 | 375 | 382 | **是，+7** |
| 414 | 399 | 428 | **是，+29** |
| 430 | 415 | 428 | **是，+13** |
| 768 | 753 | 753 | 否 |
| 1440 | 1425 | 1425 | 否 |

**根因（三条证据链 + 注入实验）**：

1. **源码顺序**：`@media (max-width: 414px)`（`theme.css:1976`）写在 `@media (max-width: 768px)`（`:1986`）**之前**；768 块内的 `.top nav a.nav-i-recent { display: inline-flex }`（`:2054`）在同优先级下后出现即生效，把 414 块刚设的 `display:none` 覆盖回 `inline-flex`。
2. **构建产物一致**：`dist/client/_astro/Base*.css` 的媒体查询顺序为 `width<=1080 → 860 → 414 → 768 → 768`，确认 414 被 768 覆盖。
3. **运行时行为**：390 宽下 `nav-i-github` 为 `none`（414 块生效）而 `nav-i-recent` 为 `flex`（被 768 块复活）—— 覆盖的典型症状。
4. **注入实验（决定性）**：动态注入 `@media (max-width:430px){.top nav a.nav-i-recent,.top nav a.nav-i-github{display:none!important}}` 后：

| setW | clientWidth | 修前 scrollW | 收图标后 | 再收 pop 后 |
| --- | --- | --- | --- | --- |
| 360 | 345 | 382 | **345** ✅ | 345 |
| 390 | 375 | 382 | **375** ✅ | 375 |
| 414 | 399 | 428 | **399** ✅ | 399 |

三档全部归零，证明「收掉这两个图标」即完整修法，溢出完全由该覆盖导致。

**另两个次要源**：

- **断点偏紧**：setW=414 时 `matchMedia('(max-width:414px)').matches === false`（visualViewport 宽 414.4，亚像素边界），需 `max-width:415px` 才为 true。故 414 档本身未被收图标，仍 3 个 → 溢出 29px。建议断点改 `430px` 或 `440px`。
- **`.tsw-pop` 隐藏态占位**：`visibility:hidden` 但仍有布局盒（`width:min(296px,100vw-32px)`、`right:-6px`），390 宽时右缘 381.8 > clientWidth 375，单独贡献 7px。建议隐藏态改 `right:0`。

**建议改法（三条都做）**：① 把 414 块整体移到 768 块**之后**（或并入 768 块靠后位置）；② 断点 414 → 430/440；③ `.tsw-pop` 隐藏态 `right:0`。

**归属**：t2（本条为 t2 修复引入的回归，不在 t1 原 22 条内）。

#### 第二次复测（2026-10-23 22:49，新 dist 含 440 块）：**11 档全部通过**

探测前提（同一轮内当场验）：`netstat` 显示 127.0.0.1:8787 LISTENING PID 11636，`curl /` = 200，`grep -c 'width<=440px' dist/client/_astro/Base*.css` = **1**（确认新产物已含修法），dist CSS mtime 22:47:24。

**测量页面：首页 `/`**（不是 `/songs/`）。首页与外壳均不引用 `songs.css`/`songs.astro`，故本矩阵不受 t9 在途改动影响。

| setW | clientW | scrollW | 溢出 | nav-i-recent | nav-i-github | .tsw-pop 右缘 |
| --- | --- | --- | --- | --- | --- | --- |
| 360 | 345 | 345 | 否 ✅ | none | none | 329.8 |
| 375 | 360 | 360 | 否 ✅ | none | none | 342.0 |
| 390 | 375 | 375 | 否 ✅ | none | none | 357.2 |
| 414 | 399 | 399 | 否 ✅ | none | none | 381.2 |
| 430 | 415 | 415 | 否 ✅ | none | none | 397.2 |
| 440 | 425 | 425 | 否 ✅ | none | none | 406.8 |
| 441 | 426 | 426 | 否 ✅ | flex | flex | 421.8 |
| 442 | 427 | 427 | 否 ✅ | flex | flex | 421.8 |
| 768 | 753 | 753 | 否 ✅ | flex | flex | 726.7 |
| 1024 | 1009 | 1009 | 否 ✅ | none | flex | 974.0 |
| 1440 | 1425 | 1425 | 否 ✅ | none | flex | 1296.4 |

**溢出档数 0/11。**

**441 上边界的两个坑（重要方法论）**：

1. **Playwright `setViewportSize(441)` 测不到 441**：请求 441 实测 `innerWidth=442`、`devicePixelRatio=1.0000000149`。改用 CDP `Emulation.setDeviceMetricsOverride({width:441, deviceScaleFactor:1, mobile:true})` 后仍为 `innerWidth=442`、`visualViewport.width=441.6` —— Chromium 把 441.6 向上取整，**无法精确停在 441**。结论：不要用单点亚像素档位作为验收依据。
2. **边界安全性用两侧论证，比单点数据更可靠**：
   - `mq440=true` 侧（439 / 440）：两个图标被收，`scrollW == clientW`（424/425）
   - `mq440=false` 侧（441 / 442 / 480）：三个图标全留，`scrollW == clientW`（442/442/480），`.tsw-pop` 右缘 423.6 < 442
   → 断点即使因亚像素抖动来回切，两侧均不溢出。这次修法同时补了 `.tsw-pop{right:0; width:min(296px,100vw-24px)}`，所以 441 不再是薄冰。

**修法落地确认（前端实际改动）**：`@media (max-width: 440px)`（`theme.css:2115`）整体位于 `@media (max-width: 768px)`（`:1976` / `:2253`）**之后**，块内 `nav-i-recent` / `nav-i-github` 设 `display:none`、`.tsw-pop` 设 `right:0`；源码注释明确记录了「放在前面会被 `.nav-i-recent{display:inline-flex}` 复活」。

### 复测对 22 条的增量

- 第 9 条（标题层级）：**由「部分」升为「已修」**（7 页 h1 齐全、AX 名可读、层级连续）；仅剩 `/admin/`、`/account/` 有权限分支待真实登录补验。
- 第 4 条（触控目标）：由「仍在」降为「基本已修」；残留 `#backTop` 动画态（稳定态合规）与 1024 档 2 个 43.5px。
- N1、N2：**均已修**，从「仍存在」清单移除。
- 新增回归项：横向溢出 —— **第二次复测（22:49）已修，11/11 通过**，不再是放行障碍。
- 第 12 条（字号 <12px）：**由「仍在」升为「已修」**（产物 `Base.DFv7wA4I.css` 全量扫描：9px = 0、10.5px = 0、最小档 10px；主力小字全部 11px；剩余 2 处 10px 在中等宽度媒体查询内且有布局理由）。详见第 12 条的复核更新。
- 第 2 条（`--ink3`）：**knit 已修**（`#6b6257` → `#665d52`，首屏最差 4.46 → 4.82），其余 5 代不动；核心结论是「不整体压深」。

### 截至 2026-10-24 00:20 的归类汇总（供 t8 收口引用）

| 归类 | 条目 | 数量 |
| --- | --- | --- |
| **已修** | 1（h1 aria-label）、3（main + skip）、9（7 页 h1）、12（字号）、20 的死链部分 | 4（+1 部分） |
| **部分** | 2（`--ink3`，knit 已修其余未充分验证）、6（图片尺寸，首页未改）、7（懒加载，首页未改）、15（`tabular-nums`）、20（无效 CSS 仍在） | 5 |
| **仍在** | 4（触控 44px，大幅收敛但未清零）、5（`color-scheme`，已在源码修复待终产确认）、8（`theme-color`）、10（弹层焦点）、11（焦点环）、13（URL 状态）、14（触屏三项）、16（死 CSS）、17（半角点）、18（`translate`）、19（数字错位）、21（版本 title）、22（`Intl`） | 13 |

> **注意**：本表是 00:20 时点快照。第 5、16、17、18、22 等条在 t3 中已改源码但部分未进当前 dist，**t8 最终 build 后需按终产重刷**。

### 数据时效性说明（哪条需要复测）

| 数据 | 来源轮次 | 是否受 t9 影响 | 是否需复测 |
| --- | --- | --- | --- |
| 首页 11 档溢出矩阵 | 22:49 | 否（首页不引 songs.css） | 不需 |
| `.skip` 圆角 / 15 套对比度 | 22:17 + 22:49 | 否（外壳组件） | 不需 |
| `#backTop` 稳定态 46×46 | 22:17 | 否（外壳组件） | 不需 |
| 首页 / 404 / `/login/` / `/register/` 的 h1 | 22:17 + 22:49 | 否 | 不需 |
| **`/songs/` 的 Tab 序列与 h1 AX** | 22:17 | **是**（t9 新增 `.sc-find`/`.sc-sort`，改了页面结构） | **需在 t9 自己的 build 后重测** |
| `/admin/`、`/account/` 有权限分支 h1 | — | 否 | 需真实账号登录后测 |

### 第三次复测（2026-10-23 23:09，t2+t5+t9 全量 dist）：`/songs/` 专项

探测前提（同一轮当场验，23:09:17）：`netstat` 显示 8787 LISTENING PID **15364**，`curl /songs/` = 200，dist client mtime **23:06:26**。

#### 1. 测量误报闭环：`/songs/` 跳 `/register/` 确认为测量侧问题

首次复测时曾观察到打开 `/songs/` 后 `page.url()` 落在 `/register/`。四类独立证据均指向测量侧：

- **源码五项排除**：`songs.astro` 无 `register` / `http-equiv` / `location` / `navigate` / `replace(`；全站无 `http-equiv`（meta refresh）；全站唯一 `window.location` 是 `BootScreen.astro:391` 的 `new URL(a.href, location.href)`（只读不赋值）；无 `form` / `action=`；t9 脚本无 `pushState` / `replaceState` / `href =`。
- **全站 storage 写入仅 3 处**：`BootScreen.astro:26-27`（`jb-boot`）、`ThemeScript.astro:124`（`jubeat-gen`）、`Base.astro:94` 只读；无任何注册/跳转/next 相关键；全站 `document.referrer` 读取 0 处。
- **curl 无重定向**：`/songs/` → 200；`curl -L` 的 final 仍为 `/songs/`。
- **全新 `browser.newContext()` 打开 `/songs/`**：status 200，finalUrl = `/songs/`，`.sc-card` = 1241 —— 未跳转。

**结论：测量侧问题（旧 browser context 复用 document），不进缺陷清单。**

#### 2. h1 与层级：通过

- h1 = 1（`.sc-hide`，`clip-path: inset(50%)`，1×1px，`display:block`）
- AX 树：`name="曲目库"`, `level=1`, `ignored=false`
- h2 = 5，h3 = 0，文档顺序 `H1 → H2×5`，无跳级

#### 3. `.sc-skip`（t9 新增「跳到曲目列表」）：功能有效，但位置偏后

Tab 序列实测（1440×900，全新 context）：

| 位次 | 元素 | 备注 |
| --- | --- | --- |
| 1 | `a.skip`（跳到主内容，109×44） | |
| 2–8 | mark / 曲目 / 最近更改 / 登录 / nav-i ×2 / tswBtn | |
| **9** | **`a.sc-skip`（跳到曲目列表，112×42）** | 被 7 个导航项挡在前面 |
| 10–11 | `.sc-srv-b` 日服 / 国服（各 200×126） | |
| 12 | `input#scSearch`（532×44） | t9 新增 |
| 13 | `button#scFilterBtn`（75×44） | t9 新增 |
| 14 | `select#scSort`（106×44） | t9 新增 |
| 15–17 | `.sc-chip` ×3 | |
| 18 | `.sc-gen-a`「jubeat→」 | |
| **19** | **第一张曲目卡 `.sc-link`** | `firstCardAt = 19` |

功能验证：`.sc-skip` 聚焦 → Enter → `activeElement = #scList`（DIV），`scrollY = 386`；随后 Tab+1 落在 `.sc-gen-a`「jubeat→」，Tab+2 落在第一张曲目卡 `/songs/11000076/`。**焦点确实移入列表区，skip 功能有效。**

**未达标项**：直接 Tab 到第一张卡由首次复测的 **16 次** 升至 **19 次**（t9 新增搜索/筛选/排序 3 个控件所致），未达到「个位数」目标。但经由 `.sc-skip` 路径只需落点后 2 次 Tab。

**建议（不阻塞放行）**：
1. 把 `.sc-skip` 移到全站 `.skip` 之后、`.mark` 之前（第 2 位），使两条 escape hatch 都在最前；当前第 9 位等于藏在导航后。
2. 若希望落点后 1 次直达卡片：`.sc-skip` 的 `href` 指向卡片网格（或给 `.sc-grid` 加 `tabindex="-1"` 锚点）。现状 `scList` → `.sc-gen-a` → 卡片需 2 次，因世代头 `.sc-gen-h` 在 `.sc-grid` 之前（`genTop=38` vs `cardTop=80`）。

#### 4. 折叠态筛选面板：不进 Tab 序列，合规

`#scPanel` 内有 13 个控件且 `tabIndex >= 0`，初看疑似违规。实测推翻：

- `panel.hasAttribute('hidden')` = `true`，`getComputedStyle(panel).display` = `none`
- 从 `#scFilterBtn` 往后 Tab 6 次，**无一个落在面板内**（`inPanel=false`：`scSort` → `sc-chip`×3 → `sc-gen-a` → `sc-link`）
- JS 强行 `.focus()` 面板内 button：`document.activeElement === button` = `false`（焦点被弹回）

`hidden` + `display:none` 已把面板彻底移出焦点序列。

> **勘误**：本报告此前曾提「t9 用 `html:not(.sc-js)` 隐藏工具条，理论上存在 FOUC 风险」—— 该提醒**作废**。`songs.css:1604-1633` 实际采用反向写法「默认 `display:none` → `html.sc-js` 才显示」，CSS 一到位即隐藏态，不存在先可见再消失的窗口；注释亦写明取舍理由。

