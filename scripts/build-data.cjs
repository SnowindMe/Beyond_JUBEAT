// 数据生成：把 data/jubeat.db（两张表）抽成站点要用的 data.json + 曲绘。
//   node scripts/build-data.cjs
// 只在库更新时需要跑；页面自己读 src/data/data.json，构建时不读库、不联网。
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data/jubeat.db');
const OUTDIR = path.join(ROOT, 'src/data');
const JDEST = path.join(ROOT, 'public/assets/images/jackets');

// 两服的曲绘是两套体系，源头不同、产物格式统一成 webp：
//   日服  cover 是官方曲绘本名 id<N>.gif，源文件在 data/beyond-the-ave/jackets/
//   国服  cover 是 archive 里的 md5 名 <hash>.webp，源文件在 archive/legacy/jubeat-wiki-v3/public/jackets/
const JP_JACKETS = path.join(ROOT, 'data/beyond-the-ave/jackets');
const CN_JACKETS = path.join(ROOT, 'archive/legacy/jubeat-wiki-v3/public/jackets');

// 世代顺序：日服按年份从旧到新，国服当前唯一世代排最后（口径见 CONTEXT.md）。
const GEN_ORDER = [
  ['jubeat', 'jp', '2008'], ['ripples', 'jp', '2009'], ['knit', 'jp', '2010'],
  ['copious', 'jp', '2011'], ['saucer', 'jp', '2012'], ['saucer fulfill', 'jp', '2014'],
  ['prop', 'jp', '2015'], ['Qubell', 'jp', '2016'], ['clan', 'jp', '2017'],
  ['festo', 'jp', '2018'], ['Ave.', 'jp', '2022'], ['beyond the Ave.', 'jp', '2024'],
  ['音乐魔方', 'cn', '2023'],
];

const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare(`
  SELECT song_id, title, artist, bpm, gen_name, server_jp, server_cn, category,
         bsc, adv, ext, alt, cover, added_at, unlock_note, id_kind
  FROM songs ORDER BY gen_name, ext DESC
`).all();
db.close();

const num = (v) => (typeof v === 'number' ? v : null);
// 行归属：server_jp / server_cn 双标志（0/1）。'both' = 两服都有（国服 KONAMI原创 移植曲）。
const srvOf = (s) => (s.server_jp && s.server_cn ? 'both' : s.server_jp ? 'jp' : 'cn');
const ext = (s) => num(s.ext);

// 两服源文件后缀不同，站点侧一律用 .webp 名（转档在文件末尾统一做）。
const coverName = (c) => (c ? String(c).replace(/\.gif$/i, '.webp') : null);

// site 侧统一字段：t 曲名 / a 艺术家 / lv 三难度 / cover 曲绘名 / d 上线日期 / o 世代
const pick = (s) => ({
  t: s.title, a: s.artist || null,
  lv: { bsc: num(s.bsc), adv: num(s.adv), ext: num(s.ext) },
  cover: coverName(s.cover), d: s.added_at || null, o: s.gen_name,
  srv: srvOf(s), cat: s.category, alt: s.alt ? 1 : 0,
});

// 曲目页用的全量曲目。字段名保持 src/data/data.json 的短键风格，
// 但带上页面要用的 id / 长押谱标记 / 解禁说明；曲绘不在这里挑，游戏内定数一律来自库。
const SONGS = rows.map((s) => ({
  id: s.song_id, t: s.title, a: s.artist || null,
  lv: { bsc: num(s.bsc), adv: num(s.adv), ext: num(s.ext) },
  cover: coverName(s.cover), d: s.added_at || null, bpm: s.bpm || null,
  gen: s.gen_name, jp: !!s.server_jp, cn: !!s.server_cn, cat: s.category, alt: s.alt ? 1 : 0,
  unlock: s.unlock_note || null, kind: s.id_kind,
}));

const byExtDesc = (a, b) => (ext(b) || 0) - (ext(a) || 0);
const TOP = rows.slice().sort(byExtDesc).slice(0, 12).map(pick);
const LATEST = rows.filter((s) => s.added_at)
  .sort((a, b) => String(b.added_at).localeCompare(String(a.added_at))).slice(0, 12).map(pick);

const GEN = GEN_ORDER.map(([key, server, y]) => {
  const arr = rows.filter((s) => (server === 'cn' ? s.server_cn : s.server_jp) && s.gen_name === key);
  // 代表曲优先取「定数最高且真有曲绘」的那首：国服定数第一的 THRERROR 是新曲、还没有曲绘，
  // 直接取 top1 会让音乐魔方这一格永远出不了图。
  const rep = arr.length
    ? (arr.filter((s) => s.cover).sort(byExtDesc)[0] || arr.slice().sort(byExtDesc)[0])
    : null;
  // 【top16：该世代 EXT 定数最高的 16 首（2026-10-25 主人要求）】
  // 首屏立方体原本是「每代一张代表曲」共 13 格、且不随主题切换。
  // 主人要的是「当前主题世代自己的 16 首、按定数大到小」——即切到 clan 主题时，
  // 这 16 格全是 clan 世代的曲。所以数据要按世代各备一份。
  //
  // 排序：EXT 定数降序；同定数按曲名升序（稳定，避免每次重建顺序漂移）。
  // 缺 EXT 的排最后（与页面筛选的约定一致，不能当 0 混进前面）。
  // 不足 16 首的世代（如 jubeat 只有 20 首但够；万一有更少的）就返回实际条数，
  // 前端按实际长度渲染，不留空格。
  const top16 = arr.slice()
    .sort((a, b) => (ext(b) ?? -1) - (ext(a) ?? -1) || String(a.title).localeCompare(String(b.title)))
    .slice(0, 16)
    .map(pick);
  return { k: key, s: server, y, n: arr.length, rep: rep ? pick(rep) : null, top16 };
});

// 定数分布：10.5 及以上并成一档，其余按整数档
const bucket = {};
for (const s of rows) {
  const e = ext(s);
  if (e == null) continue;
  const k = e >= 10.5 ? '10.5' : String(Math.floor(e));
  bucket[k] = (bucket[k] || 0) + 1;
}
const DIST = ['5', '6', '7', '8', '9', '10', '10.5']
  .filter((k) => bucket[k]).map((k) => ({ k, v: bucket[k] }));
const dots = rows.map(ext).filter((e) => e != null).sort((a, b) => a - b);

// 谱面数按三难度实际有值的格子数算（不是曲目数 × 3：国服有曲目缺档）
const charts = rows.reduce((n, s) => n + (s.bsc != null) + (s.adv != null) + (s.ext != null), 0);
const gensJp = GEN.filter((g) => g.s === 'jp').length;
const gensCn = GEN.filter((g) => g.s === 'cn').length;

const out = {
  stat: { songs: rows.length, charts, gens: GEN.length, gensJp, gensCn },
  top: TOP,
  latest: LATEST,
  gen: GEN,
  dist: DIST,
  dots,
  gen10: rows.filter((s) => ext(s) >= 10).length,
  gen105: rows.filter((s) => ext(s) >= 10.5).length,
  alt: rows.filter((s) => s.alt).length,
};
out.pad = rows.slice().sort(byExtDesc).slice(0, 16).map(pick);

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'data.json'), JSON.stringify(out));
// 曲目页的全量曲目：一首一行，按服务器 / 世代 / EXT 降序（世代顺序由页面按 GEN_ORDER 排）
fs.writeFileSync(path.join(OUTDIR, 'songs.json'), JSON.stringify(SONGS));

// 曲目页要用全量曲绘，这里不再只转 data.json 引用的那几十张。
fs.mkdirSync(JDEST, { recursive: true });
const wanted = new Set(SONGS.map((x) => x.cover).filter(Boolean));

let sharp = null;
try { sharp = require('sharp'); } catch { /* 没装 sharp 时只能拷现成的国服 webp */ }

// sharp 是异步的，转档段包在 async IIFE 里；.cjs 没有顶层 await。
(async () => {
  let copied = 0, converted = 0, missing = [];
  for (const name of wanted) {
    const dest = path.join(JDEST, name);
    if (fs.existsSync(dest)) continue;               // 已有产物，跳过

    // 日服源文件是 .gif，转成同尺寸 webp
    const gifSrc = path.join(JP_JACKETS, name.replace(/\.webp$/i, '.gif'));
    if (fs.existsSync(gifSrc)) {
      if (!sharp) { missing.push(name + ' (无 sharp)'); continue; }
      await sharp(gifSrc).resize(144, 144, { fit: 'cover' }).webp({ quality: 82 }).toFile(dest);
      converted++;
      continue;
    }
    // 国服源文件本身就是 webp，直接复制
    const webpSrc = path.join(CN_JACKETS, name);
    if (fs.existsSync(webpSrc)) { fs.copyFileSync(webpSrc, dest); copied++; continue; }
    missing.push(name);
  }

  console.log('data.json ok; songs ' + rows.length + ', charts ' + charts +
    ', gen ' + GEN.length + ', dots ' + dots.length +
    ', jackets 新增 ' + (copied + converted) + ' (转 ' + converted + ' / 拷 ' + copied + ')');
  if (missing.length) console.log('缺曲绘 ' + missing.length + ' 张: ' + missing.join(', '));
})().catch((e) => { console.error(e); process.exitCode = 1; });