# Beyond_JUBEAT

jubeat（音乐魔方）中文资料站。用 **Astro 7** 构建的多页站点：绝大多数页面构建期预渲染成静态 HTML，只有曲目页在边缘 SSR 时读 Cloudflare D1。线上托管在 Cloudflare Workers。

![deploy](https://img.shields.io/badge/Cloudflare_Workers-live-F38020) ![astro](https://img.shields.io/badge/Astro-7.4-ff5d01) ![repo](https://img.shields.io/badge/GitHub-Beyond__JUBEAT-181717)

线上地址：<https://wiki.byd-ub.top>（自定义域名） · <https://jubeat-wiki-home.1945743455.workers.dev>（workers.dev）

---

## 这是什么

把 jubeat 从 2008 年（jubeat）到 2023 年（jubeat 音乐魔方）**13 个世代（日服/国际服 12 + 国服 1）/ 1241 首曲目 / 3723 张谱面**整理成一个可浏览的资料站。

> 当前版本：四个数据区块（世代的层 / 定数顶格 / 定数分布 / 最近收录）已下线，正文换成一句「正在施工中，前面的区域以后再来探索吧......」的占位告示。数据仍在 `src/data/data.json` 里，随时可以接回来。
>
> 导航里的「曲目」已是真实页面（`src/pages/songs.astro`，日服/国服两卡切换 + 分区筛选 + 搜索 + 四维筛选 + **七种排序**，**默认 songId 升序**）。⚑ 服务端建桶的排序必须与前端默认排序（`DEFAULT_SORT = 'id-asc'`）**同构**：前端只写 CSS `order`、不重排 DOM，两者不一致就会出现「刷新先看到定数降序、脚本跑完又跳成 songId 升序」的闪烁（v1.19.2 修的）。它标了 `prerender = false`：曲库放在 Cloudflare D1，请求时在边缘查库渲染（见「数据来源」与「部署」）。`/recent/`、`/songs/[songId]/`、`/songs/gen/[gen]/` 与登录/账户/管理页同样是 SSR。
>
> **导航只列真实存在的页面，没有死链**（v1.9.1 起）。当前顶栏文字链是 **曲目 / Jubility / 最近更改**（v1.21.0 起 Jubility 排在曲目后面）。「Emblem / 伙伴 / 成就 / 关于 / 登录」五个二级页还没做，此前挂在顶栏、访问落进自定义 404，现已撤下；等页面开做时补 `src/pages/*.astro`，再到 `Header.astro` 的 `.nav-txt`（宽屏文字链）和 `.nav-drawer`（窄屏抽屉）**两处同步加回**，图标类入口还要加 `.nav-ico`。


**PWA「添加到屏幕」**（v1.23.0 起）：顶栏右侧有安装入口，手机/桌面浏览器可把站点装成独立窗口应用。

| 文件 | 作用 |
| --- | --- |
| `public/manifest.webmanifest` | 名称、图标（192/512/maskable）、start_url、三个快捷方式（曲目 / Jubility / 最近更改） |
| `public/sw.js` | Service Worker：**只缓存静态资源**，HTML 与 `/api/` 一律走网络 |
| `public/icon-192.png` / `icon-512.png` / `icon-maskable-512.png` | 由 favicon 的几何按 4 倍超采样重绘，与站标一致 |
| `src/components/InstallPrompt.astro` | 安装按钮 + iOS 手动说明弹层 |

**为什么 SW 不缓存 HTML**：本站 `/songs/`、`/jubility/`、`/recent/` 等都是 SSR 查 D1，曲库和登录态随时会变。缓存 HTML 会让用户看到过期数据或别人的登录态——这比「离线可用」严重得多。所以 fetch 处理器只接管 `/_astro/`、`/assets/` 与带 hash 的静态文件，`mode === 'navigate'` 直接 return 放行。实测缓存 23 项、全是静态资源。

**安装入口分三支**：① Chrome/Edge/安卓有 `beforeinstallprompt`，记下事件后点按钮调 `prompt()`；② iOS Safari 没有这个事件，只能教用户「分享 → 添加到主屏幕」；③已是独立窗口（`display-mode: standalone`）时完全不显示。不做成「一律显示的按钮」，否则在不能装的环境里就是死按钮。

**`sw.js` 的缓存头必须是 `max-age=0, must-revalidate`**（见 `public/_headers`）：浏览器更新 SW 时会对同一 URL 重新取，长缓存会让旧 SW 一直留着、新版本永远不生效。

**Jubility 层级 /jubility/**（v1.21.0 上线、v1.22.0 加 PEACH 档，与 `/songs/` 同为 `prerender = false` 的 SSR 页）：服务器选项卡（日服 / 国服，按钮里直接带该服理论值）→ 理论值概览 → 12 档层级阶梯（官方十档 + PEACH + PRIME GOLD）→ 公式与口径说明。

| 概念 | 口径 |
| --- | --- |
| 单曲 jubility | `ROUNDDOWN(定数 × 12.5 × MUSIC RATE ÷ 99, 1)`；MUSIC RATE 上限 100%（NORMAL）/ 120%（HARD EXC）；定数 8 以下按 8.0 计 |
| TOTAL 理论值 | COMMON 上位 30 谱面 + PICK UP 上位 30 谱面，**谱面为单位**（BSC/ADV/EXT 与 `[2]` 各自独立参评） |
| COMMON / PICK UP | 直接复用 `lib/song-view.ts` 的 `isPickUp()`——与 `/songs/` 的「范围」筛选同一个函数，两页不会打架 |
| 视图去重 | 与 `/songs/` 的 `rowsIn` 同判据：国服视图里双服同曲只留国服行 |

十档分数线是官方的（BEMANIWiki 的「ネームカラー」表，festo 起沿用至今）：NORMAL 0 / YELLOW GREEN 250 / GREEN 750 / LIGHT BLUE 1500 / BLUE 2500 / VIOLET 4000 / PURPLE 5500 / PINK 7000 / ORANGE 8500 / GOLD 9500。**两个档位是本站自创**（游戏内都没有）：

- **PEACH**（v1.22.0 起）：要求 TOTAL ≥ **NORMAL 模式**理论值的 96.5%，阈值低于 7000 时不设此档。日服 8064.3 × 96.5% = **7782.0**、国服 8034.7 × 96.5% = **7753.4**，都落在 PINK(7000) 与 ORANGE(8500) 之间，所以**按分数排**在两者中间（阶梯序号 #08），但图标是站长做的第 11 张（`/assets/jubility/tier-11.webp`）——**图标编号与分数顺序在这里故意不一致**，靠 `Tier.icon` 显式指定。
- **PRIME GOLD**：要求 TOTAL ≥ 理论值的 99.5%，阈值低于 9500 时不设此档——否则曲库小的服务器会轻易白拿最高档。图标是金黄色棒棒糖（`/assets/jubility/tier-10.webp`）。

> 图标编号是**素材固定**的：tier-00…07 = NORMAL…PINK，tier-08 = ORANGE，tier-09 = GOLD，tier-10 = PRIME GOLD，tier-11 = PEACH。往 `TIERS` 中间插一档会让后面所有档的数组下标 +1，所以 ORANGE / GOLD / PRIME GOLD 三档的 `icon` 都是显式写死的；新增档位时同样要核对每档取到的图对不对。

阶梯每行四组数字各有含义，别混：「区间」= 分数线跨度，写成**闭区间**（上界取下一档起点 − 0.1，因为分数精度是 0.1，如 ORANGE 显示 8500 – 9499.9，实际覆盖到 9499.9）；「占理论值」= 该档在 0 → 理论值刻度尺上的位置（顶两档只有 1–2% 宽，是数据事实不是画错）；「均分」= 分数线 ÷ 60，即每张谱面平均要打出多少；「可填」= 本服曲库里单曲理论值够得着该均分的谱面能凑出几个槽（COMMON 30 + PICK UP 30 上限），**只有 60/60 才是这一档真正可达**。日服实测 GOLD 52/60、PRIME GOLD 45/60（理论值本身达不到这两档），国服 55/60 与 44/60。PEACH 阈值低于 GOLD 门槛，两服都是 60/60 可达。

两处独立校验（改动公式或去重口径后要重跑）：①国服现算 4832.8 + 4809.1 = **9641.9**，与源表 `data/xlsx/sheet4.json` 表头 MAX 完全吻合；②日服现算 4879.5 + 4797.0 = **9676.5**，与 BEMANIWiki 记载的 COMMON / PICK UP / TOTAL 理论值逐项吻合。**注意源表 sheet4 的 60 首是按「国服曲池」挑的，拿日服曲库对会对不上**（表里 少年は空を辿る / 此岸の戯事 是 COMMON 池、海神 是 PICK UP 池，且 DIAMOND CROSSING 记 10.4 而库里是 10.6）——那是源表口径差异，不是数据错。

该页必须列进 `wrangler.jsonc` 的 `run_worker_first`（`/jubility` 与 `/jubility/*` 两条），否则会被资源层按 `not_found_handling` 截成 404.html 进不了 Worker——这一步漏了的表现就是「本地 build 成功、访问仍是 404」。

页面标题统一是「XXX · Beyond ↑ JUBEAT ♪~」，由 `src/lib/title.ts` 的 `pageTitle(name)` 生成（首页 =「首页 · Beyond ↑ JUBEAT ♪~」），别再手写整串。

**曲目详情 /songs/[songId]/**（v1.10.0 上线，与曲目页同为 `prerender = false` 的 SSR 页，按 `song_id` 查 D1 单行）：两栏唱片内页式版面——左窄栏曲绘封套 + 识别信息（songId / 世代 / 分区 / 服务器），右栏曲名与艺人，三档定数做成 0–11 刻度的横条，底部横铺 BPM / 上线 / 解禁 / 备注。不存在的 id 在原 URL 返回真正的 404 状态（不 302 跳 /404，否则复制出去的链接会丢 songId）同时 `noindex`。曲目卡整卡可点，实现是卡内一层绝对定位铺满的 `.sc-link`，而不是把整卡包成 `<a>`——点击覆盖全卡，读屏链接名也只有曲名。

> 详情页曾内嵌 ub.thregren.world 的「谱面确认」播放器（v1.12.0–1.12.2，靠 `/ub-proxy` 前缀代理剥掉对方的 X-Frame-Options 才能嵌进同源 iframe）。**该功能已于 v1.13.0 整体下线**：`src/pages/ub-proxy/`、`src/data/ub-index.json`、`scripts/ub/build-ub-index.mjs` 与 `wrangler.jsonc` 的 `/ub-proxy` 运行时路由一并移除。保留的两样东西：①详情页右下角的「在谱面确认中打开」外链去掉后，页面上不再有任何 ub 入口；②`ub-index.json` 映射表（1169 条 songId → ub 曲目 id）与生成脚本留在 `archive/materials/ub/` 备用。以后要重启，把文件搬回原位、恢复 `run_worker_first` 那条路由即可。

**用户系统**（v1.14.0 起）：四层身份——**游客**（不登录，只能看）/ **玩家**（注册即得）/ **维护者**（玩家自荐 + 站长审批）/ **站长**（只有主人，在 D1 里直接改 `role`，站点不提供提权入口）。邮箱 + 密码注册，不发送验证邮件（主人 2026-10-23 定：先不做邮件，邮箱只作登录名）。GitHub 等第三方登录二期再接，`oauth_accounts` 表已建好。

安全实现要点（都不要随手改）：

| 项 | 做法 | 为什么 |
| --- | --- | --- |
| 密码 | PBKDF2-SHA256，每用户独立盐，迭代次数写进 hash 串（`pbkdf2$sha256$<iter>$<salt>$<hash>`） | 不存明文/可逆加密；迭代次数随身存，将来提强度老用户下次登录自动重算 |
| 会话 | cookie 放随机 token，库里只存它的 SHA-256 | 库被拖走也拿不到能直接用的 cookie |
| cookie | `HttpOnly; SameSite=Lax; Secure` | `HttpOnly` 挡 XSS 窃取，`Lax` 挡跨站 POST 类 CSRF |
| 登录枚举 | 邮箱不存在也跑一次假 hash 校验 | 响应时间一致，不能靠耗时探测「这个邮箱注册过没有」 |
| 改密 | 验旧密码 + 清空该用户所有会话再发新 token | 防 cookie 被盗后直接改密锁人，并踢掉其它设备 |
| 人机验证 | Cloudflare Turnstile（Managed 模式），secret 走 `wrangler secret` | 缺 secret 时对生产 fail-closed，宁可拒绝也不裸奔 |
| 回跳 | `?next=` 只接受单个 `/` 开头的站内路径 | 不做就是开放重定向漏洞 |
| 审批 | `/api/admin/decide` 服务端复核 `role === 'owner'` | 页面上藏按钮只是体验，接口才是防线 |

路由与文件：`/login/` `/register/` `/account/` `/admin/` 都是 `prerender = false` 的 SSR 页；接口在 `src/pages/api/{auth,account,admin}/`。中间件 `src/middleware.ts` 把 cookie 解成 `Astro.locals.user`。**这些路由必须列进 `wrangler.jsonc` 的 `run_worker_first`**，否则会被资源层的 404.html 截住。

> 一个必须知道的坑：中间件里**不能顶层 `import { env } from 'cloudflare:workers'`**。本机预渲染走 Node（`prerenderEnvironment: 'node'`），Node 的 ESM loader 不认识 `cloudflare:` 协议，会在「预渲染 /404」这步直接崩 `ERR_UNSUPPORTED_ESM_URL_SCHEME`。改成在 SSR 分支里动态 `await import()`。同理，所有 API 端点都要标 `export const prerender = false`。

> 静态页的登录态：本站绝大多数页面是构建期预渲染的，生成时没有会话，顶栏渲染出来永远是游客态。`/api/auth/me` 接口 + Header 里的内联脚本在客户端把右侧人形图标升级成账户菜单。所以**不要在静态页里写死任何按用户变化的文案**。

> **账户菜单**（v1.19.0）：导航文字区只留「曲目 / 最近更改」，登录、管理、昵称全部收进右侧人形图标的下拉（主人 2026-10-25 两次要求：「标记一可以不要，全部整合进标记二里」「标记1的【登录】也不要」）。菜单结构 = 昵称+身份 → 我的账户 / 管理后台（staff 才有）→ 分隔线 → 红色退出登录。游客看到的人形图标仍是直达 `/login/` 的普通链接，**无 JS 也能登录**；登录后脚本才把它改成点开菜单（href 保留，中键/新标签仍可直达账户页）。退出用 POST 表单提交 `/api/auth/logout`——那个端点只接受 POST，防止爬虫/预取随手 GET 就把人踢下线。菜单底色用 `--acm-bg` 实色，**不能吃 `--pop-bg`**（后者是 rgba 0.94 的玻璃，浅色主题下曲绘会透上来叠字）。


> **三个浮层互斥**（v1.23.1）：导航抽屉（.nav-drawer）/ 账户菜单（.acm-pop）/ 主题切换（.tsw-pop）打开时不会重叠——打开任何一个，其余两个自动收起（主人 2026-10-26「展开时不能重叠，一个打开，其他的就要收起」）。实现是 `Header.astro` 里的 `window.jbPop` 协调器：每个浮层把「关闭自己」的函数 register 上去，`closeOthers(self)` 在开新浮层前统一调度。三个浮层分属 Header 两个 script + ThemeScript 一个 script，互相拿不到对方的 setOpen，所以抽一层登记处而不是硬引用。

> **约定：被 JS 接管、点击后不导航的 `<a>` 必须带 `data-boot-skip`**（v1.19.1）。BootScreen 的「点链接先亮 LOADING」监听器挂在 `document` 的 **capture 阶段**，比链接自己的 `preventDefault` 先跑——它看到 href 还在，就当成「要跳走了」而 `begin(160)`。实撞：账户菜单把 `<a href="/account/">` 改成开菜单的触发器后，每次点它都闪一下 LOADING，还得等 3 秒兜底才收。所以这类触发器要打 `data-boot-skip`，遮罩监听器见到就跳过。反向要验：普通站内链接点击仍必须点亮遮罩（实测 `bootRun:true`），别把拦截做成「所有导航都不亮」。

**/recent/ 最近更改**（v1.15.0 起为真实数据页）：记录维护者对站点内容的编辑。该页 `prerender = false`（与 `/songs/` 一样是 SSR），运行时查 D1 的 `recent_changes` 表，每条含 `changed_at` / `user` / `target_label` / `target_href` / `summary` / `before_text` / `after_text`。前后差异用原生 `<details>/<summary>` 折叠，**这一页没有任何脚本**，无 JS 也能展开。写入源是 `/api/admin/song-update`（维护者每次成功编辑曲目写一条）。库里没有记录时显示空态三行说明。该页 `noindex`，宽屏走导航文字链接，窄屏走图标组里的时钟图标。

> 为什么改了 SSR：此前读的是 `src/data/recent-changes.json` 这份构建期快照，编辑记录是运行时数据，构建期永远不知道，列表恒为空。那个文件现在只留作 dev 退路（见 `src/lib/db.ts`）。副作用：`dist/client/recent/` 不再生成，`check-refs` 的 dist 引用基线从 46 变为 42。
>
> **`run_worker_first` 必须保留独立条目**：`/recent` 与 `/recent/*` 不在任何通配规则里，漏写会被资源层按 `not_found_handling` 直接截成 404.html，进不了 Worker。

**开屏 LOADING**：`src/components/BootScreen.astro` 是街机开机风的整站开屏遮罩（4×4 方块逐格点亮 + `LOADING......` + 进度条 + 扫描线），同一套视觉有**三种触发**，但只有「真的要等」时才亮：①首访开屏——每个会话第一次进入才出现（`sessionStorage` 记 `jb-boot`），最少停 900ms（太快闪一下像故障）、最多 3s（`load` 被慢资源拖住时不锁人）；②点导航去下一页——延迟 160ms 才亮，新页在此之前到达就完全不出现（本地点击到 `pagehide` 约 68ms，正常网速下看不到遮罩）；③切世代主题——先查本页是否已经拿到过这两张图（背景 + 字标），拿到就零延迟直换、一点不闪；没拿到才挂 160ms 延迟遮罩，图到齐立刻收（兜底 2.6s）。

**遮罩的进出是径向圆孔**：进场「四周→中间」、退场「中间→四周」。实现是 `mask-image: radial-gradient(...)` + 注册成可插值属性的 `--boot-r`（`@property syntax: "<percentage>"`）：`-30%` 时圆孔不存在、遮罩盖满，`130%` 时圆孔超出四角、完全看不见，中间的 `--boot-soft: 26%` 是过渡带（羽化边缘，不然边界是硬圆）。进场 `bootIrisIn` 半径 130%→-30% 且 opacity 0→1，退场 `bootIrisOut` 反过来；**退场的 opacity 必须由动画收到 0**，否则动画播完摘 `boot-out` 那一帧会退回基础态（遮罩盖满 + opacity 1），屏幕会黑一下。基础态是常驻 `display: grid` + `opacity: 0` + `visibility: hidden`（`display` 不参与过渡，切 `none↔grid` 会吃掉淡入），收场 `visibility` 延后 0.32s 才 hidden。浏览器缺 `@property`/`mask-image` 能力时自动退回整体透明度淡入淡出（`bootIn`）。首访的 `boot-run` 由主脚本双 `rAF` 加，head 脚本只留 `boot-first` 标记——早期版本 head 直接加 class，第一帧就是 `opacity:1`，看着像「啪」地糊上来。`is-wait` 态进度条改成来回扫（不知道多久就不假装知道进度）。**遮罩绝不会永久卡住**（v1.15.4 修，主人两次反馈「卡在 loading 页」和「进详情后按 back 有概率卡 loading」）：①`show()` 一点亮就挂一个 8 秒看门狗，到点无条件收起——`begin()` 返回的收尾函数原来在 click 处理器里被直接丢弃，导航慢/失败/被取消时遮罩就永远没人收（实测 10 秒后仍 `opacity:1` 且 `overflow:hidden`、`pointer-events:auto`，`elementFromPoint` 返回 none，整页点不动滚不动）；②点站内链接后 3 秒若本页仍在可见态（说明导航没走成），自己收掉；③**`pagehide`（persisted）时先把遮罩摘干净**，让 bfcache 存下的是干净快照——这是「back 有概率卡 loading」的根因：点进详情时 `begin(160)` 已点亮遮罩，列表页带着 `boot-run` 被冻进 bfcache，而「有概率」正是因为导航快于 160ms 时遮罩没亮、快照干净；④`pageshow` 的 `persisted` 分支无条件复位 `boot-run`/`boot-out`/`shown`，兜住其他来源的脏状态。设了 `prefers-reduced-motion: reduce` 的用户整站不启动。样式与脚本都是 `is:inline`，必须在首帧前生效。

页面支持 **16 套世代主题**（切换时背景交叉淡入、字体与强调色整套更换；2026-10-21 新增国服「音乐魔方」，2026-10-26 新增初代「jubeat」——排在 ripples 之前，背景与白色字标取自官方 PROFILE 卡），选择存在 localStorage。背景填充为 cover 按视口比例自适应。

**首屏标题行是「WELCOME TO + 字标 + ~」拼成的一句**（v1.24.0。原先字标和「WELCOME TO jubeat ~」上下各说一遍 jubeat）：世代字标图直接充当 jubeat 这个词，前缀与 `~` 锚在同一个 `--wl-em` 上，因此三者天然同高。难点是 13 张字标构图完全不同（字身带有的压图顶、有的居中，还各带圆弧/菱形/色条/副标题），所以按世代量了对照表写进 `theme.css`：`--bh`（「jubeat」字身带占图高比例，把字身缩成统一 1em）、`--bc`（字身带中心位置，对齐到行中线）、`--bt`（字身带上缘，留档核对）。**换字标图必须重算这三值**，否则标题行会错位。量法：以最干净的 `logo/jubeat.webp` 为模板，对各字标做归一化互相关扫描（缩放 0.5–2.6×、全纵向偏移），取得分最高的窗口；外围圆弧会让「段数+跨度」这类判据误判，实测过 `--bh` 被带到 0.4857 导致 ave 字标缩成一半。

> **字体走第三方 CDN（2026-10-25）**：仓库不再存字体二进制（`public/assets/fonts/` 已清空），6 款主题字体全部由 [@fontsource](https://fontsource.org/) 的官方字体包经 `cdn.jsdmirror.com` 分发：
> `https://cdn.jsdmirror.com/npm/@fontsource/<pkg>/files/<pkg>-latin-<weight>-normal.woff2`
> 选 jsdmirror 而非 jsdelivr 原站是实测结论：同一文件 avg ttfb **1.86s → 0.31s**（对照：本站 CF 1.16s、fontelio 2.19s 且首次 4.7s）。
> 代价：fontsource 是通用拉丁集，比原来自裁剪的子集大 48%（105.6 → 156.6 KB）；首屏只加载当前世代 1 款，实际约 +20 KB。
> 两个易错点：①路径必须带 `-normal.woff2`；②Playfair 的包名是 `@fontsource/playfair-display`（不是 `@fontsource/playfair`）。改字体时 `theme.css` 的 `@font-face` 与 `Base.astro` 的 preload **必须同改**（地址不一致会被下载两次）。

页脚两列：左边是「最后一次编辑 日期 + 版本号」，版本号是**网页自己的迭代版本**，读 `src/data/site.json` 的 `version`（从 `1.0.0` 起，改功能时手动 +1，与 npm 包版本无关），右边是品牌字 + 小灰字 `Enjoy Yourself`。日期取构建当天（北京时间），云端每次 push 自动构建，所以等价于最后上线时间。

## 项目清单

```
Beyond_JUBEAT/
├─ src/                       Astro 源码
│  ├─ pages/
│  │  ├─ index.astro          首页（Hero + 施工中占位）
│  │  ├─ songs.astro          曲目页（SSR：运行时查 D1，双服切换 + 分区筛选 + 搜索/四维筛选/5 种排序）
│  │  ├─ songs/[songId].astro 曲目详情（SSR：按 song_id 查 D1 单行）
│  │  ├─ songs/gen/           世代筛选页（SSR：13 个世代各一页，slug 在 lib/gens.ts）
│  │  ├─ admin/songs/         维护者曲目编辑（列表 + 单曲编辑，服务端复核 role）
│  │  ├─ login.astro          登录（SSR）
│  │  ├─ register.astro       注册（SSR）
│  │  ├─ account.astro        我的账户：改昵称/改密/自荐维护者（SSR）
│  │  ├─ admin.astro          管理面板：站长审批维护者自荐（SSR）
│  │  ├─ api/                 auth(register/login/logout/me) · account(profile/password/apply) · admin(decide/song-update)
│  │  ├─ recent.astro         最近更改（SSR：查 D1 recent_changes，原生 details 折叠前后差异）
│  │  └─ 404.astro            404 页
│  ├─ components/
│  │  ├─ Header.astro         顶部导航 + 主题切换按钮
│  │  ├─ BootScreen.astro     开屏 LOADING 遮罩（每会话一次，is:inline）
│  │  ├─ Hero.astro           主视觉（站标 / 统计 / 曲绘方块）
│  │  ├─ SongCard.astro       曲目卡（/songs/ 与 /songs/gen/ 共用的唯一一份）
│  │  └─ ThemeScript.astro    世代主题切换脚本（内联进页面）
│  ├─ layouts/Base.astro      全站骨架（head / 背景板 / footer）
│  ├─ middleware.ts           全站中间件：会话 cookie → Astro.locals.user
│  ├─ styles/theme.css        全站样式（源码 60 KB → 产物 31 KB → gzip 7 KB）
│  ├─ styles/auth.css         用户系统样式（登录/注册/账户/管理）
│  ├─ styles/songs.css        曲目页样式（卡片 / 工具条 / 世代页 / 搜索筛选排序）
│  ├─ lib/
│  │  ├─ title.ts             页面标题格式「XXX · Beyond ↑ JUBEAT ♪~」
│  │  ├─ db.ts                D1 数据访问层（getAllSongs 全量查询 + isolate 缓存）
│  │  ├─ auth.ts              认证底层：PBKDF2 / 会话 / Turnstile / 角色
│  │  ├─ auth-messages.ts     认证错误码 → 中文文案
│  │  ├─ gens.ts              世代顺序表（13 条，含日服 / 国服归属 + 稳定 url slug）
│  │  └─ song-view.ts         视图口径：哪些行进哪个服务器视图、算哪个分区（两页共用）
│  └─ data/
│     ├─ data.json            页面聚合数据（约 11 KB）
│     ├─ songs.json           构建期曲目快照（1241 条，本地无 D1 时的兜底）
│     ├─ site.json            站点自有版本号（页脚 v X.X.X）
│     └─ recent-changes.json  最近更改的记录（现为空数组，待接后端）
│
├─ public/                    原样拷进 dist 根的内容
│  ├─ assets/
│  │  ├─ images/bg/           15 张世代主题背景 webp（397 KB，1440 宽）
│  │  ├─ images/jackets/      1305 张曲绘 webp（11 MB，144px）
│  │  ├─ images/logo/         12 张世代站标 webp（244 KB，570 宽 DPR2）
│  │  ├─ images/og/           og:image 分享图（1200x630 png）
│  │  ├─ fonts/               （已清空）主题字体改由 fontsource CDN 提供，见下方「字体」
│  │  └─ data/ docs/ media/   预留空目录
│  ├─ _headers                Cloudflare 静态资源响应头
│  ├─ apple-touch-icon.png    iOS 主屏图标（180x180，由 favicon 渲染）
│  ├─ robots.txt  sitemap.xml SEO（构建时由 scripts/gen-seo.cjs 生成）
│  └─ favicon.svg             站点图标
│
├─ docs/                      设计与验收文档
│  ├─ measurement-caliber.md  **统计口径（做任何计数前先读）**：data-cat 三处 / 世代块 12 vs 13 / grep 单行陷阱 / Tab 分视口 / 断言数看运行时
│  ├─ data-pipeline.md        数据管线（xlsx → db → seed，含 D1 上线顺序）
│  ├─ site-structure.md       站点层级结构（页面 / 数据来源 / 导航）
│  └─ audit-status-2026-10-23.md  22 条审计问题的现状与复测记录
│
├─ data/                      管线输入与本地产物（详见 docs/data-pipeline.md）
│  ├─ xlsx/source.xlsx        国服更新表原件（7 表，2 隐藏）
│  ├─ xlsx/sheet*.json        xlsx 解析产物（parse-xlsx 生成，受版本控制）
│  ├─ upstream/               日服 1150 首 + 旧站 513 首冻结快照
│  └─ jubeat.db               权威曲库（SQLite 392 KB / 1241 曲 / 3723 谱面，不部署）
├─ db/
│  ├─ schema.sql              本地建库全量 DDL（含 DROP，勿对线上跑）
│  ├─ migrate-users.sql       用户系统增量迁移（IF NOT EXISTS，给线上 D1 用）
│  └─ seed.sql                生成物：幂等数据 DDL + INSERT + ANALYZE，可整体重放到 D1
├─ scripts/                   工具脚本（不部署）
│  ├─ build-data.cjs          data/jubeat.db → src/data/data.json + songs.json + 同步曲绘
│  ├─ db/build-db.cjs         建库导入（上游快照 / xlsx 产物 → data/jubeat.db，末尾 ANALYZE）
│  ├─ db/parse-xlsx.cjs       xlsx 解析（自带 ZIP 解包，读 data/xlsx/source.xlsx）
│  ├─ ci/check-refs.cjs       引用完整性检查（源码 / dist 两用）
│  ├─ ci/check-song-edits.mjs 曲目编辑越权/参数校验（node:sqlite 内存库冒充 D1，调真实 handleSongUpdate）
│  ├─ ci/check-contrast.mjs   对比度自检（16 套主题 × 三条组合取 min；输出公式理论值，不含背景图）
│  ├─ scrape-beyond-ave.cjs   上游曲目抓取（beyond the Ave. 站点 → data/upstream/*.json）
│  ├─ gen-seo.cjs            生成 robots.txt / sitemap.xml（build 前自动跑）
│  ├─ gen-brand-assets.cjs   生成 og 分享图与 apple-touch-icon（素材变了才跑）
│  ├─ optimize-images.cjs     图片压缩（logo / bg / 曲绘）
│  ├─ subset-fonts.py         历史脚本：字体子集化（现字体走 CDN，已不再需要）
│  ├─ probe/                  历史探测脚本（Playwright 时代留下的）
│  ├─ screenshots/ logs/ tmp/ 过程产物
│  └─ README.md
│
├─ archive/                   暂不使用的素材与旧项目（不部署，已 gitignore）
│  ├─ materials/              候选素材：曲绘原图、更新情报、版本资料
│  └─ legacy/                 jubeat-wiki / -v2 / -v3 / -v4 四代旧项目
│
├─ .github/workflows/        build-check.yml（push/PR 校验构建与引用完整性）
├─ astro.config.mjs          Astro 配置（output: static + @astrojs/cloudflare 适配器）
├─ tsconfig.json
├─ wrangler.jsonc            Cloudflare Workers 配置（Worker 入口 + ./dist/client 静态资源 + D1 / KV 绑定）
├─ package.json              依赖：astro、@astrojs/cloudflare、wrangler、sharp
├─ dist/                     构建产物，gitignore，部署时上传的就是它
├─ .dsh-meow/  .dsh-ops/      本地工具数据（已 gitignore，勿提交）
├─ .gitignore  .gitattributes
└─ README.md
```

## 数据来源

| 字段 | 来源 |
| --- | --- |
| 曲名 / 谱师 / 三档定数 / 曲绘 | `data/jubeat.db`（SQLite 392 KB，1241 曲 / 3723 谱面；`npm run db` 从 `data/xlsx` + `data/upstream` 重建，细节见 [docs/data-pipeline.md](docs/data-pipeline.md)） |
| **线上实际读的曲库** | Cloudflare D1 数据库 `beyond-jubeat`（id `91a48a18-62b2-4933-9214-788205926744`），内容与上面那份 SQLite 一致；重灌曲库用 `db/seed.sql`（幂等数据 DDL + INSERT，不含用户系统表），用户表另跑 `db/migrate-users.sql` |
| 世代归属与年份 | `src/lib/gens.ts` 的 `GEN_ORDER`（13 条：日服 12 + 国服 1），`scripts/build-data.cjs` 里有同源的一张表 |
| 收录日期 | `songs.added_at`（D1 列名），缺失则为 `null` |

`src/data/data.json` 是上面数据的**聚合快照**，字段：`stat`（总数）、`top`（定数顶格）、`gen`（世代层）、`dist`（定数分布）、`latest`（最近收录）、`dots` / `pad`（散点与填充）、`gen10` / `gen105`（定数 ≥10 / ≥10.5 计数）。

## 开发

```bash
npm install              # astro + wrangler
npm run dev              # 本地开发服务器（本机起不来，见「本机 workerd 的两个坑」）
npm run db               # 一条命令重建曲库：xlsx → sheet JSON → data/jubeat.db + db/seed.sql → 站点 JSON
npm run data             # 只重新生成 src/data/data.json 与 songs.json 并同步曲绘
npm run build            # 构建到 dist/
npm run check            # 四段：引用完整性(源码) → 引用完整性(dist) → 曲目编辑越权/参数校验 → 对比度自检(16 套主题)
                         # 任何一段红都不能放行。对比度脚本输出的是公式理论值（不含背景图），真实渲染会有 0.5–1.0 偏差，
                         # 验收仍以实机渲染为准，脚本只作回归护栏。
npm run opt              # 压缩 public/assets/images 下的图片
# 字体已改为 CDN 分发（fontsource + jsdmirror），不需要本地子集化
```

改版式改 `src/pages` 与 `src/components`，改主题色改 `src/styles/theme.css`（**一处主题色是七件东西**：`--acc` 强调色、`--focus` 焦点环、`--acc2` 次级强调、`--ink2`/`--ink3` 次要文字、`--edge`/`--edge2` 描边、`--glass`/`--glass2` 玻璃板，再加 `ThemeScript.astro` 里 `GEN` 的色点 `c`——只改 `--acc` 会留下半套旧色系；改完必须跑 `node scripts/ci/check-contrast.mjs`，它是唯一会拦住「强调色对比度不足 3:1」的关口，2026-10-24 的 saucer/Qubell 修正就是这么发现旧值只有 2.39:1 / 2.59:1 的）。改曲库不要手改 `data/jubeat.db`：换 `data/xlsx/source.xlsx` 或 `data/upstream/*.json` 后跑 `npm run db`，再把生成的 `db/seed.sql` 灌进 D1。

资源引用一律写站点绝对路径（`/assets/...`）：Astro 会把 CSS 打到 `/_astro/*.css`，相对路径会失效。

`npm run dev` / `npm run preview` **在本机起不来**（workerd 环境问题，见下「本机 workerd 的两个坑」）。改完只能 `npm run build` 后看产物：`dist/client` 是预渲染出来的静态文件（可用任意静态服务器打开），`dist/server` 是 Worker 侧代码；`/songs/` 走 SSR，本地静态服务器里看不到，要验就 push 后看线上。

## 部署

仓库：<https://github.com/SnowindMe/Beyond_JUBEAT>（main 分支）
线上：<https://wiki.byd-ub.top>（自定义域名，绑在 `byd-ub.top` zone 下）
备用：<https://beyond-jubeat.1945743455.workers.dev>

用的是 **Cloudflare Workers（混合渲染）**：`dist/client` 走 Workers Assets 静态资源层（零运行时开销），`/songs/`、`/recent/`、登录/账户/管理页等落进 Worker 脚本在边缘 SSR 时查 D1。哪些路径进 Worker 由 `wrangler.jsonc` 的 `assets.run_worker_first` 决定。

- Worker 名 `beyond-jubeat`，由 **Cloudflare 的 Git 集成（Workers Builds）在 push 到 main 后自动构建 + 部署**。
- `wrangler.jsonc`：`assets.directory = "./dist/client"`、`not_found_handling = "404-page"`、`main = "@astrojs/cloudflare/entrypoints/server"`。
- 两个绑定必须和 Cloudflare 侧一致，漏了会部署失败：`SESSION`（KV；适配器给 Astro Sessions 自动挂的，暂时没用也得写 id）、`beyond_jubeat`（D1）。
- **Turnstile（人机验证）**：widget 已建好（Managed 模式，域名 `byd-ub.top` 覆盖 `wiki.byd-ub.top`）：
  1. **secret** 用 `npx wrangler secret put TURNSTILE_SECRET --name beyond-jubeat`（已写入，值不进仓库）；
  2. **site key** 是公开值，写在 `src/lib/turnstile-config.ts` 的 `TURNSTILE_SITE_KEY` 常量里——不走构建期环境变量，省掉「控制台忘配 → widget 不渲染 → 注册静默失败」这类坑。
  少了 secret 时，生产环境注册/登录 fail-closed 拒绝（本地 DEV 放行）。
  换 widget 时改这两处即可；模式/域名在 Cloudflare 控制台改。
- 线上 D1 加表：`npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-users.sql`（幂等，`IF NOT EXISTS`）。**不要拿 `db/schema.sql` 对线上跑**——它开头有 `DROP TABLE songs`。
- Astro 以 `output: "static"` 构建：没标 `prerender = false` 的页面照旧预渲染成 HTML，只有曲目页进 Worker。所以 `dist/client/songs/index.html` 不存在，这是正常的。
- `dist/server/wrangler.json` 才是带绑定的那份配置，`wrangler deploy` 通过 `.wrangler/deploy/config.json` 指过去。
- 曲目页的 HTTP 缓存自己设：`cache-control: public, max-age=30, s-maxage=300, stale-while-revalidate=60`；Worker 内还有 60s 的 isolate 级内存缓存（`src/lib/db.ts`）。
- `dist/` 与 `node_modules/`、`.astro/`、`.wrangler/` 都在 `.gitignore`，产物由云端构建生成。

也就是说：**只需要 push，剩下的云端自己干**。

```bash
git push                 # Cloudflare 自动构建 + 部署
```

本地手动部署（一般用不到，等价于云端做的事）：

```bash
npm run deploy           # build + wrangler deploy
```

> 旧的 `jubeat-wiki-home` worker 已删除；GitHub Actions 的 `deploy.yml` 也已移除，避免和 Cloudflare 的自动构建重复部署。

### 本机 workerd 的两个坑（适配器为什么这么配）

接 D1 必须装回 `@astrojs/cloudflare`，但它自带的 miniflare/workerd 在这台 Windows 上会崩：

```
Fatal uncaught kj::Exception: kj/filesystem-disk-win32.c++:773: failed: CreateDirectory: #5 拒绝访问。; path = miniflare-email-store
```

**坑 1 · 构建期预渲染**：适配器默认用 workerd 跑预渲染，上面这条直接让 `npm run build` 挂掉。解法是 `astro.config.mjs` 里写 `prerenderEnvironment: 'node'`，改用 Node 跑预渲染，产物完全一致，云端（Linux）也不受影响。

**坑 2 · 本地 dev server 起不来**：同一个崩溃发生在 `npm run dev`、`npm run preview`、`npx wrangler dev` 的**启动阶段**——miniflare 在 `os.tmpdir()` 下建临时目录，然后 workerd 自己要在里面建 Durable Object 存储目录，被本机权限拒绝（设 `TEMP`/`TMP`/`TMPDIR`、手动建同名空目录都无效）。所以本机没有可用的 dev server，改动一律靠 `npm run build` + 线上验证；CI 与 Cloudflare 的构建都在 Linux 上跑，不受影响。

同理，`platformProxy: { enabled: false }` 也是为了避免 dev 时连本地 D1 代理；没有 D1 绑定时代码会退回读 `src/data/songs.json`（仅 DEV，构建期会被摇掉，不进 Worker 包）。

### 自定义域名

已把 `wiki.byd-ub.top` 挂到 worker（Workers Custom Domain，证书与 DNS 记录自动生成；当前 `service` 已指向 `beyond-jubeat`）：

```bash
PUT /accounts/{account_id}/workers/domains
{"environment":"production","hostname":"wiki.byd-ub.top","service":"beyond-jubeat","zone_id":"..."}
```

注意：这个 zone 开着 Browser Integrity Check，用 curl 裸请求（不带 UA）访问自定义域名会被 CF 拦成 403 `Cf-Mitigated: challenge`；带浏览器 UA 就是正常 200。浏览器访问不受影响。

### 响应头（`public/_headers`）

Cloudflare 静态资源会自动读取 dist 根下的 `_headers`：

| 路径 | 策略 |
| --- | --- |
| `/*` | nosniff、SAMEORIGIN、strict-origin-when-cross-origin、收紧 Permissions-Policy |
| `/assets/fonts/*`、`/assets/images/*` | `max-age=31536000, immutable`（内容不变，长缓存） |
| `/_astro/*` | `max-age=31536000, immutable`（文件名带内容 hash，天然不可变） |
| `/index.html`、`/404.html` | `max-age=0, must-revalidate`（每次都回源确认） |
| `/favicon.svg` | `max-age=86400` |

### SEO 与站点图标

| 项 | 位置 | 说明 |
| --- | --- | --- |
| `robots.txt` / `sitemap.xml` | `public/`（构建时生成） | `npm run build` 先跑 `scripts/gen-seo.cjs`，lastmod 是当天；只收录首页，施工中的二级页不进 sitemap |
| og:image | `public/assets/images/og/cover.png` | 1200x630，字标反相后压在 ave 背景上；`scripts/gen-brand-assets.cjs` 生成 |
| apple-touch-icon | `public/apple-touch-icon.png` | 180x180，由 `favicon.svg` 渲染 |
| canonical / og / twitter | `src/layouts/Base.astro` | 默认拼 `https://wiki.byd-ub.top` + `canonicalPath`；404 页传 `canonicalPath=""` 且 `noindex`，不输出 canonical |

素材（背景/站标/字体）换了之后跑一次 `node scripts/gen-brand-assets.cjs` 重生成分享图。

### CI（GitHub Actions）

| 工作流 | 触发 | 做什么 |
| --- | --- | --- |
| `build-check.yml` | push / PR | `npm ci` → `npm run build` → 校验源码与 dist 的引用完整性 |

部署不再走 GitHub Actions，交给 Cloudflare Workers Builds。

## 性能

实测（本机 `dist/` 静态服务器 + ego 浏览器，1280x800，冷加载跑 3 次取中位数）：

| 指标 | 值 |
| --- | --- |
| 请求数 | 20 |
| 解码后总字节 | 160 KB |
| TTFB | 20 ms |
| FCP | 440 ms |
| DOMContentLoaded | 208 ms |
| load | 470 ms |

字节构成：图片 11 KB + CSS/字体 6 KB（首屏只取当前世代的 1 张背景 + 1 张站标 + 9 张曲绘；背景 32 KB 与站标 11 KB 走 head 里的 preload，和 CSS 并行）。

做过这几件事：

| 项 | 做法 | 效果 |
| --- | --- | --- |
| 字标 | 世代站标原本全部渲染、靠 CSS 隐藏 → 改成单个 `<img id="wordLogo">` 按当前世代设 src | 少下 10 张，约 -160 KB |
| 曲绘 | 78 张缩到 144x144（显示 84 CSS px，够了） | 1344 → 438 KB |
| 背景 | 世代背景缩到 1440 宽 q62（festo 2026-10-26 从原始卡面重提取，见下条） | 单张 5–60 KB |
| 站标 | PNG → WebP，360 宽 q88 | 421 → 179 KB |
| 字体 | 改走 fontsource CDN（见下方「字体」一节） | 仓库不再存字体二进制 |
| 缓存 | `_headers` 给 `/_astro/*` 加一年 immutable | 二次访问不再回源取 CSS |
| 主题 | head 里内联预热脚本，先读 localStorage 再渲染 | 老用户刷新不闪 ave |

压缩用 `npm run opt`（sharp）、子集化用 `npm run fonts`（fonttools）。注意两个脚本都是**原地覆盖**，重复跑会越压越糊；要重压先从 git 历史取原图（`91e698e` 是最后一批原图）。

图片是体积大头；整站素材（15 张背景 + 12 张站标 + 1305 张曲绘 + 7 个字体）约 11.7 MB，但首屏只取当前世代的 1 张站标 + 1 张背景 + 9 张曲绘，曲目页的曲绘全部 `loading="lazy"`，其余按需。

曲目页在 v1.7.0 前是构建期把 1241 首全量烘进 HTML（`dist/songs/index.html` 592 KB raw / brotli 49.8 KB）；改成 SSR 读 D1 之后这份 HTML 不再存在，首屏字节由浏览器按需索取，代价是 Worker 冷启时多一次 D1 查询（命中 isolate 缓存则省掉）。

## 本地预览构建产物

```bash
npm run build
# dist/client 里的静态页：随便起个静态服务器即可
npx wrangler dev         # 本机起不来（见上），要验 SSR 只能看线上
```

## 说明

`archive/` 里四代旧项目体积约 1.6 GB，由 `archive/.gitignore` 忽略（内含 `materials/`、`legacy/`），不会进仓库。

---

本项目在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中开发。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)