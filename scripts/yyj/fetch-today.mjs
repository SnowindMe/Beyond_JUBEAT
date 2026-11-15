// 按曲名定向抓今天上架的新曲（库 + 三档谱面 + 曲绘信息）。
// 用法：node scripts/yyj/fetch-today.mjs --token=xx --names="A|B|C" --out=.devhome/today.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSession, call } from '../../archive/legacy/yyj-extractor/fetcher.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (k) => (argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
const token = arg('token') || fs.readFileSync(path.join(ROOT, '.devhome/yyj-token.txt'), 'utf8').trim();
const NAMES = (arg('names') || '').split('|').map((s) => s.trim()).filter(Boolean);
const OUT = path.join(ROOT, arg('out') || '.devhome/yyj-today.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const s = makeSession(token);
const lib = new Map();
for (const diff of [1, 2, 3]) {
  for (const isCol of [0, 1]) {
    let page = 1, total = 1;
    while (page <= total) {
      let j; try { j = await call(s, 'music_info', { isCol, filterType: 0, diff, isHard: 0, page, page_size: 100 }); } catch (e) { console.error('lib err', e.code || e.message); page++; continue; }
      const d = j && j.data; if (!d || !Array.isArray(d.list)) break;
      total = Number(d.total_page) || 1;
      for (const it of d.list) { const id = String(it.songId); if (!lib.has(id)) lib.set(id, { songId: it.songId, name: it.name, artist: it.artist, levels: {}, cover: it.cover || it.img || null }); const rec = lib.get(id); const k = ['bsc', 'adv', 'ext'][diff - 1]; if (it.lv != null) rec.levels[k] = it.lv; }
      if (!d.list.length) break; page++; await sleep(100);
    }
  }
}
console.log('曲库', lib.size, '首');
const hits = [];
for (const n of NAMES) {
  const found = [...lib.values()].filter((r) => r.name === n || r.name.replace(/\s+/g, '') === n.replace(/\s+/g, ''));
  console.log(n, '→', found.length ? found.map((f) => f.songId).join(',') : '库内未找到');
  hits.push(...found);
}
const details = {};
for (const h of hits) {
  const rec = {};
  for (const diff of [1, 2, 3]) {
    for (let a = 0; a < 3; a++) {
      try { const j = await call(s, 'music_detail', { roleid: '1006559', songId: Number(h.songId), diff, isHard: 0 }); const d = j && j.data;
        if (d && d.noteCount != null) { rec[['bsc', 'adv', 'ext'][diff - 1]] = { noteCount: d.noteCount, radar: d.radarData, lv: d.lv, artist: d.artist, name: d.name, cover: d.cover || d.img || null }; break; }
      } catch (e) { if (e.code === 'TOKEN_EXPIRED') { console.error('token 过期'); } }
      await sleep(250 + a * 400);
    }
    await sleep(120);
  }
  details[h.songId] = { ...h, detail: rec };
  console.log('抓完', h.name);
}
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), lib: [...lib.values()], details }, null, 1));
console.log('写入', OUT);
