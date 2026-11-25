<!-- deep-ptc:project-cards v1 next=R7,F2,Q1,T3 -->
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
<!-- card id=tasks kind=tasks rev=2 updated=2026-11-25T18:34:21.381Z -->

- **T1** [done] 相关站点共新增两个网站（G4 的 FaFuMemo 进友链、本条 JubeatLog 进 Jubeat相关），都按现有条 — 首页与导航八条改版已发 v1.71.0 并上线：三枚按钮、Star 大按钮、游客头像、Jubeat相关改名与新增站点、README 致谢迁移、安装按钮下线；九段自检与 CI 全过，线上八项逐条实测通过。 (11/25)
- **T2** [done] 调整首页视觉排布：统一各主题世代 logo 的显示尺寸，同一行内大小一致、比例不变形 — 首页 logo 尺寸统一 + 模块留白统一已落地，三档验证通过，本地提交 7466626（未推送） (11/26)
