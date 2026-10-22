#!/usr/bin/env node
/**
 * 生成「本站 songId → 谱面确认站曲目 id」映射表。
 *
 * 背景：详情页要内嵌 https://ub.thregren.world 的谱面播放器（经 /ub-proxy 代理），
 * 它的深链接参数是它自己的曲目 id，形如 jubeat/首次收录/arcade_10000001，
 * 与我们 D1 里的 song_id 不是同一套。实测它的 id 第三段正是官方 songId，
 * 所以先按 songId 精确匹配；再对长押谱/占位 id 用「规范化标题」兜底。
 *
 * 产出：src/data/ub-index.json  { "<本站 songId>": "<ub 曲目 id>" }
 * 只存命中项（约 94%），未命中的曲目详情页就不显示播放器——
 * 比显示一个空白 iframe 好。ub 是日服街机谱面站，国服原创曲（9900xxxx）
 * 与拿不到官方 id 的占位曲（BTA-xxxx）本来就没有条目。
 *
 * 用法：node scripts/ub/build-ub-index.mjs
 * 需要联网。不建议放进 build 流程（每次构建都拉 17 个分片太慢），
 * 曲库有更新时手动重跑并提交产物。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const UB = 'https://ub.thregren.world';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; BeyondJUBEAT/1.0)' };

const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

async function main() {
  // 1) 拉曲库总索引，拿到 17 个版本分片
  const libRes = await fetch(UB + '/data/library.json', { headers: UA });
  if (!libRes.ok) throw new Error('library.json ' + libRes.status);
  const lib = await libRes.json();
  const indexes = lib.versionIndexes ?? [];
  if (!indexes.length) throw new Error('versionIndexes 为空，对方站结构可能变了');

  // 2) 逐个分片拉曲目
  const ubSongs = [];
  for (const rel of indexes) {
    const res = await fetch(UB + '/' + rel, { headers: UA });
    if (!res.ok) {
      console.warn('skip', rel, res.status);
      continue;
    }
    const j = await res.json();
    const arr = j.songs || j.items || (Array.isArray(j) ? j : []);
    if (Array.isArray(arr)) ubSongs.push(...arr);
  }
  if (!ubSongs.length) throw new Error('没拉到任何曲目，对方站结构可能变了');

  // 3) 建两张索引
  const bySongId = new Map();
  const byTitle = new Map();
  for (const s of ubSongs) {
    const m = /arcade_(\d+)$/.exec(String(s.id ?? ''));
    if (m) bySongId.set(m[1], s.id);
    const k = norm(s.title);
    if (!k) continue;
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(s.id);
  }

  // 4) 与本地的曲目快照对撞
  const ours = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'songs.json'), 'utf8'));
  const out = {};
  let byId = 0, byTitleHit = 0;
  for (const s of ours) {
    if (bySongId.has(s.id)) {
      out[s.id] = bySongId.get(s.id);
      byId++;
      continue;
    }
    const cands = byTitle.get(norm(s.t));
    // 只在标题唯一命中时采用，避免同名曲配错谱面
    if (cands && cands.length === 1) {
      out[s.id] = cands[0];
      byTitleHit++;
    }
  }

  const dest = path.join(ROOT, 'src', 'data', 'ub-index.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 0) + '\n');
  const covered = Object.keys(out).length;
  console.log(
    `ub 曲库 ${ubSongs.length} 首｜本地 ${ours.length} 首｜命中 ${covered} ` +
    `(songId ${byId} + 标题 ${byTitleHit})｜覆盖 ${((covered / ours.length) * 100).toFixed(1)}%`
  );
  console.log('写入', path.relative(ROOT, dest));
}

main().catch((e) => {
  console.error('生成失败:', e.message);
  process.exit(1);
});
