// 密度条覆盖率审计：统计有多少谱面能真正画出 bar 条、多少不能、为什么。
//   node scripts/ci/check-bar-coverage.cjs
//
// 【为什么要有这个脚本】详情页的谱面密度条是「有就画、没有就不画」的加分项，
// 不做的曲目在页面上就是一片空白，肉眼很难判断「这是上游没有」还是「我抓挂了」。
// 这个脚本按**页面 chartOf() 的同一套判据**逐首重算，把缺口和原因列清楚。
//
// 【判据必须与 src/pages/songs/[songId].astro 的 chartOf 保持一致】
//   ① 有谱面文件；② 上游 level 与库定数一致；③ 算出的键数等于库 notecounts。
//   任一条不满足就不画 —— 因为画了就是错图（旁边那个「N 键」会是另一个数）。
//
// 【2026-11-01 实测基线，改代码后拿它对照】
//   曲目 1248 / 有谱面的档位 3744 / 能出图 3396 (90.7%) / 不出图 348 档
//   一首都出不了的曲目 75 首：
//     · 63 首 ub 完全没收录（61 首国服音乐魔方原创 + 2 首 BTA 占位曲）
//       —— 查过 ub 的 library.json，这些 songId 一个都没有，连 BGM 音源也没有；
//          ub 是日服谱面站，国服原创曲它本来就不收。
//     · 12 首 ub 上有文件但版本不符（全是日服），最严重的是 paranoia：
//       ub 挂 Lv8 老谱（563 键），现行是 Lv9.5（965 键），偏差 41%。
//   主人 2026-11-01 拍板：**就这样留空，不补**。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const songs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/songs.json'), 'utf8'));
const charts = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ub-charts.json'), 'utf8'));
const LEVELS = ['bsc', 'adv', 'ext'];

/** 与页面 chartOf() 逐条对齐；改一处必须改另一处 */
function chartOf(s, key) {
  const c = charts[String(s.id)]?.[key];
  if (!c || !c.cols || !c.cols.length) return null;
  const libLv = s.lv ? s.lv[key] : null;
  const libNotes = s.notecounts ? s.notecounts[key] : null;
  if (c.level != null && libLv != null) {
    const ub = parseFloat(c.level);
    if (Number.isFinite(ub) && Math.abs(ub - libLv) > 0.001) return null;
  }
  if (libNotes != null && c.keys !== libNotes) return null;
  return c;
}

let totalCharts = 0, shown = 0;
const noFile = [], lvBad = [], keysBad = [];
const songsNoBar = [];

for (const s of songs) {
  let shownAny = false;
  const diag = [];
  for (const key of LEVELS) {
    const lv = s.lv ? s.lv[key] : null;
    if (lv == null) continue;
    totalCharts++;
    const e = charts[String(s.id)];
    if (!e || !e[key]) { noFile.push({ id: s.id, key }); diag.push(key + ':noFile'); continue; }
    const c = chartOf(s, key);
    if (!c) {
      const cu = e[key];
      if (cu.level != null && parseFloat(cu.level) !== lv) {
        lvBad.push({ id: s.id, t: s.t, key, ubLv: cu.level, libLv: lv });
        diag.push(key + ':lv' + cu.level + '!=' + lv);
      } else {
        keysBad.push({ id: s.id, t: s.t, key, calc: cu.keys, lib: s.notecounts ? s.notecounts[key] : null });
        diag.push(key + ':keys');
      }
      continue;
    }
    shown++;
    shownAny = true;
  }
  if (!shownAny) songsNoBar.push({ id: s.id, t: s.t, diag: diag.join(',') });
}

const pct = (shown / totalCharts * 100).toFixed(1);
console.log('密度条覆盖：' + shown + '/' + totalCharts + ' 档（' + pct + '%），不出图 ' + (totalCharts - shown) + ' 档');
console.log('  ① 无谱面文件        ' + noFile.length);
console.log('  ② 定数不符(旧版谱面) ' + lvBad.length);
console.log('  ③ 键数不符(谱面变过) ' + keysBad.length);
console.log('一首都出不了的曲目：' + songsNoBar.length + ' 首');

if (songsNoBar.length) {
  console.log('\n明细：');
  songsNoBar.forEach((x, i) => console.log('  ' + (i + 1) + '. ' + x.id + ' ' + x.t + '  [' + x.diag + ']'));
}

// 反向自检：覆盖率不该突然掉下来（掉太多说明抓取或口径出问题了）
if (shown / totalCharts < 0.85) {
  console.error('\nFAIL: 覆盖率跌破 85%，先查 ub 抓取或口径是否被改坏');
  process.exit(1);
}
