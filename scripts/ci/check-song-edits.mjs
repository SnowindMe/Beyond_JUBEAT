// CI 用：曲目编辑面板的规则与越权分支自检（不联网、不起 workerd）。
//   node scripts/ci/check-song-edits.mjs
//
// 为什么要有这个脚本：本地起不了 workerd（见 docs/dev-plan-2026-10-23.md §四.4），
// 「越权分支返回 401/403」这种结论不能只靠 code review 说出来，得跑出来。
// 做法：src/lib/song-admin-server.ts 里不含任何 Astro / cloudflare:workers 依赖，
// 这里用 node:sqlite 造一个内存库冒充 D1，直接调 handleSongUpdate 断言返回值。
//
// 检查项：
//   1. 未登录（user=null）→ 401，且**完全没有**读表单、没有碰数据库
//   2. role=player → 403，同上
//   3. role=maintainer / owner → 放行并成功写入
//   4. 参数校验：定数 0–11、最多一位小数、空=NUL  L；标题/艺人长度上限；songId 必须存在
//   5. recent_changes 的列名与顺序跟 db/schema.sql 完全一致
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Windows 上动态 import 绝对路径必须先转成 file:// URL，否则被当成 'c:' 协议报错
const load = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { handleSongUpdate } = await import(load('src/lib/song-admin-server.ts'));
const { LIMITS } = await import(load('src/lib/song-admin.ts'));

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log('  PASS ' + name);
  else {
    failures++;
    console.error('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
};

// ---------- 用 schema.sql 里真实的两张表起一个内存库 ----------
const schema = readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8');
const db = new DatabaseSync(':memory:');
// schema.sql 里有 users/sessions 等表的 DROP + CREATE，全文跑没问题；
// 只需要注意它是给 D1 的方言（都是标准 SQLite 语法）。
db.exec(schema);

db.prepare(
  `INSERT INTO songs (song_id, id_kind, title, artist, bpm, gen_name, server_jp, server_cn,
                      category, bsc, adv, ext, alt, cover, added_at, unlock_note)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  '80001015', 'official', 'アガット', 'Bazole', '190', 'beyond the Ave.', 1, 0,
  '原创', 3.0, 7.0, 10.0, 1, 'id71588407.webp', '2024-03-01', '日服解禁池 #3'
);

/** 最小 D1 替身：只实现 prepare/bind/first/all/run/batch */
const d1 = {
  prepare(sql) {
    let binds = [];
    const api = {
      bind(...vals) { binds = vals; return api; },
      async first() {
        const row = db.prepare(sql).get(...binds);
        return row ? { ...row } : null;
      },
      async all() { return { results: db.prepare(sql).all(...binds).map((r) => ({ ...r })) }; },
      async run() { return db.prepare(sql).run(...binds); },
    };
    return api;
  },
  async batch(stmts) {
    // D1 的 batch 是同一事务顺序执行；这里用 BEGIN/COMMIT 还原同一语义
    db.exec('BEGIN');
    try {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
};

const form = (pairs) => ({ get: (k) => (k in pairs ? pairs[k] : null) });

const base = {
  song_id: '80001015',
  title: 'アガット',
  artist: 'Bazole',
  bpm: '190',
  bsc: '3',
  adv: '7',
  ext: '10',
  unlock: '日服解禁池 #3',
  cover: 'id71588407.webp',
};

const run = (opts) =>
  handleSongUpdate({
    user: opts.user,
    db: opts.db === undefined ? d1 : opts.db,
    readForm: opts.readForm ?? (async () => form(opts.form ?? base)),
    wantsJson: opts.wantsJson ?? true,
    now: '2026-10-23T12:00:00.000Z',
  });

// ---------- 1/2. 越权分支 ----------
console.log('[越权分支]');
{
  let formRead = false;
  const res = await handleSongUpdate({
    user: null,
    db: d1,
    readForm: async () => { formRead = true; return form(base); },
    wantsJson: true,
    now: '2026-10-23T12:00:00.000Z',
  });
  ok('未登录 → 401', res.status === 401, 'got ' + res.status);
  ok('未登录 → 不解析请求体', formRead === false);
}
{
  let formRead = false;
  const player = { id: 'u1', name: '路人', role: 'player' };
  const res = await handleSongUpdate({
    user: player,
    db: d1,
    readForm: async () => { formRead = true; return form(base); },
    wantsJson: true,
    now: '2026-10-23T12:00:00.000Z',
  });
  ok('玩家 → 403', res.status === 403, 'got ' + res.status);
  ok('玩家 → 不解析请求体', formRead === false);
}
{
  // 越权且 db 缺失：仍要回 401/403，不能先撞上 500
  const res = await run({ user: { id: 'u1', name: '路人', role: 'player' }, db: undefined });
  ok('玩家 + 无 D1 → 403（复核先于取库）', res.status === 403, 'got ' + res.status);
}
{
  // 浏览器表单（非 JSON）未登录：**不再回 401 纯文本，而是 303 跳登录页并带回跳目标**。
  // 为什么翻过来：浏览器里一屏「请先登录」纯文本没有链接、没有返回，用户只能改地址栏，
  // 而他刚填的编辑内容已经丢了。跳登录页至少能原路回来重填。
  // 越权证据没有被削弱 —— 它由下面那条 JSON 断言和上面「未登录 → 401 + JSON」共同守着。
  const res = await run({ user: null, wantsJson: false });
  ok(
    '未登录 + 表单提交 → 303 跳登录页',
    res.status === 303 && /^\/login\/\?next=/.test(res.location ?? ''),
    'got ' + res.status + ' ' + (res.location ?? '')
  );
}
{
  // 同一个人换成 JSON 调用（curl / fetch）：仍要拿到 401，验收命令靠这条。
  const res = await run({ user: null, wantsJson: true });
  ok('未登录 + JSON 提交 → 401', res.status === 401, 'got ' + res.status);
  ok(
    '未登录 + JSON → body 含 error: unauthorized',
    res.json?.ok === false && res.json?.error === 'unauthorized',
    JSON.stringify(res.json)
  );
}
{
  // 已登录但没权限（role=player）用浏览器表单提交：同样跳转，去列表页并带错误码，
  // 不给人一屏 403 纯文本。口径与 /api/admin/decide 一致（它也跳 ?e=no-permission）。
  const res = await run({ user: { id: 'u1', name: '路人', role: 'player' }, wantsJson: false });
  ok(
    '玩家 + 表单提交 → 303 跳列表并带 no-permission',
    res.status === 303 && (res.location ?? '').includes('e=no-permission'),
    'got ' + res.status + ' ' + (res.location ?? '')
  );
}
{
  const before = db.prepare('SELECT COUNT(*) AS n FROM recent_changes').get().n;
  const res = await run({ user: { id: 'u1', name: '路人', role: 'player' } });
  const after = db.prepare('SELECT COUNT(*) AS n FROM recent_changes').get().n;
  ok('越权请求没有写 recent_changes', before === after, before + ' -> ' + after);
}

// ---------- 3. 放行 ----------
console.log('[放行路径]');
{
  const res = await run({
    user: { id: 'u2', name: '维护者甲', role: 'maintainer' },
    form: { ...base, ext: '10.6', unlock: '日服解禁池 #4' },
  });
  ok('维护者 → 303 且带 ok=saved', res.status === 303 && /ok=saved/.test(res.location ?? ''), res.location);

  const row = db.prepare('SELECT ext, unlock_note FROM songs WHERE song_id = ?').get('80001015');
  ok('songs 已写入新值', row.ext === 10.6 && row.unlock_note === '日服解禁池 #4', JSON.stringify(row));
}
{
  const rows = db.prepare('SELECT * FROM recent_changes ORDER BY change_id DESC').all();
  ok('recent_changes 有一条记录', rows.length === 1, 'n=' + rows.length);
  const r = rows[0] ?? {};
  const cols = Object.keys(r).join(',');
  ok(
    'recent_changes 列与 schema 完全对齐',
    cols === 'change_id,changed_at,user,target_label,target_href,summary,before_text,after_text',
    cols
  );
  ok('changed_at 是 ISO', r.changed_at === '2026-10-23T12:00:00.000Z', String(r.changed_at));
  ok('user = 编辑者昵称', r.user === '维护者甲', String(r.user));
  ok('target_href 指向曲目详情', r.target_href === '/songs/80001015/', String(r.target_href));
  ok('summary 列出改动项', /EXT 定数/.test(r.summary) && /解禁注/.test(r.summary), String(r.summary));
  ok('before/after 都带改前改后', r.before_text.includes('10') && r.after_text.includes('10.6'),
    r.before_text + ' | ' + r.after_text);
  ok('改前文本不含未改动字段', !/曲名/.test(r.before_text), String(r.before_text));
}
// 把 songs 行恢复成 base 的原样，供「没有改动」用例使用
const resetSong = () =>
  db.prepare(
    `UPDATE songs SET title = ?, artist = ?, bpm = ?, bsc = ?, adv = ?, ext = ?,
       unlock_note = ?, cover = ? WHERE song_id = ?`
  ).run(base.title, base.artist, base.bpm, 3, 7, 10, base.unlock, base.cover, '80001015');
{
  resetSong();
  const n = db.prepare('SELECT COUNT(*) AS n FROM recent_changes').get().n;
  const res = await run({ user: { id: 'u2', name: '维护者甲', role: 'maintainer' } });
  const n2 = db.prepare('SELECT COUNT(*) AS n FROM recent_changes').get().n;
  ok('没有改动 → 不写记录', res.status === 303 && /ok=nochange/.test(res.location ?? '') && n === n2,
    res.location + ' n=' + n + '->' + n2);
}
{
  const res = await run({
    user: { id: 'u3', name: '站长', role: 'owner' },
    form: { ...base, bsc: '', adv: '', ext: '', title: 'アガット' },
  });
  const row = db.prepare('SELECT bsc, adv, ext FROM songs WHERE song_id = ?').get('80001015');
  ok('站长可编辑（role=owner 放行）', res.status === 303, res.status + ' ' + res.location);
  ok('定数留空 → NULL', row.bsc === null && row.adv === null && row.ext === null, JSON.stringify(row));
  // 还原，供后面的校验用例使用
  await run({ user: { id: 'u3', name: '站长', role: 'owner' }, form: { ...base, unlock: '日服解禁池 #4' } });
}

// ---------- 4. 参数校验 ----------
console.log('[参数校验]');
const badCases = [
  ['定数两位小数', { ext: '10.55' }, 'bad-diff'],
  ['定数超过 11', { ext: '11.1' }, 'bad-diff'],
  ['定数负数', { ext: '-1' }, 'bad-diff'],
  ['定数非数字', { ext: '十点六' }, 'bad-diff'],
  ['曲名空', { title: '   ' }, 'bad-title'],
  ['曲名超长', { title: 'x'.repeat(LIMITS.title + 1) }, 'bad-title'],
  ['艺人超长', { artist: 'x'.repeat(LIMITS.artist + 1) }, 'bad-artist'],
  ['BPM 超长', { bpm: 'x'.repeat(LIMITS.bpm + 1) }, 'bad-bpm'],
  ['解禁注超长', { unlock: 'x'.repeat(LIMITS.unlock + 1) }, 'bad-unlock'],
  ['曲绘带路径', { cover: '../etc/passwd' }, 'bad-cover'],
  ['曲绘扩展名不对', { cover: 'evil.exe' }, 'bad-cover'],
  ['songId 形状不对', { song_id: '../../x' }, 'bad-song-id'],
];
for (const [name, patch, code] of badCases) {
  const res = await run({
    user: { id: 'u2', name: '维护者甲', role: 'maintainer' },
    form: { ...base, ...patch },
  });
  ok(name + ' → ' + code, res.status === 303 && (res.location ?? '').includes('e=' + code), res.location);
}
{
  const res = await run({
    user: { id: 'u2', name: '维护者甲', role: 'maintainer' },
    form: { ...base, song_id: '99999999', title: '不存在的曲' },
  });
  ok('songId 不存在 → not-found', res.status === 303 && (res.location ?? '').includes('e=not-found'), res.location);
}
{
  // 边界值：0 与 11 都要收
  const res = await run({
    user: { id: 'u2', name: '维护者甲', role: 'maintainer' },
    form: { ...base, bsc: '0', ext: '11' },
  });
  const row = db.prepare('SELECT bsc, ext FROM songs WHERE song_id = ?').get('80001015');
  ok('定数边界 0 与 11 可写入', res.status === 303 && row.bsc === 0 && row.ext === 11,
    JSON.stringify(row) + ' ' + res.location);
}

// ---------- 5. 表单模板的防护不能当防线 ----------
console.log('[防线口径]');
{
  // 直接构造 POST（不带任何页面上下文）也必须被拦：这里模拟一个裸请求
  const res = await handleSongUpdate({
    user: { id: 'u9', name: '玩家乙', role: 'player' },
    db: d1,
    readForm: async () => form({ ...base, ext: '11' }),
    wantsJson: false,
    now: '2026-10-23T12:00:00.000Z',
  });
  // 这个用例要证明的是「防线在服务端、与页面无关」，不是某个具体状态码。
  // 按新口径：浏览器表单（wantsJson=false）-> 303 跳转；JSON -> 403。
  // 两种都必须在**进入业务逻辑之前**就被拦下（连表单都没解析）。
  ok(
    '裸 POST（player、表单）→ 303 跳转，与页面无关',
    res.status === 303 && typeof res.location === 'string',
    String(res.status) + ' ' + (res.location ?? '')
  );
}
{
  // 同一场景换成 JSON 调用：403 + body 结构（状态码之外还要验 body，否则 body 变了抓不到）。
  const res = await handleSongUpdate({
    user: { id: 'u9', name: '玩家乙', role: 'player' },
    db: d1,
    readForm: async () => form({ ...base, ext: '11' }),
    wantsJson: true,
    now: '2026-10-23T12:00:00.000Z',
  });
  ok(
    '裸 POST（player、JSON）→ 403 + body error=forbidden',
    res.status === 403 && res.json?.ok === false && res.json?.error === 'forbidden',
    String(res.status) + ' ' + JSON.stringify(res.json)
  );
}

console.log(
  failures === 0
    ? '曲目编辑校验通过：越权（表单 303 跳转 / JSON 401·403）、参数规则、recent_changes 列名全部符合预期'
    : '曲目编辑校验失败：' + failures + ' 项'
);
if (failures) process.exit(1);