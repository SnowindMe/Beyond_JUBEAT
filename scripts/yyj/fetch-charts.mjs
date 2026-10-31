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
// 参数形态未知，这里是「先试最常见的几种，哪种返回有用数据就用哪种」。
// 音频要快速判定：拿第一首试，命中就锁定参数名，后面全用同一个。
const CANDIDATES = [
  (id) => ({ songId: id }),
  (id) => ({ songid: id }),
  (id) => ({ musicId: id }),
  (id) => ({ id }),
  (id) => ({ songId: id, diff: 3 }),
  (id) => ({ songId: id, song_id: id }),
];

async function probeDetail(session, sampleId) {
  for (const build of CANDIDATES) {
    const extra = build(sampleId);
    try {
      const j = await call(session, 'music_detail', extra);
      const d = j && j.data;
      if (!d) { log('  [' + JSON.stringify(extra) + '] 无 data'); continue; }
      const keys = Object.keys(d).join(',');
      log('  [' + JSON.stringify(extra) + '] data keys: ' + keys);
      if (Object.keys(d).length >= 2) return { build, sample: d };
    } catch (e) {
      log('  [' + JSON.stringify(extra) + '] 失败: ' + (e.code || e.message));
    }
    await sleep(200);
  }
  return null;
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

  log('[2/2] 探测 music_detail 参数形态…');
  const probe = await probeDetail(session, ids[0] || '990000001');
  if (!probe) {
    log('没探到可用参数。已保存曲库，详情留空。');
    fs.writeFileSync(path.join(ROOT, '.devhome/yyj-charts.json'), JSON.stringify({ songs: [...lib.values()], details: {} }, null, 1));
    return;
  }
  log('    锁定参数：' + JSON.stringify(probe.build('<id>')));
  log('    样例返回：' + JSON.stringify(probe.sample).slice(0, 500));

  const details = {};
  let done = 0, failed = 0;
  for (let i = 0; i < ids.length; i += CONC) {
    const batch = ids.slice(i, i + CONC);
    const got = await Promise.all(batch.map(async (id) => {
      try {
        const j = await call(session, 'music_detail', probe.build(id));
        return [id, (j && j.data) || null];
      } catch (e) { return [id, { error: e.code || e.message }]; }
    }));
    for (const [id, d] of got) { if (d && !d.error) { details[id] = d; done++; } else failed++; }
    if (i % (CONC * 5) === 0) log('    进度 ' + Math.min(i + CONC, ids.length) + '/' + ids.length + '（成功 ' + done + ' 失败 ' + failed + '）');
    await sleep(60);
  }
  const out = path.join(ROOT, '.devhome/yyj-charts.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), songs: [...lib.values()], details }, null, 1));
  log('完成：成功 ' + done + ' / 失败 ' + failed + ' -> ' + path.relative(ROOT, out));
}

main().catch((e) => { console.error('出错：' + (e && e.message)); process.exit(1); });