// 把 .devhome/ 下的中间产物落成 data/remy/*.json（受版本控制的那两份）。
//   运行：从**仓库根**跑 node scripts/db/remy/make-remy-data.cjs
// 三份大输入留在 .devhome/：remy-list / remy-pages-final / remy-md 缓存，都不随仓库保存。

const fs = require('fs');
const path = require('path');
const MD = Object.assign({}, JSON.parse(fs.readFileSync('.devhome/remy-md/index.json', 'utf8')), JSON.parse(fs.readFileSync('.devhome/remy-md/index-miss.json', 'utf8')));
const list = JSON.parse(fs.readFileSync('.devhome/remy-list.json', 'utf8'));
const pages = JSON.parse(fs.readFileSync('.devhome/remy-pages-final.json', 'utf8'));
const bySong = JSON.parse(fs.readFileSync('.devhome/remy-by-song.json', 'utf8'));

// 榜单外补充页（2026-10-31）：这 13 首不在 Full Song List 里，主快照永远匹配不到，
// 由 make-extra-pages.cjs 从各自页面单独解析后并进来。没有这个文件就跳过（不改变原有行为）。
const extraPath = '.devhome/remy-extra-snapshot.json';
const extra = fs.existsSync(extraPath) ? JSON.parse(fs.readFileSync(extraPath, 'utf8')) : {};
// 合并规则：**只补主快照没有的键**。主快照已有的一律以主快照为准——
// 主快照是 1137 行两路交叉验证过的，补充页只用来填它的空洞。
let extraAdded = 0;
for (const [id, rec] of Object.entries(extra)) {
  if (bySong[id]) continue;
  bySong[id] = rec;
  extraAdded++;
}

const out = [];
let withData = 0, withHold = 0, holdCharts = 0, holdSum = 0, noData = [];
for (const e of list) {
  const p = pages[e.url];
  const isAlt2 = /\[\s*2\s*\]\s*$/.test(String(e.title).trim());
  const c = p ? (isAlt2 ? p.alt2 : p.reg) : null;
  const charts = c ? c.charts.filter((x) => x.notes != null).map((x) => ({ diff: x.diff, notes: x.notes, holds: x.holds })) : [];
  const hasData = charts.length > 0;
  const hasHold = charts.some((x) => (x.holds || 0) > 0);
  if (hasData) { withData++; if (hasHold) { withHold++; } for (const x of charts) { if (x.holds > 0) { holdCharts++; holdSum += x.holds; } } }
  else noData.push((isAlt2 ? '[2] ' : '') + e.title);
  out.push({
    title: e.title, artist: e.artist || null, url: e.url, variant: isAlt2 ? 'alt2' : 'regular',
    bpm: p ? p.bpm : null, charts, hasData, hasHold,
    source: p ? (p.strict ? 'table' : 'digest') : null,
  });
}
fs.writeFileSync('data/remy/jubeat-charts.json', JSON.stringify(out, null, 1));
fs.writeFileSync('data/remy/by-song-id.json', JSON.stringify(bySong, null, 0));
console.log('列表条目', out.length, '| 有数据', withData, '| 含 hold', withHold, '| 有 hold 的难度谱', holdCharts, '| hold 总数', holdSum, '| 无数据', noData.length);
console.log('无数据条目:', noData.join(' / '));
console.log('榜单外补充页并入:', extraAdded, '条（源 ' + Object.keys(extra).length + ' 条，其余主快照已有）');
console.log('files:', fs.readdirSync('data/remy').map((f) => f + '=' + fs.statSync('data/remy/' + f).size).join(' '));