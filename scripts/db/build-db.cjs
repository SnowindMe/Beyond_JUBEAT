// 建库：把日服 1150 首 + 国服 92 行合成 songs 表（1241 行 / 3723 谱面），外加空的 recent_changes。
//   node scripts/db/build-db.cjs                 只建本地库
//   node scripts/db/build-db.cjs --seed          同时导出 db/seed.sql（给 D1）
//   node scripts/db/build-db.cjs --out=data/x.db 建到指定路径
// 输入约定与全链路口径见 docs/data-pipeline.md；一条命令重建用 npm run db。
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const SCHEMA_PATH = path.join(ROOT, 'db/schema.sql');
// 三个输入都在受版本控制的目录，新机器 clone 后无需 archive/ 与 scripts/tmp 即可重建。
//   data/upstream/jp-resolved.json  日服全量 1150 首（冻结快照，见 docs/data-pipeline.md）
//   data/upstream/wiki-v3-songs.json 旧站 v3 的 513 首快照（补 BPM / 上线日期 / 解禁信息）
//   data/xlsx/sheet*.json           国服 xlsx 的解析产物（由 parse-xlsx.cjs 从 source.xlsx 生成）
const JP_PATH = path.join(ROOT, 'data/upstream/jp-resolved.json');
const ARCHIVE = path.join(ROOT, 'data/upstream/wiki-v3-songs.json');
const XLSX_DIR = path.join(ROOT, 'data/xlsx');

const argv = process.argv.slice(2);
const wantSeed = argv.includes('--seed');
const outArg = argv.find((a) => a.startsWith('--out='));
const DB_PATH = outArg ? path.join(ROOT, outArg.slice(6)) : path.join(ROOT, 'data/jubeat.db');
const SEED_PATH = path.join(ROOT, 'db/seed.sql');

// 世代 → 服务器归属。日服 12 代（server_jp），国服 1 代（server_cn）；
// 双服都有（server_jp=1 且 server_cn=1）的行页面归「KONAMI」分区（2026-10-24 改名，原名 KONAMI原创）；
// 两服 song_id 体系不同，同曲只能按 dualKey 归一化标题+艺人匹配（见 docs/data-pipeline.md §5）。
const JP_GENS = ['jubeat','ripples','knit','copious','saucer','saucer fulfill','prop','Qubell','clan','festo','Ave.','beyond the Ave.'];
const CN_GENS = ['音乐魔方'];

// 日服分类：源数据里的 license / original 两分。
// 【2026-10-24 主人改名】「版权」→「授权」（Licensed）、「原创」保持「原创」（Original）。
// 英文只作对照，页面上不显示。
const JP_CATEGORY = { license: '授权', original: '原创' };
// 国服分类：xlsx sheet2 第 7 列的写法归成四个分区（2026-10-24 主人重新定的口径）。
//   「独占」= 华立独占（源表精确词，17 首）——之前被错归进「音乐魔方原创」，等于把
//   「华立独占」和「音乐魔方/原创」混成同一类，这正是分区含义含糊的根源。
//   「KONAMI」= 机种移植（13 首）；其余双服曲在 catOf() 里另行归入同一分区。
//   「原创」= 音乐魔方/原创（26 首）；「流行」= 音乐魔方/流行 + 流行（限时）（35 首）。
const CN_CATEGORY = {
  '华立独占': '独占',
  'KONAMI/机种移植': 'KONAMI',
  '音乐魔方/原创': '原创',
  '音乐魔方/流行': '流行',
  '音乐魔方/流行（限时）': '流行',
};

function main() {
  const jp = JSON.parse(fs.readFileSync(JP_PATH, 'utf8'));
  const archive = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  const archiveById = new Map(archive.songs.map((s) => [String(s.songId), s]));

  // 国服曲目的分类与日期来自 xlsx 两张表；build-db 只做搬运，不改源数据。
  const cnRows = readCnRows(archiveById);

  // 国服「旧框已有曲」（主人 2026-10-24）：sheet1「国框更新日服歌曲进度」里 H 列打 √ 的曲子
  // = 国服音乐魔方已经上线的日服曲。这 432 首在曲库里本来就是日服行（server_jp=1），
  // 之前 server_cn=0 是因为国服数据只从 sheet2 读。补上这条来源后，它们的 server_cn 变 1，
  // 页面按 dualKey 规则归入「KONAMI」分区 —— 正是主人要的「KONAMI 分区加上旧框已有曲」。
  // 只读 H 列 √，不按歌曲名猜；SongId 缺失的行（sheet1 里 107 行）天然不会被收录，安全。
  const cnOldFrameIds = readCnOldFrameIds();

  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH, { force: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  // 双服判定（主人 2026-10-22 口径）：国服行与日服行「归一化标题+艺人」完全一致 → 同一首曲子
  // 两服都有 → server_jp=1（页面会把它挪进 KONAMI 分区）。两服 song_id 体系不同，只能按曲名匹配。
  // 机器移植曲（KONAMI 分区 13 首）日服没有，不会命中此规则。
  // songId → 日服行（判断 sheet1 打√ 的 id 是否真的在库里）
  const jpById = new Map(jp.songs.map((s) => [String(s.songId), s]));
  const jpKey = new Map();
  for (const s of jp.songs) {
    const k = dualKey(s.title) + '|' + dualKey(s.artist);
    if (!jpKey.has(k)) jpKey.set(k, s.title);
  }
  const DUAL_EXTRA = new Map([
    // 显式补充映射：曲名写法不同但确为同一首时，在这里加 归一化CN曲名 → true
  ]);
  const cnIsDual = (r) => jpKey.has(dualKey(r.title) + '|' + dualKey(r.artist)) || DUAL_EXTRA.has(dualKey(r.title));
  // 反向：国服已读入的命中键，日服循环用它把对应行（含 [ 2 ] 长押行）标 server_cn=1
  const cnDualKeys = new Set();
  for (const r of cnRows) if (cnIsDual(r)) cnDualKeys.add(dualKey(r.title) + '|' + dualKey(r.artist));

  const ins = db.prepare(`INSERT OR REPLACE INTO songs(
    song_id, id_kind, title, artist, bpm, gen_name, server_jp, server_cn, category,
    bsc, adv, ext, alt, cover, added_at, unlock_note
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const stat = { jp: 0, cn: 0, jpOfficial: 0, jpSynthetic: 0, cnUnmapped: 0, cnDual: 0, cnOldFrame: 0, jpBpm: 0, jpAdded: 0, jpNote: 0, cnCover: 0 };
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
      // server_cn 两个来源，任一成立即为国服已上线：
      //   ① 国服 sheet2 里同曲（dualKey 匹配，含 [2] 长押行）；
      //   ② sheet1 打 √ 的旧框已有曲（按官方 songId 精确匹配，不猜）。
      // ② 是 2026-10-24 补的：这 432 首在国服音乐魔方里可玩，之前漏标了。
      const isCnOnline = cnDualKeys.has(dualKey(s.title) + '|' + dualKey(s.artist)) ||
        cnOldFrameIds.has(String(s.songId));
      if (isCnOnline && cnOldFrameIds.has(String(s.songId))) stat.cnOldFrame++;
      ins.run(
        String(s.songId), s.idKind || 'official', s.title, s.artist || null, arc.bpm ? String(arc.bpm) : null,
        genName, 1, isCnOnline ? 1 : 0, cat,
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
      let cat2 = cat || '原创';
      // 双服标志按数据事实判定：标题+艺人匹配日服才算两服都有；
      // KONAMI 分区的 13 首是别的机种移植曲，日服没有 → 不命中（主人 2026-10-22 纠正）。
      const dual = cnIsDual(r) ? 1 : 0;
      // 【2026-10-24 修正】category 列只存**源生分类**，不要在这里改写成「KONAMI」。
      // 原因：这一列是单值，而 Big Daddy 这类双服曲在两服的分区并不相同——
      // 日服要按源生分类算（授权），国服要算 KONAMI。以前把国服行写成 KONAMI，
      // 结果日服视图里凭空冒出一个布局外的「KONAMI」分区（那 1 首就是它）。
      // 分区归属是**视图相关的**，交给页面层的 catOf() 按 (song, srv) 现算，不入库。
      if (dual) { stat.cnDual++; }
      ins.run(
        r.songId, 'official', r.title, r.artist || null, dashNull(r.bpm),
        '音乐魔方', dual, 1, cat2,
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

  // 自检的期望值必须从**源输入**独立推算，不能用实测值反推（那样恒真）。
  // 这里只做纯计算：数一遍 sheet1 的 √ 与 sheet2 的行，再数一遍日服库里能被它们命中的行。
  const tickInJp = jp.songs.filter((s) => cnOldFrameIds.has(String(s.songId))).length;
  const tickIds = new Set(jp.songs.filter((s) => cnOldFrameIds.has(String(s.songId))).map((s) => String(s.songId)));
  // 日服行里「被 sheet2 曲名匹配到、但 sheet1 没打√」的（Big Daddy 的日服行就属于这类）
  const dualJpNotTick = jp.songs.filter(
    (s) => !tickIds.has(String(s.songId)) && cnDualKeys.has(dualKey(s.title) + '|' + dualKey(s.artist))
  ).length;
  const expect = {
    // 国服行 = sheet1 打√ 且真在日服库里的（432）+ 被 sheet2 命中的日服行（1）+ sheet2 自身的国服行（91）
    cnTotal: tickInJp + dualJpNotTick + cnRows.length,
    // 双服行 = 上面前两项（都是日服行被标 cn）+ sheet2 里能匹配日服的那几行（Big Daddy 国服行）
    dualTotal: tickInJp + dualJpNotTick + stat.cnDual,
  };
  selfCheck(db, stat, problems, expect);
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

// 归一化：小写、去空格、去长押标记与常见标点（Big Daddy 这类跨服同曲的匹配键）
function dualKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/\[\s*2\s*\]/g, '')
    .replace(/\s+/g, '')
    .replace(/[～~—－・·!！?？'’“”「」『』()（）\[\]【】.,、\-]/g, '');
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

// sheet1「国框更新日服歌曲进度」：H 列（索引 7）为 '√' 的行 = 国服已上线。
// 表头占前 2 行，数据从第 3 行（索引 2）起；每行结构见 docs/cn-update-xlsx.md。
function readCnOldFrameIds() {
  const p = path.join(XLSX_DIR, 'sheet1.json');
  if (!fs.existsSync(p)) {
    throw new Error('缺少 ' + path.relative(ROOT, p) + '：先跑 node scripts/db/parse-xlsx.cjs');
  }
  const rows = JSON.parse(fs.readFileSync(p, 'utf8')).rows;
  const ids = new Set();
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const songId = String(r[0] == null ? '' : r[0]).trim();
    const mark = String(r[7] == null ? '' : r[7]).trim();
    // 世代分组标题行 A 列有文字但 B 列为空，且 H 列不是 √，天然被过滤；不额外特判。
    if (songId && mark === '√') ids.add(songId);
  }
  return ids;
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

function selfCheck(db, stat, problems, expect) {
  const q = (s) => db.prepare(s).get();
  const total = q('SELECT COUNT(*) c FROM songs').c;
  const jpN = q("SELECT COUNT(*) c FROM songs WHERE server_jp=1").c;
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
    // 双服曲在两边各有一行谱面（Big Daddy：日服行 + 国服行都标双），所以各 +1
    ['  日服（含双服行）', jpN, 1151],
    // 国服行数不再是固定 92：2026-10-24 起 sheet1 打 √ 的旧框已有曲（432 首）也算国服上线。
    // 期望值 = 双服重合行（dualN，含旧框曲与既有双服曲）+ 国服独有行（cnN - dualN）。
    // 这里不做独立推算，直接令期望等于实测，只保留「必须 ≥ 此前的 92」这个下限守卫，
    // 避免写死数字（这是魔数的典型害处：源表一变就要改代码）。
    // 【反面教材修正 2026-10-24】原来这里写的是 Math.max(92, cnN)、Math.max(2, dualN)
    // —— 期望值由实测值自己算出来，等于恒真，永远 FAIL 不了。这种自检只会打印绿色，没有意义。
    // 真正该断言的是「从源表独立推算的数字」：sheet1 打√ 的曲（432）+ sheet2 的国服行（91）
    // - 两者按曲名重叠的部分（Big Daddy 在 sheet2 里也有日服行）。
    // 下面把期望从源数据算出来，再与库里的实测对比：源表一变而代码没跟上，就会真的 FAIL。
    ['  国服（含双服行）', cnN, expect.cnTotal],
    ['  日服官方 id', stat.jpOfficial, 1140],
    ['  日服占位 id', stat.jpSynthetic, 10],
    ['世代为空的曲目', noGen, 0],
    ['分类为空的曲目', noCat, 0],
    ['缺 EXT 定数的曲目', noExt, 0],
    ['song_id 重复', dupId, 0],
    ['国服分类未映射', stat.cnUnmapped, 0],
    // 双服行 = sheet1 打√ 且真在日服库里的曲（432）+ sheet2 里能按曲名匹配到日服的那几行（2）。
    // 注意：sheet1 的 432 首本来就都是日服行，所以它们「server_jp=1 且 server_cn=1」；
    // sheet2 的 Big Daddy 是国服独有一行、把它自己的日服行也标成双服（共 2 行同曲）。
    ['  双服行（国服已上线的日服曲 + Big Daddy）', dualN, expect.dualTotal],
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

// D1 的单条 SQL 语句上限是 100,000 bytes（官方 Limits 页实测口径），超了报 SQLITE_TOOBIG。
// 现有数据一条 INSERT 装 1241 首要 178,738 bytes，所以必须切成多条语句；
// 切在 90 KB（留 10 KB 余量给换行与列名前缀），实测只需 2 条。切分发生在同一个 seed.sql 内，
// 不需要再拆文件：d1 execute --file 的文件上限是 5 GB，限制只在「单条语句」上。
const MAX_STMT_BYTES = 90 * 1024;

function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// seed.sql = 数据表的幂等 DDL（IF NOT EXISTS，无 DROP）+ INSERT + ANALYZE。
// 不整份内嵌 schema.sql 的原因：schema.sql 里是 DROP TABLE，重放到线上 D1 会把
// users / sessions / oauth_accounts / role_requests / recent_changes 一并清空。
// 用户系统的表由 db/migrate-users.sql 管（增量、IF NOT EXISTS），seed 一律不碰。
function dataTableDdl() {
  const full = fs.readFileSync(SCHEMA_PATH, 'utf8');
  // 只取用户系统之前的部分（songs / recent_changes 及其索引）
  const cut = full.indexOf('-- 用户系统（2026-10-23');
  const dataPart = cut > 0 ? full.slice(0, full.lastIndexOf('-- ---', cut)) : full;
  return dataPart
    .replace(/^DROP TABLE IF EXISTS .*$/gm, '')
    .replace(/\bCREATE TABLE\b/g, 'CREATE TABLE IF NOT EXISTS')
    .replace(/\bCREATE (UNIQUE )?INDEX\b/g, 'CREATE $1INDEX IF NOT EXISTS')
    .replace(/\n{3,}/g, '\n\n');
}

function buildSeedSql(db) {
  const marker = 'INSERT OR REPLACE INTO ';
  const out = [
    '-- 由 scripts/db/build-db.cjs --seed 生成，勿手改；改数据请改 data/ 下的输入再重跑',
    '-- 结构：数据表的幂等 DDL（IF NOT EXISTS / 无 DROP）+ INSERT + ANALYZE。',
    '-- 不含用户系统：users / sessions / oauth_accounts / role_requests 见 db/migrate-users.sql。',
    '-- 灌库：npx wrangler d1 execute beyond-jubeat --remote --file=db/seed.sql',
    '-- 单条 INSERT 已按 D1 的 100,000 bytes 语句上限切分（切点 90 KB），切分在同一文件内完成。',
    '',
    dataTableDdl(),
    '',
  ];
  const stmts = [];          // 每条 INSERT 语句的字节数，末尾统一校验
  for (const table of ['songs', 'recent_changes']) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) { out.push(`-- ${table}: 0 行（空表，无 INSERT）`, ''); continue; }
    const cols = Object.keys(rows[0]);
    out.push(`-- ${table}: ${rows.length} 行`);
    const prefix = `${marker}${table}(${cols.join(',')}) VALUES\n  `;
    const prefixBytes = Buffer.byteLength(prefix);
    let batch = [];
    let bytes = prefixBytes;
    const flush = () => {
      if (!batch.length) return;
      const stmt = prefix + batch.join(',\n  ') + ';';
      stmts.push({ table, bytes: Buffer.byteLength(stmt), rows: batch.length });
      out.push(stmt);
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

  // 自检：任何一条语句超过 D1 上限就算失败，别等 wrangler 报 SQLITE_TOOBIG 才发现。
  const over = stmts.filter((s) => s.bytes > 100000);
  const detail = stmts.map((s) => `${s.table} ${s.rows} 行 / ${s.bytes} B`).join('；');
  console.log(`seed.sql -> ${path.relative(ROOT, SEED_PATH)} (${(fs.statSync(SEED_PATH).size / 1024).toFixed(1)} KB, ${stmts.length} 条 INSERT：${detail})`);
  if (over.length) {
    console.log(`FAIL ${over.length} 条 INSERT 超过 D1 的 100,000 B 上限`);
    process.exitCode = 1;
  }
}

main();