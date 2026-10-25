# 数据管线（国服 + 日服曲库）

> 目标：新机器 clone 仓库后，**不依赖 `scripts/tmp/`、不依赖 `archive/`、不需要手工解压 xlsx**，
> 跑一条命令就能重建 `data/jubeat.db` → `src/data/songs.json`，并重新生成可灌进 D1 的 `db/seed.sql`。
> 所有路径都是仓库内相对路径，脚本里没有本机绝对路径。

## 0. 一条命令

```bash
npm run db      # = parse-xlsx → build-db --seed → build-data
```

它依次做三件事：

| 步骤 | 脚本 | 输入 | 输出 |
|---|---|---|---|
| ① 解析 xlsx | `scripts/db/parse-xlsx.cjs` | `data/xlsx/source.xlsx` | `data/xlsx/sheet1..7.json` + `all.json` |
| ② 建库 + 导种子 | `scripts/db/build-db.cjs --seed` | 上面 7 份 JSON + `data/upstream/*.json` + `data/gen-overrides.json` + `db/schema.sql` | `data/jubeat.db` + `db/seed.sql` |
| ③ 生成站点数据 | `scripts/build-data.cjs` | `data/jubeat.db` | `src/data/data.json`、`src/data/songs.json`、曲绘同步 |

自检（每次跑都会打印并判失败）：

```
曲目总数 1241   日服（含双服行）1151   国服（含双服行）524   双服行 434
谱面 3723（bsc/adv/ext 非空计数之和）   song_id 重复 0   世代/分类/EXT 空 0
```

只想跑其中一段时：

```bash
node scripts/db/parse-xlsx.cjs                    # 只重新解析 xlsx
node scripts/db/build-db.cjs                      # 只建本地库（不出 seed）
node scripts/db/build-db.cjs --seed               # 建库 + 导出 db/seed.sql
node scripts/build-data.cjs                       # 只从现有库刷站点 JSON
```

`parse-xlsx.cjs` 也接受覆盖参数，换一份新 xlsx 时不必改代码：

```bash
node scripts/db/parse-xlsx.cjs --xlsx=/绝对路径/音乐魔方更新歌曲.xlsx --out=data/xlsx
```

### 0.0 songId 修正表（`data/id-fixes.json`）

上游有些曲目拿不到官方 songId（用 `BTA-<曲绘id>` 占位），还有几首 id 与世代段不符。
本表存「现有 id → 正确 id」，在插入前重映射；重映射在内存整表做，因此**互换**
（A→B 且 B→A）不会撞主键。

```jsonc
{ "fixes": { "BTA-30740339": { "id": "11000155", "note": "voxel star arise / bta" } } }
```

- 修正后 id 一律要与曲目自身世代吻合（前缀判据见 0.1）。
- 自检三条：目标 id 不能重复、旧 id 必须真的消失、新 id 必须真的存在。
  「旧 id 仍在」对**互换项**不算错误（该 id 会被另一方占用），判据是「它是否也是别人的目标」。

> **seed 必须先清空数据表**：原先只靠 `INSERT OR REPLACE` 做幂等，只对「同主键改内容」有效。
> 一旦 id 变了，旧主键那行没人覆盖 → 库里同时留新旧两行，页面卡片数凭空变多
> （2026-10-25 实测从 1150 涨到 1159）。现在 seed 在 INSERT 前 `DELETE FROM songs; DELETE FROM recent_changes;`，
> 用户系统表一律不碰。

### 0.1 世代归属的人工覆盖表（`data/gen-overrides.json`）

上游 `jp-resolved.json` 的 `origin` 记的是**曲目首发世代**，但改版曲和替代谱面（`[ 2 ]` 谱）
的归属应是**新版上线的世代**。上游快照没有这个信息，所以这类错位是系统性的，需要人工覆盖。

```jsonc
{ "overrides": { "11000076": { "gen": "Ave.", "note": "凛として咲く花の如く，主人 2026-10-25 指出原 jubeat 错" } } }
```

- 覆盖优先于 `origin`；`gen` 必须是 `JP_GENS` 之一，写错会**直接抛错**（不静默丢弃）。
- 表里每个 songId 都会自检：不在库中 → 列进「待人工确认」；世代没生效 → 报「覆盖未生效」。
- **判据补充**：songId 前两位是世代号，但 `11` 段（Ave. 与 beyond the Ave.）和
  `50` 段（saucer 与 saucer fulfill）是**共用的**，光看前缀判不出世代，必须查这张表。

## 1. 数据从哪来

三份输入全部在版本控制里：

| 输入 | 位置 | 内容 | 来源 |
|---|---|---|---|
| 国服更新表 | `data/xlsx/source.xlsx` | 7 个工作表（2 个隐藏），源名「音乐魔方更新歌曲.xlsx」 | 国服玩家维护的更新台账，最后由 RXSnowind 于 2026-10-15T06:50:46Z 保存（`docProps/core.xml`），Kingsoft Office 生成 |
| 日服曲库 | `data/upstream/jp-resolved.json` | 1150 首，含 songId / 曲名 / 艺人 / 三档定数 / 曲绘文件名 / 初出代 / 分类 | `scrape-beyond-ave.cjs` 抓取日服数据后经多轮 id 消歧得到（`idKind` 区分官方 id 与占位 id） |
| 日服旧站快照 | `data/upstream/wiki-v3-songs.json` | 513 首，带 BPM / 上线日期 / 解禁池 / 曲绘 md5 名 | 旧站 jubeat-wiki-v3 的 `data/songs.json`（原在 `archive/`，已复制进来以免依赖 gitignore 目录） |

校验值（`data/xlsx/all.json` 里也记了 xlsx 的 sha256）：

```
data/xlsx/source.xlsx              4f0382b1202b43ff61d7f83369a5a874540cb6cd5300ae075e003a8a7ba28f07  94,712 B
data/upstream/jp-resolved.json     0cc35237b6789f46632cbf4b9787a54f586f5b1f4e061b41e5d6a1b559a4bb69  605,897 B
data/upstream/wiki-v3-songs.json   eb3fe063489ceb035e4da2f6f819525689024c382e28fae14bfba30d80d81655  1,353,138 B
```

两份 JSON 是**冻结快照**：日服数据源停更后不再抓，曲库一旦需要更新，就换文件 + 重跑管线，
而不是让脚本去联网。

曲绘分两套源、产物统一成 webp，都已不影响曲库数字：

| 源 | 位置 | 是否在版本控制 |
|---|---|---|
| 日服曲绘原图（`idN.gif`） | `data/beyond-the-ave/jackets/`（31 MB） | 否（`data/.gitignore`） |
| 国服曲绘源（`<hash>.webp`） | `archive/legacy/jubeat-wiki-v3/public/jackets/` | 否（`archive/` 整体 gitignore） |
| 站点实际引用的产物 | `public/assets/images/jackets/*.webp`（1312 张） | 是 |

`build-data.cjs` 只补「产物不存在」的曲绘：实测 `jackets 新增 0`，所以把两个源目录都藏起来
（`data/beyond-the-ave` 与 `archive/` 同时不可见）之后，`npm run db` 仍然重建出 1241 首 / 3723 谱面，
只是新曲绘会进 `missing` 列表等源文件补齐——**曲库数字不依赖任何一张曲绘**。

## 2. 解析约定（parse-xlsx）

- **输入**：`data/xlsx/source.xlsx`（xlsx 本体就是 ZIP，脚本自带 90 行 `readZip`，用 `node:zlib` 的
  `inflateRawSync` 解压，**不需要手工解压、也不装任何 xlsx 库**）。
- **输出**：`data/xlsx/sheet1.json` … `sheet7.json` + `all.json`，与输入同目录、同版本控制。
- 每份 sheet JSON 结构：`{sheetIndex, sheetName, state, hidden, sourceFile, maxRow, maxCol, declaredRange,
  merges, formulaCount, formulas, nonEmptyRowCount, nonEmptyRows, rows}`；`rows` 是「值二维数组」，
  空格子为 `null`（保留原列位，下游按列号取）。
- `all.json` 结构：`{sourceXlsx, sourceSha256, sharedStringCount, sheets:[…]}`。
- 解析覆盖：共享字符串（富文本多 `<r><t>`、剥离 `<rPh>` 注音）、`inlineStr`、数字/布尔/公式缓存值、
  `&#10;` 等数字实体、`&amp;` 等命名实体、合并单元格、空 `<c/>`。
- **踩过的坑**：单元格正则必须自闭合感知。早期写法把 `<c r="F1" s="81"/>` 的斜杠吃进属性，
  再走 `'>'` 分支，会吞掉后面多个单元格 → sheet1 表头整列错位。现存 `scanTags` 逐字符走引号与自闭合。
- 只读不写源文件；换新 xlsx 时把文件放到 `data/xlsx/source.xlsx`（或传 `--xlsx=`），重跑即可。

## 3. 7 张表的口径

详细逐表说明（列语义、分段、统计块、编码坑）见 [`docs/cn-update-xlsx.md`](./cn-update-xlsx.md)，
这里只记「入库时怎么用」。

| # | 工作表 | 可见性 | 用在管线里吗 | 口径 |
|---|---|---|---|---|
| 1 | 国框更新日服歌曲进度 | 可见 | **入库**（H 列 √ 的 432 首 → 标 server_cn=1） | 685 行国服曲库台账：578 个有 SongId 的行 + 12 条 `×` 的 `[2]` 追加谱 + 95 行 beyond 占位。H 列 `√/×/空`，I 列日期或 `解禁I/II - 池名`。右侧 L–V 统计块的 P/Q/R 三列语义**未解**（已穷举排除难度/状态/批次/命中四类解释），不入库 |
| 2 | 国框更新音乐魔方进度 | 可见 | **入库**（国服独有 91 行） | 91 条数据行，SongId 全为 9 位且唯一。A=SongId、B=曲名、C=艺人、D=BPM、E/F/G=BSC/ADV/EXT、H=分类（华立独占 / KONAMI/机种移植 / 音乐魔方原创 / 音乐魔方流行 / 流行（限时））、I=移植机种或联动、J=更新日期 |
| 3 | 国框Jubiility理论值 | **隐藏** | **不入库** | 2026-06-16 版理论值，60 首。与表 4 仅 36 首重合，属历史快照，见 §4 |
| 4 | 国框Jubiility理论值 【20261015】 | 可见 | 暂不入库（波次二用） | 2026-10-15 版，60 首。E 列 Normal 理论值求和 = G2 MAX 8034.7，F 列 = H2 MAX 9641.9，逐行吻合 |
| 5 | 国框跑图II歌曲详情 | **隐藏** | 参考 | 解禁II 五池（CHERRY/KUMQUAT/LIME/BLUEBERRY/RAINBOW）横向并排明细，61 首；与表 1 的 I 列 `解禁II` 完全一致，唯一增量是 Basic/Advanced 定数。**注（2026-10-25）**：此表一直是 61 首，而库里一度只有 55 —— 因为 `unlock_note` 当时只从旧站快照回查，而快照缺 6 首 `[2]` 长押曲（70001001 / 80001002 / 80001003 / 80001004 / 80001014 / 80001015）+ concon(30000127) 的 `解禁I`。已改为以表 1 的 I 列为权威（见 §3 的 unlock_note 行），并加了「解禁I/II 曲数」两条自检 |
| 6 | pick up（10+） | 可见 | 参考 | 定数 10.0–10.9 的 pick up 池统计（68 格，含 3 首同曲双难度）。右侧初出代统计块漏计 `jubeat prop` 1 首（合计 67 ≠ 68），不可当权威。**⚠️ 名字撞车（2026-10-25）**：这里的 "pick up" 是「**高定数曲**」的意思（按定数分池），与页面上的 PICK UP / COMMON **范围筛选**毫无关系——后者指「本世代的重点推荐曲」（日服 bta 世代 / 国服音乐魔方+Ave.+解禁II）。两者同名不同义，接数据时别串 |
| 7 | pick up（9+） | 可见 | 参考 | 定数 9.0–9.9，69 格，左右统计块均与逐行计数吻合 |

### 3.1 songs 表怎么由三份输入拼出来

> **2026-10-24 起**：国服行有两个来源——sheet2 的 91 条国服独有曲，以及 **sheet1 H 列打 √ 的
> 432 首「旧框已有曲」**（它们是日服行，首登于日服各世代，但在国服音乐魔方里可玩）。
> 判定只按官方 songId 精确匹配，不按曲名猜。于是 server_cn=1 共 524 行，其中双服 434 行。

| 字段 | 日服 1150 首 | 国服 524 行（91 国服独有 + 432 旧框已有曲 + 1 Big Daddy 日服行） |
|---|---|---|
| song_id | `jp-resolved.json` 的 `songId`（拿不到官方 id 的 10 首用 `BTA-<曲绘id>` 占位，`id_kind=synthetic`） | xlsx sheet2 的 A 列（9 位） |
| title / artist | resolved.json | sheet2 B / C |
| bpm | **NULL**（源数据没有），从 wiki-v3 快照按 songId 回查，回查不到就留 NULL | sheet2 D（`——` / `—` 归一成 NULL） |
| bsc / adv / ext | resolved.json `levels` | sheet2 E / F / G |
| gen_name | `origin` 剥掉 `jubeat ` 前缀后对齐 12 个日服世代 | 固定 `音乐魔方` |
| server_jp / server_cn | jp=1；命中跨服同曲判定时再置 cn=1；或该 songId 在 sheet1 的 H 列为 √（旧框已有曲）时置 cn=1 | cn=1；命中判定时 jp=1 |
| category | `license`→**授权**、`original`→**原创**（2026-10-24 改名，原名「版权」） | sheet2 H 的 5 种写法归成 4 个分区：`华立独占`→**独占**、`KONAMI/机种移植`→**KONAMI**、`音乐魔方/原创`→**原创**、`音乐魔方/流行`(+限时)→**流行**。**只存源生分类**，不再按「两服都有」改写成 KONAMI——分区归属是视图相关的，由页面层 `catOf()` 现算 |
| alt | resolved.json `alt` | 标题匹配 `[ 2 ]` |
| cover | `jacketFile` 的 `.gif` → `.webp` | wiki-v3 快照的 md5 名 → `.webp`；7 首新曲按 `id<songId>.webp` 回退（素材库 png 或已转档 webp 任一存在） |
| added_at | 从快照回查 | sheet2 J 的 `YYYY.MM.DD` → `YYYY-MM-DD` |
| unlock_note | **解禁池/期次以 sheet1 的 I 列为准**；快照 `unlockPool`/`poolPhase` 只在源表没有该曲时才兜底。`exchangeCost`/`limitedPeriod` 源表没有，仍只取快照 → 合成一句 | sheet2 I（移植机种 / 联动） |

**缺失值一律 NULL，不猜。** 日服 1150 首里 721 首没有占位 id、快照里也不存在，BPM / 上线日期就保持 NULL。

## 4. 历史版本：sheet3 藏起来的旧理论值

- 表 3「国框Jubiility理论值」是 **2026-06-16 版**，被隐藏；表 4 是同名 + `【20261015】`，可见。
- 两表各 60 首，**只有 36 首重合**：表 4 新增 24 首、表 3 独有 24 首；重合曲里只有 Megalara Garuda 定数变了（10.4 → 10.7）。
- 两表的 MAX 都与本表逐行求和严格相等（表 3：7983.7 / 9580.1；表 4：8034.7 / 9641.9）——
  说明 MAX 就是 60 首理论值之和，没有漏算。
- 单曲公式：`Hard = 1.2 × Normal`，Normal 由定数查表（10.4→131.3、10.5→132.5、10.6→133.8、10.7→135.1、10.8→136.3、10.9→137.6）。
- **管线只用表 4**，表 3 仅作历史存档留在 xlsx 里（隐藏状态原样保留，`sheet3.json` 里 `hidden: true`）。
  Jubility 入库属波次二，当前 songs 表不含这两张表的字段。
- 质量提醒：表 3 写 `Advanced`、表 4 写 `Advance`，且两表实际只列 Extreme 一种难度。

## 5. dualKey 与 DUAL_EXTRA：跨服同曲怎么认

两服的 song_id 是两套体系（国服 9 位 `9900/9910/9950` 段，日服 8 位），**不能按 id 关联**，
只能按「曲名 + 艺人」判定是不是同一首歌。

`build-db.cjs` 里的 `dualKey(v)` 是这条匹配的归一化键：

```js
lowercase → 去掉 [ 2 ] 长押标记 → 去掉所有空白 → 去掉 ~～—－・·!！?？'’“”「」『』()（）[]【】.,、-
```

双向用法：

1. 先用日服全部 1150 首建 `Map<dualKey(title)|dualKey(artist), title>`；
2. 国服行拿同一个键去查，命中即 `server_jp = 1`（只标标志位，不参与分区判定）；
3. 国服命中行的键收集进 `cnDualKeys`，日服循环把这些行也标 `server_cn = 1`。
   日服侧的 `[ 2 ]` 长押行靠 `dualKey` 抹掉后缀后同样命中，所以「两服都有」是双向一致的。

当前结果：只有 **2 行** 同时 `server_jp=1 AND server_cn=1`——Big Daddy（USAO），
日服行 `11000228`（beyond the Ave.，授权）+ 国服行 `991000007`（音乐魔方，原创）。
   注：2026-10-24 主人明确「国服的 Big Daddy 属于原创分区」，于是废弃了「两服都有→KONAMI」的自动改判。
国服「KONAMI」区 = 13 首机种移植曲（日服没有）+ **432 首旧框已有曲**。
   旧框曲的识别不靠新增字段，用世代区分：旧框曲是「国服已上线的日服曲」，gen_name 是日服世代
   （jubeat…beyond the Ave.）；国服音乐魔方自己的曲（含 Big Daddy 国服行）gen_name 一律是「音乐魔方」。
   实测国服 524 行里 gen!=='音乐魔方' 的正好 433 行 = 旧框 432 + Big Daddy 日服行 1（该行在国服视图已被去重）。
   所以 `catOf()` 里 `srv==='cn' && gen!=='音乐魔方' → KONAMI`，Big Daddy 国服行仍留在原创。

`DUAL_EXTRA` 是**逃生口**：当曲名写法差太多、`dualKey` 归一化后仍对不上、但人工确认是同一首时，
往里加一条 `dualKey(国服曲名) → true`。当前它是**空的**（现有数据用归一化键就能全部覆盖），
留着是为了以后遇到「日文名 / 英文名各写一遍」这类情况时不必改匹配算法。

## 6. seed 的最终形态：单文件 + 语句内切分

`db/seed.sql` 是**单文件、纯生成物**（不要手改），结构是：

```
-- 注释头（生成方式、灌库命令、切分说明）
数据表的幂等 DDL（CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS，无 DROP）
INSERT OR REPLACE INTO songs(...) VALUES ...   ← 2 条语句
ANALYZE;
```

### 6.1 为什么以前要切文件，现在不用了

D1 的限制是「**单条 SQL 语句** ≤ 100,000 bytes」（官方 Limits 页：Maximum SQL statement length 100,000 bytes），
不是文件大小——`d1 execute --file` 的文件上限是 5 GB。历史上的 `db/seed-parts/part-001..006.sql`
是因为一条塞不下才按「文件」切，六份文件各带一遍整套 schema，重放时重复建表，纯属副作用。

实测（本机 Node v22.22.0 / node:sqlite，输出可直接复现）：

```
songs 1241 行，单个 tuple 合计 174,864 B
若只用一条 INSERT：178,738 B  → 超 100,000 B 上限（也会触发 SQLITE_TOOBIG）
按 90 KB 切分：  2 条（644 行 / 92,052 B + 597 行 / 86,836 B）
若改成一行一条 INSERT：1241 条，总 364,738 B（语句数多 600 倍，D1 导入反而更慢）
```

所以切分保留、但切在**同一文件内的语句之间**，切点 90 KB（留 10 KB 余量给列名前缀与换行）。
`build-db.cjs` 生成后自己复核每条语句字节数，超 100,000 B 直接 `FAIL` 并以非零码退出，
不用等 wrangler 报错才发现。`db/seed-parts/` 已删除。

D1 官方文档同时写明：`db.batch()` 里的每条语句各自受这条 100 KB 限制（batch 不豁免）。

### 6.2 seed 不含用户系统，重灌曲库不会注销账号

早期 `seed.sql` 整份内嵌了 `db/schema.sql`（含 `DROP TABLE songs/recent_changes/users/sessions/oauth_accounts/role_requests`）。
线上 D1 已经有真实用户之后，把这份 seed 重放一遍等于清空账号表。

现在 `build-db.cjs` 只取 `schema.sql` 里**用户系统之前**的那一段（songs / recent_changes 及索引），
去掉所有 `DROP TABLE`、把建表语句改成 `IF NOT EXISTS`，用户系统的表交给 `db/migrate-users.sql`。

实测一（node:sqlite 直放，先建用户表并写入 1 条用户）：

```
首次重放：songs 1241 / charts 3723 / users 仍 1 行 / 11 个索引 / sqlite_stat1 8 行 / 132 ms
再重放一次（幂等）：songs 1241 / users 仍 1 行 / 79 ms
```

实测二（本机 `wrangler d1 execute --local`，走真实 D1 导入路径，库里已有 3 条用户）：

```bash
npx wrangler d1 execute beyond-jubeat --local --file=db/seed.sql
npx wrangler d1 execute beyond-jubeat --local --command="SELECT (SELECT COUNT(*) FROM songs) songs,
  (SELECT COUNT(bsc)+COUNT(adv)+COUNT(ext) FROM songs) charts, (SELECT COUNT(*) FROM users) users"
```

```
songs 1241 / charts 3723 / users 3（未被清空）/ 索引 17 个
```

> Windows 上跑 wrangler 要把 `TMP`/`TEMP` 指到项目内真实目录（默认 `/tmp` 不成立，workerd 会报
> `CreateDirectory: 拒绝访问`）。这只影响本地 wrangler，不影响 `npm run db`。

### 6.3 灌线上 D1 的顺序

```bash
# 1) 新库先建用户系统表（幂等，老库跑也无害）
npx wrangler d1 execute beyond-jubeat --remote --file=db/migrate-users.sql
# 2) 再灌曲库数据（幂等，只替换 songs 行，不碰用户表）
npx wrangler d1 execute beyond-jubeat --remote --file=db/seed.sql
```

本地从零建库不需要这两步，`npm run db` 已经用 `db/schema.sql` 建好了。

## 7. 目录约定小结

```
data/
├─ xlsx/
│  ├─ source.xlsx        国服更新表原件（改名避开非 ASCII 路径）
│  ├─ sheet1..7.json     parse-xlsx 产物
│  └─ all.json           解析元数据（含 sourceSha256）
├─ upstream/
│  ├─ jp-resolved.json   日服 1150 首冻结快照
│  └─ wiki-v3-songs.json 日服旧站 513 首快照（补 BPM/日期/解禁）
├─ beyond-the-ave/       曲绘原图等大素材（31 MB，gitignore 之外的本地素材）
└─ jubeat.db             本地权威库（不出网，重灌用 db/seed.sql）

db/
├─ schema.sql            本地全量 DDL（含 DROP，别对线上跑）
├─ migrate-users.sql     线上用户系统增量（IF NOT EXISTS）
└─ seed.sql              生成物：幂等数据 DDL + INSERT + ANALYZE
```

`scripts/tmp/` 与 `archive/` 都在 `.gitignore` 里，**管线不再读它们**：清空 `scripts/tmp/` 后
`npm run db` 依然能从 `data/` 重建出 1241 首 / 3723 谱面。
