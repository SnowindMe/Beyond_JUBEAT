// 音游街「音乐魔方谱面详情」抓取器（2026-10-31 建立）。
//
// 为什么需要它：音乐魔方（国服曲库）的 has_hold / 音符数量只能从音游街拿 ——
// 这些曲目在 remywiki（日服 wiki）里根本没有，国服 xlsx 也只有 BPM 与定数。
//
// 用法（必须在微信里配合）：
//   1. node scripts/yyj/fetch-charts.mjs --wait-token
//      脚本会起本地 MITM 代理（127.0.0.1:8899）并等你打开小程序。
//      打开微信 → 音游街 → 进入「音乐魔方」页面，脚本截到 token 后自动开抓。
//   2. 想手动给 token 也行：node scripts/yyj/fetch-charts.mjs --token=<词>
//
// 输出：.devhome/yyj-charts.json（中间产物，不入库）
//       再由 make-chart-overrides 落成 data/chart-overrides.json 的条目。
//
// 【为什么能只抓音乐魔方】token 只有约 4 分钟窗口，全量曲库几千次请求跑不完。
// 音乐魔方只有 98 首 × 3 难度 ≈ 300 次请求，并发 8 大约 40 秒，来得及。
//
// 【六维与长押的关系】主人 2026-10-31 明确：「六维数据只能看出有没有 hold，
// 无法看出 hold 有多少」。所以本脚本能给 has_hold（有/无），给不了 holds 数值。
// 拿到音符数量（noteCount）可以补 notecounts 三档。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSession, call, genOf } from '../../archive/legacy/yyj-extractor/fetcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const argv = process.argv.slice(2);
const tokenArg = (argv.find((a) => a.startsWith('--token=')) || '').slice(8);
const waitToken = argv.includes('--wait-token');
const CONC = Number((argv.find((a) => a.startsWith('--conc=')) || '--conc=8').slice(7));
const ONLY_CUBE = !argv.includes('--all');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---- 取 token ----
async function getToken() {
  if (tokenArg) return tokenArg;
  if (!waitToken) {
    console.error('需要 --token=<词> 或 --wait-token（起代理等小程序）');
    process.exit(1);
  }
  const { MitmProxy } = await import('../../archive/legacy/yyj-extractor/proxy.mjs');
  const upstream = process.env.YYJ_UPSTREAM || null;
  const certDir = path.join(ROOT, 'archive/legacy/yyj-extractor/certs');
  const proxy = new MitmProxy({ port: 8899, certDir, upstream });
  const p = new Promise((res) => proxy.on('token', (t) => t && res(t)));
  await proxy.start();
  log('本地代理已启动 127.0.0.1:8899' + (upstream ? '（非目标流量转 ' + upstream + '）' : ''));
  log('>>> 请在微信里打开「音游街」，进入【音乐魔方】页面。等待 token（最多 3 分钟）…');
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('等待 token 超时')), 180000));
  try {
    const t = await Promise.race([p, timeout]);
    proxy.stop();
    return t;
  } catch (e) {
    proxy.stop();
    console.error('没截到 token：' + e.message);
    console.error('注意：系统代理需要指向 127.0.0.1:8899。用 start.bat 启动最稳。');
    process.exit(1);
  }
}

// ---- 曲库 ----
async function fetchLibrary(session) {
  const lib = new Map();
  for (const diff of [1, 2, 3]) {
    for (const isCol of [0, 1]) {
      let page = 1, totalPage = 1;
      while (page <= totalPage) {
        const j = await call(session, 'music_info', { isCol, filterType: 0, diff, isHard: 0, page, page_size: 100 });
        const d = j && j.data;
        if (!d || !Array.isArray(d.list)) break;
        totalPage = Number(d.total_page) || 1;
        for (const s of d.list) {
          const id = String(s.songId);
          if (!lib.has(id)) lib.set(id, { songId: s.songId, name: s.name, artist: s.artist, levels: {} });
          const rec = lib.get(id);
          const key = ['bsc', 'adv', 'ext'][diff - 1];
          if (s.lv != null) rec.levels[key] = s.lv;
        }
        if (!d.list.length) break;
        page++;
        await sleep(120);
      }
    }
  }
  return lib;
}

// ---- 详情：逐首查 music_detail ----
// 【2026-10-31 确认】参数形态是反推来的，不是猜的：
// 从 Fiddler 历史抓包（CustomRules.js 的 YYJ_Save 落盘）里翻到一条真实请求——
//   {"action":"music_detail","roleid":"1006559","songId":995000032,"diff":3,"isHard":0,"project":"jubeat_release"}
// 三个关键点，之前全踩错：
//   ① songId 必须是**数字**（我传字符串，服务端当没这个字段）；
//   ② 必须带 diff（1/2/3 = bsc/adv/ext），不带就拿不到谱面；
//   ③ isHard 也要带（0 即可）。
// 返回里正好有需要的两个字段：
//   noteCount = 该难度音符总数；radarData.hold = 长押值（0 = 无长押）。
// 主人 2026-10-31 明确「六维只能看出有没有 hold，看不出 hold 有多少」——
// radarData 是个 0~100 的雷达分值，不是长按个数，所以**只能判有无**。

const DIFF = { 1: 'bsc', 2: 'adv', 3: 'ext' };
const DIFFS = [1, 2, 3];

// 拉一首曲的指定难度。失败重试 3 次（并发过高时服务端会丢请求而不是报错）。
async function fetchDiff(session, songIdNum, diff, attempt = 0) {
  try {
    const j = await call(session, 'music_detail', {
      roleid: '1006559',
      songId: Number(songIdNum),
      diff,
      isHard: 0,
    });
    const d = j && j.data;
    if (d && d.noteCount != null) {
      return { noteCount: d.noteCount, radar: d.radarData, lv: d.lv, songLength: d.songLength };
    }
    // 没 data 也当失败重试（限流时就是这么表现的）
    if (attempt < 2) { await sleep(300 + attempt * 500); return fetchDiff(session, songIdNum, diff, attempt + 1); }
    return { error: 'no-data' };
  } catch (e) {
    if (e.code === 'TOKEN_EXPIRED') throw e;  // token 过期不重试，直接往上抛
    if (attempt < 2) { await sleep(300 + attempt * 500); return fetchDiff(session, songIdNum, diff, attempt + 1); }
    return { error: e.code || e.message };
  }
}

// 一首曲三档全抓。**三档都要**（主人 2026-10-31 明确「BSC 和 ADV 也要抓」）
async function fetchOne(session, songIdNum) {
  const out = {};
  for (const diff of DIFFS) {
    out[DIFF[diff]] = await fetchDiff(session, songIdNum, diff);
    await sleep(120);   // 每档之间留间隔，别把服务端打急
  }
  return out;
}

async function main() {
  const token = await getToken();
  log('*** 已拿到 token，开始抓（有效期约 4 分钟，抓紧）');
  const session = makeSession(token);

  log('[1/2] 抓曲库…');
  const lib = await fetchLibrary(session);
  let ids = [...lib.keys()];
  if (ONLY_CUBE) ids = ids.filter((id) => genOf(Number(id)) === '音乐魔方');
  log('    曲库 ' + lib.size + ' 首，本次要抓 ' + ids.length + ' 首');

  log('[2/2] 逐首抓三档谱面（BSC/ADV/EXT，串行 + 重试）…');
  // 断点续抓：上一次的结果若存在就复用，只补缺的档
  const prevPath = path.join(ROOT, '.devhome/yyj-charts.json');
  let details = {};
  if (fs.existsSync(prevPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
      if (prev.details) details = prev.details;
      log('    读到上次结果 ' + Object.keys(details).length + ' 首，将复用已有的档');
    } catch {}
  }
  const needDiff = (rec) => DIFFS.filter((d) => !rec || !rec[DIFF[d]] || rec[DIFF[d]].error || rec[DIFF[d]].noteCount == null);

  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const rec = details[id] || {};
    const need = needDiff(rec);
    if (!need.length) { done++; continue; }
    for (const diff of need) {
      rec[DIFF[diff]] = await fetchDiff(session, id, diff);
      await sleep(100);
    }
    details[id] = rec;
    done++;
    if (i % 5 === 0 || i === ids.length - 1) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const full = Object.values(details).filter((r) => !needDiff(r).length).length;
      log('    ' + (i + 1) + '/' + ids.length + ' 齐全 ' + full + ' 首 | 已用 ' + secs + 's');
    }
    // 中途落盘，token 半路过期也不丢已抓的
    if (i % 10 === 0) {
      fs.writeFileSync(prevPath, JSON.stringify({ generatedAt: new Date().toISOString(), songs: [...lib.values()], details }, null, 1));
    }
  }
  const out = path.join(ROOT, '.devhome/yyj-charts.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), songs: [...lib.values()], details }, null, 1));
  log('完成：成功 ' + done + ' / 失败 ' + failed + ' -> ' + path.relative(ROOT, out));
}

main().catch((e) => { console.error('出错：' + (e && e.message)); process.exit(1); });