// CI 用：校验页面里引用的本地资源都真实存在（不联网、不依赖浏览器）
//   node scripts/ci/check-refs.cjs          # 检查 src/ 源码里的引用
//   node scripts/ci/check-refs.cjs dist     # 检查构建产物 dist/ 里的绝对路径引用
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const isDist = process.argv[2] === 'dist';
const target = isDist ? path.join(ROOT, 'dist') : path.join(ROOT, 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.(astro|html|css|mjs|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = isDist ? walk(target).filter((p) => /\.(html|css)$/.test(p)) : walk(target);

const refs = [];
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/(?:src|href)=["']([^"']+)["']/g)) refs.push([f, m[1]]);
  for (const m of txt.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)) refs.push([f, m[1]]);
}

const missing = [];
let ok = 0;
for (const [from, ref] of refs) {
  if (!ref || ref.startsWith('#') || ref.startsWith('data:') || /^[a-z]+:/i.test(ref) || ref.startsWith('//')) continue;
  if (/[<>{}]/.test(ref)) continue; // 注释/模板里的占位文本
  // /xxx 是站点绝对路径：源码期从 public/ 找，产物期从 dist/ 找
  const base = ref.startsWith('/') ? (isDist ? target : path.join(ROOT, 'public')) : path.dirname(from);
  const p = path.resolve(base, ref.replace(/^\//, ''));
  if (fs.existsSync(p)) ok++;
  else missing.push(path.relative(ROOT, from) + ' -> ' + ref);
}

console.log('refs=' + (ok + missing.length) + ' ok=' + ok + ' missing=' + missing.length);
if (missing.length) {
  missing.forEach((m) => console.error('  MISSING ' + m));
  process.exit(1);
}
console.log('引用完整性通过');
