// 增量补丁生成器：把「上次已部署的曲库」和「这次本地生成的曲库」逐行对比，
// 只输出**受影响那几行**的 INSERT / UPDATE / DELETE，绝不整表清空重灌。
//
//   node scripts/db/diff-seed.cjs                对比 git HEAD 的 db/seed.sql 与当前 db/seed.sql，写 db/patch.sql
//   node scripts/db/diff-seed.cjs --base=a.sql   指定基线文件
//   node scripts/db/diff-seed.cjs --check        只报差异行数，不写文件（CI / 预演用）
//
// 存在的理由（主人 2026-10-28 的建议）：线上 D1 里不止曲库，还有运行时数据
// （recent_changes 由 /api/admin/song-update 写入、users/sessions 由用户系统写入）。
// 重放整份 db/seed.sql 会把它们一起清掉，而曲库本身通常只动几行 —— 全量重灌
// 等于用「清空 + 重建」去换「改三行」，风险与收益完全不成比例。
//
// 基线取 git HEAD 而不是查线上 D1：HEAD 的 db/seed.sql 就是上次 push 的曲库状态
// （npm run db 会重写它并随提交进版本库），离线可比、无需 wrangler 联网。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SEED_PATH = path.join(ROOT, 'db/seed.sql');
const PATCH_PATH = path.join(ROOT, 'db/patch.sql');

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const baseArg = argv.find((a) => a.startsWith('--base='));

// ---------- 逐字符切分（不能用正则） ----------
// 【2026-10-28 实撞】最初用 /INSERT ... VALUES\n([\s\S]*?);/ 提取语句体，被字符串里的分号截断：
// 艺人名 'produced by ave;new' 含分号 → 语句体在那里被切掉，17 列的行只剩 4 个值。
// 凡是「SQL 字面量可能含分隔符」的场合，正则都会静默给出错位结果；只能按
// 「单引号状态 + 括号深度」逐字符走。'' 是转义的单引号，要成对跳过。
function scanTuples(text, start) {
  // 从 start（VALUES 后的第一个 '('）开始，返回 [语句体结束下标, 顶层元组文本数组]
  const tuples = [];
  let depth = 0, inStr = false, cur = '';
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (text[i + 1] === "'") { cur += text[i + 1]; i++; }
        else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === '(') { depth++; cur += c; continue; }
    if (c === ')') { depth--; cur += c; if (depth === 0) { tuples.push(cur); cur = ''; } continue; }
    if (depth === 0) {
      if (c === ';') return [i, tuples];
      continue;  // 顶层空白与逗号忽略
    }
    cur += c;
  }
  throw new Error('INSERT 语句未正常结束（缺少分号）');
}

function splitValues(tuple) {
  // tuple = "('a','b',1,NULL)" → 值字面量数组（同样按字符串状态切）
  const inner = tuple.slice(1, -1);
  const vals = [];
  let inStr = false, cur = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (inner[i + 1] === "'") { cur += inner[i + 1]; i++; }
        else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === ',') { vals.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  vals.push(cur.trim());
  return vals;
}

const PRIMARY = { songs: 'song_id', recent_changes: 'change_id' };

function parseSeed(sql) {
  const tables = {};
  const marker = 'INSERT OR REPLACE INTO ';
  let pos = 0;
  while (true) {
    const at = sql.indexOf(marker, pos);
    if (at < 0) break;
    const header = sql.slice(at + marker.length, sql.indexOf('VALUES', at));
    const m = /^(\w+)\(([^)]+)\)\s*$/.exec(header.trim());
    if (!m) throw new Error('无法解析 INSERT 头部：' + header.slice(0, 120));
    const table = m[1];
    const cols = m[2].split(',').map((s) => s.trim());
    const pk = PRIMARY[table];
    if (!pk) throw new Error('未知表 ' + table + '，PRIMARY 里补一条再继续');
    const valStart = sql.indexOf('(', sql.indexOf('VALUES', at));
    const [end, tuples] = scanTuples(sql, valStart);
    if (!tables[table]) tables[table] = new Map();
    for (const t of tuples) {
      const vals = splitValues(t);
      if (vals.length !== cols.length) {
        throw new Error('列数与值数量不匹配：' + cols.length + ' vs ' + vals.length + ' @ ' + t.slice(0, 60));
      }
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });  // 保持字面量原文，比较时原文相等即行相等
      tables[table].set(row[pk], row);
    }
    pos = end + 1;
  }
  return tables;
}

// ---------- 基线 ----------
function readBase() {
  if (baseArg) return fs.readFileSync(path.resolve(ROOT, baseArg.slice(7)), 'utf8');
  try {
    return execFileSync('git', ['show', 'HEAD:db/seed.sql'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    console.log('基线：git HEAD 里没有 db/seed.sql（首次提交？），退化为「全部视为新增」。');
    return '';
  }
}

const before = parseSeed(readBase());
const after = parseSeed(fs.readFileSync(SEED_PATH, 'utf8'));

const out = [
  '-- 由 scripts/db/diff-seed.cjs 生成，勿手改。',
  '-- 只含受影响的行：新增 INSERT / 变更 UPDATE / 下线 DELETE。不 DELETE 整表，不碰用户系统与 recent_changes。',
  '-- 灌库：npx wrangler d1 execute beyond-jubeat --remote --file=db/patch.sql',
  '',
];
const stats = { insert: 0, update: 0, delete: 0 };

// 表集合取两边的并集：只有基线里存在、这次已整表消失的表，也要能报出下线行，
// 否则「表整个没了」这种情况会被静默当成「无差异」。
for (const table of new Set([...Object.keys(after), ...Object.keys(before)])) {
  const pk = PRIMARY[table];
  if (!pk) throw new Error('未知表 ' + table + '，PRIMARY 里补一条再继续');
  const b = before[table] || new Map();
  const a = after[table] || new Map();
  const adds = [], changes = [], removes = [];

  for (const [id, row] of a) {
    const old = b.get(id);
    if (!old) { adds.push(row); continue; }
    const cols = Object.keys(row).filter((c) => row[c] !== old[c]);
    if (cols.length) changes.push({ id, cols, row });
  }
  for (const id of b.keys()) if (!a.has(id)) removes.push(b.get(id));

  if (removes.length) {
    // 下线曲目是不可逆动作，单独成段并标注，方便执行前人工复核
    out.push('-- ' + table + ' 下线 ' + removes.length + ' 行（数据源里已不存在）');
    for (const r of removes) out.push('DELETE FROM ' + table + ' WHERE ' + pk + ' = ' + r[pk] + ';');
    out.push('');
    stats.delete += removes.length;
  }
  if (changes.length) {
    out.push('-- ' + table + ' 变更 ' + changes.length + ' 行（只改变化了的列）');
    for (const ch of changes) {
      const sets = ch.cols.map((c) => c + ' = ' + ch.row[c]).join(', ');
      out.push('UPDATE ' + table + ' SET ' + sets + ' WHERE ' + pk + ' = ' + ch.id + ';');
    }
    out.push('');
    stats.update += changes.length;
  }
  if (adds.length) {
    const cols = Object.keys(adds[0]);  // adds 里是行对象本身，别再拿它去 Map 里查一次
    out.push('-- ' + table + ' 新增 ' + adds.length + ' 行');
    const prefix = 'INSERT OR REPLACE INTO ' + table + '(' + cols.join(',') + ') VALUES ';
    let batch = [], bytes = Buffer.byteLength(prefix) + 4;
    const flush = () => {
      if (!batch.length) return;
      out.push(prefix + batch.join(',\n') + ';');
      batch = []; bytes = Buffer.byteLength(prefix) + 4;
    };
    for (const r of adds) {
      const tuple = '(' + cols.map((c) => r[c]).join(',') + ')';
      const size = Buffer.byteLength(tuple) + 2;
      if (bytes + size > 90 * 1024) flush();
      batch.push(tuple); bytes += size;
    }
    flush();
    out.push('');
    stats.insert += adds.length;
  }
}

const total = stats.insert + stats.update + stats.delete;
if (!total) out.push('-- 与基线完全一致，无需灌库（patch 不含任何语句）', '');

const summary = '新增 ' + stats.insert + ' / 变更 ' + stats.update + ' / 下线 ' + stats.delete + '（合计 ' + total + ' 行）';

// 【自检】解析回来的行数必须与 seed.sql 自己标注的行数一致。
// 理由：解析器出错时最危险的形态不是崩溃，而是**静默少行** —— 少行会让「变更」
// 漏报，patch 看着是 0 差异，线上却停在旧数据。这里拿生成器写进文件的行数做红锚。
const declared = [...fs.readFileSync(SEED_PATH, 'utf8').matchAll(/^-- (\w+): (\d+) 行$/gm)]
  .reduce((acc, m) => { acc[m[1]] = Number(m[2]); return acc; }, {});
const parseFails = [];
for (const [table, n] of Object.entries(declared)) {
  const got = after[table] ? after[table].size : 0;
  if (got !== n) parseFails.push(table + ' 声明 ' + n + ' 行、解析出 ' + got + ' 行');
}
if (parseFails.length) {
  console.log('FAIL 解析行数与 seed 声明不符：' + parseFails.join('；'));
  process.exitCode = 1;
}

if (checkOnly) {
  const parsed = Object.entries(after).map(([t, m]) => t + ' ' + m.size + ' 行').join(' / ');
  console.log('解析：' + (parsed || '（无 INSERT）'));
  console.log('差异：' + summary);
  process.exit(process.exitCode || 0);
}

fs.writeFileSync(PATCH_PATH, out.join('\n'));
console.log('patch.sql -> ' + path.relative(ROOT, PATCH_PATH) + '  ' + summary);
if (stats.delete) console.log('⚠ 含 ' + stats.delete + ' 行 DELETE（不可逆），执行前请复核 db/patch.sql 顶部的下线段。');

// 自检：patch 里绝不能出现整表清空
const bad = fs.readFileSync(PATCH_PATH, 'utf8').split('\n').filter((l) => /^\s*DELETE\s+FROM\s+\w+\s*;/.test(l));
if (bad.length) { console.log('FAIL patch 里出现整表 DELETE：' + bad.join(' | ')); process.exitCode = 1; }
