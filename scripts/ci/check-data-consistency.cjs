// 数据一致性自检：拉回来的数据里，不该有「上游明明有值、产物却是空」的字段。
//   node scripts/ci/check-data-consistency.cjs
//
// 【为什么要有这个脚本】2026-11-21 线上首页 4x4 曲绘墙少了一格（主人「怎么右边4x4少了一张
// 曲绘」）。根因不是代码：R2 里的 src/data/data.json 停在 11-18，音乐魔方定数第一的 THRERROR
// cover 是 null，构建时 pull 到的是旧数据，SSR 拿到空 src，applyCube() 里 `if (!s.c) continue`
// 把那一格整个跳过。**本地库完全正常**（105 首该世代曲全部有 cover），所以本地怎么看都对，
// 只有线上缺——这种「本地产物与生产快照漂移」靠肉眼看页面永远发现不了。
//
// 断言口径（四条，全部只比「产物 vs 它自己的源头」，不需要任何凭据）：
//   ① data.json 的 stat 必须与 songs.json 实际行数一致（防止 data.json 单方面过期）；
//   ② songs.json 每条曲的 cover 要么为空、要么在 src/data/cdn.json 里有映射（防止悬空引用）；
//   ③ 每个世代 top16 里带 cover 的曲，在 songs.json 里必须也是同一个 cover（防止一份产物先改、另一份没改）；
//   ④ top16 里**一条空 cover 都不许有**——这是本次事故的直接判据：首页方阵只认 top16，
//      其中一条空就等于少一格。库层面允许空 cover（新曲来不及补图），但 top16 是门面，必须齐。
//
// 【反向验证，必须做】改完脚本不能只看它绿。三种坏值都试过（2026-11-21）：
//   A 只抹 data.json 的 THRERROR cover        → ③ FAIL，点名「data.json=空，songs.json=id990000032.webp」
//   B 再把 stat.songs 改成 1                  → ① + ③ 双 FAIL
//   C songs.json 造一条 id00000000.webp 悬空   → ② FAIL，点名曲目
//   D 两边同时抹掉（事故最早形态）            → ④ FAIL，点名「音乐魔方 / THRERROR」
// 去掉断言里任何一条，对应的坏值就不再有 FAIL，脚本退化成只会打印 ok。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'src/data/data.json');
const SONGS = path.join(ROOT, 'src/data/songs.json');
const CDN = path.join(ROOT, 'src/data/cdn.json');

for (const f of [DATA, SONGS]) {
  if (!fs.existsSync(f)) {
    console.log('跳过：' + path.basename(f) + ' 不存在（先 npm run data）');
    process.exit(0);
  }
}

const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const songs = JSON.parse(fs.readFileSync(SONGS, 'utf8'));
const cdn = (() => { try { return JSON.parse(fs.readFileSync(CDN, 'utf8')).jackets || {}; } catch { return {}; } })();

const bad = [];

// ① stat.songs 与 songs.json 实际条数
if (data.stat && data.stat.songs !== songs.length) {
  bad.push('data.json 的 stat.songs=' + data.stat.songs + '，但 songs.json 实际 ' + songs.length + ' 条（data.json 过期）');
}

// ② 悬空 cover：产物里出现了 cdn.json 没有映射的名字
//    曲绘本就该全走图床映射（src/lib/covers.ts 的 jacketName 口径），悬空名会回退站内路径，
//    而本地图早已移进 archive/ —— 线上就是 404。真正的缺图另有 `缺曲绘` 日志，这里只管对不齐。
const dangling = songs.filter((s) => s.cover && !cdn[s.cover]);
if (dangling.length) {
  bad.push('songs.json 有 ' + dangling.length + ' 条 cover 在 cdn.json 里没有映射（会回退站内路径 → 404）：' +
    dangling.slice(0, 8).map((s) => s.t + '(' + s.id + ')' + s.cover).join('、') +
    (dangling.length > 8 ? ' …' : ''));
}

// ③ 两份产物互相打架：data.json 的 top16 与 songs.json 同一首的 cover 不一致
//    （含「songs 有值、data 空」——本次事故就是这个形状）
// 索引一次，避免 208 × 1255 的 O(n·m) 线性查找
const byTitleGen = new Map();
for (const s of songs) {
  const k = s.gen + '\u0000' + s.t;
  if (!byTitleGen.has(k)) byTitleGen.set(k, s);
}
let mismatched = 0;
const samples = [];
for (const g of data.gen || []) {
  for (const it of g.top16 || []) {
    // 同名曲可能存在于不同世代（如「アガット」与「アガット [ 2 ]」是两首），所以按 曲名+世代 一起锚
    const hit = byTitleGen.get(g.k + '\u0000' + it.t);
    if (!hit) continue;
    if ((it.cover || '') !== (hit.cover || '')) {
      mismatched++;
      if (samples.length < 8) samples.push(g.k + ' / ' + it.t + '：data.json=' + (it.cover || '空') + '，songs.json=' + (hit.cover || '空'));
    }
  }
}
if (mismatched) bad.push('top16 与 songs.json 的 cover 有 ' + mismatched + ' 处不一致：' + samples.join('；') + (mismatched > 8 ? ' …' : ''));

// ④ top16 空 cover：主站门面直接少格。2026-11-21 事故就是这一条（音乐魔方 THRERROR）。
//    和 ③ 分开写：③ 能抓到「两份产物打架」，抓不到「两边都空」——那是最早的形态，必须先于修复。
const emptyTop = [];
for (const g of data.gen || []) for (const it of g.top16 || []) if (!it.cover) emptyTop.push(g.k + ' / ' + it.t);
if (emptyTop.length) {
  bad.push('top16 有 ' + emptyTop.length + ' 条空 cover（首页方阵会少格）：' + emptyTop.slice(0, 8).join('、') + (emptyTop.length > 8 ? ' …' : ''));
}

if (bad.length) {
  console.log('FAIL 数据产物不一致（' + bad.length + ' 项）：');
  for (const b of bad) console.log('  · ' + b);
  console.log('处理：npm run data 重跑产物；仍不一致说明源头缺值，查 data/jubeat.db 的 cover 与 src/data/cdn.json 的映射。');
  process.exit(1);
}

const withCover = songs.filter((s) => s.cover).length;
const top16 = (data.gen || []).reduce((a, g) => a + (g.top16 || []).length, 0);
console.log('ok 数据一致：songs ' + songs.length + ' 条（带 cover ' + withCover + '）、top16 ' + top16 + ' 条，无悬空 cover、两份产物无打架');
