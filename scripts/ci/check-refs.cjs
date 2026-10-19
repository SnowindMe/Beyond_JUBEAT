// CI 用：校验 src/index.html 与 src/theme.css 里引用的资源都存在（不联网、不依赖 playwright）
//   node scripts/ci/check-refs.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const files = ['index.html', 'theme.css'];

const refs = new Set();
for (const f of files) {
  const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of txt.matchAll(/(?:src|href)="([^"]+)"/g)) refs.add([f, m[1]]);
  for (const m of txt.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)) refs.add([f, m[1]]);
}

const missing = [];
let ok = 0;
for (const [from, ref] of refs) {
  if (!ref || ref.startsWith('#') || ref.startsWith('data:') || /^[a-z]+:/i.test(ref)) continue;
  const p = path.resolve(SRC, ref);
  if (fs.existsSync(p)) ok++;
  else missing.push(from + ' -> ' + ref);
}

// theme.css 里的注释也会被正则抓到，按「文件不存在但含尖括号」跳过明显的注释文本
const real = missing.filter(m => !/[<>{}]/.test(m));
console.log('refs=' + (ok + missing.length) + ' ok=' + ok + ' missing=' + real.length);
if (real.length) {
  real.forEach(m => console.error('  MISSING ' + m));
  process.exit(1);
}
console.log('引用完整性通过');
