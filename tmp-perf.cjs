// 模拟线上 CPU 成本：buildDifficultyStats 对 1248 首 x 3 档的执行时间
const t0 = Date.now();
const songs = require('./src/data/songs.json');
const LEVELS = ['bsc','adv','ext'];
const MIN_BUCKET = 8;
const buckets = new Map(); const holdRates = [];
for (const s of songs) {
  if (!s.notecounts) continue;
  for (const key of LEVELS) {
    const lv = s.lv[key], notes = s.notecounts[key];
    if (lv == null || notes == null || notes <= 0) continue;
    const bk = key + '|' + Math.floor(lv);
    let arr = buckets.get(bk); if (!arr) buckets.set(bk, (arr = []));
    arr.push(notes);
    const h = s.holds ? s.holds[key] : null;
    if (h != null && h > 0) holdRates.push((h / notes) * 100);
  }
}
for (const arr of buckets.values()) arr.sort((a,b)=>a-b);
holdRates.sort((a,b)=>a-b);
const baseline = holdRates.length ? { medianPct: holdRates[Math.floor(holdRates.length/2)], sample: holdRates.length } : null;
const out = new Map();
let loopOps = 0;
for (const s of songs) {
  if (!s.notecounts) continue;
  for (const key of LEVELS) {
    const lv = s.lv[key], notes = s.notecounts[key];
    if (lv == null || notes == null) continue;
    const arr = buckets.get(key + '|' + Math.floor(lv)) ?? [];
    let notesPctl = null;
    if (arr.length >= MIN_BUCKET) {
      let below = 0;
      for (const x of arr) { loopOps++; if (x < notes) below++; else break; }
      notesPctl = Math.round((below / arr.length) * 100);
    }
    const h = s.holds ? s.holds[key] : null;
    const holdPct = h != null && h > 0 && notes > 0 ? (h / notes) * 100 : null;
    out.set(s.id + '|' + key, { notesPctl, bucketSize: arr.length, holdPct, holdBaseline: baseline });
  }
}
console.log('执行耗时', Date.now()-t0, 'ms');
console.log('内层循环次数', loopOps);
