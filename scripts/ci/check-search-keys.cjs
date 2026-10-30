// src/data/search-keys.json 自检（`npm run check`）。
//
// 【为什么需要】它是**生成物**：data/jubeat.db 变了、忘了跑 `npm run data`，
// 文件就悄悄过期——表现是「新曲搜不到假名/罗马字」，既不报错也不崩，肉眼根本发现不了。
// 所以把「该有的条目必须有」变成断言：
//   1) 文件里的 song_id 必须都还在库中（抓住改名/下线后残留的孤儿键）；
//   2) 曲名或曲师含**假名**的曲必须有读音条目——这一条是确定成立的：片假名会被归一成
//      平假名、假名会被转成罗马字，两个结果都和原文不同，所以生成器一定会写入条目，
//      缺了只可能是文件过期。纯汉字曲名不在此列：kuroshiro 对中文汉字（如「诀爱」）
//      和个别未收录字转不出来，结果与原文相同会被跳过，属已知限制，只作统计输出。
//   3) 值的格式必须符合前端约定：全小写、无空白，段之间只用 | 分隔
//      （matchCard 会拿去掉空白的查询串直接比对）。
// 不再断言「值里不许有汉字」：kuroshiro 对 kuromoji 未收录的字（哀/嘆/輔/戯/閃/搏…）
// 原样返回，属已知限制而非文件过期，只作统计输出，不拦截。
// 拿库本身对账，不看文档数字，所以不会随统计口径漂移。
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '../..');
const KEYS = path.join(ROOT, 'src/data/search-keys.json');
const DB = path.join(ROOT, 'data/jubeat.db');

const fail = [];
const keys = JSON.parse(fs.readFileSync(KEYS, 'utf8'));
const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare('SELECT song_id, title, artist FROM songs').all();
db.close();

const byId = new Map(rows.map((r) => [r.song_id, r]));
const hasKanji = (s) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s || '');
const hasKana = (s) => /[\u3041-\u3096\u30a1-\u30fa]/.test(s || '');

// 1) 孤儿键
for (const id of Object.keys(keys)) {
  if (!byId.has(id)) fail.push('孤儿键（库里没有这首歌）：' + id);
}

// 2) 该有的条目必须有
let needKana = 0;
let kanjiOnlyGap = 0;
const kanjiOnlyGapList = [];
for (const r of rows) {
  const kana = hasKana(r.title) || hasKana(r.artist);
  const kanji = hasKanji(r.title) || hasKanji(r.artist);
  if (!kana && !kanji) continue;
  if (kana) {
    needKana++;
    if (!keys[r.song_id]) fail.push('缺读音条目（含假名但没索引）：' + r.song_id + ' ' + r.title);
  } else if (!keys[r.song_id]) {
    kanjiOnlyGap++;
    if (kanjiOnlyGapList.length < 3) kanjiOnlyGapList.push(r.song_id + ' ' + r.title);
  }
}

// 3) 值的格式符合前端约定
let kanjiLeft = 0;
for (const [id, v] of Object.entries(keys)) {
  if (typeof v !== 'string' || !v) { fail.push('空的读音值：' + id); continue; }
  // 一个空白都不该有：squash 会把它们全去掉，段之间用 | 分隔。
  if (/[\s\u3000]/.test(v)) fail.push('读音值含空白（前端会按无空白比对）：' + id);
  if (v !== v.toLowerCase()) fail.push('读音值不是小写：' + id);
  if (hasKanji(v)) kanjiLeft++;
}

if (fail.length) {
  console.error('check-search-keys FAIL (' + fail.length + ' 条)：');
  for (const f of fail.slice(0, 20)) console.error('  - ' + f);
  if (fail.length > 20) console.error('  …还有 ' + (fail.length - 20) + ' 条');
  process.exit(1);
}

console.log('check-search-keys ok: ' + Object.keys(keys).length + ' 条读音索引，' +
  needKana + ' 首含假名的曲全部覆盖，无孤儿键；库内 ' + rows.length + ' 首；' +
  '其中 ' + kanjiLeft + ' 条残留汉字（kuromoji 未收录，已知限制）' +
  (kanjiOnlyGap ? '；' + kanjiOnlyGap + ' 首纯汉字曲转不出读音（' + kanjiOnlyGapList.join('、') +
    (kanjiOnlyGap > 3 ? ' 等' : '') + '，已知限制）' : ''));
