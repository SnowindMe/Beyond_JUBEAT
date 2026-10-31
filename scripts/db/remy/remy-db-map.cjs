// remywiki 抓取产物 → 本站 song_id 的映射。
//   运行：从**仓库根**跑 node scripts/db/remy/remy-db-map.cjs
// 输入（都在 .devhome/，不进版本库）：remy-list.json / remy-pages-final.json / remy-md/index*.json
// 输出：.devhome/remy-db-map.json  → 交给 make-snapshot.cjs 归一成 by-song-id 快照。

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const idx = JSON.parse(fs.readFileSync('.devhome/remy-md/index.json', 'utf8'));
const idx2 = JSON.parse(fs.readFileSync('.devhome/remy-md/index-miss.json', 'utf8'));
const list = JSON.parse(fs.readFileSync('.devhome/remy-list.json', 'utf8'));
const pages = JSON.parse(fs.readFileSync('.devhome/remy-pages-final.json', 'utf8'));
const db = new DatabaseSync('data/jubeat.db', { readOnly: true });

// 【2026-10-31 修】原 norm 只做 NFKC + 去空白 + 小写，实测漏掉三类差异，
// 导致 4 行明明在 remywiki 里有数据的曲目被记成「长押未知」：
//   ① alt=1 的行拿带 [ 2 ] 的整名去查 url —— remywiki 的列表条目名不带 [ 2 ]，
//      所以 71 条 [ 2 ] 谱面里 68 条根本查不到 url（只有恰好另有普通谱条目的才侥幸命中）；
//   ② HTML 实体没解码 —— wiki 里写作 `Show up&#160;! - short ver -`，&#160; 是不断行空格；
//   ③ 省略号写法不统一 —— 本站用 `…`(U+2026)，wiki 用半角中点 `･･･`(U+FF65)，
//      旧代码只把前者转成 '...'，后者原样留着，两者不相等。
// 修法：先解码实体、把三种省略号统一成 '...'、查不到再用「去掉 [ 2 ] 后缀」的基准名重查一次。
// 仍然保持「精确名优先」的两趟匹配，避免影响已匹配的 1133 行（见下面的回归自检）。
const decodeEntities = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#039;/g, "'");

const norm = (s) => decodeEntities(s).normalize('NFKC')
  .replace(/[\s\u3000]+/g, '').toLowerCase()
  .replace(/[\u2018\u2019\u02bc]/g, "'")
  .replace(/[\u2661\u2665]/g, '')
  .replace(/[\u2026\uff65\u30fb]+/g, '...')   // … 与 ･ ・ 统一
  .replace(/\.{2,}/g, '...')
  .replace(/\u00df/g, 'ss');

// 去掉标题末尾的 [ 2 ] 标记，得到基准名
const baseTitle = (s) => String(s || '').replace(/\s*\[\s*2\s*\]\s*$/, '');

// 【2026-10-31】库里的曲名可能已被 data/title-overrides.json 修正过（如 Milchstrae → Milchstraße），
// 但 remywiki 列表用的是它自己的写法。两边都要试：先按库里的名字查，查不到再按
// 覆盖表里的**源名**查一次。不这样做，改完曲名反而会把原本能匹配的曲子弄丢。
const titleOverridesPath = 'data/title-overrides.json';
const titleOverrides = fs.existsSync(titleOverridesPath)
  ? JSON.parse(fs.readFileSync(titleOverridesPath, 'utf8')).overrides || {}
  : {};
// 覆盖表里只存了「修正后的名字」，源名要从上游快照反查回来。
const jpResolved = JSON.parse(fs.readFileSync('data/upstream/jp-resolved.json', 'utf8'));
const srcTitleById = new Map();
for (const s of (jpResolved.songs || jpResolved)) srcTitleById.set(String(s.songId), String(s.title || ''));

const rows = db.prepare('SELECT song_id, title, artist, alt, bpm, gen_name, bsc, adv, ext FROM songs ORDER BY song_id').all();

// 两趟索引：①整名（保持旧行为，先到先得）②基准名（新增，同样先到先得）
const urlByExact = new Map();
const urlByBase = new Map();
const conflictBase = [];
for (const e of list) {
  const kExact = norm(e.title);
  if (!urlByExact.has(kExact)) urlByExact.set(kExact, e.url);
  const kBase = norm(baseTitle(e.title));
  if (urlByBase.has(kBase) && urlByBase.get(kBase) !== e.url) conflictBase.push(kBase);
  if (!urlByBase.has(kBase)) urlByBase.set(kBase, e.url);
}
const resolvedBy = {};
const res = [];
const unmatched = [];
for (const r of rows) {
  let u = urlByExact.get(norm(r.title));
  let how = u ? 'exact' : null;
  if (!u) {
    const b = urlByBase.get(norm(baseTitle(r.title)));
    if (b) { u = b; how = 'base'; }
  }
  if (!u && titleOverrides[r.song_id]) {
    // 库里是被覆盖修正过的名字 → 用上游源名再查一次（remywiki 收的是源写法）
    const srcName = srcTitleById.get(r.song_id);
    if (srcName) {
      u = urlByExact.get(norm(srcName)) || urlByBase.get(norm(baseTitle(srcName))) || null;
      if (u) how = 'src-title';
    }
  }
  if (how) resolvedBy[how] = (resolvedBy[how] || 0) + 1;
  const p = u ? pages[u] : null;
  const chartObj = r.alt === 1 ? (p && p.alt2) : (p && p.reg);
  const charts = chartObj ? chartObj.charts.filter((c) => c.notes != null) : null;
  const notes = charts ? charts.map((c) => c.notes) : null;
  const holds = charts ? charts.map((c) => c.holds) : null;
  const hasHold = charts ? charts.some((c) => (c.holds || 0) > 0) : null;
  const bpmNew = p ? p.bpm : null;
  // chartFound 的语义必须与改前一致（= 取到了谱面对象，哪怕 charts 为空）：
  // Big Daddy 两条的 jubeat 表是 ? 占位，charts 为空数组但仍要靠这条路径写 bpm。
  res.push({ song_id: r.song_id, title: r.title, alt: r.alt, gen: r.gen_name, dbBpm: r.bpm, remyBpm: bpmNew, notes: notes ? notes.join('/') : null, holds: holds ? holds.join('/') : null, hasHold, url: u || null, matched: !!p, chartFound: !!charts });
  if (!p || !charts || !charts.length) unmatched.push((r.alt === 1 ? '[2] ' : '') + r.title + ' | gen=' + r.gen_name + ' | url=' + (u || 'NONE') + ' | page=' + (p ? 'yes' : 'no') + ' | chart=' + (charts ? 'yes' : 'no'));
}
const m = res.filter((x) => x.chartFound);
console.log('DB rows', res.length, '| 有 remy 谱面数据', m.length, '| 无', res.length - m.length);
console.log('命中方式:', JSON.stringify(resolvedBy), '| 基准名有歧义的键', new Set(conflictBase).size);
console.log('hasHold: 是', m.filter((x) => x.hasHold).length, '| 否', m.filter((x) => !x.hasHold).length);
console.log('--- 无数据行（前 60）');
console.log(unmatched.slice(0, 60).join('\n'));
console.log('--- 无数据行总数', unmatched.length);
const both = res.filter((x) => x.dbBpm && x.remyBpm);
const same = both.filter((x) => String(x.dbBpm) === String(x.remyBpm));
const diffB = both.filter((x) => String(x.dbBpm) !== String(x.remyBpm));
console.log('--- bpm: DB 有值 ' + res.filter((x) => x.dbBpm).length + ' | remy 有值 ' + res.filter((x) => x.remyBpm).length + ' | 两者都有 ' + both.length + ' 一致 ' + same.length + ' 不一致 ' + diffB.length);
console.log(diffB.slice(0, 45).map((x) => '   ' + x.title + ' db=' + x.dbBpm + ' remy=' + x.remyBpm).join('\n'));
console.log('--- db 无值而 remy 有值:', res.filter((x) => !x.dbBpm && x.remyBpm).length);
fs.writeFileSync('.devhome/remy-db-map.json', JSON.stringify(res, null, 1));