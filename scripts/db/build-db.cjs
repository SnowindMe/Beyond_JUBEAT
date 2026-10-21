// 建库：把日服 1150 首 + 国服 84 首合成一张歌曲表，外加空的最近更改表。
//   node scripts/db/build-db.cjs                 只建本地库
//   node scripts/db/build-db.cjs --seed          同时导出 db/seed.sql（给 D1）
//   node scripts/db/build-db.cjs --out=data/x.db 建到指定路径
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const SCHEMA_PATH = path.join(ROOT, 'db/schema.sql');
const JP_PATH = path.join(ROOT, 'data/beyond-the-ave/resolved.json');
const ARCHIVE = path.join(ROOT, 'archive/legacy/jubeat-wiki-v3/data/songs.json');
const XLSX_DIR = path.join(ROOT, 'scripts/tmp/xlsx');

const argv = process.argv.slice(2);
const wantSeed = argv.includes('--seed');
const outArg = argv.find((a) => a.startsWith('--out='));
const DB_PATH = outArg ? path.join(ROOT, outArg.slice(6)) : path.join(ROOT, 'data/jubeat.db');
const SEED_PATH = path.join(ROOT, 'db/seed.sql');

// 世代 → 服务器归属。日服 12 代（server_jp），国服 1 代（server_cn）；
// 双服都有（server_jp=1 且 server_cn=1）的行页面归「KONAMI原创」分区；
// 现有数据两服 song_id 体系不同、暂无重合（移植曲只有国服有，主人 2026-10-22 纠正）。
const JP_GENS = ['jubeat','ripples','knit','copious','saucer','saucer fulfill','prop','Qubell','clan','festo','Ave.','beyond the Ave.'];
const CN_GENS = ['音乐魔方'];

// 日服分类：源数据里的 license / original 两分。
const JP_CATEGORY = { license: '版权', original: '原创' };
// 国服分类：xlsx sheet2 第 7 列的五种写法归成三个分区（主人 m02311 定的口径）。
const CN_CATEGORY = {
  '华立独占': '音乐魔方原创',
  '音乐魔方/原创': '音乐魔方原创',
  '音乐魔方/流行': '音乐魔方流行',
  '音乐魔方/流行（限时）': '音乐魔方流行',
  'KONAMI/机种移植': 'KONAMI原创',
};

function main() {
  const jp = JSON.parse(fs.readFileSync(JP_PATH, 'utf8'));
  const archive = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  const archiveById = new Map(archive.songs.map((s) => [String(s.songId), s]));

  // 国服曲目的分类与日期来自 xlsx 两张表；build-db 只做搬运，不改源数据。
  const cnRows = readCnRows(archiveById);

  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH, { force: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const ins = db.prepare(`INSERT OR REPLACE INTO songs(
    song_id, id_kind, title, artist, bpm, gen_name, server_jp, server_cn, category,
    bsc, adv, ext, alt, cover, added_at, unlock_note
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const stat = { jp: 0, cn: 0, jpOfficial: 0, jpSynthetic: 0, cnUnmapped: 0, cnDual: 0, jpBpm: 0, jpAdded: 0, jpNote: 0, cnCover: 0 };
  const problems = [];

  db.exec('BEGIN');
  try {
    // ---- 日服 1150 首 ----
    for (const s of jp.songs) {
      const genName = normalizeJpGen(s.origin);
      if (!genName) { problems.push(`日服世代无法归并: ${s.origin} (${s.title})`); continue; }
      const cat = JP_CATEGORY[s.category];
      if (!cat) { problems.push(`日服分类未知: ${s.category} (${s.title})`); continue; }
      const jpOfficial = s.idKind === 'official';
      if (jpOfficial) stat.jpOfficial++; else stat.jpSynthetic++;
      // resolved.json 没有 BPM / 上线日期 / 解禁信息，这三项从 archive 快照按 songId 回查；
      // 无占位 id 的新曲（721 首）在快照里压根不存在，回查不到就保持 NULL，不猜。
      const arc = archiveById.get(String(s.songId)) || {};
      if (arc.bpm) stat.jpBpm++;
      if (arc.addedAt) stat.jpAdded++;
      const note = jpUnlockNote(arc);
      if (note) stat.jpNote++;
      ins.run(
        String(s.songId), s.idKind || 'official', s.title, s.artist || null, arc.bpm ? String(arc.bpm) : null,
        genName, 1, 0, cat,
        num(s.levels && s.levels.bsc), num(s.levels && s.levels.adv), num(s.levels && s.levels.ext),
        s.alt ? 1 : 0, webpCover(s.jacketFile),
        arc.addedAt || null, note
      );
      stat.jp++;
    }

    // ---- 国服 84 首 ----
    for (const r of cnRows) {
      const cat = CN_CATEGORY[r.cnCategory];
      if (!cat) { stat.cnUnmapped++; problems.push(`国服分类未映射: ${r.cnCategory} (${r.title})`); }
      // 主人 2026-10-22 纠正：音乐魔方的「KONAMI原创」13 首是移植曲（别的机种搬进音乐魔方），
      // 只有国服有、日服没有 → server_jp=0。双服标志按数据事实判定，不做分类推断。
      const dual = 0;
      if (dual) stat.cnDual++;
      ins.run(
        r.songId, 'official', r.title, r.artist || null, dashNull(r.bpm),
        '音乐魔方', dual, 1, cat || '音乐魔方原创',
        num(r.bsc), num(r.adv), num(r.ext),
        /\[\s*2\s*\]/.test(r.title) ? 1 : 0, r.cover || null,
        isoDate(r.date), dashNull(r.pool)
      );
      if (r.cover) stat.cnCover++;
      stat.cn++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  selfCheck(db, stat, problems);
  if (wantSeed) buildSeedSql(db);
  db.close();
  console.log(`\n本地库 -> ${path.relative(ROOT, DB_PATH)} (${(fs.statSync(DB_PATH).size / 1024).toFixed(1)} KB)`);
  if (problems.length) {
    console.log('\n待人工确认:');
    for (const p of problems.slice(0, 20)) console.log('  - ' + p);
  }
}

// 解禁信息合成一条人类可读文本：解禁池 + 期次 / 兑换价。三样都没有就留 NULL。
function jpUnlockNote(arc) {
  const parts = [];
  if (arc.unlockPool) parts.push('解禁' + (arc.poolPhase ? (arc.poolPhase === 1 ? 'I' : 'II') : '') + ' - ' + arc.unlockPool);
  if (arc.exchangeCost) parts.push('兑换 ' + arc.exchangeCost);
  if (arc.limited && arc.limitedPeriod && arc.limitedPeriod.endsOn) parts.push('限时至 ' + arc.limitedPeriod.endsOn);
  return parts.length ? parts.join(' / ') : null;
}

// 曲绘入库即归一化为站点素材名：日服源文件是 idN.gif，build-data 转档产物统一叫 idN.webp。
function webpCover(v) {
  const s = String(v || '').trim();
  return s ? s.replace(/\.gif$/i, '.webp') : null;
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// xlsx 用 '——' / '—' 表示「没有这项」，入 NULL 而不是把破折号当数据。
function dashNull(v) {
  const s = String(v == null ? '' : v).trim();
  return s && s !== '——' && s !== '—' ? s : null;
}

function isoDate(raw) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(String(raw || '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// resolved.json 的 origin 是带前缀的原生写法（'jubeat knit' / 'jubeat saucer fulfill' / 'beyond the Ave.'）。
// 剥掉 'jubeat ' 前缀后与 JP_GENS 对齐；'saucer F' 是旧 schema 的简写，一并归一。
function normalizeJpGen(origin) {
  const raw = String(origin || '').trim();
  if (!raw) return null;
  const alias = { 'saucer F': 'saucer fulfill' };
  const v = alias[raw] || raw.replace(/^jubeat\s+/, '');
  return JP_GENS.includes(v) ? v : null;
}

// 国服行取 xlsx sheet2；曲绘 xlsx 里没有，从 archive 快照按 songId 回查。
// 快照没有的新曲（2026.10.15 那批）回退查素材库 archive/materials/songjackets/idN.png
// （转档产物 public/assets/images/jackets/idN.webp 已存在则用同名 webp），再没有才留 NULL。
function readCnRows(archiveById) {
  const p = path.join(XLSX_DIR, 'sheet2.json');
  if (!fs.existsSync(p)) {
    throw new Error('缺少 ' + path.relative(ROOT, p) + '：先跑 node scripts/db/parse-xlsx.cjs');
  }
  const rows = JSON.parse(fs.readFileSync(p, 'utf8')).rows;
  const out = [];
  for (const r of rows) {
    const songId = String(r[0] || '').trim();
    const title = String(r[1] || '').trim();
    if (!/^\d{6,}$/.test(songId) || !title) continue;   // 跳过分组标题行与空行
    const arc = archiveById.get(songId) || {};
    out.push({
      songId, title, artist: String(r[2] || '').trim(), bpm: String(r[3] || '').trim(),
      bsc: r[4], adv: r[5], ext: r[6],
      cnCategory: String(r[7] || '').trim(),
      pool: String(r[8] || '').trim(),
      date: String(r[9] || '').trim(),
      cover: arc.cover ? String(arc.cover).split('/').pop() : cnCoverFallback(songId),
    });
  }
  return out;
}

// 国服新曲的曲绘回退：素材库 png 或已转档的 webp，任一存在即认 idN.webp 为站点名。
function cnCoverFallback(songId) {
  const png = path.join(ROOT, 'archive/materials/songjackets', 'id' + songId + '.png');
  const webp = path.join(ROOT, 'public/assets/images/jackets', 'id' + songId + '.webp');
  if (fs.existsSync(webp) || fs.existsSync(png)) return 'id' + songId + '.webp';
  return null;
}

function selfCheck(db, stat, problems) {
  const q = (s) => db.prepare(s).get();
  const total = q('SELECT COUNT(*) c FROM songs').c;
  const jpN = q("SELECT COUNT(*) c FROM songs WHERE server_jp=1 AND server_cn=0").c;
  const cnN = q("SELECT COUNT(*) c FROM songs WHERE server_cn=1").c;
  const dualN = q("SELECT COUNT(*) c FROM songs WHERE server_jp=1 AND server_cn=1").c;
  const noneN = q("SELECT COUNT(*) c FROM songs WHERE server_jp=0 AND server_cn=0").c;
  const noGen = q('SELECT COUNT(*) c FROM songs WHERE gen_name IS NULL OR gen_name = \'\'').c;
  const noCat = q('SELECT COUNT(*) c FROM songs WHERE category IS NULL OR category = \'\'').c;
  const noExt = q('SELECT COUNT(*) c FROM songs WHERE ext IS NULL').c;
  const dupId = q('SELECT COUNT(*) c FROM (SELECT song_id FROM songs GROUP BY song_id HAVING COUNT(*) > 1)').c;
  const gens = db.prepare('SELECT server_jp, server_cn, gen_name, COUNT(*) n FROM songs GROUP BY server_jp, server_cn, gen_name ORDER BY server_jp DESC, server_cn DESC, gen_name').all();

  const rows = [
    ['曲目总数', total, 1241],
    ['  日服', jpN, 1150],
    ['  国服', cnN, 91],
    ['  日服官方 id', stat.jpOfficial, 1140],
    ['  日服占位 id', stat.jpSynthetic, 10],
    ['世代为空的曲目', noGen, 0],
    ['分类为空的曲目', noCat, 0],
    ['缺 EXT 定数的曲目', noExt, 0],
    ['song_id 重复', dupId, 0],
    ['国服分类未映射', stat.cnUnmapped, 0],
    ['  双服（两标志全 1）', dualN, 0],
    ['  国服独有', stat.cn - dualN, 91],
    ['两服标志全 0 的行', noneN, 0],
  ];
  console.log('=== 一致性自检 ===');
  let bad = 0;
  for (const [name, got, want] of rows) {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} ${got} (期望 ${want})`);
  }
  console.log('\n=== 各世代曲目数 ===');
  for (const g of gens) console.log(`  jp${g.server_jp}cn${g.server_cn}  ${String(g.gen_name).padEnd(20)} ${g.n}`);
  if (bad) { console.log(`\n自检未通过项 ${bad} 个`); process.exitCode = 1; }
}

// D1 单条语句上限约 100KB（实测 141396 bytes 报 SQLITE_TOOBIG），按行数 + 字节双封顶。
const MAX_STMT_BYTES = 90 * 1024;

function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function buildSeedSql(db) {
  const marker = 'INSERT OR REPLACE INTO ';
  const out = [
    '-- 由 scripts/db/build-db.cjs --seed 生成，勿手改',
    '-- 灌库：npx wrangler d1 execute beyond-jubeat --remote --file=db/seed.sql',
    '',
    fs.readFileSync(SCHEMA_PATH, 'utf8'),
    '',
  ];
  for (const table of ['songs', 'recent_changes']) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    out.push(`-- ${table}: ${rows.length} 行`);
    const prefix = `${marker}${table}(${cols.join(',')}) VALUES\n  `;
    const prefixBytes = Buffer.byteLength(prefix);
    let batch = [];
    let bytes = prefixBytes;
    const flush = () => {
      if (!batch.length) return;
      out.push(prefix + batch.join(',\n  ') + ';');
      batch = [];
      bytes = prefixBytes;
    };
    for (const r of rows) {
      const tuple = '(' + cols.map((c) => sqlLit(r[c])).join(',') + ')';
      const tupleBytes = Buffer.byteLength(tuple) + 4;
      if (bytes + tupleBytes > MAX_STMT_BYTES) flush();
      batch.push(tuple);
      bytes += tupleBytes;
    }
    flush();
    out.push('');
  }
  // 统计信息随 seed 一起重放：没有 ANALYZE 时 D1/SQLite 靠猜选错索引
  out.push('ANALYZE;', '');
  fs.writeFileSync(SEED_PATH, out.join('\n'));
  console.log(`seed.sql -> ${path.relative(ROOT, SEED_PATH)} (${(fs.statSync(SEED_PATH).size / 1024).toFixed(1)} KB)`);
}

main();