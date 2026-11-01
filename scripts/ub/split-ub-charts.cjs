// 谱面密度数据拆分：把 ub-charts.json 拆成「每首一个静态 JSON」，放进 public/。
//   node scripts/ub/split-ub-charts.cjs
//
// 【为什么拆】
// 原先 src/data/ub-charts.json（1.07MB）用 import 内联进详情页 chunk，
// 实测那个 chunk 3.3MB —— 而每次详情页请求只用到其中一首（中位 961 字节）。
// Worker 每次请求都要把整张表读进内存，1200 首被批量访问时是纯浪费。
//
// 【为什么不改成「进页面后再找 ub 拉」】
// 那会让用户每次多下载约 3KB + 3 次跨站请求（实测上游 ~300ms/次），
// 且 ub 一旦不可用，图就整块消失。而本站现在这份数据是**构建期快照**，
// 走 CF 静态资源层、同源、边缘缓存 —— 用户下载 0 字节、延迟约 20ms。
//
// 【产物】
//   public/assets/diff/<songId>.json  每首一个文件，中位 961 字节
//   运行时按 songId 拼 URL 取单个文件，取不到就整块不渲染（与版本校验同一个兜底）。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src/data/ub-charts.json');
const OUT = path.join(ROOT, 'public/assets/diff');

const charts = require(SRC);
fs.mkdirSync(OUT, { recursive: true });

// 清掉旧产物，避免曲目下线后残留孤儿文件（这是全量可重算的表，清空安全）
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT, f));
}

let n = 0, bytes = 0;
for (const [id, entry] of Object.entries(charts)) {
  const s = JSON.stringify(entry);
  fs.writeFileSync(path.join(OUT, id + '.json'), s);
  n++;
  bytes += s.length;
}

console.log('谱面密度数据已拆分到 public/assets/diff/');
console.log('  文件数 ' + n + '，合计 ' + (bytes / 1024 / 1024).toFixed(2) + ' MB，单首中位约 1 KB');
