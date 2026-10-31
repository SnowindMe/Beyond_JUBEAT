// remywiki「榜单外补充页」→ 快照条目（2026-10-31 由主人给的 13 个直链而来）。
//   运行：从**仓库根**跑 node scripts/db/remy/make-extra-pages.cjs
//   读 .devhome/remy-md/extra/<songId>.md（逐页 Markdown 缓存），产出
//   .devhome/remy-extra-snapshot.json，由 make-remy-data.cjs 并入 by-song-id 快照。
//
// 为什么要单独一层：这 13 首**不在** remywiki 的 Jubeat beyond the Ave. Full Song List 里，
// 所以 remy-list.json 筛不到，主映射脚本永远匹配不上。但它们在 remywiki 各有独立页面，
// 其中 8 首带 jubeat 难度表（另 5 首是 stub，只有曲目信息、没有表 → 仍是未知，不许编）。
//
// 抓取通道：read_page（modsearch 桥）。本机 Node fetch / curl 打 remywiki 极不稳（20s/页、大量超时）。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const MD_DIR = path.join(ROOT, '.devhome', 'remy-md', 'extra');

// songId → remywiki 页面 URL（主人 2026-10-31 提供，逐条核对过与库中曲名对应）
const PAGES = {
  '11000031': "https://remywiki.com/Don%27t_believe_the_hype",
  '11000035': 'https://remywiki.com/DIAMOND_CROSSING',
  '11000036': 'https://remywiki.com/Satfinal',
  '11000037': 'https://remywiki.com/Go_Beyond!!',
  '11000094': 'https://remywiki.com/Homesick_Pt.2%263',
  '90000009': 'https://remywiki.com/In_Your_EyEs',
  '90000120': 'https://remywiki.com/Splash!',
  '90000143': 'https://remywiki.com/Get_On_The_Floor',
  '90000154': 'https://remywiki.com/Gekitou_hoankan!_DEMPA_bokumetsu_daisakusen',
  '90000156': 'https://remywiki.com/Underground_Astronomy',
  '90000204': 'https://remywiki.com/Sayonara_heaven_(BEMANI_SYMPHONY_Arr.)',
  '90000206': 'https://remywiki.com/Idola_(BEMANI_SYMPHONY_Arr.)',
  '90000208': 'https://remywiki.com/Starmine_(BEMANI_SYMPHONY_Arr.)',
};

// 解析 jubeat 小节里的 Notecounts 行。
// 【必须锚定 ### jubeat 小节】：同页往往还有 beatmania IIDX / pop'n / ノスタルジア 的难度表，
// 表头同样是 Basic/Advanced/Extreme，不锚定就会取到别机种的音数（主解析器踩过，误了 213 条）。
// 【判据看值不看标签】：值是两数 '470 / 12' = 总键数 / 长按数；单值 '281' = 该难度确定无长押。
// 1116 那种「标签写 Notecounts、值是两数」的页面证明标签不可信。
function parseJubeat(content) {
  const lines = String(content || '').split('\n');
  const i = lines.findIndex((l) => /^###\s*jubeat/i.test(l));
  if (i < 0) return null;
  for (let k = i; k < Math.min(i + 15, lines.length); k++) {
    const m = /^\|\s*(Notecounts[^|]*)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/.exec(lines[k]);
    if (!m) continue;
    const cells = [m[2], m[3], m[4]].map((s) => s.trim());
    const notes = [], holds = [];
    for (const c of cells) {
      const p = c.split('/').map((x) => x.trim());
      const num = (v) => (v === '' || v === '?' || v === '-' ? null : Number(v));
      notes.push(num(p[0]));
      holds.push(p.length > 1 ? num(p[1]) : null);
    }
    return { label: m[1].trim(), notes, holds };
  }
  return null;
}

const bpmOf = (content) => {
  const m = /BPM[:：]\s*([0-9][0-9.\-]*)/i.exec(String(content || ''));
  return m ? m[1] : null;
};

if (!fs.existsSync(MD_DIR)) {
  console.error('缺少 ' + path.relative(ROOT, MD_DIR) + '：先抓这 13 页并存成 <songId>.md');
  process.exit(1);
}

const out = {};
const skipped = [];
for (const [id] of Object.entries(PAGES)) {
  const p = path.join(MD_DIR, id + '.md');
  if (!fs.existsSync(p)) { skipped.push(id + ' (无缓存)'); continue; }
  const content = fs.readFileSync(p, 'utf8');
  const r = parseJubeat(content);
  if (!r) { skipped.push(id + ' (stub，无 jubeat 难度表)'); continue; }
  const lv = ['bsc', 'adv', 'ext'];
  const no = {}, ho = {};
  lv.forEach((d, i) => {
    if (r.notes[i] != null) no[d] = r.notes[i];
    ho[d] = r.holds[i] == null ? 0 : r.holds[i];
  });
  const rec = {};
  const bpm = bpmOf(content);
  if (bpm) rec.bpm = bpm;
  rec.has_hold = Object.values(ho).some((x) => x > 0) ? 1 : 0;
  rec.notecounts = no;
  rec.holds = ho;
  out[id] = rec;
}
const dest = path.join(ROOT, '.devhome', 'remy-extra-snapshot.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.log('补充页解析: ' + Object.keys(out).length + ' 条（长押 ' + Object.values(out).filter((v) => v.has_hold === 1).length + '）');
if (skipped.length) console.log('跳过: ' + skipped.join(' / '));
for (const [id, v] of Object.entries(out)) console.log('  ' + id + ' ' + JSON.stringify(v));