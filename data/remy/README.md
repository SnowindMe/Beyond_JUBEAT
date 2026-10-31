# RemyWiki jubeat 曲目数据（BPM / 总键数 / 长押数）

来源：https://remywiki.com/Jubeat_beyond_the_Ave._Full_Song_List 及其 1065 个曲目页（2026-10-31 抓取）。
用途：给 songs 表补 BPM、判断「是不是长押谱」、记录各难度的总键数与长押数。

## 文件

- `jubeat-charts.json` —— 抓取的**原始产物**：列表里每一条曲目一行（含 `[ 2 ]` 变体条目），
  字段 `title / artist / url / variant / bpm / charts[{diff,notes,holds}] / hasData / hasHold / source`。
  它记录「页面里写了什么」，不绑定本站 song_id。
- `by-song-id.json` —— **入库快照**：把上面的数据按本站 song_id 归并（曲名归一化后匹配，
  `[ 2 ]` 条目归到 `alt=1` 的那一行）。`scripts/db/build-db.cjs` 读它回填 songs 的三列 + bpm。
  形如 `{"10000036":{"bpm":"140","has_hold":0,"notecounts":{"bsc":298,"adv":371,"ext":573},"holds":{"bsc":0,"adv":0,"ext":0}}}`。
  没有长押数据的行 `has_hold` / `notecounts` / `holds` 三键都不出现 → 库里存 NULL（**未知**，不是 0）。
- （旧的 `jubeat-charts.tsv` / `jubeat-holds.tsv` 已删：内容与 JSON 完全重复，JSON 是唯一来源。）

## 判定规则

- **是不是长押谱**：看 jubeat 难度表 Notecounts 行的**值**，不看标签 —— `379 / 19` 是「总键数 / 长押数」，
  单值 `414` 表示该难度没有长押。踩过的坑：`1116` 的通常表标签写的是 `Notecounts`（不带 Holds），
  值却是 `524 / 35` 两个数；只看标签会漏判。
  → 本站的 `has_hold` **由 holds 数值推出**，与 `alt`（是否 `[ 2 ]` 谱面）无关：
  `alt=1` 只说明它是 [ 2 ] 版本，实测 63 条 [ 2 ] 里有 1 条没有长押（主人 2026-10-31 指正）。
- **BPM**：取 Song Information 段的 `BPM:`；多机种页面按「括号里提到 jubeat 优先」挑
  （`BPM: 100-400 (DanceDanceRevolution), 200 (jubeat, SOUND VOLTEX)` → `200`，旧正则只认紧贴的
  `(jubeat)`，会把 DDR 的区间当成 jubeat 值）；没有 jubeat 标注时优先 `other BEMANI games` 这类
  全机种值，最后才退到第一个数。区间写法（`90-180`）原样保留。
- **表格定位**：必须锚定页面里的 `### jubeat` 小节的第一张表。踩过的坑：GF/DM 的表头同样是
  Basic/Advanced/Extreme，只按表头匹配会让跨机种曲目取到 GF/DM 的音符数（213 条被修正）。
  少数页面 `Regular Charts` / `[ 2 ] Charts` 是顶层小节（没有 `### jubeat` 包裹），需要单独兜底。
- `[ 2 ] Charts` 只认**以 `[ 2 ]` 开头**的小节名；`Alternate [ 2 ] Charts`（ETERNAL BLAZE）不算。

## 现状

- 列表 1138 条 → **1137 条有数据**（Big Daddy 的第一张子表用 `?` 占位看下面特例）、**289 条含长押**，
  覆盖 866 个难度谱面、长押合计 31,726。
- **Big Daddy 特例（2026-10-31 主人判定）**：该页 `### jubeat` 段下挂了两张子表 ——
  `jubeat音乐魔方 Charts` = `? ? ?`、`jubeat (2026) Charts` = 313/10 · 725/23 · 904/35。
  主人原话「big daddy抓出来的bpm和hold那些信息是bta的（songid为11000228）」→
  有数值的那张属于 beyond the Ave. 版，**只补给 11000228**；国服行 991000007 是音乐魔方谱，
  `has_hold` 保持 NULL（未知），不许拿 BTA 的数冒充。实现在快照生成器的显式 `OVERRIDES` 表里。
- 归到本站 1248 行曲库：**1150 行拿到数据**（其中 298 行 `has_hold=1`），98 行没有 ——
  **正好就是「音乐魔方」整个世代**（remywiki 是日服 wiki，不收国服曲库），
  库里对应列保持 NULL（= 未知），不要当成 0。

### 榜单外补充页（2026-10-31，主人给了 13 个直链）

**Full Song List 不是全集**：有些曲目在 remywiki 有独立页面，却没被那个列表收进去，
主映射脚本（只按列表条目匹配）永远命中不了。主人 2026-10-31 直接给了 13 个 URL，
于是单开一层 `scripts/db/remy/make-extra-pages.cjs`（页面 Markdown 缓存在
`.devhome/remy-md/extra/<songId>.md`）：

| 结果 | 曲目 | 说明 |
| --- | --- | --- |
| **解析到 jubeat 难度表（8 首）** | 11000031 / 11000035 / 11000036 / 11000037 / 11000094 / 90000009 / 90000143 / 90000208 | 其中 4 首长押 |
| **只有 stub 页（5 首）** | 90000120 / 90000154 / 90000156 / 90000204 / 90000206 | 页面只有曲目信息、**没有难度表**。这 5 首**已改由主人截图补录**（见下） |

**5 首 stub 页的后续（2026-10-31 同日）**：主人直接贴了 BEMANIWiki 2nd 的难度表截图，
按图录入 `data/chart-overrides.json`（优先级高于本快照）。逐张核过定数三元组与库一致，
可证没贴错图；BPM 也对上（142 / 155 库里本来就有）。

| songId | 曲名 | BPM | 键数/长押 | 长押 |
| --- | --- | --- | --- | --- |
| 90000120 | splash! | 156 | 223/20 · 417/24 · 715/25 | 是 |
| 90000154 | 激闘保安官！DEMPA撲滅大作戦 | 142 | 218/6 · 356/6 · 709/4 | 是 |
| 90000156 | Underground Astronomy | 155 | **207 · 420 · 815（单值）** | 否 |
| 90000204 | サヨナラ・ヘヴン (BEMANI SYMPHONY Arr.) | 111 | 129/22 · 408/27 · 739/154 | 是 |
| 90000206 | Idola (BEMANI SYMPHONY Arr.) | 140-176 | 253/14 · 509/50 · 782/60 | 是 |

合并规则：`make-remy-data.cjs` **只补主快照没有的键**，主快照已有的一律以主快照为准
（主快照是 1137 行两路交叉验证过的，补充页只用来填空洞）。

交叉验证：这 8 首里 5 首库里本来有 BPM（180/180/150/142/155），与页面写的完全一致 ——
可排除「页面与曲目对错号」的可能。

### 曲名归一化（2026-10-31 修，踩过三个坑）

`remy-db-map.cjs` 最早只做 NFKC + 去空白 + 小写，结果有 4 行明明 remywiki 里有数据却被记成
「长押未知」。三类差异必须一起处理：

1. **alt=1 的行不能拿带 `[ 2 ]` 的整名去查** —— remywiki 的列表条目名是不带 `[ 2 ]` 的，
   71 条 [ 2 ] 谱面里 68 条会因此查不到 url（只有恰好另有普通谱条目的才侥幸命中）。
   做法：整名查不到时，用**去掉 `[ 2 ]` 后缀的基准名**再查一趟。
2. **HTML 实体要解码** —— wiki 把 `Show up !` 写成 `Show up&#160;! - short ver -`（`&#160;` = 不断行空格）。
3. **省略号三种写法要统一** —— 本站用 `…`(U+2026)，wiki 用半角中点 `･`(U+FF65)，旧代码只把前者
   转成 `...`，后者原样留着，两者不相等。

修完实测：新增 4 行拿到数据（11000139 / 50000241 / 80001011 / 90001019），**0 行丢失、0 行已有值被改写**
（全量逐条 diff 过 before/after 的 notes / holds / bpm）。

另外 `data/title-overrides.json` 会改库里曲名（目前只有 Milchstrae → Milchstraße），
改完之后 remywiki 那边仍按**上游源名**匹配，所以映射脚本在整名/基准名都查不到时，
会再用源名查第三趟 —— 否则「修好曲名」反而会把原本能匹配的曲子弄丢。
- 与本站旧站快照 `data/upstream/wiki-v3-songs.json` 的 notecounts 交叉比对：
  **212 / 213 完全一致（99.5%）**，唯一差异是同名曲（`凛として咲く花の如く` 红色リトマス 版 vs
  remywiki 收的 大神ミオ 版）。
- 各难度的值还经过一道独立校验：用库里的 (bsc, adv, ext) 定数三元组去匹配页面里各张表后面的
  等级行（19 个「去表格化」页面全部命中），可排除取错表的可能。

## 重跑

逐页 Markdown 缓存 15 MB 不随仓库保存（`.devhome/remy-md/`），改解析规则时用缓存重跑即可，不需要重新抓。
抓取通道：直接连 remywiki 极不稳（Node fetch 大量超时、curl 平均 20 s/请求），
可用的是 `read_page`（modsearch 桥）；`anysearch extract` 会因输出 schema 报错。
