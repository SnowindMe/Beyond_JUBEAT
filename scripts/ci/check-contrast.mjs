// 对比度自检：把「颜色相关的验收」变成可复现数字，而不是靠肉眼或口径之争。
//   node scripts/ci/check-contrast.mjs              # 公式理论值（离线、CI 用）
//   node scripts/ci/check-contrast.mjs --json       # 机器可读
//
// 为什么需要它：本站 16 套世代主题（深色 8 + 浅色 8），同一个令牌在不同主题下
// 对比度能差 3 倍。实测教训（2026-10-23，t5）：
//   .rc-before 的 opacity:0.8 在深色下 7.03 达标，换到浅色世代只有 2.63–3.08，全部不达标。
// 只看默认主题、或只看最大值，必漏。所以对每个「文字色 × 背景」组合跑全部主题并取 min。
//
// 口径（重要，避免再吵）：
//   * WCAG 2.1 AA：正文 4.5:1；大字号（≥18.66px 粗体 / ≥24px）3:1
//   * 本站 --ink3 多用于 10.5–11px 小字，一律按 4.5 判
//   * 玻璃面板是半透明的：先把 --glass 按 alpha 合到 --base 上，再算对比
//   * 本脚本输出的是**公式理论值**（不含背景照片）。真实渲染值要用浏览器量，
//     两者可能有 0.5–1.0 的差（背景图会抬高/压低局部亮度）——验收以真实渲染为准，
//     本脚本用于「改之前先拦住明显不达标的组合」。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS = readFileSync(path.join(ROOT, 'src/styles/theme.css'), 'utf8');
const AS_JSON = process.argv.includes('--json');

// ---------- WCAG ----------
const hexToRgb = (h) => {
  const s = String(h).replace('#', '').trim();
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (fg, bg) => {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!f || !b) return null;
  const a = luminance(f);
  const c = luminance(b);
  const hi = Math.max(a, c);
  const lo = Math.min(a, c);
  return (hi + 0.05) / (lo + 0.05);
};
/** 半透明色叠到底色上的等效不透明色 */
const over = (fg, alpha, bg) => {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!f || !b) return null;
  return '#' + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha))).map((v) => v.toString(16).padStart(2, '0')).join('');
};

// ---------- 从 theme.css 读令牌 ----------
// 注意：theme.css 里主题块写作 html[data-g="knit"] { ... }，:root 是默认深色。
// 这里只做「块内首个同名声明」的朴素提取 —— 够用，且不引 CSS 解析器（保持零依赖）。
// 必须匹配「选择器后面紧跟 {」，不能只是 indexOf：
// theme.css 里 html[data-g="knit"] 还出现在 .mark b .sym、.word-l 等后代选择器里
// （行 318/322 等），只做 indexOf 会抓到那些规则块，令牌全部取不到、静默回退成 :root，
// 于是每套浅色主题都算出「深色」的对比度 —— 这个坑我自己踩过一次，写脚本时专门钉住。
const blockOf = (selector) => {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{', 'm');
  const m = re.exec(CSS);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  // 花括号配对（主题块里没有嵌套块，但保持稳健）
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') {
      depth--;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  return null;
};
const tokenIn = (block, name) => {
  if (!block) return null;
  const m = block.match(new RegExp('(?:^|[;\\s])' + name + ':\\s*([^;]+);'));
  return m ? m[1].trim() : null;
};

// ---------- 自检：同一主题不允许有「多个定义颜色令牌」的块 ----------
// 为什么需要：theme.css 里每个主题其实有 2 个（yymf 有 3 个）html[data-g] 块，
// 第二个只定义 --bgauto（背景图灯箱自动切换）。blockOf() 取的是**第一个**块，
// 这在「后者覆盖前者」的 CSS 语义下只有在「后块不含颜色令牌」时才安全。
// 现状是安全的（实测每个主题恰 1 个颜色块），但这是**当前的巧合，不是机制**：
// 以后谁再加一个颜色块，脚本会静默按第一块算、输出一份「全 PASS 的假报告」——
// 假绿灯比红灯危险得多。所以这里显式 fail loud，让人去改脚本而不是相信数字。
const COLOR_TOKENS = ['--base', '--ink', '--ink2', '--ink3', '--glass', '--glass2', '--edge', '--acc', '--focus'];
const colorBlockLines = (selector) => {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{', 'gm');
  const hits = [];
  let m;
  while ((m = re.exec(CSS)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < CSS.length; i++) {
      if (CSS[i] === '{') depth++;
      else if (CSS[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) continue;
    const body = CSS.slice(open + 1, end);
    if (COLOR_TOKENS.some((t) => new RegExp('(?:^|[;\\s])' + t + ':').test(body))) {
      hits.push(CSS.slice(0, m.index).split('\n').length); // 行号便于定位
    }
  }
  return hits;
};

const ROOT_BLOCK = blockOf(':root');
const GEN_KEYS = [
  'ave', 'bta', 'clan_blue', 'clan_green', 'clan_purple', 'clan_red', 'copious',
  'knit', 'ripples', 'saucer', 'saucerfulfill', 'qubell', 'prop', 'festo', 'yymf',
];
const THEMES = [
  { key: '默认(:root)', block: ROOT_BLOCK },
  ...GEN_KEYS.map((g) => ({ key: g, block: blockOf(`html[data-g="${g}"]`) })),
].filter((t) => t.block);

/** rgba(...) / rgb(...) → { color, alpha } */
const parseColor = (v) => {
  if (!v) return null;
  const m = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)/);
  if (m) {
    const color = '#' + [m[1], m[2], m[3]].map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('');
    return { color, alpha: m[4] === undefined ? 1 : Number(m[4]) };
  }
  return { color: v.trim(), alpha: 1 };
};

const readTheme = ({ key, block }) => {
  const get = (n) => tokenIn(block, n) ?? tokenIn(ROOT_BLOCK, n);
  const base = get('--base');
  const ink = get('--ink');
  const glass = parseColor(get('--glass'));
  const panel = glass ? over(glass.color, glass.alpha, base) : base;
  return {
    key,
    base,
    ink,
    ink2: get('--ink2'),
    ink3: get('--ink3'),
    panel,
  };
};

// ---------- 要守住的组合 ----------
// 只列真正用于「小字」的搭配，按 4.5:1 判。新增页面用到 ink3 小字时，往这里加一条。
const CHECKS = [
  {
    name: '/recent/ 改前·改后正文 (.rc-text)',
    fg: 'ink2',
    bg: (t) => over(t.ink, 0.06, t.panel),
    min: 4.5,
  },
  {
    name: '/recent/ 时间 / 标签 / 空态说明 (.rc-time/.rc-tag/.rc-note)',
    fg: 'ink3',
    bg: (t) => t.panel,
    min: 4.5,
  },
  {
    name: '曲目卡作曲者 (.sc-a)',
    fg: 'ink3',
    bg: (t) => t.panel,
    min: 4.5,
  },
];

// ---------- 先跑自检：颜色块唯一性 ----------
// 必须在算对比度**之前**：如果这里有问题，后面算出来的每个数字都可能是按错块取的。
const structErrors = [];
for (const g of GEN_KEYS) {
  const lines = colorBlockLines(`html[data-g="${g}"]`);
  if (lines.length > 1) {
    structErrors.push(`html[data-g="${g}"] 有 ${lines.length} 个定义颜色令牌的块（行 ${lines.join(', ')}）`);
  }
  if (lines.length === 0) {
    structErrors.push(`html[data-g="${g}"] 一个颜色令牌块都没有（可能被删或改名）`);
  }
}
const rootColorBlocks = colorBlockLines(':root');
if (rootColorBlocks.length !== 1) {
  structErrors.push(`:root 定义了 ${rootColorBlocks.length} 个颜色令牌块（应恰好 1 个）`);
}
if (structErrors.length) {
  if (AS_JSON) {
    console.log(JSON.stringify({ mode: 'structure', results: [], structureErrors: structErrors }, null, 2));
  } else {
    console.error('结构自检失败：颜色令牌块不唯一，后续对比度数字不可信');
    for (const e of structErrors) console.error('  ' + e);
    console.error('→ 处理方式：确认哪个块是「生效」的那份并让脚本取它；不要直接忽略此错误。');
  }
  process.exit(1);
}

const themes = THEMES.map(readTheme).filter((t) => t.base && t.panel);
const results = [];
let failed = 0;

for (const c of CHECKS) {
  const rows = themes
    .map((t) => ({ theme: t.key, ratio: contrast(t[c.fg], c.bg(t)) }))
    .filter((r) => r.ratio !== null);
  if (!rows.length) continue;
  const worst = rows.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
  const bad = rows.filter((r) => r.ratio < c.min);
  if (bad.length) failed++;
  results.push({
    name: c.name,
    min: Number(worst.ratio.toFixed(2)),
    worstTheme: worst.theme,
    threshold: c.min,
    pass: bad.length === 0,
    below: bad.map((b) => ({ theme: b.theme, ratio: Number(b.ratio.toFixed(2)) })),
  });
}

if (AS_JSON) {
  console.log(JSON.stringify({ themes: themes.length, mode: 'formula', results }, null, 2));
} else {
  console.log('对比度自检（公式理论值，不含背景图）：' + themes.length + ' 套主题');
  for (const r of results) {
    console.log(
      `  ${r.pass ? 'PASS' : 'FAIL'} ${r.name}：min ${r.min.toFixed(2)} @ ${r.worstTheme}（门槛 ${r.threshold}）` +
        (r.pass ? '' : ' ← ' + r.below.map((b) => b.theme + ' ' + b.ratio).join(', '))
    );
  }
  console.log(failed === 0 ? '对比度全部达标' : '对比度不达标：' + failed + ' 项');
  console.log('提示：验收以真实渲染为准（本脚本为公式值，背景图会带来 0.5–1.0 的偏差）。');
}
if (failed) process.exit(1);
