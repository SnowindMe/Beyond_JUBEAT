// 搜索读音索引：给每首曲算「平假名读音 + 罗马字」，产出 src/data/search-keys.json。
//   node scripts/build-search-key.cjs
//
// 【为什么需要它 / 2026-10-30 主人要求「搜索适配假名·罗马字」】
// 曲名与曲师里大量是汉字（「凛として咲く花の如く」「千本桜」），haystack 里只有原文，
// 用户按假名「りんとして」或罗马字「senbon」搜一个都命中不了。这里用 kuroshiro
// （+ kuromoji 词典）把原文转成读音，在**数据生成阶段**算好存成静态 JSON——
// 页面构建与运行时都不需要词典，不会把十几 MB 的词典打进 Worker。
//
// 【为什么单独出一个文件，而不是往 songs.json / D1 加列】
//  · songs.json 只是 astro dev 的快照，生产读 D1（见 src/lib/db.ts）；
//  · 加 D1 列要在线上库 ALTER + 重灌，且忘跑就等于「改了没生效」的静默失效；
//  · 读音是**纯派生数据**（源就是 title/artist），按 song_id 挂在 db.ts 查询层合并即可，
//    跟着 git push 一起部署，没有额外的迁移步骤。
// 这份文件被 src/lib/db.ts 静态 import，会进 Worker 包（gzip 后约 15 KB），换来零运行时开销。
//
// 【只做 kuroshiro 自己做不到的两件事】
//  1) 片假名 → 平假名：to:'hiragana' **不会**转片假名（エンドルフィン 原样返回），
//     不补这一步，用户打平假名「えんど」永远搜不到片假名标题；
//  2) 去掉所有空白：读音串只用于子串匹配，保留空格反而挡住「senbon sakura」这类查询
//     （前端比对前也会把查询串的空格去掉）。
// 与原文完全相同的转写没有信息量（纯英文曲名就是这种情况），直接丢掉省体积。
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data/jubeat.db');
const OUT = path.join(ROOT, 'src/data/search-keys.json');

// 片假名 → 平假名。主区 ァ..ヶ 统一 -0x60；ヷヸヹヺ 四个没有对应半区，单列。
const kata2hira = (s) => s.replace(/[\u30A1-\u30F6\u30F7-\u30FA]/g, (c) => {
  const code = c.charCodeAt(0);
  return String.fromCharCode(code <= 0x30F6 ? code - 0x60 : 0x308F + (code - 0x30F7));
});

// 读音串只用于子串匹配：无空白、全小写。
const squash = (s) => (s || '').toLowerCase().replace(/[\s\u3000]+/g, '');

// 罗马字去音调符号：kuroshiro 默认 hepburn 会给长音加 ー（ō ū），而用户敲键盘只会打
// 纯 ASCII（ō 打不出来 / 打成 o）——不去掉就等于「罗马字搜不到」。
// 顺手去掉「ん'」里的撇号：shin'ya → shinya，用户不会打那个撇号。
const asciiRomaji = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, '');

(async () => {
  const Kuroshiro = require('kuroshiro');
  const Analyzer = require('kuroshiro-analyzer-kuromoji');
  const k = new Kuroshiro();
  await k.init(new Analyzer());

  const db = new DatabaseSync(DB, { readOnly: true });
  const rows = db.prepare('SELECT song_id, title, artist FROM songs ORDER BY song_id').all();
  db.close();

  const out = {};
  let chars = 0;
  // kuroshiro 是异步的，逐首串行：1200+ 首约十几秒，这是低频的数据生成步骤，不进构建。
  for (const r of rows) {
    const parts = [];
    for (const src of [r.title, r.artist]) {
      if (!src) continue;
      const orig = squash(src);
      const kana = squash(kata2hira(await k.convert(src, { to: 'hiragana' })));
      const romaji = squash(asciiRomaji(await k.convert(src, { to: 'romaji' })));
      if (kana && kana !== orig) parts.push(kana);
      if (romaji && romaji !== orig) parts.push(romaji);
    }
    if (!parts.length) continue;
    // 用 | 分隔各段（曲名读音 | 曲名罗马字 | 曲师读音 | 曲师罗马字）：
    // 段与段之间不该被查询串跨过去，用一个读音里不会出现的字符挡一下；
    // 同时保证「值里不含任何空白」这条断言成立（真漏了空白处理就会报出来）。
    out[r.song_id] = [...new Set(parts)].join('|');
    chars += out[r.song_id].length;
  }

  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('search-keys ok: ' + Object.keys(out).length + '/' + rows.length +
    ' 首有读音，' + chars + ' 字符，' + fs.statSync(OUT).size + ' 字节');
})().catch((e) => { console.error(e); process.exitCode = 1; });
