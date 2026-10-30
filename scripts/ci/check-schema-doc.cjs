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

// [说明, 实测 SQL, 文档模板, 对照 SQL（可选，模板里的 {m}）]
// 模板里的 {n} / {m} 由**实测值**填进去，再要求文档里真的出现这个串。
// 【2026-10-31 改成模板的原因】原写法把数字焊在 needle 里（'**737 / 1248**'），
// 于是断言退化成「文档里有没有这句老话」：库里 bpm 空值已经变成 24，文档还写着 737，
// 照样打印 ok —— 只在文档行被删掉时才 FAIL，正是这条脚本想防的「静默过期」。
// 现在文档写旧数字就会 FAIL（库里是新的、文档里找不到新串），改对了才过。
const RULES = [
  ['songs 总行数', 'SELECT COUNT(*) c FROM songs', '**{n}**'],
  ['日服独占行', 'SELECT COUNT(*) c FROM songs WHERE server_jp=1 AND server_cn=0', '**{n}**'],
  ['双服行', 'SELECT COUNT(*) c FROM songs WHERE server_jp=1 AND server_cn=1', '**{n}**'],
  ['国服独有行', 'SELECT COUNT(*) c FROM songs WHERE server_jp=0 AND server_cn=1', '**{n}**'],
  ['谱面总数', 'SELECT COUNT(bsc)+COUNT(adv)+COUNT(ext) c FROM songs', '**{n}**'],
  ['bpm 空值', 'SELECT COUNT(*) c FROM songs WHERE bpm IS NULL', '**{n} / {m}**', 'SELECT COUNT(*) c FROM songs'],
  ['added_at 空值', 'SELECT COUNT(*) c FROM songs WHERE added_at IS NULL', '**{n} / {m}**', 'SELECT COUNT(*) c FROM songs'],
  ['unlock_note 空值', 'SELECT COUNT(*) c FROM songs WHERE unlock_note IS NULL', '**{n} / {m}**', 'SELECT COUNT(*) c FROM songs'],
  ['占位 id', "SELECT COUNT(*) c FROM songs WHERE id_kind='synthetic'", '**{n}**'],
  ['限时曲', 'SELECT COUNT(*) c FROM songs WHERE limited_until IS NOT NULL', '**{n}**'],
  ['索引数', "SELECT COUNT(*) c FROM sqlite_master WHERE type='index' AND sql IS NOT NULL", '**{n}**'],
  // 【2026-10-31 RemyWiki 谱面数据】三列的覆盖情况也要在文档里写清（尤其 NULL ≠ 0 这条）。
  ['长押谱行数', 'SELECT COUNT(*) c FROM songs WHERE has_hold=1', '**{n}**'],
  ['长押未知行', 'SELECT COUNT(*) c FROM songs WHERE has_hold IS NULL', '**{n}**'],
];

let bad = 0;
for (const [name, sql, tmpl, sqlM] of RULES) {
  const got = one(sql);
  const needle = String(tmpl)
    .replace('{n}', String(got))
    .replace('{m}', sqlM ? String(one(sqlM)) : '');
  // 文档里必须能找到**按实测值拼出来**的串（包在 ** 里，避免「1241」这种串在别处误命中）
  if (!doc.includes(needle)) {
    console.log('FAIL ' + name.padEnd(18) + ' 库里 ' + got + '，但文档里找不到 ' + needle);
    bad++;
  } else {
    console.log('ok   ' + name.padEnd(18) + ' ' + got);
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
