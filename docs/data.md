# 数据与管线

返回 [根 README](../README.md)。

## 数据与代码分离

**仓库里没有数据。** 2026-11-18 起，所有清单输入（`data/xlsx` 源表、`data/upstream` 上游快照、`data/remy` 谱面快照、各个覆盖层）与生成物（`db/seed.sql`、`src/data/*.json`）都移出版本库，改存 Cloudflare R2 私有桶 `beyond-jubeat-data`。

理由：仓库是 PUBLIC 的，数据留在库里等于把整站源码可读的副本白送出去；而且每改一首曲都要在几十个数据文件上留下 diff，功能 review 会被淹掉；数据还在每次更新里让仓库持续变大。

- **克隆后**：`npm run data:pull` 拉回（`prebuild` 已挂上，`npm run build` 会自动先跑它，缺凭据时跳过并打印提示）。
- **改完数据**：`npm run data:push -- --changed` 推回去，否则 CI 与别人的 clone 拿不到你的改动。
  加 `--changed` 是必须的——不加会全量重推（当前 78 个音频约 304 MB，大头是音频），跑十几分钟。
  它逐条比内容的 md5 与远端 ETag，没变的不传；想要全量才省略这个参数。
- **代码引起的数据变化不用手动推**：`.github/workflows/data-push.yml` 在 push main 后自动 pull → 重建 → `--changed` 推，只在 `data/`、`scripts/db/`、`schema.sql` 一类路径变动时触发。覆盖层这类只在本地改的文件它看不到，仍由本机推。
- 白名单在 `scripts/data/push.cjs` 的 `WHITELIST`：新增长期数据文件时要登记，否则推不上去。`db/schema.sql` 与 `src/data/site.json` 仍留在仓库——它们跟代码一起 review 才有意义。
- R2 免费额度足够：数据文件是 MB 级、音频约 300 MB（78 个），只有构建与手动推送会访问，不对外暴露读端点，天然不担心被刷。

`push.cjs` 用 `execFileSync(..., { shell: true })`，键里一旦有空格（曲名、`--file=`、`--content-type=`）就会被 shell 拆成多个参数，报 `Unknown arguments: -, 2073, ...`。三处都必须走 `shq()` 套双引号，往白名单加带空格的路径时别忘了这一层。

## 数据管线

```
data/xlsx/source.xlsx ─parse→ data/xlsx/sheet*.json ─┐
data/upstream/*.json ──────────────────────────────┼→ data/jubeat.db → src/data/*.json
data/unit-songs.json ─────────────────────────────┘        ↓
                                                    db/seed.sql（全量）
                                                    db/patch.sql（增量，灌线上用）
```

`data/jubeat.db` 是本地权威曲库（生成物、不入库，`npm run db` 随时重建，不需要网络）。线上真实数据在 Cloudflare D1 库 `beyond-jubeat`，内容与之一致。

**日常改线上数据用 `npm run patch` 生成的增量补丁，不要重放 `db/seed.sql`**——后者会 `DELETE FROM songs` 再整表插入。细节见 [database-schema.md](database-schema.md) §6。

三条特殊输入：

- `data/unit-songs.json`：日服 `U'nit` 世代（2026-11-22 接入）。官方曲库还没有这批曲，所以用占位 id `unit-001`…`unit-014`，`id_kind='synthetic'`；不并进 `jp-resolved.json`（那份会被 `data:pull` 覆盖）。其中 5 首有真曲绘，其余 9 首共用一张占位图。
- `src/data/audio-sources.json`：新入库音源的上传者（Fruity / Album），详情页来源徽章据此显示，未登记的回落到 `Jack大本`。
- `src/data/cdn.json`：曲绘规范名 → 图床 URL 的映射（1270 条，含 1 张国服占位图），不入库但在 R2 白名单里。

抓取类脚本需要联网，**不进 build 流程**，曲库更新后手动重跑并提交产物：

- `scripts/ub/build-ub-audio.cjs` → `src/data/ub-audio.json`（BGM 映射，全库 1269 首里 14 首整代排除、1255 首参与，命中 1241 首 98.9%；未命中的 14 首是上游确实没有的国服独占曲与占位曲）。
  上游有两处反复变动的形态，脚本都做了应对：①「音乐魔方」等自建目录的音频名是内容哈希 `bgm.<hash>.ogg`，路径一律按上游返回的 assets 原样取值，不自己拼；②自建目录的曲目 id 已从 `arcade_<数字>` 换成 `目录/C0xx 曲名`，末段编号与本站九位 id 无对应，所以这批只能靠规范化标题匹配，且**先在本世代主目录内比唯一性**，再退到世代目录白名单（主目录 + `jubeat-china` 等旁支）——跨目录直接比会把本身就以 jubeat-china 身份存在的曲目判成歧义。
  标题层也无法消歧的（目前仅 `991000007 Big Daddy`：上游同名两条，一条在 `音乐魔方/C033`、一条在 `jubeat-beyond-ave/首次收录/arcade_11000228`）留在 `data/audio-overrides.json` 里显式钉死。
   「U'nit」整代不参与映射：上游 `versionIndexes` 的 18 个分片里根本没有这一代（2026-09 才上线的国服世代），而它又没有 `GEN_DIRS` 条目、世代内唯一性判据失效后会退到全库标题层去误命中别的世代（实测 `unit-001 朧` 撞上 saucer 的 `arcade_50000071`）。脚本用 `SKIP_GENS` 硬跳过，且不计入覆盖率分母——否则一整代必然全未命中会把 85% 阈值挤下去、掩盖真正的上游异常。
- `scripts/ub/build-ub-charts.cjs` → 谱面密度数据，再由 `split-ub-charts.cjs` 拆成每首一个静态 JSON；**密度条画之前必须校验键数**（算出的键数要与库里的官方物量相等，否则不画——实测 3807 个档位里有 314 档上游根本没有谱面文件、84 首完全没有密度数据，宁可少一张图也不给自相矛盾的图。定数不作为判据，库里的定数是官方的，ub 那栏标签会滞后）

## 部署与发布

push 到 main，Cloudflare 的 Git 集成（Workers Builds，worker 名 `beyond-jubeat`）自动构建 + 部署（`wrangler.jsonc` 的 `main` 是 `src/worker.ts`，`assets.directory` 是 `./dist/client`）。

**线上构建不跑 GitHub Actions**：Actions 只做检查、推数据、清缓存、打标签。两条线相互独立，**Actions 绿 ≠ 线上已更新**——实测部署需要 90–120 秒，页脚版本号变了才算上线。构建期需要的凭据（如微信校验文件）要同时保证 CF 与 Actions 两条链路都能拿到。

**EdgeOne 缓存的自动清除**：加速站 `wiki-cn.byd-ub.top` 是 EdgeOne 前置，旧 HTML 会被它按源站 `max-age` 缓存住，源站已发新版、加速站却继续吐旧页（2026-11-17 事故即此）。所以 `build-check` 在 push 到 main 时会跑 `scripts/ops/purge-edgeone.mjs`：先轮询源站 `wiki.byd-ub.top`（直连 CF）直到页脚出现本次版本号，再对站点 `zone-3we3ellu1uc3` 发 `purge_all`。本机临时清一次：`EDGEONE_ZONE_ID=… TENCENTCLOUD_SECRET_ID=… TENCENTCLOUD_SECRET_KEY=… node scripts/ops/purge-edgeone.mjs --now`，`--dry` 只打印请求不发送。

**Worker 侧的 `caches.default` 不用管**：缓存 key 里带 `SITE_VERSION`（`src/middleware.ts` 的 `CACHE_PREFIX`），发版换版本号即自动换 key，旧条目自然失效。

**发版清单**：

1. 改 `src/data/site.json` 的 `version`（页脚同源）；
2. 写 `docs/releases/v<版本>.md`（模板见下）；
3. commit + push main；`build-check` 绿后 `release-tag` 自动打 tag 并建 Release。

### 版本标签

每次发版对应一个 git tag 和一个 GitHub Release，由 `.github/workflows/release-tag.yml` 自动生成——人工只改版本号，不再手写 tag。它是 `build-check` 的 `workflow_run` 下游，只有 main 上的 push 且构建 + 自检全绿才打；构建失败的那一次不会有 tag。

标签打在「这次构建对应的那个提交」上（`workflow_run.head_sha`），而**不是**此刻 main 的最新提交——发版提交后面又跟了一个样式提交时，两个 sha 会不一样。版本号从那个提交里的 `site.json` 读，和页脚同源。

tag 命名：

- 默认 `v1.2.3`，与 `site.json` 的版本号一致（不带前缀、不改写）。
- 该版本号已被**别的提交**占着（版本号没变就继续提交）时，默认 **silent 模式跳过**、日志写明「已指向 abc1234」——同一版本号的后续提交本来就还属于这次发布，tag 只代表这个版本号第一次出现。
- 要在每个提交上都留标记就换 **strict 模式**：退化成 `v1.2.3-abc1234`，可追溯、不静默丢弃。两种模式都**不移动**已存在的标签，所以标签永远指向某个真实出厂过的提交。

### 版本说明

Release 正文取自 `docs/releases/v<版本号>.md`（随代码提交，一份发版一个文件），末尾自动附上「上一个标签…本标签」的提交对比链接。发版前把这份文件写好，别人在 Releases 页面就能直接看出这一版改了什么。

- 文件名的版本号必须与 `site.json` 的 `version` 一致，否则不算写到（会被当成没写）。
- 没写的时候不会留空白页：正文退化成自动整理的提交列表，并在顶部与 job summary 里都标出「这一版没有写版本说明」——是兜底，不是免写。
- 已经发出去的版本要补说明：`gh release edit v1.2.3 --notes-file docs/releases/v1.2.3.md`。

模板（`docs/releases/v1.67.2.md` 是现成例子）：

```markdown
## 新增

- **做了什么**：为什么改、改完用户看到什么变化。

## 修复

- **现象**：一句话说清原来哪里不对，以及现在的行为。
```

本地先看一眼正文长什么样：`node scripts/ops/release-tag.mjs --ref HEAD --dry`（会打印 tag 名与正文前 24 行）。
注释标签要作者身份，而 runner 上没有全局 `git config`（2026-11-22 首次真跑死在 `fatal: empty ident name`）。脚本用 `git -c user.name/user.email` 就地给 `github-actions[bot]`，只作用于那一条命令，不写 runner 的全局配置。

失败是红的，不是 `continue-on-error`——tag 是发布凭据，静默失败比红更坏。失败的 step 会把 stderr 原文和补救命令写进 job summary：

```bash
git push origin refs/tags/v1.2.3                    # 标签建了但没推上去
gh release create v1.2.3 --verify-tag --notes-file docs/releases/v1.2.3.md   # 标签推上去了但 Release 建失败
gh workflow run release-tag -f sha=<commit> -f mode=strict   # 那次构建没被触发，整段漏跑
```

### 上线前必须先跑的迁移

都是幂等的 `IF NOT EXISTS` / `IF EXISTS`，与 `db/schema.sql` 里对应的建表段逐字同源：

```bash
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-users.sql      # 用户系统
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-hot.sql        # 热度打点：漏跑则 /api/hot/hit 500
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-auth.sql       # 鉴权限流：漏跑则登录/注册/改密全 500
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-p0.sql         # 限流计数表 + 删冗余索引
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-song-tags.sql  # 曲目标签：漏跑则详情页标签 500
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-song-alias.sql # 曲目别名：漏跑则详情页别名 500
```

另有 `db/migrate-added-at-split.sql` 是**一次性**迁移（把 `added_at` 拆成 `added_at_jp` / `added_at_cn`），线上已跑过；新库由 `schema.sql` 直接建全，重复跑会因列已存在失败，不要再执行。

新开一份迁移要同时改 `db/schema.sql` 的对应段落，两份别分叉——本地靠 schema 一次建全，线上只能一条条跑迁移。

**日常改数据用补丁，别重放 seed**：`node scripts/db/diff-seed.cjs --base=<上次部署的 seed>` 生成 `db/patch.sql`（只含受影响的行），再 `node scripts/db/apply-patch.cjs --token=<CF token>` 灌进去。后者走 D1 REST `/query`、每批 100 条失败即停，不依赖 `wrangler` 的本地登录态——这台机器上 `wrangler d1 execute --remote` 会因缺授权直接失败，而 token 只要给了 D1 Edit 权限就能用同一条路径。

**不要拿 `db/schema.sql` 对线上跑**，它开头有 `DROP TABLE songs`。

Turnstile secret 用 `npx wrangler secret put TURNSTILE_SECRET --name beyond-jubeat`；site key 是公开值，写在 `src/lib/turnstile-config.ts`（不走构建期环境变量，省掉「控制台忘配 → widget 不渲染 → 注册静默失败」）。

这个 zone 开着 Browser Integrity Check，`curl` 裸请求自定义域名（不带 UA）会被拦成 403 `Cf-Mitigated: challenge`，带浏览器 UA 才正常。浏览器访问不受影响。
