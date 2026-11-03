# 数据库结构与成本审查

审查日期：2026-11-04
审查对象：db/schema.sql（161 行）、src/lib/db.ts、src/lib/hotStore.ts、src/lib/auth.ts、src/pages/api/hot/hit.ts、wrangler.jsonc
前提：主人在 Workers **免费版**，目标是低成本 + 高访问速度。

---

## 先说结论

**这套结构的瓶颈不在数据库选型，在放大倍数。** 换库不会变快也不会变便宜，因为现在的成本大头是「一次页面访问读 1248 行」和「一次打点写 2 次 KV」，这两个问题换到任何库上都要重做。

免费额度换算成人话（全部来自 Cloudflare 官方定价页 / limits 页，2026-11-04 实读）：

| 资源 | 免费额度 | 现在的单次消耗 | 撞墙点 |
|---|---|---|---|
| D1 rows read | 5,000,000 / 天 | 1248 行 / 次全表扫 | 约 4,000 次浏览 / 天 |
| D1 rows written | 100,000 / 天 | 1 行 / 次打点 | 10 万次打点 / 天 |
| KV keys written | **1,000 / 天** | 2 次 / 次打点 | **约 500 次打点 / 天** |
| Workers 请求 | 100,000 / 天 | 1 / 次访问 | 10 万 PV / 天 |
| Workers CPU | **10 ms / 请求** | 全量 SSR | 单请求上限，不是日额度 |

**最先撞的是 KV，不是 D1，而且早 8 倍。** hit.ts:36-41 的 bump 每次打点做 1 次 get + 1 次 put，hit.ts:91 再 put 一个节流键——每次有效打点写 2 次 KV。1000 写 ÷ 2 = 500 次。KV 免费版超限是**直接报错**（不是排队），而 hit.ts:90-92 只有一个裸 try，打点会开始静默丢。

rows read 按**扫描行数**计费，不按返回行数，官方定义原话：「Rows read measure how many rows a query reads (scans), regardless of the size of each row」。所以 SELECT * FROM songs 永远算 1248 行，LIMIT 和 WHERE 都救不了没有索引的扫描。

---

## P0 先堵放大（不换服务，当天可做）

### 1. 曲目数据离开运行时查询

**这是全站最大的一笔，一次改动把 3 处 1248 行全扫全部干掉。**

关键事实：src/data/songs.json（432 KB）**已经是完整导出物**，由 scripts/build-data.cjs:145 每次构建生成，字段与 db.ts:31-65 的 Song 类型一一对应。但现在它只在开发环境被 import（db.ts:121-127 注释自认是 dev 退路），生产环境完全不用。

改法：把它从 import 改成运行时 fetch('/data/songs.json')，走 ASSETS 静态资源绑定，再叠一层 Cache API（每个 PoP 一份，命中零 D1）。

- 曲子是构建期产物，本来就不该在请求期查库，这和 difficulty.ts:46-50 注释里那条「统计从请求期搬到构建期」是同一个教训，只是那次踩过坑，曲目这条没搬。
- 后台改曲后需要 purge：song-update 路径里已有 invalidateSongsCache（db.ts:211-214）可挂。
- 体积不是问题：ASSETS 单个静态文件上限 25 MiB，432 KB 远够。

改完 songs 表的读全部归零，D1 只剩用户表和热度表。

### 2. 打点合并成一次写

现在一次打点 = 1 次 COUNT 扫（hit.ts:87，走 idx_hot_hits_day_ip）+ 1 次 INSERT（hit.ts:89）+ 2 次 KV 写。

- 把「同 IP 当天次数」从 COUNT 改成写入时 UPSERT 一个 (day, ip_hash) 计数行，COUNT 从读路径挪到写路径，还省一次扫描。
- 每分钟限流（hit.ts:78）和节流键（hit.ts:91）全部搬进 D1 同一批语句，KV 只留会话。KV 写入从 2 次降到 0。

### 3. 会话过期清理挪到 cron

auth.ts:159-163 注释写着「无 cron 的小站够用」，但 cron 早就有了（wrangler.jsonc:78-80 每天 00:05 封榜）。现状是**每次登录都多一次 DELETE 扫 sessions**。把这句搬进 scheduled，登录路径删掉即可。

### 4. 删冗余索引

- schema.sql:150 的 idx_hot_hits_day_song ON hot_hits(day, song_id) 被主键 (day, song_id, visitor) 的前缀完全覆盖，纯冗余。hot_hits 是写量最大的表，每条索引都要在每次 INSERT 上摊成本。
- schema.sql:41-42 的 idx_songs_jp_gen / idx_songs_cn_cat 几乎用不上：唯一带筛选的查询是后台列表（song-admin.ts:284-285 按 server_jp = 1 过滤），但它的 ORDER BY 是 gen_name, ext DESC, title（song-admin.ts:303），末位索引覆盖不住排序，仍要 TEMP B-TREE，筛完还要再筛一遍全集。而按索引名暗示的「server_jp + gen_name」「server_cn + category」这类查询**一处都没有**：现成代码都是把全量拉回来在 JS 里分组（song-view.ts 全程内存处理）。曲目表改静态之后这两条更是全废。

### 5. 运势的计数查询

Fortune.astro:34-37 每个首页请求跑一次 SELECT SUM(...) FROM songs 全表扫，只为判断「哪一服有曲」。而 build-data.cjs:129-139 已经在生成的 data.json 里算了 stat.gen / stat.charts 这些计数，直接读现成的即可。

---

## P1 再按数据性质拆存储

现在 6 张表混在一个库里，但它们的读写特征完全不同，不该有同一套存储策略：

| 表 | 行数 | 读写特征 | 该放哪 |
|---|---|---|---|
| songs | 1248 | 只读、构建期全量产出 | **静态资产（见 P0-1）** |
| users / sessions / role_requests | 几十～几百 | 低频写、低频读 | D1 保留 |
| recent_changes | 无上限 | 只在 /recent 读 200 行 | D1 保留，但要加清理 |
| hot_hits | 天量写 | 只在封榜时按天聚合 | **Analytics Engine 或 R2** |
| hot_snapshots | 每天 1 行 | 读多写少 | D1 或 KV |

### 6. hot_hits 换 Analytics Engine

官方免费额度：100,000 data points written / 天、10,000 read queries / 天，保留 3 个月（developers.cloudflare.com/analytics/analytics-engine/pricing/）。单点写入不计维度成本，正好匹配「只追加、只按天聚合」的埋点。
限制要知道：每次 invoke 最多 250 点、index ≤96 字节（同路径 /limits/）。打点是一请求一点，够用。
代价：SQL API 的语法与 D1 不同，封榜那一段要重写；数据保留 3 个月，与 KEEP_DAYS=30（hotPage.ts:14）不冲突。

### 7. recent_changes 无上限

schema.sql:49-58 没有任何归档或上限，db.ts:192 靠 LIMIT 200 兜着。表会一直长。按 KEEP 半年加一条 cron 清理。

### 8. 曲绘与音频放 R2

免费额度 10 GB 存储 + 100 万 A 类 + 1000 万 B 类操作，**egress 完全免费**（developers.cloudflare.com/r2/pricing/）。audio 端点现在把整份音频 arrayBuffer 读进内存再 cache.put（[songId].ts:301-306），走 R2 可以直接流式转发，省掉这一次完整的缓冲。

---

## P2 真要换库的话

**结论：不换也能撑。** 上面 P0 做完，D1 免费档的 500 万读额度能撑到日 PV 两万以上，而 Workers 自己的 10 万请求/天会先到。换库解决不了请求数，先让绝大多数请求不进 Worker 更值钱。

如果仍要换，只有 Turso 值得考虑：

- Turso（libSQL）：免费 500M rows read / **月**（≈16.6M/天，是 D1 的 3.3 倍）、10M 写 / 月、100 个库、5 GB。**方言就是 SQLite，schema.sql 可直接跑**，迁移成本近乎为零。
- Neon（Postgres）：免费 100 CU-hour / 项目、1 GB 存储、5 GB egress，无卡永久免费。但方言不同（PG），SQL 要改；而且 5 分钟无活动自动挂起，冷启动唤醒对首屏不友好。
- 别选：PlanetScale 无免费档；Supabase 免费 500 MB 且闲置 7 天暂停。

Turso 的定位是「另一个同样要积分额的免费档」，它的优势在额度不在架构——**它和 D1 一样会被 1248 行全扫吃光，只是吃得慢一点**。

---

## 表结构本身的问题

1. **notecounts / holds 存 JSON 列**（schema.sql:31-32）：SQLite 里既不能索引也不能聚合，以后想「按键数排序」得全表拉回来在 JS 里排。要支持就拆成六列（bsc_notes / adv_notes / ext_notes / holds_*）。现在不改，列在这里备查。
2. **server_jp / server_cn 双列**（schema.sql:19-20）让 1248 行里塞了两份同曲记录，两服都有的还要 (1,1)。理论上能并成一列 srv TEXT，但会把几十处 WHERE server_jp = 1 全部改掉，收益不抵改动量。
3. **alt 只有 DEFAULT 0 没有 CHECK**（schema.sql:25），而同表的 has_hold 有 CHECK (has_hold IN (0,1))（schema.sql:30）。补一句就行。
4. **recent_changes 无 created_at 之外的时间索引策略**，靠 LIMIT 200 掩盖增长，见 P1-7。

---

## 建议顺序

1. P0-2、P0-3、P0-4、P0-5（都是几行到几十行的小改，立刻降一半以上写入和扫描）
2. P0-1（曲目改静态，最大的一笔，需要改 3 个页面 + purge 钩子）
3. P1-6（hot_hits 迁 Analytics Engine，要重写封榜）
4. P1-7、P1-8、表结构 3
5. 只有在 P0 做完还撞墙时，才谈换库
