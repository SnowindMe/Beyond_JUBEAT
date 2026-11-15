// 截 token → 立刻抓指定曲名（2026-11-16）。
// token 只有约 4 分钟，人工接力（截完再手动跑）经常差几十秒就过期，所以做成一体：
// PAC 只把 wahlap 导到本地录制代理 → 截到 access_token → 立即开抓 → 退出时恢复 PAC。
// 用法：node scripts/yyj/capture-and-fetch.mjs --names="A|B"
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MitmProxy } from '../../archive/legacy/yyj-extractor/proxy.mjs';
import { makeSession, call } from '../../archive/legacy/yyj-extractor/fetcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BACKUP = path.join(ROOT, '.tmp', 'pac-backup.json');
const REG = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const ps = (c) => execFileSync('powershell', ['-NoProfile', '-Command', c], { encoding: 'utf8' }).trim();
const argv = process.argv.slice(2);
const arg = (k, d) => { const v = argv.find((a) => a.startsWith('--' + k + '=')); return v ? v.split('=').slice(1).join('=') : d; };
const NAMES = (arg('names', '') || '').split('|').map((s) => s.trim()).filter(Boolean);
// 曲名与曲库写法不一致时（如截图「下兩天」实为「下雨天」）用 --ids 直接指定 songId。
// 【踩过】第一次只加了 --names，补抓那次 NAMES 为空 → 一首没抓，还把上一轮的 details 覆盖成空对象。
const IDS = (arg('ids', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const WAIT_MS = Number(arg('wait', '240000'));
const PAC_PORT = Number(arg('pac-port', '45931'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const origPac = ps(`(Get-ItemProperty '${REG}').AutoConfigURL`);
fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.writeFileSync(BACKUP, JSON.stringify({ pac: origPac || '' }));
let restored = false;
const restore = () => { if (restored) return; restored = true;
  try { ps(`Set-ItemProperty '${REG}' -Name AutoConfigURL -Value '${origPac || ''}'`); console.log('已恢复 AutoConfigURL'); }
  catch (e) { console.error('!!! 恢复失败，手动改回', origPac, e.message); } };
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(s, () => { restore(); process.exit(130); });
process.on('exit', restore);
process.on('uncaughtException', (e) => { console.error('异常', e.message); restore(); process.exit(1); });

const pac = http.createServer((q, r) => {
  if (q.url.startsWith('/commands/pac')) { r.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' });
    // 【为什么其余流量要交给 mihomo 而不是 DIRECT】小程序在拿 token 之前还要连别的域，
    // 全 DIRECT 时只要有一个解析不通，界面就卡在打开中（2026-11-16 实测：两次都在等 token 超时）。
    // 只有 wahlap.net 被 MITM，其余仍是正常网络。
    r.end(`function FindProxyForURL(u,h){ if(dnsDomainIs(h,'wahlap.net')) return 'PROXY 127.0.0.1:8899'; return 'PROXY 127.0.0.1:7897; DIRECT'; }\n`); }
  else { r.writeHead(404); r.end(); }
});
await new Promise((r) => pac.listen(PAC_PORT, '127.0.0.1', r));
ps(`Set-ItemProperty '${REG}' -Name AutoConfigURL -Value 'http://127.0.0.1:${PAC_PORT}/commands/pac'`);
console.log('PAC 已指向本地，请在微信里打开「音游街 → 音乐魔方」并点开任意曲目详情…');

const proxy = new MitmProxy({ port: 8899, certDir: path.join(ROOT, 'archive/legacy/yyj-extractor/certs'), upstream: '127.0.0.1:7897' });
const token = await new Promise((res, rej) => {
  proxy.on('token', (t) => t && res(t));
  proxy.start().then(() => console.log('录制代理已启动，等待 token…'));
  setTimeout(() => rej(new Error('等 token 超时')), WAIT_MS);
});
console.log('*** 拿到 token，立刻开抓');
fs.writeFileSync(path.join(ROOT, '.devhome/yyj-token.txt'), token + '\n');

const s = makeSession(token);
const lib = new Map();
for (const d of [1, 2, 3]) for (const isCol of [0, 1]) {
  let p = 1, total = 1;
  while (p <= total) {
    let j; try { j = await call(s, 'music_info', { isCol, filterType: 0, diff: d, isHard: 0, page: p, page_size: 100 }); }
    catch (e) { console.error('lib', e.code || e.message); break; }
    const dd = j && j.data; if (!dd || !Array.isArray(dd.list)) break;
    total = Number(dd.total_page) || 1;
    // 调试：第一次拿到列表时把原始条目键名留档，确认曲绘字段到底叫什么（2026-11-16 见 cover/img 全是 null）
    if (!fs.existsSync(path.join(ROOT, '.devhome/yyj-rawkeys.json')))
      fs.writeFileSync(path.join(ROOT, '.devhome/yyj-rawkeys.json'), JSON.stringify(dd.list.slice(0, 2), null, 1));
    for (const it of dd.list) { const id = String(it.songId); if (!lib.has(id)) lib.set(id, { songId: it.songId, name: it.name, artist: it.artist, levels: {}, cover: it.cover || it.img || null, pic: it.pic || null }); // 曲绘真名是 pic，cover/img 一直是 null（2026-11-16 实测）
      const rec = lib.get(id); const k = ['bsc', 'adv', 'ext'][d - 1]; if (it.lv != null) rec.levels[k] = it.lv; }
    if (!dd.list.length) break; p++; await sleep(60);
  }
}
console.log('曲库', lib.size, '首');
const out = {};
// 已有产物先读进来，本轮只覆盖抓到的条目，不清空上一轮的结果
try { Object.assign(out, JSON.parse(fs.readFileSync(path.join(ROOT, '.devhome/yyj-today.json'), 'utf8')).details || {}); } catch {}
const targets = [...NAMES.map((n) => ({ by: 'name', v: n })), ...IDS.map((i) => ({ by: 'id', v: i }))];
for (const t of targets) {
  const n = t.by === 'name' ? t.v : '#' + t.v;
  const f = t.by === 'name'
    ? [...lib.values()].filter((r) => r.name === n)
    : [...lib.values()].filter((r) => String(r.songId) === t.v);
  if (!f.length) { console.log(n, '→ 未找到'); continue; }
  for (const h of f) {
    const rec = {};
    for (const d of [1, 2, 3]) {
      for (let a = 0; a < 3; a++) {
        try { const j = await call(s, 'music_detail', { roleid: '1006559', songId: Number(h.songId), diff: d, isHard: 0 });
          const dd = j && j.data;
          if (dd && !fs.existsSync(path.join(ROOT, '.devhome/yyj-rawdetail.json'))) fs.writeFileSync(path.join(ROOT, '.devhome/yyj-rawdetail.json'), JSON.stringify(dd, null, 1));
          if (dd && dd.noteCount != null) { rec[['bsc', 'adv', 'ext'][d - 1]] = { noteCount: dd.noteCount, radar: dd.radarData, lv: dd.lv, name: dd.name, artist: dd.artist, cover: dd.cover || dd.img || null, pic: dd.pic || null }; break; } }
        catch (e) { console.error('detail', h.songId, d, e.code || e.message); }
        await sleep(200 + a * 350);
      }
      await sleep(100);
    }
    out[h.songId] = { ...h, detail: rec };
    console.log('抓到', h.name, h.songId);
  }
}
const OUT = path.join(ROOT, '.devhome/yyj-today.json');
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), lib: [...lib.values()], details: out }, null, 1));
console.log('完成 →', OUT);
proxy.stop(); pac.close(); restore(); process.exit(0);
