#!/usr/bin/env node
/**
 * 生成「本站 songId → 上游 BGM 相对路径」映射表。
 *
 * 背景：曲目详情页要提供试听，音源来自 https://ub.thregren.world（jubeat 谱面确认站）。
 * 它的曲目 id 形如 jubeat/首次收录/arcade_10000036，音频资源在 songs/<同路径>/bgm.ogg，
 * 与我们 D1 里的 song_id 不是同一套，所以要一张映射表。
 *
 * 匹配三层（越靠前越可信）：
 *   1) 数字 id 精确 + 世代目录优先：ub 曲目 id 末段 arcade_<官方 songId> / jubeatchina_<id>，
 *      与本站 song_id 数字部分相同即命中；同一 id 在 ub 可能有「首次收录 / 谱面变化」两条
 *      （谱面重制），优先取属于本站世代的目录，其次取「首次收录」。音频两者其实相同，
 *      但取首次收录更符合直觉，也避免以后对方站只保留一条时行为跳变。
 *   2) 数字 id 精确（不限世代目录）。
 *   3) 规范化标题唯一命中：只在该标题于「本站世代目录内」唯一时采用，
 *      避免同名曲（如 Big Daddy 在 beyond-ave 与音乐魔方 各有一份）配错音源。
 *
 * 未命中的不写进表：上游本就没有这些曲目（国服原创 9950xxxx、拿不到官方 id 的 BTA- 占位曲），
 * 详情页对未命中曲目不渲染播放器，而不是摆一个永远转圈的控件。
 *
 * 产出：src/data/ub-audio.json  { "<songId>": "songs/<世代目录>/<分类>/<id>/bgm.ogg" }
 *      value 是不带域名的相对路径、未做 URL 编码——编码统一在 Worker 反代端点里做，
 *      避免「生成时编一次、拼 URL 时又编一次」把 % 二次转义。
 *
 * 用法：node scripts/ub/build-ub-audio.cjs
 * 需要联网。不进 build 流程（每次构建拉 18 个分片太慢），曲库更新后手动重跑并提交产物。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const UB = 'https://ub.thregren.world';
const DEST = path.join(ROOT, 'src', 'data', 'ub-audio.json');
const SONGS = path.join(ROOT, 'src', 'data', 'songs.json');
const OVERRIDES = path.join(ROOT, 'data', 'audio-overrides.json');
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; BeyondJUBEAT/1.0)' };

// 本站世代 → 上游目录名。上游把「追加曲」和「谱面变化」放在独立目录里
// （ripples-append / copious-append / plus / 谱面变化），归到同一世代下才比得对。
const GEN_DIRS = {
  'jubeat': ['jubeat'],
  'ripples': ['jubeat-ripples', 'jubeat-ripples-append'],
  'knit': ['jubeat-knit'],
  'copious': ['jubeat-copious', 'jubeat-copious-append'],
  'saucer': ['jubeat-saucer'],
  'saucer fulfill': ['jubeat-saucer-fulfill', 'jubeat-saucer'],
  'prop': ['jubeat-prop'],
  'Qubell': ['jubeat-qubell'],
  'clan': ['jubeat-clan', 'jubeat-plus'],
  'festo': ['jubeat-festo'],
  'Ave.': ['jubeat-ave'],
  'beyond the Ave.': ['jubeat-beyond-ave'],
  // 国服：音乐魔方自建曲在「音乐魔方」目录，早期移植曲在 jubeat-china，
  // 少数从日服搬来的（如 Big Daddy）沿用 beyond-ave 目录。
  '音乐魔方': ['音乐魔方', 'jubeat-china', 'jubeat-beyond-ave'],
};

const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const dirOf = (u) => String(u.id).split('/')[0];
// 「首次收录」（0）优先于「谱面变化」（1），其它分类（视频抄谱等）最后。
const rankOf = (u) => (u.category === '首次收录' ? 0 : u.category === '谱面变化' ? 1 : 2);
const pick = (arr) => arr.slice().sort((a, b) => rankOf(a) - rankOf(b))[0];
const inGen = (arr, gen) => {
  const dirs = GEN_DIRS[gen] || [];
  return arr.filter((u) => dirs.includes(dirOf(u)));
};

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  return res.json();
}

async function main() {
  // 1) 曲库总索引 → 18 个版本分片（少的世代也有独立分片）
  const lib = await getJson(UB + '/data/library.json');
  const shards = lib.versionIndexes ?? [];
  if (!shards.length) throw new Error('versionIndexes 为空，上游结构可能变了');

  // 2) 逐分片拉曲目，只留带音频资源的
  const ubSongs = [];
  for (const rel of shards) {
    let j;
    try {
      j = await getJson(UB + '/' + rel);
    } catch (e) {
      console.warn('  跳过分片', rel, e.message);
      continue;
    }
    for (const s of j.songs ?? []) if (s.assets && s.assets.audio) ubSongs.push(s);
  }
  if (ubSongs.length < 1000) throw new Error('只拉到 ' + ubSongs.length + ' 首，上游结构可能变了');

  // 3) 建索引：数字 id → 曲目列表；规范化标题 → 曲目列表
  const byNum = new Map();
  const byTitle = new Map();
  for (const u of ubSongs) {
    const m = /_(\d+)$/.exec(String(u.id));
    if (m) {
      if (!byNum.has(m[1])) byNum.set(m[1], []);
      byNum.get(m[1]).push(u);
    }
    const k = norm(u.title);
    if (!k) continue;
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(u);
  }

  // 4) 与本地上游快照对撞
  const ours = JSON.parse(fs.readFileSync(SONGS, 'utf8'));
  const out = {};
  const stat = { numGen: 0, num: 0, title: 0 };
  const miss = [];
  for (const s of ours) {
    const id = String(s.id);
    const byNumAll = byNum.get(id) || [];
    const numInGen = inGen(byNumAll, s.gen);
    if (numInGen.length) {
      out[id] = pick(numInGen).assets.audio;
      stat.numGen++;
      continue;
    }
    if (byNumAll.length) {
      out[id] = pick(byNumAll).assets.audio;
      stat.num++;
      continue;
    }
    const byTitleAll = byTitle.get(norm(s.t)) || [];
    const titleInGen = inGen(byTitleAll, s.gen);
    if (titleInGen.length === 1) {
      out[id] = titleInGen[0].assets.audio;
      stat.title++;
      continue;
    }
    if (byTitleAll.length === 1) {
      out[id] = byTitleAll[0].assets.audio;
      stat.title++;
      continue;
    }
    miss.push(id);
  }

  // 4.5) 应用人工覆盖层：自动匹配解决不了歧义时（同名曲两服各一条、目录白名单互相包含），
  //      在 data/audio-overrides.json 里按 songId 钉死。覆盖层优先于自动结果。
  //      自检三条，任一不符直接抛错——静默失效会表现为「改了没生效」，比报错难查一个数量级。
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));
  const ourIds = new Set(ours.map((s) => String(s.id)));
  const ubPaths = new Set(ubSongs.map((u) => u.assets.audio));
  let ovApplied = 0;
  for (const [id, o] of Object.entries(overrides)) {
    if (id.startsWith('_')) continue;
    if (!ourIds.has(id)) throw new Error('覆盖层 songId ' + id + ' 不在本站曲库中');
    if (!o || typeof o.path !== 'string' || !o.path) throw new Error('覆盖层 ' + id + ' 缺 path');
    if (!ubPaths.has(o.path)) throw new Error('覆盖层 ' + id + ' 的 path 不在上游曲目中：' + o.path);
    out[id] = o.path;
    ovApplied++;
  }
  const stillMiss = miss.filter((id) => !out[id]);

  // 5) 自检：覆盖率不能莫名掉下去（上游改结构/分片丢失时立刻发现，而不是静默变空表）
  const covered = Object.keys(out).length;
  const rate = covered / ours.length;
  if (rate < 0.85) {
    throw new Error('覆盖率仅 ' + (rate * 100).toFixed(1) + '%，低于 85%，判定为上游异常，未写入');
  }

  fs.writeFileSync(DEST, JSON.stringify(out) + '\n');
  console.log(
    '上游 ' + ubSongs.length + ' 首带音频｜本站 ' + ours.length + ' 首｜命中 ' + covered +
    ' (' + (rate * 100).toFixed(1) + '%)｜id+世代 ' + stat.numGen + ' / id ' + stat.num +
    ' / 标题 ' + stat.title + '｜覆盖层 ' + ovApplied + '｜未命中 ' + stillMiss.length
  );
  if (stillMiss.length) {
    console.log('未命中（上游无对应曲目）：' + stillMiss.slice(0, 8).join(', ') + (stillMiss.length > 8 ? ' …' : ''));
  }
  console.log('写入', path.relative(ROOT, DEST));
}

main().catch((e) => {
  console.error('生成失败:', e.message);
  process.exit(1);
});
