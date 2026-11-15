// 把 db/patch.sql 灌进线上 D1，走 REST /query（不依赖 wrangler 的本地登录态）。
//
//   node scripts/db/apply-patch.cjs --token=<CF API Token> [--file=db/patch.sql] [--base=...] [--dry]
//
// 存在的理由：这台机器上 wrangler 拿不到授权（无 CLOUDFLARE_API_TOKEN 时它要走交互网页登录，
// 而本机现存的 token 只有 Workers 权限，打 d1/database 会 401）。补丁本身只是几百条 UPDATE，
// 用 REST 一条一条发反而更可控：能分批、能失败即停、能先干跑数行数。
//
// 【分批】D1 的单次查询体量有限，整份 1234 行塞一条会超时/超限。这里按 100 条一批，
// 每批一个事务语义的请求体（D1 的多语句在同一请求里是顺序执行的），失败即停并报出批号。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const TOKEN = args.token || process.env.CLOUDFLARE_API_TOKEN || '';
const FILE = path.resolve(ROOT, args.file || 'db/patch.sql');
const ACCOUNT = args.account || process.env.CF_ACCOUNT || '6327ccf25660e1b2bde4a731ff9d68c0';
const DB = args.db || process.env.CF_D1 || '91a48a18-62b2-4933-9214-788205926744';
const BATCH = Number(args.batch || 100);
const DRY = 'dry' in args;

if (!fs.existsSync(FILE)) { console.error('找不到补丁文件 ' + FILE); process.exit(2); }
if (!TOKEN && !DRY) { console.error('缺 token：--token=<CLOUDFLARE_API_TOKEN>（需 D1 Edit 权限）'); process.exit(2); }

// 只留真正改数据的语句（注释与空行去掉），并保留结尾分号前的正文
const stmts = fs.readFileSync(FILE, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('--'))
  .join('\n')
  .split(/;\s*(?=\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

console.log('补丁 ' + path.basename(FILE) + '：' + stmts.length + ' 条语句，每批 ' + BATCH + (DRY ? '（干跑）' : ''));
if (DRY) { stmts.slice(0, 5).forEach((s) => console.log('  ' + s.slice(0, 100))); process.exit(0); }

const URL_ = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`;
async function run(sql) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error('HTTP ' + res.status + ' 非 JSON：' + text.slice(0, 120)); }
  if (!json.success) throw new Error('HTTP ' + res.status + ' ' + (json.errors?.[0]?.message || text.slice(0, 120)));
  return json;
}

(async () => {
  let done = 0;
  for (let i = 0; i < stmts.length; i += BATCH) {
    const chunk = stmts.slice(i, i + BATCH);
    // 一批发一条请求体（多语句），D1 在同一请求内顺序执行
    await run(chunk.join(';\n') + ';');
    done += chunk.length;
    process.stdout.write('\r已执行 ' + done + ' / ' + stmts.length + '  ');
  }
  console.log('\n完成 ' + done + ' 条');
})().catch((e) => { console.error('\n失败：' + e.message); process.exit(1); });
