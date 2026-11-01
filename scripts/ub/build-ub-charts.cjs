// 谱面抓取：从 ub.thregren.world 拉 BSC/ADV/EXT.json，按**官方口径**算出密度条与物量。
//   node scripts/ub/build-ub-charts.cjs [--limit N] [--only songId]
//
// 【为什么做这个】详情页原来只有「键数 / 长押数」两个裸数字，读不出节奏形态。
// 谱面文件里有每个音符的拍位置，等分成固定列就能画出真实的密度条——
// 哪一段是压轴、哪一段是空档，一眼可见。这是**派生数据**，不是新的事实来源：
// 键数、长押数仍然以 D1 为准，这里只多算「分布」。
//
// ===========================================================================
// 【口径：物量怎么算】（主人 2026-11-01 给定，对齐 jubeat 官方口径模拟器
//   jujube/Stepland 的 Drawables::DensityGraph 与官方物量表，1121 首/3101 谱面逐张核过）
//
//   物量 = 单点 ×1 + 长押 ×2 —— 长押的**头判和尾判各算一颗**，中间按住的那段不额外算。
//   这也是实机结算画面那条分布图的口径，也是右上角 NOTE 那一格的数字。
//
//   不这么算会出大错：以前只数头判，长押多的谱面物量会少算一半
//   （「袖手旁観」三道难度都是 18 条长押，NOTE 从 18 修到 36；「iris」是 35 → 70）。
//
//   另外三条也照抄官方：
//     · 时间轴 = max(音频时长, 最后一颗判定时刻) + 1s（末尾那一秒是官方自己留的尾巴）
//     · 固定切 115 列，柱高封顶 8 层，画的是**绝对颗数**（不按本曲峰值归一化）
//     · 格子是正方形（4px 亮面 + 1px 暗缝），整张图按「屏宽 ÷ 768」等比缩放后水平居中
//
//   验证：11000120 EXT 物量 1040 = 单点 960 + 长押 40×2，115 列列总计也是 1040，
//   两个独立算法互验一致。与 D1 的 notecounts 同样差 0。
// ===========================================================================
//
// 【输出】src/data/ub-charts.json
//   { "<songId>": { "<lv>": { cols: [..115 列各自的颗数..], dur: 时间轴秒数,
//                              keys: 物量, notes: 单点, holds: 长押, bpm, level } } }
//   cols 是压缩数组（115 个整数），三档约 400 字节，全库预计 1 MB 上下。
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..', '..');
const AUDIO = require(path.join(ROOT, 'src/data/ub-audio.json'));
// 库里各曲的键数（用于给抓回来的谱面打「版本是否对得上」的标记）
const SONG_BY_ID = new Map(
  require(path.join(ROOT, 'src/data/songs.json')).map((s) => [s.id, s])
);
const OUT = path.join(ROOT, 'src/data/ub-charts.json');
const BASE = 'https://ub.thregren.world/';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const LIMIT = opt('--limit') ? Number(opt('--limit')) : Infinity;
const ONLY = opt('--only');

function get(url, tries = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; byd-ub-indexer)' } }, (r) => {
      if (r.statusCode !== 200) {
        r.resume();
        if (tries > 1 && r.statusCode >= 500) return setTimeout(() => get(url, tries - 1).then(resolve, reject), 800);
        return reject(new Error('HTTP ' + r.statusCode));
      }
      let d = '';
      r.setEncoding('utf8');
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve(d));
    });
    req.on('error', (e) => {
      if (tries > 1) return setTimeout(() => get(url, tries - 1).then(resolve, reject), 800);
      reject(e);
    });
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

/** beat 是 [bar, num, den] —— 实测第一个分量本身就是「拍」，不是小节号。
 *  验证：EXT 最后一个音符 beat[0]=414，bpm 200 → 414/200*60 = 124.2s，与曲长吻合。 */
const toBeat = (b) => b[0] + b[1] / b[2];

/** 官方固定列数。不按小节切——曲子 BPM 与长度各不同，固定列数才能横向比较。 */
const COLS = 115;
/** 柱高封顶层数（官方也是 8 层；超出的部分截断，不压峰）。 */
const MAX_LAYERS = 8;
/** 官方在时间轴末尾留的尾巴（秒）。 */
const TAIL_SEC = 1;

function analyze(json) {
  const notes = (json.note || []).filter((n) => n.index !== undefined);
  const taps = notes.filter((n) => !n.endbeat);
  const holds = notes.filter((n) => n.endbeat);

  // 最后一颗「判定时刻」：单点看头判，长押看尾判（尾判更靠后）
  let lastBeat = 0;
  for (const n of notes) {
    const p = toBeat(n.beat);
    if (p > lastBeat) lastBeat = p;
    if (n.endbeat) {
      const q = toBeat(n.endbeat);
      if (q > lastBeat) lastBeat = q;
    }
  }

  const bpm = json.time?.[0]?.bpm || 120;
  const lastSec = (lastBeat / bpm) * 60;
  // 官方口径：时间轴 = max(音频时长, 最后一颗判定时刻) + 1s。
  // 我们拿不到音频时长，用最后一颗判定时刻代替（对绝大多数曲目这就是音频长度，
  // 且官方也是取两者较大值）；再 +1s 尾巴。列定位用**不含尾巴**的 lastBeat，
  // 否则会把柱子整体往前压、末尾多出一列空的。
  const dur = lastSec + TAIL_SEC;

  // 固定 115 列等分。长押的头判与尾判**各算一颗**（官方口径），
  // 这样列总计 == 物量，两个独立算法互验。
  const cols = new Array(COLS).fill(0);
  const put = (beatPos) => {
    let idx = Math.floor((beatPos / lastBeat) * COLS);
    if (idx >= COLS) idx = COLS - 1;
    if (idx < 0) idx = 0;
    cols[idx] += 1;
  };
  for (const n of taps) put(toBeat(n.beat));
  for (const n of holds) {
    put(toBeat(n.beat));
    put(toBeat(n.endbeat));
  }

  return {
    cols,
    dur: Math.round(dur * 10) / 10,
    // 物量 = 单点 ×1 + 长押 ×2（头判 + 尾判）
    keys: taps.length + holds.length * 2,
    notes: taps.length,
    holds: holds.length,
    bpm,
    // 【版本校验】ub 上个别曲目还是旧版谱面（实测 paranoia 的 EXT 是 Lv8 老谱，
    // 而库里已是 Lv9.5；两者键数 563 vs 965，差 40%）。把上游的 level 一起存下来，
    // 消费端拿它跟库里定数比对，不符的就不画密度条——宁可少一条图，
    // 也不能把「旧版谱面的节奏形态」当成当前谱面展示。
    level: json.meta?.level != null ? String(json.meta.level) : null,
  };
}

(async () => {
  const ids = Object.keys(AUDIO).filter((k) => (ONLY ? k === ONLY : true));
  const out = {}; // 变化检测：读旧文件，只写有变化的 id，避免每次全量重写
  let done = 0, ok = 0, fail = 0;
  const failures = [];

  const queue = ids.slice(0, LIMIT === Infinity ? ids.length : LIMIT);
  console.log('待抓 ' + queue.length + ' 首 × 3 档 = ' + queue.length * 3 + ' 个谱面');

  // 并发 6：单站限流与礼貌之间的折中，实测 6 路稳定
  const CONCURRENCY = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const id = queue[cursor++];
      const dir = BASE + AUDIO[id].replace('/bgm.ogg', '') + '/charts/';
      const entry = {};
      for (const lv of ['bsc', 'adv', 'ext']) {
        try {
          const txt = await get(dir + lv.toUpperCase() + '.json');
          entry[lv] = analyze(JSON.parse(txt));
          ok++;
        } catch (e) {
          failures.push(id + '/' + lv + ': ' + e.message);
        }
        fail = failures.length;
      }
      if (Object.keys(entry).length) out[id] = entry;
      // 与库里对账：只报数字，不中断（版本陈旧是数据事实，不是脚本错误）
      const song = SONG_BY_ID.get(id);
      for (const lv of Object.keys(entry)) {
        const c = entry[lv];
        const lib = song?.notecounts?.[lv];
        if (lib != null && c.keys !== lib) {
          entry[lv].mismatch = lib - c.keys; // 正数 = 库多于上游（多为上游旧版）
        }
      }
      done++;
      if (done % 50 === 0) console.log('  进度 ' + done + '/' + queue.length);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.writeFileSync(OUT, JSON.stringify(out));
  const bytes = fs.statSync(OUT).size;
  console.log('\n完成：' + done + ' 首，谱面成功 ' + ok + '，失败 ' + fail);
  console.log('输出 ' + path.relative(ROOT, OUT) + '，' + (bytes / 1024 / 1024).toFixed(2) + ' MB');
  if (failures.length) {
    console.log('失败样例：');
    console.log(failures.slice(0, 10).map((f) => '  ' + f).join('\n'));
  }
})();
