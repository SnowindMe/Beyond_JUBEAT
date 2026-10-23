# 音乐魔方更新歌曲.xlsx 结构说明

> 源文件：`音乐魔方更新歌曲.xlsx`（7 个工作表，其中 2 个隐藏）
> 解析脚本：`scripts/db/parse-xlsx.cjs`（纯 Node、零依赖，手工 OOXML 解析）
> 产物：`data/xlsx/sheet1.json` … `sheet7.json` + `all.json`（汇总元数据）
> 输入：`data/xlsx/source.xlsx`（脚本自带 ZIP 解包，**不需要手工解压**）
> 运行：`node scripts/db/parse-xlsx.cjs`；整体重建见 [`data-pipeline.md`](./data-pipeline.md) 的 `npm run db`
> 全部数字均为脚本实测，非人工抄录。

---

## 0. 总览

| # | 工作表 | 可见性 | 用途 | 数据行 | 建议入库 |
|---|--------|--------|------|--------|----------|
| 1 | 国框更新日服歌曲进度 | 可见 | 国服曲库 vs 日服曲库的逐曲更新台账 | 685 | ✅ 主表 |
| 2 | 国框更新音乐魔方进度 | 可见 | 国服「音乐魔方」原创/流行曲台账 | 91 | ✅ 主表 |
| 3 | 国框Jubiility理论值 | **隐藏** | Jubility 理论值（2026-06-16 版，旧） | 60 | ⚠️ 仅存档 |
| 4 | 国框Jubiility理论值 【20261015】 | 可见 | Jubility 理论值（2026-10-15 版，最新） | 60 | ✅ 用这版 |
| 5 | 国框跑图II歌曲详情 | **隐藏** | 解禁II 五池曲目明细 | 61 | ⚠️ 并入表 1 |
| 6 | pick up（10+） | 可见 | 定数 10.0–10.9 的 pick up 池统计 | 68 | ⚠️ 统计用 |
| 7 | pick up（9+） | 可见 | 定数 9.0–9.9 的 pick up 池统计 | 69 | ⚠️ 统计用 |

共 **1094** 条曲目级记录（含跨表重复，实际唯一曲目远少于此）。
日服基准库：`archive/legacy/jubeat-wiki-v3/data/songs.json`（513 首）。

---

## 1. sheet1「国框更新日服歌曲进度」（685 行，主表）

### 结构
第 1–2 行两级表头，数据从第 4 行起，被 **12 个世代分组标题行**切成 12 段（标题行特征：A 列有文字、B 列为空）。

| 列 | 字段 | 说明 |
|----|------|------|
| A | SongId | 8 位数字；**107 行为空** |
| B | Song | 曲名（含 `[2]` 后缀表示追加谱面） |
| C | Artist | 曲师 |
| D | BPM | 数值 |
| E/F/G | Level | Basic / Advanced / Extreme 定数（E1:G1 合并为「Level」） |
| H | 更新情况 | `√` / `×` / 空 |
| I | 音乐魔方更新时间（公布更新情报） | 日期、`解禁I - 池名`、`解禁II - 池名`、`——` 或空 |
| J | 初出代 | 逐段恒等于段名，**冗余列**，可由分组标题推导 |
| L–V | 统计块 | 见 §1.3 |

### 1.1 分段明细

| 段（初出代） | 行范围 | 数据行 | 有 SongId | 无 SongId |
|---|---|---|---|---|
| jubeat | 4–14 | 11 | 11 | 0 |
| jubeat ripples | 16–30 | 15 | 15 | 0 |
| jubeat knit | 32–47 | 16 | 16 | 0 |
| jubeat copious | 49–77 | 29 | 29 | 0 |
| jubeat saucer | 79–216 | 138 | 138 | 0 |
| jubeat saucer fulfill | 218–249 | 32 | 32 | 0 |
| jubeat prop | 251–287 | 37 | 37 | 0 |
| jubeat Qubell | 289–357 | 69 | 69 | 0 |
| jubeat clan | 359–416 | 58 | 58 | 0 |
| jubeat festo | 418–556 | 139 | 128 | 11 |
| jubeat Ave. | 558–603 | 46 | 45 | 1 |
| jubeat beyond the Ave.(如果有) | 605–700 | 95 | 0 | 95 |
| **合计** | | **685** | **578** | **107** |

- 578 个 SongId **全部唯一、无重复、无非数字脏值**。
- beyond 段的 95 行只有曲名 + Artist，BPM 与三档定数全空，H/I 也全空 —— 属于「日服已出、国服未排期」的占位清单。
- 107 行无 ID 中，12 行是 `×` 状态的 `[2]` 追加谱（见 §1.2），其余 95 行即 beyond 段。

### 1.2 H（更新情况）与 I（更新时间）

全表分布：**H：√ 432 / 空 241 / × 12**；**I：解禁I 125 / —— 160 / 日期 86 / 空 253 / 解禁II 61**。

逐段交叉分布：

| 段 | H √ | H 空 | H × | I 解禁I | I 解禁II | I 日期 | I —— | I 空 |
|---|---|---|---|---|---|---|---|---|
| jubeat | 11 | 0 | 0 | 6 | 0 | 1 | 4 | 0 |
| ripples | 15 | 0 | 0 | 7 | 0 | 1 | 7 | 0 |
| knit | 15 | 1 | 0 | 9 | 0 | 2 | 4 | 1 |
| copious | 28 | 1 | 0 | 15 | 0 | 2 | 11 | 1 |
| saucer | 128 | 10 | 0 | 47 | 4 | 16 | 61 | 10 |
| saucer fulfill | 28 | 4 | 0 | 5 | 1 | 9 | 13 | 4 |
| prop | 28 | 9 | 0 | 10 | 1 | 6 | 11 | 9 |
| Qubell | 45 | 24 | 0 | 9 | 12 | 10 | 14 | 24 |
| clan | 40 | 18 | 0 | 4 | 9 | 16 | 11 | 18 |
| festo | 70 | 58 | 11 | 7 | 22 | 19 | 22 | 69 |
| Ave. | 24 | 21 | 1 | 6 | 12 | 4 | 2 | 22 |
| beyond | 0 | 95 | 0 | 0 | 0 | 0 | 0 | 95 |

**H 与 I 严格同步**：H 为空 ⇒ I 必为空（H空但I有值 = 0 条）；H 有值 ⇒ I 必有值（唯一例外是 12 条 `×`）。

- `×` 的 12 条全部是 `[2]` 追加谱，SongId 全为空：Lava Flow[2]、Life Connection[2]、Proof of the existence[2]、Queen's Paradise[2]、Sakura Sunrise[2]、SigSig[2]、sola[2]、True Blue[2]、VALLIS-NERIA[2]、サヨナラ・ヘヴン[2]、創世ノート[2]、Daily Lunch Special[2]。语义推断：**追加谱面不移植**。
- 语义推断：`√` = 已进国服音乐魔方；`×` = 明确不移植；空 = 尚未更新。
- I 列日期共 15 个取值，每月约 2 批：2026.02.10 / 03.10 / 03.31 / 04.16 / 04.30 / 05.14 / 05.28 / 06.16 / 06.30 / 07.16 / 07.30 / 08.14 / 08.31 / 09.15 / 09.29 / 10.15。
- `解禁I` / `解禁II` 后缀池名：KUMQUAT / CHERRY / LIME / BLUEBERRY / RAINBOW。

### 1.3 右侧统计块 L–V（⚠️ P/Q/R 语义未解）

L3–L14 为世代名，其余为公式与统计。已实测公式：
- `M3=COUNTBLANK(H4:H14)`、`N3=COUNTA(H4:H14)`、`T3=SUM(P3:R3)`、`V3=N3-T3`
- `M16=SUM(M3:M13)=146`、`N16=SUM(N3:N15)=521`、`T16=SUM(T3:T13)+N15=509`
- `M18=ROUND((M16-5)/6,2)=23.5`、`M19=61+N13-12+N15=162`
- 标签：L16「Ave.之前总和（曲库）」、L18「可更新月数」、L19「pick up歌曲」

逐代 P/Q/R：

| 段 | P | Q | R | T=P+Q+R | 实际 √ 数 |
|---|---|---|---|---|---|
| jubeat | 10 | 1 | 0 | 11 | 11 |
| ripples | 12 | 3 | 0 | 15 | 15 |
| knit | 15 | 0 | 0 | 15 | 15 |
| copious | 25 | 2 | 0 | 27 | 28 |
| saucer | 104 | 19 | 2 | 125 | 128 |
| saucer fulfill | 24 | 2 | 1 | 27 | 28 |
| prop | 20 | 6 | 1 | 27 | 28 |
| Qubell | 27 | 5 | 11 | 43 | 45 |
| clan | 25 | 3 | 9 | 37 | 40 |
| festo | 52 | 3 | 14 | 69 | 70 |
| Ave. | 13 | 0 | 11 | 24 | 24 |

**`T = P+Q+R` 逐行恒成立，但 T ≠ √ 数。**
已系统排除的解释（均零命中）：
1. 按 Extreme 定数分档 —— 用 22 个谓词（ext≥10 / ≥10.5 / ≥9.5 / <10、整数 vs 小数、adv/bsc 分档、√/空/×、解禁I/解禁II/日期/——、`[2]`、有ID/无ID 等）穷举全部单谓词，以及全部 22×21×20 有序三元组，**零命中**；
2. 按难度字段两刀切三段再全排列 6 种映射，**零命中**；
3. 只取 H 已填曲目再切档，**零命中**。

结论：P/Q/R 与难度分档、更新状态、解禁批次、日服命中与否**均无关**。最可能是人工估的「国服曲库规模 / 可更新量」。**入库时不要赋予这三列语义，原样保留并标注未解。**

### 1.4 编码坑（务必注意）

「jubeat clan」分组标题行的空格是 **U+00A0 不换行空格**（`6a 75 62 65 61 74 a0 63 6c 61 6e`），而 J 列写的是普通空格 U+0020。逐行字符串比对会误报 **153 处**不一致（clan 58 + beyond 95），实际语义一致。
→ 比对世代名必须先把 `\u00a0` 归一化为普通空格。

---

## 2. sheet2「国框更新音乐魔方进度」（91 行，主表）

### 结构
表头与 sheet1 同构，但后三列语义不同。分 2 组，共 91 条数据。

| 列 | 字段 | 说明 |
|----|------|------|
| A | SongId | 9 位数字，**91 条全部有值且唯一**，与 sheet1 零交集 |
| B | Song | 曲名 |
| C | Artist | 曲师 |
| D | BPM | 数值 |
| E/F/G | Level | Basic / Advanced / Extreme |
| H | 分类 | 华立独占 / KONAMI/机种移植 / 音乐魔方原创 / 音乐魔方流行 / 音乐魔方流行（限时） |
| I | 移植机种 /（可能）有关联动 | 来源机种或联动名，或 `——` |
| J | 音乐魔方更新时间（公布更新情报） | 日期 或 `——` |

### 分段与分布

| 组 | 行范围 | 数据行 | H 分类 |
|---|---|---|---|
| （无分组标题，机种移植段） | 3–32 | 30 | 华立独占 17 / KONAMI·机种移植 13 |
| 音乐魔方/原创分类 | 34–59 | 26 | 音乐魔方/原创 26 |
| 音乐魔方/流行分类 | 61–95 | 35 | 音乐魔方/流行 33 / 流行（限时）2 |

I 列分布：`——` 50、beatmania IIDX 各版本（25 CANNON BALLERS / 27 HEROIC VERSE / 28 BISTROVER / 29 CastHour / 30 RESIDENT / 31 EPOLIS）、REFLEC BEAT 悠久のリフレシア 3、REFLEC BEAT VOLZZA 2、SOUND VOLTEX EXCEED GEAR 3、华立电竞WEC2026 2、华立电竞WEC2025 3、联动/音波狂潮 7、联动/Diverse System 2、联动/Noi2E Lab 7、联动/VirtuaReal 6、联动/MankaLive 1。
J 列分布：`——` 14，其余为与 sheet1 相同的 15 个日期。

SongId 前缀：`9900` 段 30 首、`9910` 段 26 首、`9950` 段 35 首 —— 这三段是国服音乐魔方专属号段。

---

## 3. sheet3 / sheet4「Jubility 理论值」（各 60 首）

两表结构相同，只有版本不同：sheet3 隐藏（2026-06-16），sheet4 可见（2026-10-15，最新）。

| 列 | 字段 |
|----|------|
| A | 歌曲 |
| B | 版本（初出代） |
| C | 难度 |
| D | 定数 |
| E | Jubility 单曲理论值（Normal） |
| F | Jubility 单曲理论值（Hard Mode） |
| G/H | MAX 标签与数值 |

分组：A4「COMMON SONG」（行 5–34，30 首）、A35「Pick Up SONG」（行 36–65，30 首）。

### 3.1 MAX 可验证

| 表 | G2 MAX (Normal) | H2 MAX (Hard) | E 列求和 | F 列求和 |
|---|---|---|---|---|
| sheet3（0616） | 7983.7 | 9580.1 | **7983.7** ✅ | **9580.1** ✅ |
| sheet4（1015） | 8034.7 | 9641.9 | **8034.7** ✅ | **9641.9** ✅ |

→ MAX 就是 60 首理论值之和，无误差。

### 3.2 单曲理论值公式

`F = 1.2 × E`，且 E 由定数决定：

| 定数 | E (Normal) | F (Hard) |
|---|---|---|
| 10.4 | 131.3 | 157.5 |
| 10.5 | 132.5 | 159.0 |
| 10.6 | 133.8 | 160.6 |
| 10.7 | 135.1 | 162.1 |
| 10.8 | 136.3 | 163.6 |
| 10.9 | 137.6 | 165.1 |

### 3.3 定数分布（sheet4 的 J:O 统计块，已逐行验证）

标题 J2:O3「jubility理论值定数个数总览」，列头 J4..O4 = 10.9 / 10.8 / 10.7 / 10.6 / 10.5 / 10.4：

| 组 | 10.9 | 10.8 | 10.7 | 10.6 | 10.5 | 10.4 |
|---|---|---|---|---|---|---|
| 总数 | 2 | 1 | 18 | 23 | 11 | 5 |
| COMMON | 0 | 1 | 10 | 17 | 2 | 0 |
| PICK UP | 2 | 0 | 8 | 6 | 9 | 5 |

逐行计数**完全吻合**。

### 3.4 两版差异

两表各 60 首，**仅 36 首重合**：
- sheet4 新增 24 首：ドーパミン、灼熱Beach Side Bunny、天空の華、Cleopatrysm、Hades Doll、XENOViA、THRERROR、Lost Dream、ピアノ独奏無言歌 "灰燼"、Hopeful Frontier!!!、CHERNOBOG、Glitter Flatter Scatter、ORIENTAL MESIA、世界の果てに約束の凱歌を -jubeat edition-、DIAMOND CROSSING、ENDGAME、Dance With The Dead、アガット[2]、BEEF、EBONY & IVORY、brown hawk owl、Anubis、Remnath -jubeat Edit-、海神
- sheet3 独有 24 首：龍と少女とデコヒーレンス、パピポペピプペパ、Never Look Back in Sorrow、In Your EyEs、DOUBLE IMPACT、アストライアの双皿、ZZ、Wandering Gravity、TSAR BOMBA、STELLAR WIND、Riot of Color、overcomplexification、恋 No リセットゲーム!!!!!、Grand Chariot、Lisa-RICCIA、Valanga、雨上がりの空に、量子の海のリントヴルム、Too Late Snow[2]、FLOWER、concon、VALLIS-NERIA、Triple Counter
- 重合曲里只有 1 首定数变了：**Megalara Garuda 10.4 → 10.7**。

### 3.5 数据质量问题

- C 列难度拼写不一致：sheet3 用 `Extreme / Advanced / Basic`，sheet4 把 Advanced 写成 `Advance`。
- 两表实际**只列了 Extreme 一种难度**（Basic/Advanced 从未出现），但表名与列头暗示是三档。

---

## 4. sheet5「国框跑图II歌曲详情」（隐藏，61 首）

标题 A1「音乐魔方解禁II歌曲详情」。布局是 **四池横向并排**，不是常规单列：

| 列 | 池 | 子列 |
|---|---|---|
| A/B/C | CHERRY | 歌曲 / 版本 / 等级 |
| D/E/F | KUMQUAT | 歌曲 / 版本 / 等级 |
| G/H/I | LIME | 歌曲 / 版本 / 等级 |
| J/K/L | BLUEBERRY | 歌曲 / 版本 / 等级 |

- 行 4–15：每池 12 首，共 48 首。等级列是 `Basic/Advanced/Extreme` 斜杠串（如 `2/5/8`、`5/9.6/10.3`）。
- 行 16：A16:L16 合并，分组标题 **RAINBOW**。
- 行 17–19：每池 3 首，共 12 首；其中行 17–18 的 8 首带 `[2]` 后缀（SEED[2]、イ号零型[2]、枝に結ぶ願い[2]、Icicles[2]、アガット[2]、smooooch・∀・[2]、chaplet[2]、Chronos[2]），行 19 的 4 首无后缀（ピアノ独奏無言歌 "灰燼"、Hopeful Frontier!!!、Glitter Flatter Scatter、CHERNOBOG）。
- 行 21：单列 **XENOViA**（A21=曲名、C21=jubeat festo、D21=`7/10.2/10.9`，**整体左移一列**，没有独立的三联列头）。
- 行 23–29：纯统计块（B=版本、C=个数）：jubeat saucer 4、saucer fulfill 1、prop 1、Qubell 12、clan 9、festo 22、Ave. 12 = **61**。

**交叉验证**：把 sheet1 I 列 `解禁II - X` 的曲名按池取出（去 `[2]` 后缀）与 sheet5 五池逐一比对，**五个池全部完全一致、零差异**（各 12 首，RAINBOW 13 首含 XENOViA）。

→ **sheet5 是 sheet1「解禁II」列的明细展开**，唯一信息增量是 Basic/Advanced 两档定数（sheet1 只有 Extreme）。

---

## 5. sheet6 / sheet7「pick up」统计表（68 / 69 首）

布局是**横向三联**：A/B/C/D = 曲名/初出代/难度/定数（第一组），E/F/G/H 第二组，I/J/K/L 第三组。
右侧 N3/O3 =「定数/个数」、P3/Q3 =「初出代/个数」，统计块从第 4 行起。

### sheet6「pick up（10+）」
- 数据行 3–27，共 **68** 首（第一组 25、第二组 24、第三组 19）。
- 定数范围 10.0–10.9；难度 Extreme 65 / Advance 3。
- 初出代：音乐魔方 25、Ave. 17、festo 16、Qubell 5、clan 3、saucer 1、prop 1。
- 右侧定数分档（N/O）：10.9:2、10.8:0、10.7:8、10.6:6、10.5:9、10.4:14、10.3:9、10.2:8、10.1:6、10:6 —— 与逐行计数**完全吻合**。
- ⚠️ **缺陷**：右侧初出代分档（P/Q）= saucer 1 + Qubell 5 + clan 3 + festo 16 + Ave. 17 + 音乐魔方 25 = **67**，比实际 68 少 1 —— **漏计 jubeat prop 那 1 首（EBONY & IVORY）**。
- 有 3 首曲目重复出现（同一首歌的 Extreme 与 Advance 谱面各占一格）：XENOViA（Ext 10.9 / Adv 10.2）、THRERROR（Ext 10.9 / Adv 10.2）、DIAMOND CROSSING（Ext 10.6 / Adv 10.4）。

### sheet7「pick up（9+）」
- 数据行 3–32，共 **69** 首（第一组 30、第二组 21、第三组 18）。
- 定数范围 9.0–9.9；难度 Extreme 55 / Advance 14。
- 初出代：音乐魔方 34、Ave. 10、festo 10、clan 6、Qubell 5、saucer 3、saucer fulfill 1。
- 右侧定数分档：9.9:1、9.8:6、9.7:5、9.6:7、9.5:11、9.4:7、9.3:12、9.2:7、9.1:7、9:6 = 69，**完全吻合**；初出代分档合计 69，**完全吻合**；无重复曲目。

**结论**：sheet6/sheet7 本质是「pick up 池的定数分布 + 初出代分布」统计表（顺带列了全量曲目），不是权威曲目清单。sheet6 的初出代统计块有 1 条漏计。

---

## 6. 与日服基准库的关联

基准：`archive/legacy/jubeat-wiki-v3/data/songs.json`，**513 首**。字段：`songId / title / titleNorm / artist / bpm / levels{bsc,adv,ext} / origin / category / isPickUp / limited / unlockPool / poolPhase / addedBatch / addedAt / exchangeCost / cover / notecounts / levelHistory / trivia / sources`。

### 6.1 SongId 命中率

| 表 | 有 ID 行数 | 命中日服 | 命中率 |
|---|---|---|---|
| sheet1 | 578 | 429 | **74.2%** |
| sheet2 | 91 | 84 | **92.3%** |

sheet1 未命中的 149 首，在 songs.json 里**连标题都不存在**（归一化标题匹配 0 命中）→ 是国服侧新增 / 日服库未收录，不是 ID 格式差异，也不存在「ID 不同但同一首歌」的漏配。sheet1 的 107 行无 ID 曲目，标题在日服库同样 0 命中。

sheet2 按前缀：9900 段 28/30、9910 段 25/26、9950 段 31/35。未命中 7 首：`990000032` THRERROR（华立独占/华立电竞WEC2026）、`990000034` REBEL（华立独占/——）、`991000017` Road Hitta!(Feat.符白牙)（音乐魔方原创/联动音波狂潮）、`995000033` 坏女孩、`995000046` 蝶々～Break out～、`995000048` 零距离的思念、`995000054` 我爱你就像（均音乐魔方流行/——）。

**关键发现**：日服 songs.json 里 9 位 ID 的曲目恰好 **84 首**，origin 全为 `jubeat音乐魔方`、category 全为 `original` —— 与 sheet2 命中的 84 首一一对应。sheet2 未命中的 7 首是国服新增（华立独占/联动/流行），日服尚未收录。

### 6.2 逐世代命中率（越新越低）

| 世代 | 命中/总数 | 命中率 |
|---|---|---|
| jubeat | 11/11 | 100% |
| ripples | 15/15 | 100% |
| knit | 15/16 | 94% |
| copious | 28/29 | 97% |
| saucer | 128/138 | 93% |
| saucer fulfill | 28/32 | 88% |
| prop | 28/37 | 76% |
| Qubell | 44/69 | 64% |
| clan | 38/58 | 66% |
| festo | 70/128 | 55% |
| Ave. | 24/45 | 53% |

### 6.3 字段一致性抽查（429 首命中曲）

- **定数**：三档完全相同 425/429。仅 4 首不同：`40000157` RePrise（xlsx 4/7/9 vs 日服 4/7/8）、`50000178` カラルの月（4/7/9 vs 3/6/9.4）、`50000387` まるでマトリョーシカ（4/7/8 vs 3/7/8）、`70000174` ぱんだしんけん１、２、３（3/6/8 vs 2/5/8）。
- **BPM**：相同 405/429。24 处不同**全部**是日服写了多机种 BPM 说明串（如 Evans 日服 `"185 (all other games, DanceDanceRevolution BEGINNER), 185-369 (...)"`，xlsx 只写 `185`）。
- **Artist**：字符串不同 107 处，但几乎全是**空格差异**（xlsx 双空格 / 日服单空格，如 `"jun feat.  Schanita"` vs `"jun feat. Schanita"`、`"SUPER HEROINE 彩香 -AYAKA-"` vs `"SUPER HEROINE 彩香-AYAKA-"`）。

→ 字段本身可信，差异是格式噪音；入库前建议做空格归一化。

### 6.4 日服库自身分布（供对照）

- origin：jubeat 11、Ave. 24、ripples 10、ripples APPEND 5、knit 8、knit APPEND 7、copious 13、copious APPEND 15、saucer 127、saucer fulfill 29、prop 28、Qubell 44、clan 38、festo 70、音乐魔方 84。
- category：old 443、original 17、crossover 9、license 34、licensed 6、limited 4。
- 字段填充率（513 首中非空）：unlockPool 179、poolPhase 179、addedBatch 315、addedAt 125、exchangeCost 44、isPickUp 513、limited 513、cover 513、notecounts 298、levelHistory 298、trivia 289、sources 513。

---

## 7. SongId 号段规律

- sheet1 的 578 个 ID 按首位分桶：`1` 11、`11` 45（ripples 用 11 开头）、`20` 15、`30` 16、`40` 29、`50` 170、`60` 37、`70` 69、`80` 58、`90` 128。
- sheet2 的 91 个：`9900` 30、`9910` 26、`9950` 35。
- 国服 ID 与日服同构（世代号 + 序号，8 位）；`9900/9910/9950` 三段是国服音乐魔方专属。

---

## 8. 入库建议

| 表 | 建议 | 理由 |
|---|---|---|
| sheet1 | ✅ 主数据源 | 685 行国服曲库台账，578 个可用 ID，H/I 状态语义清晰且互相校验 |
| sheet2 | ✅ 主数据源 | 91 行音乐魔方专属曲，ID 100% 有效，分类/联动信息完整 |
| sheet4 | ✅ 取这版 | 最新（20261015），MAX 与逐行求和吻合 |
| sheet3 | ❌ 不入库 | 旧版（0616），与 sheet4 仅 36 首重合，属历史快照 |
| sheet5 | ⚠️ 合并入 sheet1 | 与 sheet1「解禁II」61 首完全一致，只多 Basic/Advanced 定数 |
| sheet6/7 | ⚠️ 可选 | 是统计视图而非清单；sheet6 初出代统计块漏 1 条，不可直接当权威 |

### 待确认 / 未解
1. **sheet1 P/Q/R 三列语义未解**（已穷举排除难度、状态、批次、日服命中四类解释），入库请原样保留并标注。
2. sheet6 初出代统计块漏计 `jubeat prop` 1 首，需人工确认是笔误还是口径差异。
3. sheet4 难度列把 `Advanced` 写成 `Advance`，且只列 Extreme 一种难度，需确认是否只统计 Extreme。
4. sheet1 beyond 段 95 首无 BPM / 定数 / ID，需等日服数据补齐。

---

## 9. 解析脚本

`scripts/db/parse-xlsx.cjs`，零依赖、纯 Node（实测 Node v22.22.0），**不装任何 xlsx 库**。

输入直接是 `data/xlsx/source.xlsx`：xlsx 本体就是 ZIP，脚本内 `readZip` 用 `node:zlib` 的 `inflateRawSync` 自己解包，按中央目录取 `xl/sharedStrings.xml`、`xl/workbook.xml`、`xl/_rels/workbook.xml.rels`、`xl/worksheets/sheet1..7.xml`，所以**不需要手工解压，也不依赖 `scripts/tmp/`**。换一份表可传 `--xlsx=` / `--out=` 覆盖。

流程：`parseSharedStrings`（1450 条）→ `parseWorkbook`（读 workbook.xml + rels，取 name/state/hidden/file 与 `_FilterDatabase` 范围）→ `parseSheet` → `gridValues` → 逐表写 JSON。

核心函数：`readZip`（ZIP 中央目录解析 + `inflateRawSync`，仅支持 store/deflate）、`readZipText`、`decodeEntities`（命名实体 + `&#10;` 数字实体）、`collectText`（拼接富文本多 `<r><t>`、剥离 `<rPh>` 注音）、`attr`、`scanTags(xml, name)`（属性引号感知 + **自闭合感知**的标签扫描器，返回 `{attrs, body, selfClosing, end}`）、`parseSharedStrings`、`colToIndex`、`indexToCol`、`parseSheet`、`gridValues`、`parseWorkbook`、`main`。

⚠️ **踩坑记录**：初版用 `/<c\b[^>]*>([\s\S]*?)<\/c>|<c\b[^>]*\/>/g` 匹配单元格，自闭合的 `<c r="F1" s="81"/>` 会把斜杠吃进属性再走 `'>'` 分支，**吞掉后续多个单元格** → sheet1 表头严重错位（F 列出现 "5"，H/I/J 全错位）。改用 `scanTags` 后修复。**结论：OOXML 必须用自闭合感知的标签扫描器，正则交替分支不可靠。**

产物：每个 sheet JSON 为 `{sheetIndex, sheetName, state, hidden, sourceFile, maxRow, maxCol, declaredRange, merges, formulaCount, formulas, nonEmptyRowCount, nonEmptyRows, rows}`；`all.json` 为 `{generatedFrom, sharedStringCount: 1450, sheets:[{sheetIndex, sheetName, state, sourceFile, maxRow, maxCol, declaredRange, mergeCount, nonEmptyRowCount, json}]}`。
