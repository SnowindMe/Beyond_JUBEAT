// 难度参照系（键数分位 / 长押率基准）预计算：构建期算一次，落成静态 JSON。
//   node scripts/build-difficulty-stats.cjs
//
// 【为什么必须在构建期算】
// 2026-11-01 线上事故：这组统计原本写成每次详情页请求都现算
// （getAllSongs 拉 1248 行 + 3744 条分桶 + 60 万次内层循环，实测 77 ms），
// CF Worker 的 CPU 预算撑不住，详情页直接 500。统计只随曲库变、与请求无关，
// 构建期算一次落盘、运行时只读 JSON，才是最省的做法。
//
// 【口径】见 src/lib/difficulty.ts 的头注释，这里只负责调用它、不做第二套算法。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SONGS = require(path.join(ROOT, 'src/data/songs.json'));
const OUT = path.join(ROOT, 'src/data/difficulty-stats.json');

const LEVELS = ['bsc', 'adv', 'ext'];
const MIN_BUCKET = 8;

// ① 按「难度|整级」分桶收集键数；② 收集有长押谱面的长押率
const buckets = new Map();
const holdRates = [];
for (const s of SONGS) {
  if (!s.notecounts) continue;
  for (const key of LEVELS) {
    const lv = s.lv[key];
    const notes = s.notecounts[key];
    if (lv == null || notes == null || notes <= 0) continue;
    const bk = key + '|' + Math.floor(lv);
    let arr = buckets.get(bk);
    if (!arr) buckets.set(bk, (arr = []));
    arr.push(notes);
    const h = s.holds ? s.holds[key] : null;
    if (h != null && h > 0) holdRates.push((h / notes) * 100);
  }
}
for (const arr of buckets.values()) arr.sort((a, b) => a - b);
holdRates.sort((a, b) => a - b);

const baseline = holdRates.length
  ? { medianPct: Math.round(holdRates[Math.floor(holdRates.length / 2)] * 100) / 100, sample: holdRates.length }
  : null;

// ③ 每首曲每一项算好：分位 + 长押率。分位用「小于它的个数 / 桶大小」，
//    桶内样本不足 MIN_BUCKET 时给 null（不显示分位），宁可少一个数字也不给假分位。
const out = {};
let withPctl = 0, withoutPctl = 0;
for (const s of SONGS) {
  if (!s.notecounts) continue;
  for (const key of LEVELS) {
    const lv = s.lv[key];
    const notes = s.notecounts[key];
    if (lv == null || notes == null) continue;
    const arr = buckets.get(key + '|' + Math.floor(lv)) || [];
    let pctl = null;
    if (arr.length >= MIN_BUCKET) {
      let below = 0;
      for (const x of arr) { if (x < notes) below++; else break; }
      pctl = Math.round((below / arr.length) * 100);
      withPctl++;
    } else {
      withoutPctl++;
    }
    const h = s.holds ? s.holds[key] : null;
    const holdPct = h != null && h > 0 && notes > 0 ? Math.round((h / notes) * 1000) / 10 : null;
    out[s.id + '|' + key] = [pctl, holdPct]; // 用数组压体积：{pctl, holdPct}
  }
}

const payload = { baseline, stats: out };
fs.writeFileSync(OUT, JSON.stringify(payload));
const bytes = fs.statSync(OUT).size;

console.log('难度参照系已生成');
console.log('  有分位的谱面 ' + withPctl + '，样本不足不显示分位 ' + withoutPctl);
console.log('  长押率基准线 ' + (baseline ? baseline.medianPct + '% (' + baseline.sample + ' 个有长押谱面)' : '无'));
console.log('  输出 ' + path.relative(ROOT, OUT) + '，' + (bytes / 1024).toFixed(1) + ' KB');
