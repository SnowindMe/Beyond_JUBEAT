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
// 【2026-11-01 23:00 实测基线，改代码后拿它对照】
//   曲目 1248 / 有谱面的档位 3744 / 能出图 3493 (93.3%) / 不出图 251 档
//     ① 无谱面文件 251 / ② 键数不符 0 / 另有 4 档「定数与 ub 不同但键数一致」，照样出图
//   一首都出不了的曲目 63 首（全是 ub 根本没收录：61 首国服音乐魔方原创 + 2 首 BTA 占位曲）
//       —— 查过 ub 的 library.json，这些 songId 一个都没有，连 BGM 音源也没有；
//          ub 是日服谱面站，国服原创曲它本来就不收。
//   沿革：
//     · 2026-11-01 早先基线 3396 (90.7%)，75 首无图，其中 7 首是 CS Charts（jubeat plus）误当街机谱，
//       已按 AC Charts / Regular Charts 修正 11 首（data/chart-overrides.json）。
//     · 2026-11-01 22:45 主人拍板「键数不符的按 ub 上的键数更改」→ 52 首 / 60 档 notecounts
//       按 ub 校正，键数不符归零，覆盖率 91.6% → 93.2%，一首都出不了的曲目 64 → 63 首。
//     · 2026-11-01 23:00 主人「等级差异不按 ub 的来（等级都是官方的）」→ 判据去掉定数比对，
//       只认键数。原先被定数挡住的 4 档（键数其实全等）恢复出图，93.2% → 93.3%。
//   剩余 251 档不再补：全部是上游根本没有谱面文件（63 首一首都出不了的那批）。
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
  const libNotes = s.notecounts ? s.notecounts[key] : null;
  // 【判据只有键数一条】2026-11-01 22:55 主人「等级差异不按 ub 的来（等级都是官方的）」：
  // 库里的定数是官方值，ub 的 level 标签会滞后（4 例定数不同但键数全等的谱面以前被误判成不可画）。
  // 取错页的情况（paranoia 老谱 563≠965）照样被键数这一条抓住，定数判据是多余且有害的。
  if (libNotes != null && c.keys !== libNotes) return null;
  return c;
}

let totalCharts = 0, shown = 0;
const noFile = [], keysBad = [];
const lvOnly = []; // 定数与 ub 不同但键数一致 → 现在照样出图，只作观察量打出来
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
    const cu = e[key];
    if (cu.level != null && Math.abs(parseFloat(cu.level) - lv) > 0.001) {
      lvOnly.push({ id: s.id, t: s.t, key, ubLv: cu.level, libLv: lv });
    }
    if (!c) {
      keysBad.push({ id: s.id, t: s.t, key, calc: cu.keys, lib: s.notecounts ? s.notecounts[key] : null });
      diag.push(key + ':keys');
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
console.log('  ② 键数不符(谱面变过) ' + keysBad.length);
console.log('  ·  定数不同但键数一致（照样出图，仅观察） ' + lvOnly.length);
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
