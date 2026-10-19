// 打包部署产物：把 src 的站点文件与 assets 组装成 dist/，供 Cloudflare Workers 静态资源托管。
//   node pack.cjs
// 产物结构对齐页面的相对引用（index.html 里写 ../assets/...）：
//   dist/index.html, dist/theme.css, dist/assets/...
// 因为 dist 部署在站点根，index.html 位于 /index.html，../assets/ 解析后正好是 /assets/。
const fs = require('fs');
const path = require('path');

const HERE = __dirname;                     // src/_build
const SRC = path.join(HERE, '..');          // src
const ROOT = path.join(SRC, '..');          // 工作区根
const DIST = path.join(ROOT, 'dist');

// 每次全量重建，避免上一轮残留文件混进部署
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 1) 站点自身的文件（不含 template.html 与 _build/）
const SITE = ['index.html', 'theme.css'];
for (const f of SITE) {
  fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));
}

// 2) 静态资源整棵树
fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });

// 3) 报告
let n = 0, bytes = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else { n++; bytes += fs.statSync(p).size; }
  }
})(DIST);
console.log('packed -> dist/  ' + n + ' files  ' + (bytes / 1048576).toFixed(2) + ' MB');
