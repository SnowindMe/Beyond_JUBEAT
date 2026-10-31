// remy-db-map.json → .devhome/remy-by-song.json（按 song_id 归并的入库快照）。
//   运行：从**仓库根**跑 node scripts/db/remy/make-snapshot.cjs
// 输出再由 make-remy-data.cjs 落到 data/remy/（受版本控制）。

const fs = require('fs');
const map = JSON.parse(fs.readFileSync('.devhome/remy-db-map.json', 'utf8'));
// 【2026-10-31 主人指示】Big Daddy 页面在同一 ### jubeat 段下挂了两张子表：
//   `jubeat音乐魔方 Charts` = ? ? ?（占位，取不到值）
//   `jubeat (2026) Charts`  = 313 / 10 | 725 / 23 | 904 / 35
// 解析器默认取该段的第一张表（音乐魔方那张），于是两条 Big Daddy 都拿不到键数。
// 主人原话「big daddy抓出来的bpm和hold那些信息是bta的（songid为11000228）」
// → 有数值的那张属于 beyond the Ave. 版，只补给 11000228；
//   国服行 991000007 是音乐魔方谱（页面为 ?），保持"未知"，不许用 BTA 的数冒充。
const OVERRIDES = { '11000228': { notes: '313/725/904', holds: '10/23/35' } };
const out = {};
const allNull = [];
let bpmFilled = 0, bpmChanged = 0, holdRows = 0, unknown = 0, partialNull = 0;
const changedList = [];
for (const r of map) {
  if (!r.matched || !r.chartFound) continue;
  const nums = (s) => (s ? s.split('/').map((v) => (v === '' ? null : Number(v))) : []);
  const ov = OVERRIDES[r.song_id];
  const notes = nums(ov ? ov.notes : r.notes), holds = nums(ov ? ov.holds : r.holds);
  const lv = ['bsc', 'adv', 'ext'];
  const no = {}, ho = {};
  lv.forEach((d, i) => { if (notes[i] != null) no[d] = notes[i]; if (holds[i] != null) ho[d] = holds[i]; });
  const hasData = Object.keys(no).length > 0;
  if (hasData && Object.keys(no).length < 3) partialNull++;
  const rec = {};
  const bpm = r.remyBpm || null;
  if (bpm) { rec.bpm = String(bpm); if (!r.dbBpm) bpmFilled++; else if (String(r.dbBpm) !== String(bpm)) { bpmChanged++; changedList.push(r.title + ' | ' + r.dbBpm + ' -> ' + bpm); } }
  if (hasData) {
    rec.has_hold = Object.values(ho).some((x) => x > 0) ? 1 : 0;
    if (rec.has_hold) holdRows++;
    rec.notecounts = no; rec.holds = ho;
  } else {
    unknown++; allNull.push(r.title + ' | ' + r.song_id);
  }
  if (Object.keys(rec).length) out[r.song_id] = rec;
}
fs.writeFileSync('.devhome/remy-by-song.json', JSON.stringify(out));
console.log('快照条目', Object.keys(out).length, '| 新增 bpm', bpmFilled, '| 改写 bpm', bpmChanged, '| has_hold=1', holdRows, '| 键数缺失(只有 bpm)', unknown, '| 部分缺失', partialNull);
console.log('size', fs.statSync('.devhome/remy-by-song.json').size);
console.log('--- 无键数数据的曲目'); console.log(allNull.join('\n'));
const keys = Object.keys(out); console.log('--- 样例', keys.slice(0, 3).map((k) => k + ' ' + JSON.stringify(out[k])).join('\n'));
let n1 = 0, n0 = 0, nu = 0;
for (const k of keys) { const v = out[k]; if (v.has_hold === 1) n1++; else if (v.has_hold === 0) n0++; else nu++; }
console.log('has_hold: 1=' + n1 + ' 0=' + n0 + ' 缺=' + nu + ' ；仅 bpm 条=' + unknown);