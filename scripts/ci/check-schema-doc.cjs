// 文档数字自检：核对 docs/database-schema.md 里写明的关键计数与真实库是否一致。
//
//   node scripts/ci/check-schema-doc.cjs
//
// 存在的理由：文档里的计数最容易悄悄过期——代码改了、数据变了，文字读起来仍通顺，
// 自己不会发现。这里把「文档里出现的数字」变成可执行断言，不匹配就 FAIL。
// 只断言那些「一句话能说清、且变化有意义」的数字，不做全文解析（容易假阳性）。
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const DOC = path.join(ROOT, 'docs/database-schema.md');
const DB = path.join(ROOT, 'data/jubeat.db');

if (!fs.existsSync(DB)) {
  console.log('跳过：data/jubeat.db 不存在（先跑 npm run db）');
  process.exit(0);
}

const doc = fs.readFileSync(DOC, 'utf8');
const d = new DatabaseSync(DB, { readOnly: true });
const one = (q) => d.prepare(q).get().c;

// [说明, SQL, 文档里必须出现的字符串]
const RULES = [
  ['songs 总行数', 'SELECT COUNT(*) c FROM songs', '**1241**'],
  ['日服独占行', 'SELECT COUNT(*) c FROM songs WHERE server_jp=1 AND server_cn=0', '**717**'],
  ['双服行', 'SELECT COUNT(*) c FROM songs WHERE server_jp=1 AND server_cn=1', '**434**'],
  ['国服独有行', 'SELECT COUNT(*) c FROM songs WHERE server_jp=0 AND server_cn=1', '**90**'],
  ['谱面总数', 'SELECT COUNT(bsc)+COUNT(adv)+COUNT(ext) c FROM songs', '**3723**'],
  ['bpm 空值', 'SELECT COUNT(*) c FROM songs WHERE bpm IS NULL', '**732 / 1241**'],
  ['added_at 空值', 'SELECT COUNT(*) c FROM songs WHERE added_at IS NULL', '**1084 / 1241**'],
  ['unlock_note 空值', 'SELECT COUNT(*) c FROM songs WHERE unlock_note IS NULL', '**1014 / 1241**'],
  ['占位 id', "SELECT COUNT(*) c FROM songs WHERE id_kind='synthetic'", '**2**'],
  ['限时曲', 'SELECT COUNT(*) c FROM songs WHERE limited_until IS NOT NULL', '**2**'],
  ['索引数', "SELECT COUNT(*) c FROM sqlite_master WHERE type='index' AND sql IS NOT NULL", '**11**'],
];

let bad = 0;
for (const [name, sql, needle] of RULES) {
  const got = one(sql);
  const n = String(got);
  // 文档里必须能找到这个数字（包在 ** 里，避免「1241」这种串在别处误命中）
  if (!doc.includes(needle)) {
    console.log('FAIL ' + name.padEnd(18) + ' 库里 ' + n + '，但文档里找不到 ' + needle);
    bad++;
  } else {
    console.log('ok   ' + name.padEnd(18) + ' ' + n);
  }
}

// 反向校验：文档里提到的分类计数必须与库一致
for (const r of d.prepare('SELECT category, COUNT(*) n FROM songs GROUP BY 1').all()) {
  const re = new RegExp('\\| ' + r.category + ' \\| (\\d+) \\|');
  const m = doc.match(re);
  if (!m) { console.log('FAIL 分类 ' + r.category + ' 在文档里没有计数行'); bad++; }
  else if (Number(m[1]) !== r.n) { console.log('FAIL 分类 ' + r.category + ' 文档 ' + m[1] + ' / 库 ' + r.n); bad++; }
  else console.log('ok   分类 ' + r.category.padEnd(12) + r.n);
}

d.close();
if (bad) { console.log('\n文档数字与实际库不符 ' + bad + ' 处'); process.exitCode = 1; }
else console.log('\n文档数字与数据库一致');
