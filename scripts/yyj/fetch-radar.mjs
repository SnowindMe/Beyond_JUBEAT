// 音游街「六维 radarData」抓取器 v2（2026-11-05）。
//
// v1 的坑：等 token 超时就直接 process.exit，代理跟着死 → 系统代理指向 8899 却没人接，
// 整个机器断网。v2 改成常驻：代理只有在 Ctrl-C 时才停，等不到 token 就继续等。
//
// 六维字段：NOTES 物量 / CHORD 同时押 / PEAK 尖峰 / HOLD 长押 / SLIDE 钢琴 / HAND-TRIP 出张。
// 用途：拿到 谱面 → 六维 的对照样本，反推六维算法。
//
// 用法：
//   node scripts/yyj/fetch-radar.mjs              # 常驻：起代理、等 token、截到就抓、过期接着等
//   node scripts/yyj/fetch-radar.mjs --token=xx   # 手动给 token（不起代理）
//
// 系统代理需要指向 127.0.0.1:8899。非目标流量转上游 clash（YYJ_UPSTREAM，默认 127.0.0.1:7897）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSession, call } from '../../archive/legacy/yyj-extractor/fetcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, '.devhome/yyj-radar.json');

const argv = process.argv.slice(2);
const tokenArg = (argv.find((a) => a.startsWith('--token=')) || '').slice(8);
const CONC = Number((argv.find((a) => a.startsWith('--conc=')) || '--conc=8').slice(7));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const DIFF = { 1: 'bsc', 2: 'adv', 3: 'ext' };
const state = { details: {}, ids: null, running: false, ok: 0, bad: 0, rounds: 0 };

function load() {
  if (!fs.existsSync(OUT)) return;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    state.details = prev.details || {};
    log('复用已抓 ' + Object.keys(state.details).length + ' 首');
  } catch {}
}
function save() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), details: state.details }));
}

// 队列：ext → adv → bsc；只排还缺的档
function buildQueue() {
  const q = [];
  for (const diff of [3, 2, 1]) {
    for (const id of state.ids) {
      const rec = state.details[id];
      if (rec && rec[DIFF[diff]] && rec[DIFF[diff]].radar) continue;
      q.push([id, diff]);
    }
  }
  return q;
}

async function fetchOne(session, songId, diff, attempt = 0) {
  try {
    const j = await call(session, 'music_detail', {
      roleid: '1006559', songId: Number(songId), diff, isHard: 0,
    });
    const d = j && j.data;
    if (d && d.radarData) {
      return { radar: d.radarData, noteCount: d.noteCount, lv: d.lv, songLength: d.songLength };
    }
    if (attempt < 3) { await sleep(200 + attempt * 350); return fetchOne(session, songId, diff, attempt + 1); }
    return { error: 'no-data' };
  } catch (e) {
    if (e.code === 'TOKEN_EXPIRED') throw e;
    if (attempt < 3) { await sleep(200 + attempt * 350); return fetchOne(session, songId, diff, attempt + 1); }
    return { error: e.code || e.message };
  }
}

async function loadLibrary(session) {
  const lib = new Set();
  for (const diff of [1, 2, 3]) {
    for (const isCol of [0, 1]) {
      let page = 1, total = 1;
      while (page <= total) {
        const j = await call(session, 'music_info', { isCol, filterType: 0, diff, isHard: 0, page, page_size: 100 });
        const d = j && j.data;
        if (!d || !Array.isArray(d.list)) break;
        total = Number(d.total_page) || 1;
        for (const s of d.list) if (s.songId != null) lib.add(String(s.songId));
        if (!d.list.length) break;
        page++;
        await sleep(80);
      }
    }
  }
  return [...lib];
}

async function runRound(token) {
  if (state.running) return;
  state.running = true;
  state.rounds++;
  const session = makeSession(token);
  log('=== 第 ' + state.rounds + ' 轮开始（并发 ' + CONC + '）');

  if (!state.ids) {
    try {
      const lib = await loadLibrary(session);
      if (lib.length) { state.ids = lib; log('音游街曲库 ' + lib.length + ' 首'); }
    } catch (e) {
      log('取曲库失败：' + (e.code || e.message));
      if (e.code === 'TOKEN_EXPIRED') { state.running = false; return; }
    }
  }
  if (!state.ids) {
    state.ids = [];
    try {
      const songs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/songs.json'), 'utf8'));
      for (const s of (Array.isArray(songs) ? songs : Object.values(songs))) {
        const id = String(s.id ?? s.songId ?? '');
        if (/^\d+$/.test(id)) state.ids.push(id);
      }
      log('退回本地曲库 ' + state.ids.length + ' 首');
    } catch {}
  }

  const queue = buildQueue();
  log('本轮待抓 ' + queue.length + ' 档');
  let stop = false;
  const t0 = Date.now();
  let done = 0;

  async function worker() {
    while (!stop && queue.length) {
      const [id, diff] = queue.shift();
      const rec = (state.details[id] ||= {});
      try {
        rec[DIFF[diff]] = await fetchOne(session, id, diff);
      } catch (e) {
        log('TOKEN 过期，本轮收尾');
        stop = true; return;
      }
      if (rec[DIFF[diff]].radar) state.ok++; else state.bad++;
      done++;
      // token 只有几分钟，抓到的必须立刻落盘，不然过期就白瞎
      if (done % 25 === 0) {
        log('  进行 ' + done + ' | ok ' + state.ok + ' | ' + ((Date.now() - t0) / 1000 | 0) + 's');
        save();
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  save();
  state.running = false;
  log('=== 本轮结束，累计抓档 ' + state.ok + '，作品 ' + Object.keys(state.details).length);
}

load();

if (tokenArg) {
  await runRound(tokenArg);
  save();
  log('完成 -> ' + OUT);
  process.exit(0);
}

const { MitmProxy } = await import('../../archive/legacy/yyj-extractor/proxy.mjs');
// 'none' = 直连（clash 的 7897 断过链，直连比转上游稳）
const envUp = process.env.YYJ_UPSTREAM ?? 'none';
const upstream = envUp === 'none' || envUp === '' ? null : envUp;
const proxy = new MitmProxy({ port: 8899, certDir: path.join(ROOT, 'archive/legacy/yyj-extractor/certs'), upstream });
const TOKEN_FILE = path.join(ROOT, '.devhome/yyj-token.txt');
proxy.on('token', (t) => {
  if (!t) return;
  // 落盘：token 过期后主人手动重开小程序能续，脚本重启也能直接复用
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, t);
  log('*** 截到 token（已写 ' + path.relative(ROOT, TOKEN_FILE) + '）');
  tryToken(t, '截包');
});
await proxy.start();
log('代理常驻 127.0.0.1:8899（非目标流量 → ' + (upstream || '直连') + '）。Ctrl-C 才停。');
// 同一个 token 不重复跑（截包写入和手动粘贴写入都可能触发）
let lastToken = '';
function tryToken(t, why) {
  t = (t || '').trim();
  if (!t || t === lastToken) return;
  lastToken = t;
  log('用 token 开抓（' + why + '）');
  runRound(t).catch((e) => { log('轮次出错：' + (e && e.message)); state.running = false; });
}

// 有存着的 token 就先爬一轮存货
if (fs.existsSync(TOKEN_FILE)) tryToken(fs.readFileSync(TOKEN_FILE, 'utf8'), '启动读文件');
// 外部改文件（手动粘贴 token）也能触发
fs.watchFile(TOKEN_FILE, { interval: 1000 }, () => {
  try { tryToken(fs.readFileSync(TOKEN_FILE, 'utf8'), '文件变化'); } catch {}
});
log('>>> 请在微信里打开「音游街」→ 音乐魔方。截到 token 会自动开抓，过期接着等。');

const bye = () => { save(); proxy.stop(); log('退出，已保存 ' + Object.keys(state.details).length + ' 首'); process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
setInterval(() => {}, 1 << 30);
