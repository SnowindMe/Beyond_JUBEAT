# 数据库表结构

> 面向：要改数据、加列、写查询的人。
> DDL 权威是 [db/schema.sql](../db/schema.sql)（本地建库用，含 DROP，**别对线上跑**）；
> 线上增量是 [db/migrate-users.sql](../db/migrate-users.sql)；
> 生成物是 db/seed.sql（全量）与 db/patch.sql（增量，日常灌线上用）。
> 本文数字实测于 **2026-10-28，v1.31.2**，复算命令写在每节末尾——数据会变，别当定值背。

## 0. 一句话总览

六张表，分两类，**性质完全不同，绝不能同框清空**：

| 类别 | 表 | 数据来源 | 清空后能否重建 |
| --- | --- | --- | --- |
| **曲库数据** | songs | npm run db 从 data/ 全量推导 | songs **能**（重跑就有） |
| **运行时数据** | recent_changes / users / sessions / oauth_accounts / role_requests | 站点运行中被写入 | **不能**，是真实用户与编辑记录 |

这条区分不是洁癖，是 2026-10-28 实际踩出来的：seed.sql 曾带 DELETE FROM recent_changes;
一次「重灌曲库」会把所有真人编辑记录删光且无法重建（已修）。详见 §6。

---

## 1. songs —— 曲库主表

**一行 = 一首曲**（不是一份谱面）。三难度定数 bsc / adv / ext 是三列，不是三行。
当前 **1241** 曲 / **3723** 谱面（3723 = bsc、adv、ext 三列的 COUNT 之和）。

| 列 | 类型 | 含义与取值 |
| --- | --- | --- |
| song_id | TEXT PK | 官方 songId。日服 8 位（10…–90… 段按世代），国服 9 位（99… 段）；拿不到官方 id 的用 BTA-<曲绘id> 占位（12 字符） |
| id_kind | TEXT | official / synthetic（占位） |
| title | TEXT NOT NULL | 曲名。长押谱带 [ 2 ] 后缀 |
| artist | TEXT | 作曲者 |
| bpm | TEXT | **字符串**（源数据有 "145" 也有空），不是数字 |
| gen_name | TEXT NOT NULL | 世代名，13 个：jubeat / ripples / knit / copious / saucer / saucer fulfill / prop / Qubell / clan / festo / Ave. / beyond the Ave. / 音乐魔方 |
| server_jp | INTEGER NOT NULL | 1 = 日服有谱 |
| server_cn | INTEGER NOT NULL | 1 = 国服有谱 |
| category | TEXT NOT NULL | **源生分类**，不是页面分区（见 §1.2） |
| bsc / adv / ext | REAL | 三难度定数；空 = 该难度不存在 |
| alt | INTEGER NOT NULL | 1 = 长押谱 |
| cover | TEXT | 曲绘文件名。日服源是 id<N>.gif、库里统一存 .webp |
| added_at | TEXT | 上线/解禁日 YYYY-MM-DD，**多数为空**（见 §1.3） |
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
| 1 / 0 | **717** | 纯日服曲 |
| 1 / 1 | **434** | 两服都有（国服「旧框已有曲」432 + 移植曲） |
| 0 / 1 | **90** | 国服独有（音乐魔方自有曲） |
| 合计 | **1241** | 717 + 434 + 90 |

另有两条要单独盯住的行：占位 id（id_kind='synthetic'）共 **2** 条、限时曲（limited_until 非空）共 **2** 条。

复算：

    node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('data/jubeat.db',{readOnly:true});console.table(d.prepare('SELECT server_jp jp,server_cn cn,COUNT(*) n FROM songs GROUP BY 1,2').all())"

### 1.2 category ≠ 页面分区

songs.category 存的是**源生分类**，页面上的分区由 src/lib/song-view.ts 的 catOf() **现算**（不入库）：

| category | 行数 | 说明 |
| --- | --- | --- |
| 原创 | 951 | 日服原创 + 国服音乐魔方原创 |
| 授权 | 225 | 日服授权曲（原名「版权」，2026-10-24 改名） |
| 流行 | 35 | 国服音乐魔方/流行 |
| 独占 | 17 | 华立独占（源表精确词） |
| KONAMI | 13 | 机种移植 |

**关键**：国服视图下 gen_name != '音乐魔方' 的行一律由 catOf() 归入 **KONAMI** 分区
（那 432 首旧框曲在库里 category 仍是 原创，但页面上显示在 KONAMI）。
所以「按 category 数国服分区」会算错——必须走 catOf()。

### 1.3 空值不是 bug

| 列 | 空值行数 | 原因 |
| --- | --- | --- |
| bpm | **732 / 1241** | 日服源快照就没有 BPM |
| added_at | **1084 / 1241** | 只有国服更新表（xlsx）与部分日服旧站快照有日期。国服 91 行里 77 行有；日服几乎全空 |
| unlock_note | **1014 / 1241** | 只有解禁池曲目有 |
| artist / cover / bsc | 0 | 必有 |

> 别看到「1084 行为空」就以为数据缺了——**源里就没有**。用 COALESCE 处理显示，
> 不要自己猜值填进去（schema 约定：「缺失值一律 NULL，不猜测填充」）。

### 1.4 songId 段位（改 id 前必看）

| 前缀 | 行数 | 归属 |
| --- | --- | --- |
| 50… | 267 | saucer 系 |
| 90… | 227 | beyond the Ave. |
| 11… | 216 | 国服旧框/双服 |
| 70… | 121 | Ave. |
| 80… | 113 | festo 前后 |
| 99… | 91 | **国服音乐魔方**（9 位） |
| 60… | 91 | Qubell |
| 40… | 40 | copious |
| 30… | 28 | knit |
| 20… | 25 | ripples |
| 10… | 20 | jubeat |
| BTA- | 2 | 占位 |

合计 267+227+216+121+113+91+91+40+28+25+20+2 = 1241。

那 2 条占位是 BTA-83105461（ギミギミエンターテイメント）与 BTA-67975257（夢色ワンダー），
官方 id 至今未知，**是已知待办**，别当成脏数据清掉。

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

## 4. 全部索引清单（**11** 个）

| 表 | 索引 |
| --- | --- |
| songs | idx_songs_jp_gen / idx_songs_cn_cat / idx_songs_title / idx_songs_order |
| recent_changes | idx_recent_changed_at |
| users | idx_users_email（UNIQUE） |
| sessions | idx_sessions_user / idx_sessions_exp |
| oauth_accounts | idx_oauth_user |
| role_requests | idx_role_req_pending（UNIQUE 部分索引）/ idx_role_req_state |

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

详见 [docs/data-pipeline.md §6.3](data-pipeline.md)。

---

## 7. 加一列要改几处（血泪清单）

加一个新列涉及 **五处**，少一处就出现「数据在库里、页面是空的」：

1. db/schema.sql（本地 DDL）
2. scripts/db/build-db.cjs 的 INSERT 列名 + 参数（**国服/日服两处 ins.run 都要补**，参数个数不匹配会直接抛）
3. scripts/build-data.cjs 的导出字段映射（SONGS 的短键）
4. src/lib/db.ts 的 SQL_ALL / SQL_ONE / rowToSong（**这处最容易漏**——漏了数据在库里但页面读不到）
5. 线上：先 ALTER TABLE ADD COLUMN 再灌数据（分两步，别一把梭）

实撞记录：2026-10-28 加 limited_until 时，前三处都改了，漏了第 4 处，
表现为「库里有值、页面是空的」。
