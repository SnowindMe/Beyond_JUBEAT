<!-- deep-ptc:project-cards v1 next=R7,F1,Q1 -->
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
