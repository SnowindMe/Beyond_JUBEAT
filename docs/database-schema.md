# 数据库表结构

> 面向：要改数据、加列、写查询的人。
> DDL 权威是 [db/schema.sql](../db/schema.sql)（本地建库用，含 DROP，**别对线上跑**）；
> 线上增量是 [db/migrate-users.sql](../db/migrate-users.sql)；
> 生成物是 db/seed.sql（全量）与 db/patch.sql（增量，日常灌线上用）。
> 本文数字实测于 **2026-11-04，v1.64.3**（songs 段仍是 2026-10-28 那批口径），
> 复算命令写在每节末尾——数据会变，别当定值背。

## 0. 一句话总览

十七张表，分三类，**性质完全不同，绝不能同框清空**：

| 类别 | 表 | 数据来源 | 清空后能否重建 |
| --- | --- | --- | --- |
| **曲库数据** | songs | npm run db 从 data/ 全量推导 | **能**（重跑就有） |
| **曲库缓存修订** | song_rev（单行） | 后台改曲目时 bump | **能**，从 0 起步即可 |
| **运行时数据** | recent_changes / users / sessions / oauth_accounts / role_requests / song_tags / song_alias | 站点运行中被写入 | **不能**，是真实用户与编辑记录 |
| **计数缓存** | hot_hits / hot_snapshots / hot_ip_days / hot_gaps / auth_ip_minutes / auth_ip_hours / auth_email_ip_hours / auth_email_ip_days / auth_email_hours | 访问与登录时累加 | **能**，但会丢当天的热度与限流窗口 |

这条区分不是洁癖，是 2026-10-28 实际踩出来的：seed.sql 曾带 DELETE FROM recent_changes;
一次「重灌曲库」会把所有真人编辑记录删光且无法重建（已修）。详见 §6。
2026-11-04 那批计数表全部**不进 seed.sql**，理由相同：它们是坡上的雪，不是底图。

---

## 1. songs —— 曲库主表

**一行 = 一首曲**（不是一份谱面）。三难度定数 bsc / adv / ext 是三列，不是三行。
当前 **1269** 曲 / **3807** 谱面（3807 = bsc、adv、ext 三列的 COUNT 之和）。

| 列 | 类型 | 含义与取值 |
| --- | --- | --- |
| song_id | TEXT PK | 官方 songId。日服 8 位（10…–90… 段按世代），国服 9 位（99… 段）；拿不到官方 id 的用 BTA-<曲绘id> 占位（12 字符） |
| id_kind | TEXT | official / synthetic（占位） |
| title | TEXT NOT NULL | 曲名。[ 2 ] 谱面的行带 [ 2 ] 后缀（**[ 2 ] ≠ 长押**，见 alt 与 has_hold） |
| artist | TEXT | 作曲者 |
| bpm | TEXT | **字符串**（源数据有 "145" 也有空），不是数字 |
| gen_name | TEXT NOT NULL | 世代名，13 个：jubeat / ripples / knit / copious / saucer / saucer fulfill / prop / Qubell / clan / festo / Ave. / beyond the Ave. / 音乐魔方 |
| server_jp | INTEGER NOT NULL | 1 = 日服有谱 |
| server_cn | INTEGER NOT NULL | 1 = 国服有谱 |
| category | TEXT NOT NULL | **源生分类**，不是页面分区（见 §1.2） |
| bsc / adv / ext | REAL | 三难度定数；空 = 该难度不存在 |
| alt | INTEGER NOT NULL | 1 = **该行是 [ 2 ] 谱面**（标题带 [ 2 ]）。**不代表有长押**，长押看 has_hold（主人 2026-10-31 纠正） |
| has_hold | INTEGER | 长押谱判定：1 = 至少一个难度有长押；0 = 三难度都没有；**NULL = 没抓到（未知）**。来自 remywiki（见 §1.4） |
| notecounts | TEXT | 各难度总键数 JSON，如 {"bsc":414,"adv":491,"ext":805}；NULL = 未知 |
| holds | TEXT | 各难度长押数 JSON，形状同 notecounts |
| cover | TEXT | 曲绘文件名。日服源是 id<N>.gif、库里统一存 .webp |
| added_at_jp | TEXT | 日服上线/首登日 YYYY-MM-DD；NULL = 未知（迁移后**全空**，上游没给日服日期） |
| added_at_cn | TEXT | 国服上架日 YYYY-MM-DD；NULL = 未知。**拆列时旧 added_at 的日期全搬到这里**（见 §1.3） |
| unlock_note | TEXT | 解禁池/联动来源，人类可读，如 解禁II - BLUEBERRY |
| limited_until | TEXT | 限时曲结束日；NULL = 非限时。**只存日期不存布尔**——判定要按真实今天算，存布尔会在生成那天焊死 |

**索引**（4 个，各有明确用途，别随手删）：

| 索引 | 列 | 服务的查询 |
| --- | --- | --- |
| idx_songs_jp_gen | (server_jp, gen_name) | 日服按世代分组 |
| idx_songs_cn_cat | (server_cn, category) | 国服按分区计数 |
| idx_songs_title | (title) | 搜索/查重 |
| idx_songs_order | (gen_name, ext DESC) | 主导出 ORDER BY gen_name, ext DESC，免 TEMP B-TREE 全表排序 |

### 1.1 服务器标志与实际分布

一行 = 该曲在某服的存在性。双服曲不一定是两行，别假设：

| server_jp / server_cn | 行数 | 含义 |
| --- | --- | --- |
| 1 / 0 | **725** | 纯日服曲 |
| 1 / 1 | **440** | 两服都有（国服「旧框已有曲」432 + 移植曲 + 6 首人工指定） |
| 0 / 1 | **104** | 国服独有（音乐魔方自有曲） |
| 合计 | **1269** | 725 + 440 + 104 |

另有两条要单独盯住的行：占位 id（id_kind='synthetic'）共 **14** 条（全部是 2026-11-22 新增的日服 U'nit 世代曲，id 形如 `unit-001`，见 §1.5；两首 hololive 曲已于 2026-11-12 改官方 id，见 1.4）、限时曲（limited_until 非空）共 **2** 条。

复算：

    node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('data/jubeat.db',{readOnly:true});console.table(d.prepare('SELECT server_jp jp,server_cn cn,COUNT(*) n FROM songs GROUP BY 1,2').all())"

### 1.2 category ≠ 页面分区

songs.category 存的是**源生分类**，页面上的分区由 src/lib/song-view.ts 的 catOf() **现算**（不入库）：

| category | 行数 | 说明 |
| --- | --- | --- |
| 原创 | 966 | 日服原创 + 国服音乐魔方原创 |
| 授权 | 226 | 日服授权曲（原名「版权」，2026-10-24 改名） |
| 流行 | 43 | 国服音乐魔方/流行 |
| 独占 | 19 | 华立独占（源表精确词） |
| KONAMI | 15 | 机种移植 |

**关键**：国服视图下 gen_name != '音乐魔方' 的行一律由 catOf() 归入 **KONAMI** 分区
（那 432 首旧框曲在库里 category 仍是 原创，但页面上显示在 KONAMI）。
所以「按 category 数国服分区」会算错——必须走 catOf()。

### 1.3 空值不是 bug

| 列 | 空值行数 | 原因 |
| --- | --- | --- |
| bpm | **0 / 1269** | 2026-10-31 曾清零一次；2026-11-16 新增的 7 首音乐魔方曲 BPM 一度为空（音游街接口不提供 BPM），2026-11-19 主人直接给值后已全部补进 `data/chart-overrides.json` 的覆盖层（165/180/128/128/96/128/144），当前全库无空值 |
| added_at_cn | **725 / 1269** | 来源六处，按优先级：人工覆盖表 `data/cn-online-overrides.json`（单点改）→ 解禁池常量 `UNLOCK_DATES`（整池同日，见下）→ 国服更新表（xlsx）→ 旧站快照 → 兜底常量 `CN_REMAINDER_DATE`。**覆盖层的 date 优先生效**（2026-11-17 修：此前该层只置 server_cn、date 被丢弃，写了也白写）。剩余空值全是 `server_cn=0` 的日服独有曲 |
| — | 兜底日期 | 2026-11-18 主人指令：`server_cn=1` 且 `added_at_cn` 为空的曲一律记 `2025-12-27`。写在 `build-db.cjs` 的 `CN_REMAINDER_DATE`，排在所有显式来源之后，只对国服在线的行生效 |
| — | 解禁池日期 | 解禁曲整池同日上架，2026-11-17 主人给：解禁I 非 RAINBOW 线 `2025-12-27`、解禁I RAINBOW 线 `2026-02-11`、解禁II 全部 `2026-06-30`。写在 `scripts/db/build-db.cjs` 的 `UNLOCK_DATES`，一首首铺覆盖层太啰嗦；个别曲要单点改仍走覆盖层 |
| added_at_jp | **1269 / 1269** | 2026-11-16 拆列时按主人指令把旧 `added_at` 的日期**全搬进 `added_at_cn`**（实测 171 行全在国服侧），日服这一列迁移后整列空、等上游给首登日 |
| unlock_note | **1039 / 1269** | 只有解禁池曲目有 |
| has_hold | **0 / 1269** | **已全部确定**。最后 3 首音乐魔方曲（990000021 アクマデ、995000004 新年快乐、995000021 Will We Shine）是已结束的限时曲、音游街列表里已下架，由主人手动打开详情页抓包取到。**NULL ≠ 0** 的约定仍然有效：0 是「确定三难度都没长押」，只是现在没有未知行了 |
| artist / cover / bsc | 0 | 必有 |

> 别看到「1084 行为空」就以为数据缺了——**源里就没有**。用 COALESCE 处理显示，
> 不要自己猜值填进去（schema 约定：「缺失值一律 NULL，不猜测填充」）。

### 1.4 RemyWiki 谱面数据（2026-10-31）

主人要求接入 remywiki 的 jubeat 谱面信息：**是否长押谱 / 各难度总键数 / 各难度长押数**，外加回填 BPM。

| 项 | 值 |
| --- | --- |
| 来源 | remywiki 单曲页的 jubeat 难度表，抓取产物 data/remy/jubeat-charts.json（1138 条，含 [ 2 ] 变体）+ 榜单外补充页 8 条（见 data/remy/README.md） |
| 入库输入 | data/remy/by-song-id.json（按 song_id 归并好的快照，build-db.cjs 回填） |
| 有键数的行 | 1269（快照 + 人工补录 176，2026-11-01 按 ub 物量校正后补满，2026-11-16 再由音游街补 10 首） |
| 长押谱（has_hold=1） | **332** |
| 长押未知（has_hold IS NULL） | **12** |
| 回填 BPM | 新增 722 行、改写 22 行 |

判定规则（细节与反例见 data/remy/README.md）：

- **长押看 Notecounts 行的「值」，不看标签**：值形如 379 / 19 = 总键数 / 长押数，单值 = 该难度无长押。
  反例：1116 的通常谱标签写 Notecounts 但值是两数。
- **必须锚定 jubeat 小节再取表**：GF/DM 的难度表表头同样是 Basic/Advanced/Extreme，不锚定会取到 GF/DM 的音数（曾误 213 条）。
- **has_hold 与 alt 无关**：alt=1 只表示「这行是 [ 2 ] 谱面」——[ 2 ] 谱绝大多数有长押，但判定必须来自 holds 数值本身（主人 2026-10-31 纠正）。
- BPM 多机种写法（如 BPM: 175 (DanceDanceRevolution), 170 (jubeat)）取**括号里提到 jubeat 的那个**。
- **同一 ### jubeat 段下可能挂多张子表**（`#### jubeat音乐魔方 Charts` / `#### jubeat (2026) Charts` …），解析器默认取第一张。
  目前只有 **Big Daddy** 撞上：音乐魔方那张是 `? ? ?` 占位、jubeat (2026) 那张是 313/10 · 725/23 · 904/35。
  主人 2026-10-31 判定「抓出来的 bpm 和 hold 是 BTA 的（songId 11000228）」→ 只补给 beyond the Ave. 行，
  国服行 991000007 的音乐魔方谱**保持未知**，不许拿 BTA 的数冒充（生成器里是一个显式 OVERRIDES 表）。

**为什么用快照 + UPDATE 回填、而不是塞进三条 INSERT**：快照按 song_id 归并，
与「日服 / 国服 / 国服独有新增曲」三条插入路径无关；塞进 INSERT 要改三处、还会出现「日服加了、国服忘了」的漏参。
回填与三条自检断言都在 build-db.cjs 里，期望值从快照现算。

### 1.4 songId 段位（改 id 前必看）

| 前缀 | 行数 | 归属 |
| --- | --- | --- |
| 50… | 267 | saucer 系 |
| 90… | 227 | beyond the Ave. |
| 11… | 218 | 国服旧框/双服（2026-11-12 两首 hololive 曲改回官方 id 后 +2） |
| 70… | 121 | Ave. |
| 80… | 113 | festo 前后 |
| 99… | 105 | **国服音乐魔方**（9 位） |
| 60… | 91 | Qubell |
| 40… | 40 | copious |
| 30… | 28 | knit |
| 20… | 25 | ripples |
| 10… | 20 | jubeat |
| BTA- | 0 | 占位（2026-11-12 归零） |
| unit- | 14 | **日服 U'nit 世代占位 id**（2026-11-22，官方 id 未公布，见 §1.5） |

合计 267+227+218+121+113+105+91+40+28+25+20+14 = 1269（音乐魔方由 98 增至 105，含 2026-11-16 新增的 7 首国服独有曲；unit- 14 条为 2026-11-22 新增日服 U'nit 世代）。

原先的 2 条占位（BTA-83105461 ギミギミエンターテイメント、BTA-67975257 夢色ワンダー）
2026-11-12 由主人给了官方 id（**11000244 / 11000243**），已写进 `data/id-fixes.json`，
官方 id 行不再有 `id_kind='synthetic'`；当前全库唯一一批占位行是 U'nit 的 14 条 `unit-NNN`（见 §1.5）。改 id 时注意：RemyWiki 快照是按**上游** song_id 归并的，
build-db 会先把「已从库里消失的旧 id」翻成新 id 再回填，否则这两首的谱面数据会静默丢掉。

---

### 1.5 日服 U'nit 世代（2026-11-22 接入）

日服新世代 **U'nit**，官方正式上线日未公布（站点先显示 `Soon`），曲目全部来自 Location Test。

| 项 | 值 |
| --- | --- |
| 数据源 | `data/unit-songs.json`（手写，14 首；抓自 remywiki `AC_jb_U'nit` 的 Location Test Songs 表） |
| 入库路径 | `build-db.cjs` 的 `readUnitSongs()` + 一段独立 INSERT（`gen_name="U'nit"`、`server_jp=1`、`server_cn=0`、`id_kind='synthetic'`） |
| song_id | 官方 id 未公布，用占位 `unit-001` … `unit-014`（**改官方 id 时同 §1.4 的注意事项**） |
| 分区 | Licensed（授权）1 首 = 朧；KONAMI originals（原创）13 首 |
| 谱面 | 键数 / 长押数写进 `notecounts` / `holds`（JSON），`has_hold` 由这两列派生；只有 Myth Collapse(43)、荒海の戦い(71) 有长押 |
| 曲绘 | `src/data/cdn.json` 的 jackets 映射，key 是 `idunit-NNN.webp`；5 首有官方曲绘，其余 9 首共用占位图 |
| 自检 | build-db 一致性断言多一条「U'nit 曲目 = 文件条数」 |

**为什么单独一份 JSON 而不是并进 jp-resolved.json**：jp-resolved 是上游抓取产物、会被 `data:pull` 覆盖，
U'nit 目前只有手抓的 14 首、没有稳定上游；单独成文件既能先上线，也不会在下次 pull 时被冲掉。

---

## 2. recent_changes —— 最近更改（运行时表）

**写入口**：/api/admin/song-update（src/lib/song-admin.ts 的 SQL_RECENT_INSERT）。
**读入口**：/recent/ 页（src/lib/db.ts 的 getRecentChanges，不缓存，倒序取 200 条）。

| 列 | 含义 |
| --- | --- |
| change_id | INTEGER PK AUTOINCREMENT |
| changed_at | ISO 时间 |
| user | 谁改的（display_name） |
| target_label / target_href | 改了哪个页面（显示用 + 链接） |
| summary | 改了什么 |
| before_text / after_text | 改前 / 改后 |

> **这是运行时数据**。data/ 里没有它的来源，生成器眼里它恒为 0 行。
> 任何「清空以对齐目标状态」的逻辑都不能碰它——这就是 §6 那条铁律的由来。

---

## 3. 用户系统（4 张表）

### 3.1 身份模型（主人 2026-10-23 定）

| 身份 | role | 怎么获得 |
| --- | --- | --- |
| 游客 | （不是表里的行） | 没登录 |
| 玩家 | player | 注册即得 |
| 维护者 | maintainer | 玩家自荐（role_requests）→ 站长审批 |
| 站长 | owner | 只有主人一个，**直接在 D1 里改**，站点不提供提权入口 |

### 3.2 users

user_id（随机，不暴露邮箱）/ email（唯一，统一小写）/ display_name（可改、不必唯一）/
pass_hash / role / status（active / suspended）/ created_at / updated_at / last_login_at。

**密码存储格式**：pbkdf2$<迭代次数>$<salt-b64>$<hash-b64>
—— PBKDF2-SHA256 + 每用户独立盐，**迭代次数存在 hash 串里**，未来升级算法不需要认字段。

### 3.3 sessions

token_hash 是 **sha256(cookie token)，不是 token 本体**。cookie 里放随机 token，库里只存哈希
——库被拖走也拿不到能直接用的 cookie。expires_at 过期即无效，ua_hash 只记录不作废。

### 3.4 oauth_accounts

(provider, provider_uid) 复合主键，一个用户可绑多个第三方账号。**二期才接回调，表已建好**。

### 3.5 role_requests

state = pending / approved / rejected。
有一条**部分唯一索引**保证「同一用户同时只有一条待审」：

    CREATE UNIQUE INDEX idx_role_req_pending ON role_requests(user_id) WHERE state = 'pending';

---

## 3.6 song_rev —— 曲库缓存修订号（单行表，2026-11-04）

    id INTEGER PRIMARY KEY CHECK (id = 1) / rev INTEGER NOT NULL DEFAULT 0 / changed_at TEXT

曲目已改由构建期快照提供（src/lib/song-data.ts 读 ASSETS 的 /data/songs.json，
缓存 key 是 ?v=<内容版本>&r=<rev>）。所以**后台改一条曲目，光 UPDATE songs 是不会让线上变样的**，
必须同时把 rev +1，各 PoP 的缓存 key 才会一起换。

用独立行而不是 songs 的 MAX(rowid)：rev 要能在「只改字段、不加行」时也变。
初始化靠 schema 里的 INSERT OR IGNORE INTO song_rev (id, rev) VALUES (1, 0)。
线上增量脚本是 db/migrate-p0.sql 的第 2 段（含本表与 hot_ip_days / hot_gaps）。

---

## 3.7 热度计数（4 张表，2026-11-03 / 11-04）

| 表 | 主键 | 用途 |
| --- | --- | --- |
| hot_hits | (day, song_id, visitor) | 原始打点。「一个访客对一首歌一个日历日一行」= 去重即表约束，热度口径是**独立听众数** |
| hot_ip_days | (day, ip_hash) | 每 IP 当天总次数与最近一分钟次数，n / min_key / min_n 同一行，一次 upsert + RETURNING 全拿到 |
| hot_gaps | key | 同人同曲 60 秒节流，expires 到期即失效 |
| hot_snapshots | date | 日榜快照，entries 是 JSON 文本，seeded=1 表示样本不足、按 seed 补位 |

前两张的写入不再有任何 COUNT 扫描：早期每次打点都扫 hot_hits 并用 KV 计分钟数，
2026-11-04 全并进 D1 的单行 upsert（见 src/lib/hotStore.ts）。

## 3.8 鉴权限流（5 张表，2026-11-04）

auth_ip_minutes / auth_ip_hours / auth_email_ip_hours / auth_email_ip_days / auth_email_hours。

粒度是「每 IP 每分钟 10 / 每小时 200 / IPv4 前三段并表每小时 1000」，
登录另加「邮箱+IP 每小时 20 / 每天 200 / 邮箱不分 IP 每小时 20」。
表结构统一是 (key, n) 加换窗用的 minute / hour / day 列，写法和 hot_ip_days 一样：
单行 upsert + CASE WHEN 换窗 + RETURNING，一次往返。计数是近似的（允许边界多放几个）。

限流排在 Turnstile 之前——Turnstile token 一次性，先验再被 429 挡掉就得重新过人机。
窗口外的旧行由 dropSweep 随请求清掉、挂 waitUntil。线上增量脚本：db/migrate-auth.sql。

## 3.9 song_tags —— 曲目标签（运行时表，2026-11-19）

详情页每个难度下面一栏（配置 / 难度 / 评价），玩家点一下即投一票。

| 列 | 说明 |
| --- | --- |
| song_id / diff / kind / name | 联合主键。diff 限 bsc/adv/ext，kind 限 cfg/lv/eval，name 是标签原文（词表在 src/lib/song-tags.ts，三处共用一份） |
| count | 多少人打过这一条。同一人重复提交同一条被 IGNORE 吃掉，**去重靠主键不靠代码判断**。2026-11-20 起页面**不再印数字**，只用于排序与「是否还有别人」，别再拿它当展示字段 |
| by_user | 首个打标者；只用来看「这条是不是我打的」，人数仍以 count 为准 |
| created_at | 首次出现时间 |

它是运行时数据，**不进 seed.sql**：重灌曲库不清它。词表种子在 data/song-tags.json，
入库后以库里的 count 优先、覆盖种子；库里没有的词照样能提交（自填）。
删除用 delete 标记（POST del:true），count 减到 0 即删行。线上增量脚本：db/migrate-song-tags.sql。

## 3.10 song_alias —— 曲目别名（运行时表，2026-11-20）

别名（俗称）复用标签的设计，但**无需审核、也不展示创建者**，词钮是复制按钮不是投票钮。

| 列 | 说明 |
| --- | --- |
| song_id / name | 联合主键，name 是自由文本（上限 40 字，归一化见 src/lib/song-alias.ts），同名同曲自然去重 |
| by_user | 创建者；只用来判断「这条是不是我加的、能不能删」，页面不印 |
| created_at | 排序用 |

同样不进 seed.sql，线上增量脚本：db/migrate-song-alias.sql。

---

## 4. 全部索引清单（**17** 个）

| 表 | 索引 |
| --- | --- |
| songs | idx_songs_jp_gen / idx_songs_cn_cat / idx_songs_title / idx_songs_order |
| recent_changes | idx_recent_changed_at（倒序）/ idx_recent_changed_at_asc（归档清理用） |
| users | idx_users_email（UNIQUE） |
| sessions | idx_sessions_user / idx_sessions_exp |
| oauth_accounts | idx_oauth_user |
| role_requests | idx_role_req_pending（UNIQUE 部分索引）/ idx_role_req_state |
| hot_hits | idx_hot_hits_day_ip（主键已覆盖 day+song，不再另建） |
| hot_ip_days | idx_hot_ip_days_day |
| hot_gaps | idx_hot_gaps_exp |
| song_tags | idx_song_tags_song（前缀 song_id，详情页一次取全） |
| song_alias | idx_song_alias_song（同上） |

> 【2026-11-04 复查】索引从 11 涨到 15 是热度与限流那批表带来的，不是随手加的。
> 同一天删掉了 idx_hot_hits_day_song（主键 (day, song_id, visitor) 的最左前缀与它完全重复）；
> idx_songs_jp_gen / idx_songs_cn_cat 留着——收益确实归零，但连带面大
> idx_songs_jp_gen / idx_songs_cn_cat 收益归零仍留着的理由：它们被查询层按「服务端 + 世代 / 分类」
> 直接拼进 WHERE，删掉要同时改四处查询与三份口径文档，收益只是几百 KB——2026-11-04 复查时判定
> 不值这个连带面。

复算：

    node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('data/jubeat.db',{readOnly:true});console.log(d.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all().length)"

---

## 5. 本地库与线上 D1 的关系

本地 data/jubeat.db（SQLite，gitignore）与线上 Cloudflare D1 beyond-jubeat
（id 91a48a18-62b2-4933-9214-788205926744）**同一份 DDL、同一份数据**。

| 动作 | 命令 |
| --- | --- |
| 重建本地库 + 站点 JSON | npm run db |
| 只重生成站点 JSON（库已就绪） | npm run data |
| **日常灌线上**（增量） | npm run patch → wrangler d1 execute … --file=db/patch.sql |
| 从零建库（人工决策） | migrate-users.sql → seed.sql |

本地库里五张非曲库表都是 **0 行**——用户系统只存在于线上 D1，本地只建结构。

---

## 6. 灌库规则

> **铁律：除非必要，不要对线上 D1 做全量灌表。**（主人 2026-10-28）

理由不是慢，而是误伤收不回来：线上 D1 同时装着**可重建的生成物**（songs）与
**不可重建的运行时数据**（recent_changes、users、sessions……）。全量重放等于用
「清空 + 重建」去换「改三行」。

日常改数据走增量：npm run patch 对比 git HEAD:db/seed.sql 与当前 seed，
只输出受影响行的 INSERT / UPDATE（仅变化列）/ DELETE（带主键条件）。
脚本末尾有两条自检：patch 里出现整表 DELETE 直接 FAIL；解析行数必须等于 seed 自己标注的行数。

patch 的边界（2026-11-16 定稿）：时间字段只逐行写值，不做「整列回填」；一次 patch 里只要出现
`DELETE FROM songs;`（无 WHERE）就算失败。灌线上时 token 需 D1 Edit 权限，走 REST `/query`
分批（每批 100 条、失败即停），不要用 `wrangler d1 execute --file` 直接跑整文件——
它会在上传后因 API 超时中断，而中断时 SQL 可能已经执行了一半，得改成逐条 `--command`。

---

## 7. 加一列要改几处（血泪清单）

加一个新列涉及 **五处**，少一处就出现「数据在库里、页面是空的」：

1. db/schema.sql（本地 DDL）
2. scripts/db/build-db.cjs：**按列的性质二选一**——
   - 来自「日服 / 国服 逐行输入」的列 → 改 INSERT 列名 + 参数（**两条 ins.run 都要补**，参数个数不匹配会直接抛）；
   - 来自「按 song_id 归并的旁路快照」的列 → 在 COMMIT 前加一段 UPDATE 回填（2026-10-31 的 has_hold / notecounts / holds / bpm 就是这类）。
     注意：凡在事务里算、事务外还要用的变量，不许用 const 声明在 try 块内 —— expect 那一段在事务外取不到它
     （本次实撞：ReferenceError: bpmNullBefore is not defined）。
3. scripts/build-data.cjs 的导出字段映射（SONGS 的短键）
4. src/lib/db.ts 的 SQL_ALL / SQL_ONE / rowToSong（**这处最容易漏**——漏了数据在库里但页面读不到）
5. 线上：先 ALTER TABLE ADD COLUMN 再灌数据（分两步，别一把梭）
6. docs/database-schema.md 的列表 + 计数：scripts/ci/check-schema-doc.cjs 会把数字变成断言，
   且模板里的 {n} 由**实测值**填 —— 文档写旧数字就 FAIL（2026-10-31 改前它只查「那句老话在不在」，数据变了还假绿）

实撞记录：2026-10-28 加 limited_until 时，前三处都改了，漏了第 4 处，
表现为「库里有值、页面是空的」。
