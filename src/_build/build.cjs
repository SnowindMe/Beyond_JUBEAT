// 站点生成器：把 data.json 注入模板，写出 ../index.html
//   node build.cjs        默认用 ../template.html（当前线上版）
//   node build.cjs 11     用 archive 里的 template11 版（另一套配色，约 29.5KB）
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SRC = path.join(HERE, '..');

const PRESETS = {
  // 主模板就在 src/ 里，直接改 template.html 即可，不用碰 archive
  current: { tpl: path.join(SRC, 'template.html'), lv: { 6:'#77a9c9', 7:'#63c2d6', 8:'#57e0cf', 9:'#ecc76a', 10:'#f08a63', '10.5':'#f7719f' }, stripBase: 127 },
  // 旧版模板留在 archive 备查
  11: { tpl: path.join(HERE, '../../archive/legacy/jubeat-wiki-v4/templates/template11.html'), lv: { 6:'#2c6b8a', 7:'#2f8fa8', 8:'#3fb6b0', 9:'#c8a13c', 10:'#e0654f', '10.5':'#f2467a' }, stripBase: null }
};

const arg = (process.argv[2] || 'current').replace(/^--?tpl=?/, '');
const P = PRESETS[arg];
if (!P) { console.error('未知模板: ' + arg + '（可选 current / 11）'); process.exit(1); }

const D = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));
const T = fs.readFileSync(P.tpl, 'utf8');

const jc = c => '../assets/images/jackets/' + (c || '').split('/').pop();
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const LV = P.lv;

let CUBE = '';
D.gen.forEach(g => { CUBE += '<i><img src="' + jc(g.rep.cover) + '" alt="' + esc(g.k) + '"></i>'; });
CUBE += '<i class="sum"><b>' + D.stat.songs + '</b><span>曲</span></i>';

const PAL = ['#5ee6f5','#7dfbe0','#57c8ff','#6f8dff','#9ef7ff','#4fd8d0','#63b4ff','#82e6ff',
  '#57d9ef','#8defff','#4aa8e8','#6ee0d8','#8fd4ff','#59e0ff','#ff6bb0'];
const SUM = D.gen.reduce((a, g) => a + g.n, 0);
const BASE = P.stripBase || SUM;

const STRIP = D.gen.map((g, i) => '<i title="' + esc(g.k) + ' ' + g.n + '" style="flex:' + g.n + ' 1 0;background:linear-gradient(180deg,' +
  PAL[i] + ',color-mix(in srgb,' + PAL[i] + ' 55%,#0d3446))">' + (g.n / BASE * 100 > 4.5 ? '<span>' + g.n + '</span>' : '') + '</i>').join('');
const GLEG = D.gen.map((g, i) => '<div class="gl"><em style="background:' + PAL[i] + '"></em><b>' +
  esc(g.k) + '</b><span>' + g.n + '</span></div>').join('');

const RANK = D.top.map((s, i) => '<div class="rk"><i>' + String(i + 1).padStart(2, '0') + '</i>' +
  '<img src="' + jc(s.cover) + '" alt="">' +
  '<span class="t"><b>' + esc(s.t) + '</b><em>' + esc(s.a) + '</em></span>' +
  '<span class="v">' + Number(s.lv.ext).toFixed(1) + '</span></div>').join('');

const maxD = Math.max(...D.dist.map(x => x.v));
const DIST = ['6','7','8','9','10','10.5'].map(k => {
  const it = D.dist.find(x => x.k === k); if (!it) return '';
  return '<div class="dr"><b>lv ' + k + '</b><div class="tr"><i style="width:' +
    Math.max(1.5, (it.v / maxD) * 100) + '%;background:linear-gradient(90deg,' + LV[k] + 'bb,' + LV[k] + ')"></i></div><span>' + it.v + '</span></div>';
}).join('');

const LAT = D.latest.map(s => '<a class="lc" href="#"><div class="cd"><img src="' + jc(s.cover) + '" alt=""></div>' +
  '<b>' + esc(s.t) + '</b><span>' + ((s.d || '').slice(0, 7)) + ' / ' + esc(s.a) + '</span></a>').join('');

const out = T.replace('{{CUBE}}', CUBE).replace('{{STRIP}}', STRIP).replace('{{GLEG}}', GLEG).replace('{{RANK}}', RANK)
  .replace('{{DIST}}', DIST).replace('{{LAT}}', LAT)
  .replace(/\{\{N1\}\}/g, D.stat.songs).replace(/\{\{N2\}\}/g, D.stat.charts)
  .replace(/\{\{N3\}\}/g, D.stat.gens).replace(/\{\{N4\}\}/g, D.gen10);

const OUTP = path.join(HERE, '..', 'index.html');
fs.writeFileSync(OUTP, out);
console.log('built (' + path.basename(P.tpl) + ') ' + out.length + ' chars -> ' + path.basename(OUTP) + ' (' + Buffer.byteLength(out) + ' bytes)');
