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

  // 世代人工覆盖（2026-10-25）：上游 origin 是首发世代，改版曲/替代谱面的
  // 归属应是新版上线的世代，只能靠人工维护。见 readGenOverrides 的注释。
  const genOverrides = readGenOverrides();

  // 解禁标记（2026-10-25 修）：以 sheet1 I 列（国服官方更新表）为准，archive 只当补充。
  // 起因：主人指出「解禁II 不是有 61 首吗」，而库里只有 55 首 —— 差的 6 首全是 [2] 长押曲
  // （70001001 / 80001002 / 80001003 / 80001004 / 80001014 / 80001015）+ 1 首 concon。
  // 真因是 unlock_note 只从 archive/wiki-v3-songs.json 回查，而那份旧站快照对这几首
  // 恰好没有 unlockPool（实测快照 55 首 poolPhase=2，源表 61 首）。
  // 现在按「源表优先、快照兜底」取，覆盖 186 首 = sheet1 I 列全部解禁标记行。
  const s1Unlock = readSheet1Unlock();

  // songId 修正（2026-10-25）：见 readIdFixes 注释。占位 id 与错位 id 都走这里，
  // 重映射后再写库，因此库里的 song_id 一律是官方 id（除少数确实拿不到的）。
  const idFixes = readIdFixes();

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
    bsc, adv, ext, alt, cover, added_at, unlock_note, limited_until
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  // 【2026-10-28 限时曲】取 archive 快照里的 limitedPeriod.endsOn（YYYY-MM-DD）。
  // 只认 endsOn，不要 limited 布尔：实测 Will We Shine 的 limited 是 false，
  // 但它确实有 2026-07-30~10-14 的限时区间——布尔不可靠，日期才是事实。
  // 也不用数据里那个 daysLeft：它是生成快照当天的余量，早就过期失效。
  const limitedUntilOf = (arc) => {
    const p = arc && arc.limitedPeriod;
    if (!p || !p.endsOn) return null;
    const d = String(p.endsOn).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  };

  const stat = { jp: 0, cn: 0, jpOfficial: 0, jpSynthetic: 0, cnUnmapped: 0, cnDual: 0, cnOldFrame: 0, jpBpm: 0, jpAdded: 0, jpNote: 0, cnCover: 0, unlockI: 0, unlockII: 0, limited: 0 };
  const problems = [];

  db.exec('BEGIN');
  try {
    // ---- 日服 1150 首 ----
    for (const s of jp.songs) {
      // songId 修正：占位 id（BTA-xxx）与错位 id 都换成官方 id，必须在一切
      // 按 id 查表之前做（否则 archive 回查、cnOldFrame 匹配都会用错 id）。
      const srcId = String(s.songId);
      const finalId = idFixes.get(srcId) || srcId;
      if (idFixes.has(srcId)) {
        stat.idFixed = (stat.idFixed || 0) + 1;
        // 修正后 idKind 一律视为官方 id（原来记 synthetic 是因为占位 id）
        s.idKind = 'official';
      }
      // 世代：先看人工覆盖表（改版曲 / [2] 谱归新版世代），没有再按 origin 归并。
      // 覆盖表里没有的 songId 一定走 origin；覆盖表里的 songId 若在库中不存在，
      // 由后面的自检报出来（避免覆盖表写了错 id 却静默失效）。
      // 注意覆盖表的 key 用**原始 id**（写表时以现有库为准），因此这里用 srcId 查。
      const ovGen = genOverrides.get(srcId);
      const genName = ovGen || normalizeJpGen(s.origin);
      if (!genName) { problems.push(`日服世代无法归并: ${s.origin} (${s.title})`); continue; }
      if (ovGen) stat.genOverride = (stat.genOverride || 0) + 1;
      const cat = JP_CATEGORY[s.category];
      if (!cat) { problems.push(`日服分类未知: ${s.category} (${s.title})`); continue; }
      const jpOfficial = s.idKind === 'official';
      if (jpOfficial) stat.jpOfficial++; else stat.jpSynthetic++;
      // resolved.json 没有 BPM / 上线日期 / 解禁信息，这三项从 archive 快照按 songId 回查；
      // 无占位 id 的新曲（721 首）在快照里压根不存在，回查不到就保持 NULL，不猜。
      const arc = archiveById.get(srcId) || {};
      if (arc.bpm) stat.jpBpm++;
      if (arc.addedAt) stat.jpAdded++;
      const note = jpUnlockNote(arc, s1Unlock.get(srcId));
      if (note) stat.jpNote++;
      // 解禁期次计数：与 sheet1 I 列的独立推算对比（见自检），不写死数字。
      if (s1Unlock.has(srcId)) {
        if (s1Unlock.get(srcId).phase === 2) stat.unlockII++; else stat.unlockI++;
      }
      // server_cn 两个来源，任一成立即为国服已上线：
      //   ① 国服 sheet2 里同曲（dualKey 匹配，含 [2] 长押行）；
      //   ② sheet1 打 √ 的旧框已有曲（按官方 songId 精确匹配，不猜）。
      // ② 是 2026-10-24 补的：这 432 首在国服音乐魔方里可玩，之前漏标了。
      const isCnOnline = cnDualKeys.has(dualKey(s.title) + '|' + dualKey(s.artist)) ||
        cnOldFrameIds.has(srcId);
      if (isCnOnline && cnOldFrameIds.has(srcId)) stat.cnOldFrame++;
      ins.run(
        finalId, s.idKind || 'official', s.title, s.artist || null, arc.bpm ? String(arc.bpm) : null,
        genName, 1, isCnOnline ? 1 : 0, cat,
        num(s.levels && s.levels.bsc), num(s.levels && s.levels.adv), num(s.levels && s.levels.ext),
        s.alt ? 1 : 0, webpCover(s.jacketFile),
        arc.addedAt || null, note, limitedUntilOf(arc)
      );
      if (limitedUntilOf(arc)) stat.limited = (stat.limited || 0) + 1;
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
        isoDate(r.date), dashNull(r.pool),
        // 国服行也按 songId 回查一次快照：限时曲实测都在国服（新年快乐、Will We Shine）
        limitedUntilOf(archiveById.get(String(r.songId)))
      );
      if (limitedUntilOf(archiveById.get(String(r.songId)))) stat.limited = (stat.limited || 0) + 1;
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
    // 官方 / 占位 id 期望值由上游原始数据 + 修正表推算（不写死：每加一条 id 修正，
    // 这两个数都会变，硬编码等于每次都要改断言）。
    jpOfficial: jp.songs.filter((s) => s.idKind === 'official' || idFixes.has(String(s.songId))).length,
    jpSynthetic: jp.songs.filter((s) => s.idKind !== 'official' && !idFixes.has(String(s.songId))).length,
    // 国服行 = sheet1 打√ 且真在日服库里的（432）+ 被 sheet2 命中的日服行（1）+ sheet2 自身的国服行（91）
    cnTotal: tickInJp + dualJpNotTick + cnRows.length,
    // 双服行 = 上面前两项（都是日服行被标 cn）+ sheet2 里能匹配日服的那几行（Big Daddy 国服行）
    dualTotal: tickInJp + dualJpNotTick + stat.cnDual,
    // 解禁期次：直接数 sheet1 I 列，与库里的 unlock_note 对照（2026-10-25 加）。
    unlockI: [...s1Unlock.values()].filter((v) => v.phase === 1).length,
    unlockII: [...s1Unlock.values()].filter((v) => v.phase === 2).length,
  };
  // id 修正表自检：每条都必须真的生效（旧 id 已不存在、新 id 已存在），
  // 并且新 id 不能被两条修正挤到同一个（否则 INSERT OR REPLACE 会静默吞掉一条）。
  const usedNewIds = new Map();
  for (const [from, to] of idFixes) {
    if (usedNewIds.has(to)) {
      problems.push(`id 修正表重复目标: ${from} 与 ${usedNewIds.get(to)} 都指向 ${to}`);
    }
    usedNewIds.set(to, from);
    // 【互换要放过】A→B 且 B→A 时，A 这个 id 之后会被 B 那条修正的新主人占用，
    // 所以「旧 id 仍在库中」对互换项是正常现象，不能当错误报。
    // 判据：这个旧 id 是否也是别人修正表的**目标**。是 → 它本来就该继续存在。
    const isSwapTarget = [...idFixes.values()].includes(from);
    const stillOld = db.prepare('SELECT COUNT(*) n FROM songs WHERE song_id = ?').get(from).n;
    const hasNew = db.prepare('SELECT COUNT(*) n FROM songs WHERE song_id = ?').get(to).n;
    if (stillOld && !isSwapTarget) problems.push(`id 修正未生效: ${from} 仍在库中`);
    if (!hasNew) problems.push(`id 修正目标缺失: ${to}（来自 ${from}）`);
  }

  // 覆盖表自检：表里每个 songId 都必须真的存在于库里，且写进去的世代与预期一致。
  // 不做这一步的话，表里写错一个 id（比如手滑少一位）会静默无效 ——
  // 表现为「改了没生效」，比报错难查得多。
  for (const [id, wantGen] of genOverrides) {
    const row = db.prepare('SELECT gen_name FROM songs WHERE song_id = ?').get(id);
    if (!row) { problems.push(`覆盖表里的 songId 不在库中: ${id}`); continue; }
    if (row.gen_name !== wantGen) {
      problems.push(`覆盖未生效: ${id} 期望 ${wantGen}，实际 ${row.gen_name}`);
    }
  }

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
//
// 【两个来源的优先级（2026-10-25 定）】解禁池/期次以 **sheet1 I 列**（国服官方更新表）为准，
// archive 快照只在源表没有该曲时兜底。原因：
//   ① 源表是国服运营方的原始记录，B 站/旧站快照是二手转抄；
//   ② 实测两者重叠 179 首、值完全一致（0 处冲突），说明口径同源，谁补谁都安全；
//   ③ 但快照缺 7 首（6 首 [2] 长押曲 + concon），源表全有 —— 只信快照就会少 6 首解禁II。
// 兑换价 / 限时这两项源表没有，仍只从快照取，不与解禁池来源混淆。
function jpUnlockNote(arc, s1) {
  const parts = [];
  const pool = s1 && s1.pool ? s1 : (arc.unlockPool ? { pool: arc.unlockPool, phase: arc.poolPhase } : null);
  if (pool) parts.push('解禁' + (pool.phase ? (pool.phase === 1 ? 'I' : 'II') : '') + ' - ' + pool.pool);
  if (arc.exchangeCost) parts.push('兑换 ' + arc.exchangeCost);
  if (arc.limited && arc.limitedPeriod && arc.limitedPeriod.endsOn) parts.push('限时至 ' + arc.limitedPeriod.endsOn);
  return parts.length ? parts.join(' / ') : null;
}

// sheet1 I 列（索引 8）的解禁标记：「解禁I - POOL」/「解禁II - POOL」。
// 该列还有「——」「空」「2026.02.10」这类值（日期或占位），一律不认 —— 只取解禁池写法。
// 解析失败的写法直接抛错而不是静默跳过：静默跳过就表现为「数据少了几首」，最难查。
function readSheet1Unlock() {
  const p = path.join(XLSX_DIR, 'sheet1.json');
  if (!fs.existsSync(p)) {
    throw new Error('缺少 ' + path.relative(ROOT, p) + '：先跑 node scripts/db/parse-xlsx.cjs');
  }
  const rows = JSON.parse(fs.readFileSync(p, 'utf8')).rows;
  const map = new Map();
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const songId = String(r[0] == null ? '' : r[0]).trim();
    if (!/^\d{6,}$/.test(songId)) continue;
    const raw = String(r[8] == null ? '' : r[8]).trim();
    if (!raw || !raw.includes('解禁')) continue;
    const m = /^解禁(II|I)\s*-\s*(\S+)$/.exec(raw);
    if (!m) {
      throw new Error('sheet1 I 列解禁写法无法解析: ' + songId + ' -> ' + JSON.stringify(raw));
    }
    map.set(songId, { phase: m[1] === 'II' ? 2 : 1, pool: m[2] });
  }
  return map;
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

// ---- songId 修正表（2026-10-25 建立）----
// 上游有些曲拿不到官方 songId（用 BTA-<曲绘id> 占位），还有几首 id 与世代段不符。
// data/id-fixes.json 存「现有 id → 正确 id」，插入前统一重映射。
// 重映射在内存里整表做（不就地 UPDATE），所以**互换**（A→B 且 B→A）不会撞主键。
function readIdFixes() {
  const p = path.join(ROOT, 'data/id-fixes.json');
  if (!fs.existsSync(p)) return new Map();
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const map = new Map();
  const bad = [];
  for (const [from, v] of Object.entries(raw.fixes || {})) {
    const to = String((v && v.id) || '').trim();
    if (!to) { bad.push(from + ' -> (空)'); continue; }
    map.set(String(from), to);
  }
  if (bad.length) throw new Error('data/id-fixes.json 里有空目标 id：\n  ' + bad.join('\n  '));
  return map;
}

// ---- 世代人工覆盖表（2026-10-25 建立）----
// 上游 origin 记的是「曲目首发世代」，但改版曲与替代谱面（[2] 谱）的归属应是
// 「新版上线的世代」。上游快照没有这个信息，这类错位只能人工维护。
// 文件：data/gen-overrides.json（受版本控制），key=songId，value={gen, note}。
// 覆盖优先于 origin；gen 必须与 JP_GENS 一致，写错直接抛错而不是静默丢弃
// （静默丢弃会表现为「改了没生效」，比报错难查得多）。
function readGenOverrides() {
  const p = path.join(ROOT, 'data/gen-overrides.json');
  if (!fs.existsSync(p)) return new Map();
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const map = new Map();
  const bad = [];
  for (const [id, v] of Object.entries(raw.overrides || {})) {
    const gen = String((v && v.gen) || '').trim();
    if (!JP_GENS.includes(gen)) { bad.push(id + ' -> ' + JSON.stringify(gen)); continue; }
    map.set(String(id), gen);
  }
  if (bad.length) {
    throw new Error('data/gen-overrides.json 里有非法世代名（必须是 JP_GENS 之一）：\n  ' + bad.join('\n  '));
  }
  return map;
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
    // 官方 / 占位 id 的期望值不再写死：id 修正表会把占位 id 换成官方 id，
    // 每修一条这两个数都会变。改成从上游原始数据 + 修正表推算，
    // 这样以后加修正不用改断言（写死的话每加一条就要改一次，属于魔数）。
    ['  日服官方 id', stat.jpOfficial, expect.jpOfficial],
    ['  日服占位 id', stat.jpSynthetic, expect.jpSynthetic],
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
    // 解禁期次（2026-10-25）：期望值从 sheet1 I 列独立数出来，不写死。
    // 这两条守的是「源表里写了解禁的曲子必须真的带上解禁标记」——上一轮正是这里少了 6 首解禁II。
    ['  解禁I 曲数', db.prepare("SELECT COUNT(*) c FROM songs WHERE unlock_note LIKE '解禁I %'").get().c, expect.unlockI],
    ['  解禁II 曲数', db.prepare("SELECT COUNT(*) c FROM songs WHERE unlock_note LIKE '解禁II %'").get().c, expect.unlockII],
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

// seed.sql = 数据表的幂等 DDL（IF NOT EXISTS，无 DROP）+ **清空数据表** + INSERT + ANALYZE。
// 「清空」不是冗余：只有 INSERT OR REPLACE 时，主键变过的旧行会残留（见下方注释）。
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
    // 【必须先清空数据表（2026-10-25 加）】
    // 原先只有 INSERT OR REPLACE，靠主键覆盖做到「幂等」——但这只对「同主键改内容」有效。
    // 一旦 songId 变了（本次 11 条 id 修正：BTA-xxx → 官方 id），旧主键那行没人覆盖，
    // 于是库里同时留下新旧两行，页面卡片数从 1150 涨到 1159。
    // 清空后再插，才是真正「seed = 目标状态」。只清数据表，用户系统一律不碰。
    'DELETE FROM songs;',
    'DELETE FROM recent_changes;',
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