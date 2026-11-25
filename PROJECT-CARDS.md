<!-- deep-ptc:project-cards v1 next=R7,F2,Q1,T10 -->
# Project cards

> Maintained by Deep PTC in DeepSeek Harness: edit in a Deep PTC conversation, view 特点卡片 / Project cards.
> User-approved settings guide this project. Features and requirements are records that can be checked and corrected.

## Beyond_JUBEAT 工作约定
<!-- card id=beyond-jubeat kind=setting category=conventions rev=1 updated=2026-11-24T20:58:36.829Z -->

- **R1** 站点是 Astro 7 + Cloudflare Workers + D1/R2，数据从 Excel 经 scripts/db 生成到 SQLite 再喂页面；不引入第二套框架或 ORM。
- **R2** 上线只走 git push origin main，Workers Builds 自动构建；不本地 wrangler deploy（要推就推，未推就说清「仅本地提交」）。
- **R3** 破坏性变更前先跑 npm run check（9 段自检），改完再跑一遍；数据或 schema 改动要同步抽 Live D1 并给线上实测数字。
- **R4** UI 文案只显示中文，英文只用于需求理解与注释；视觉一律先量（getBoundingClientRect / getComputedStyle）再改。
- **R5** 发版必须有正文说明（docs/releases/v<ver>.md + Release 正文），`--generate-notes` 只当辅助。
- **R6** 技术细节写进 docs/ 对应主题文件，根 README 只当门面，不塞操作手册。


## 已实现的功能
<!-- card id=features kind=features rev=1 updated=2026-11-24T21:32:22.258Z -->

- **F1** F: 谱面 JSON 走 CDN。详情页谱面由构建期拆分为 public/assets/diff/<songId>.json；线上返回 200 + CF-Cache-Status HIT + Cache-Control public,max-age=31536000,immutable。详情页用 ASSETS 绑定直读静态层，浏览器直连由 CF 静态层返回，不进 Worker（/assets/* 不在 run_worker_first）。旧谱靠 chartOf 的键数校验整档不画。


## Completed tasks / 已完成任务
<!-- card id=tasks kind=tasks rev=8 updated=2026-11-25T20:10:20.136Z -->

- **T6** [done] 首页与导航八条改版已发 v1.71.0 并上线：三枚按钮、Star 大按钮、游客头像、Jubeat相关改名与新增站点、README 致谢迁移、安装按钮下线；九段自检与 CI 全过，线上八项逐条实测通过。
- **T7** [done] 首页 logo 尺寸统一（槽高 1em、整图自居中、等比不裁）与模块留白统一（--sec-gap）已落地并推送 7466626；随后 U'nit 按 --wl-s 0.65 单独缩小推送 160e319。四档无溢出，自检全过。
- **T8** [done] 只调 U'nit 这一代的缩放，其余世代与整行对齐不变 — U'nit 字标按 --wl-s 0.65 单独缩小并推送 160e319，线上实测 281→182.7px，四档无溢出，其余世代不变。 (11/26)
- **T5** [done] 移动端标题行居中并放大字标（≤768px 档）：--wl-em 改 clamp(16px,4.6vw,24px)、.word-line min-width:0、.word-l 槽宽=图宽；390 档左右留白均 61.8px、字标 71.3→91.2、距简介 22px，桌面 1440 逐值不变。推送 3b701c3，线上实测通过。 (11/26)
- **T9** [done] 改动只落在 ≤768px 档，桌面 1440 及各代对齐、行宽现状不变 — 移动端标题行已居中、字标放大且不影响桌面，推送 3b701c3 并线上实测通过。 (11/26)
