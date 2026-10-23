// 曲目编辑的纯逻辑：校验表单、比对旧值、拼 recent_changes 文案、拼列表查询。
//
// 为什么单独拎出来：这套规则要在两个地方同时生效——
//   * 运行时：src/pages/api/admin/song-update.ts（真正的写入口，唯一防线）
//   * 校验：scripts/ci/check-song-edits.cjs（build/check 时把规则和越权分支跑一遍）
// 本文件不 import 任何运行时模块（astro / cloudflare:workers），也不碰 D1 连接，
// 只做纯函数，才能被 Node 直接 import 来断言。
import type { Role } from './auth';

/** 编辑面板能改的字段，与 songs 表可编辑列一一对应（id 是主键，只读） */
export type SongEditFields = {
  id: string;
  title: string;
  artist: string | null;
  bpm: string | null;
  bsc: number | null;
  adv: number | null;
  ext: number | null;
  unlock: string | null;
  cover: string | null;
};

/**
 * 长度上限。取值不是拍脑袋：先量了现有 1241 行的最长值
 * （曲名 54 / 艺人 85 / BPM 165 / 解禁注 35 / 曲绘 16），
 * 一律留出余量但不设成无限——上限只是防手滑粘贴整段文本，不该挡住任何真实数据。
 */
export const LIMITS = {
  title: 80,
  artist: 120,
  bpm: 200,
  unlock: 120,
  cover: 80,
} as const;

/** 定数上限（jubeat 定数刻度 0–11） */
export const DIFF_MAX = 11;

export const FIELD_LABELS: Record<Exclude<keyof SongEditFields, 'id'>, string> = {
  title: '曲名',
  artist: '艺人',
  bpm: 'BPM',
  bsc: 'BSC 定数',
  adv: 'ADV 定数',
  ext: 'EXT 定数',
  unlock: '解禁注',
  cover: '曲绘文件名',
};

// ---------- 校验 ----------

/** 定数：空 = NULL；否则必须是 0–11 之间、最多一位小数的数字 */
export function parseDiff(raw: string): { ok: true; value: number | null } | { ok: false } {
  if (raw === '') return { ok: true, value: null };
  // 只认「1~2 位整数 + 最多一位小数」：0.55 / 10.55 这类两位小数直接拒
  if (!/^\d{1,2}(\.\d)?$/.test(raw)) return { ok: false };
  const n = Number(raw);
  if (!(n >= 0 && n <= DIFF_MAX)) return { ok: false };
  return { ok: true, value: n };
}

/**
 * 曲绘文件名：只要「文件名」，不要路径。
 * 站点曲绘按文件名拼 /assets/images/jackets/<cover>，允许 ../ 或斜杠就能跳出目录，
 * 所以这里硬性拒绝路径分隔符与 ..，扩展名限定成站点实际发行的图片格式。
 */
const COVER_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:webp|gif|png|jpe?g)$/i;
export function parseCover(raw: string): { ok: true; value: string | null } | { ok: false } {
  if (raw === '') return { ok: true, value: null };
  if (raw.length > LIMITS.cover) return { ok: false };
  if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) return { ok: false };
  if (!COVER_RE.test(raw)) return { ok: false };
  return { ok: true, value: raw };
}

/** songId 形状：官方数字 id 或占位 BTA-xxxx，只用来挡明显不是 id 的输入 */
export function isSongIdShape(raw: string): boolean {
  return /^[A-Za-z0-9_-]{1,40}$/.test(raw);
}

type FormLike = { get(name: string): unknown };

/** 单行文本字段：去首尾空白、禁换行（换行会把 recent_changes 的差异排版撑坏） */
function readText(form: FormLike, key: string): { ok: true; value: string } | { ok: false } {
  const v = String(form.get(key) ?? '').trim();
  if (/[\r\n\t]/.test(v)) return { ok: false };
  return { ok: true, value: v };
}

export type ParseFormResult =
  | { ok: true; value: SongEditFields }
  | { ok: false; code: string };

export function parseSongForm(form: FormLike): ParseFormResult {
  const id = String(form.get('song_id') ?? '').trim();
  if (!isSongIdShape(id)) return { ok: false, code: 'bad-song-id' };

  const title = readText(form, 'title');
  if (!title.ok) return { ok: false, code: 'bad-title' };
  if (!title.value || title.value.length > LIMITS.title) {
    return { ok: false, code: 'bad-title' };
  }

  const artist = readText(form, 'artist');
  if (!artist.ok || artist.value.length > LIMITS.artist) return { ok: false, code: 'bad-artist' };

  const bpm = readText(form, 'bpm');
  if (!bpm.ok || bpm.value.length > LIMITS.bpm) return { ok: false, code: 'bad-bpm' };

  const diffs: Record<'bsc' | 'adv' | 'ext', number | null> = { bsc: null, adv: null, ext: null };
  for (const key of ['bsc', 'adv', 'ext'] as const) {
    const raw = String(form.get(key) ?? '').trim();
    const parsed = parseDiff(raw);
    // 三种错误合并成一个码：页面上这三个输入框的提示是同一句话
    if (!parsed.ok) return { ok: false, code: 'bad-diff' };
    diffs[key] = parsed.value;
  }

  const unlock = readText(form, 'unlock');
  if (!unlock.ok || unlock.value.length > LIMITS.unlock) return { ok: false, code: 'bad-unlock' };

  const cover = parseCover(String(form.get('cover') ?? '').trim());
  if (!cover.ok) return { ok: false, code: 'bad-cover' };

  return {
    ok: true,
    value: {
      id,
      title: title.value,
      artist: artist.value || null,
      bpm: bpm.value || null,
      bsc: diffs.bsc,
      adv: diffs.adv,
      ext: diffs.ext,
      unlock: unlock.value || null,
      cover: cover.value,
    },
  };
}

// ---------- 差异 ----------

export type FieldDiff = {
  key: Exclude<keyof SongEditFields, 'id'>;
  label: string;
  before: string;
  after: string;
};

const textOf = (v: string | null) => (v == null || v === '' ? '—' : v);
const numOf = (v: number | null) => (v == null ? '—' : String(v));

/** 逐字段比对，只返回真正变了的项（空值 ↔ NULL 视为没变） */
export function diffSong(before: SongEditFields, after: SongEditFields): FieldDiff[] {
  const out: FieldDiff[] = [];
  const push = (key: keyof typeof FIELD_LABELS, b: string, a: string) => {
    if (b !== a) out.push({ key, label: FIELD_LABELS[key], before: b, after: a });
  };
  push('title', before.title, after.title);
  push('artist', textOf(before.artist), textOf(after.artist));
  push('bpm', textOf(before.bpm), textOf(after.bpm));
  // 定数按数值比：库里 10.6 与表单 10.6 是同一条，不因显示位数不同被当成改动
  push('bsc', numOf(before.bsc), numOf(after.bsc));
  push('adv', numOf(before.adv), numOf(after.adv));
  push('ext', numOf(before.ext), numOf(after.ext));
  push('unlock', textOf(before.unlock), textOf(after.unlock));
  push('cover', textOf(before.cover), textOf(after.cover));
  return out;
}

// ---------- recent_changes ----------

/**
 * recent_changes 的一行，字段口径严格照 db/schema.sql：
 *   change_id(auto) / changed_at / user / target_label / target_href / summary / before_text / after_text
 * 这里不带 change_id（自增列由 SQLite 生成）。
 */
export type RecentChangeRow = {
  changed_at: string;
  user: string;
  target_label: string;
  target_href: string;
  summary: string;
  before_text: string;
  after_text: string;
};

const cap = (s: string, n = 1000) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** 没有实际改动就不写记录——返回 null，调用方据此跳过 INSERT */
export function buildRecentChangeRow(
  editor: { name: string },
  diffs: FieldDiff[],
  song: { id: string; title: string },
  nowIso: string
): RecentChangeRow | null {
  if (!diffs.length) return null;
  return {
    changed_at: nowIso,
    user: editor.name,
    target_label: `曲目：${song.title}`,
    target_href: `/songs/${song.id}/`,
    summary: cap(`修改 ${diffs.length} 项：${diffs.map((d) => d.label).join('、')}`),
    before_text: cap(diffs.map((d) => `${d.label}：${d.before}`).join('\n')),
    after_text: cap(diffs.map((d) => `${d.label}：${d.after}`).join('\n')),
  };
}

// ---------- 权限 ----------

export type EditGuard = 'ok' | 'unauthorized' | 'forbidden';

/**
 * 高权限动作的服务端复核：只有维护者与站长能改曲目。
 * 页面里藏按钮只是别让人误点，真正的防线是这里 + 接口里的 401/403。
 */
export function songEditGuard(user: { role: Role } | null): EditGuard {
  if (!user) return 'unauthorized';
  return user.role === 'maintainer' || user.role === 'owner' ? 'ok' : 'forbidden';
}

export const GUARD_STATUS: Record<Exclude<EditGuard, 'ok'>, number> = {
  unauthorized: 401,
  forbidden: 403,
};

/**
 * 这个请求是不是「机器在调」（curl / fetch / 脚本），而不是人点浏览器表单。
 *
 * 为什么需要区分：同一件事对这两种调用者该给不同答案。
 *   人   -> 303 跳登录页，登录后原路回来（浏览器里一屏纯文本 401 等于把人困住）
 *   机器 -> 401/403 + JSON，越权证据要能被脚本稳定断言
 *
 * 判定不看 Referer、不看 UA——都太不可靠。只看两个请求头：
 *   * accept 含 application/json         —— fetch/axios 默认带，浏览器表单 POST 不带
 *   * x-requested-with 含 xmlhttprequest —— 传统 AJAX 标记；也是 curl 显式声明「我在验接口」的最短写法
 *
 * 注意一个反直觉点：curl 默认 Accept 是通配（不含 application/json），
 * 只看 accept 的话裸 curl 会走 303、拿不到 401/403，验收证据就丢了。
 * 所以验收命令要显式带 -H 'accept: application/json' 或 -H 'X-Requested-With: XMLHttpRequest'，
 * 这两种写法都认。
 */
export function isMachineRequest(headers: { get(name: string): string | null }): boolean {
  const accept = (headers.get('accept') ?? '').toLowerCase();
  if (accept.includes('application/json')) return true;
  const xrw = (headers.get('x-requested-with') ?? '').toLowerCase();
  return xrw.includes('xmlhttprequest');
}

// ---------- 列表查询（/admin/songs/） ----------

/** songs 表的全列（与 src/lib/db.ts 的 SELECT 保持一致，两处都只读不写） */
export const SONG_COLUMNS = `song_id, id_kind, title, artist, bpm, gen_name, server_jp, server_cn, category,
              bsc, adv, ext, alt, cover, added_at, unlock_note`;

export type SongListInput = {
  q: string;
  gen: string;
  srv: 'all' | 'jp' | 'cn';
  page: number;
  perPage: number;
};

/** LIKE 的通配符要转义，否则搜索框里一个 % 就等于「全部」 */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);

export function buildSongWhere(input: Pick<SongListInput, 'q' | 'gen' | 'srv'>): {
  where: string;
  params: (string | number)[];
} {
  const parts: string[] = [];
  const params: (string | number)[] = [];

  const q = input.q.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    parts.push("(title LIKE ? ESCAPE '\\' OR song_id LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  if (input.gen) {
    parts.push('gen_name = ?');
    params.push(input.gen);
  }
  if (input.srv === 'jp') parts.push('server_jp = 1');
  else if (input.srv === 'cn') parts.push('server_cn = 1');

  return { where: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

/** 列表页的两条 SQL：COUNT 与分页数据用同一段 WHERE，避免两处条件写歪 */
export function buildSongListQuery(input: SongListInput): {
  countSql: string;
  listSql: string;
  params: (string | number)[];
  limit: number;
  offset: number;
} {
  const { where, params } = buildSongWhere(input);
  const perPage = Math.max(1, Math.min(200, Math.floor(input.perPage)));
  const page = Math.max(1, Math.floor(input.page));
  return {
    countSql: `SELECT COUNT(*) AS n FROM songs ${where}`,
    listSql: `SELECT ${SONG_COLUMNS} FROM songs ${where} ORDER BY gen_name, ext DESC, title LIMIT ? OFFSET ?`,
    params,
    limit: perPage,
    offset: (page - 1) * perPage,
  };
}

/** 编辑页读单行：直接读原始列（不经 lib/db.ts 的 60s 缓存，改完马上回看要是新值） */
export const SQL_EDIT_ROW = `SELECT song_id, title, artist, bpm, gen_name, server_jp, server_cn, category,
            bsc, adv, ext, alt, cover, added_at, unlock_note, id_kind
       FROM songs WHERE song_id = ?`;

export const SQL_UPDATE = `UPDATE songs
   SET title = ?, artist = ?, bpm = ?, bsc = ?, adv = ?, ext = ?, unlock_note = ?, cover = ?
 WHERE song_id = ?`;

export const SQL_RECENT_INSERT = `INSERT INTO recent_changes
   (changed_at, user, target_label, target_href, summary, before_text, after_text)
 VALUES (?, ?, ?, ?, ?, ?, ?)`;

// ---------- 错误码 ----------

/** 编辑相关的错误码 → 人话（与 auth-messages.ts 同一套风格：接口只回 code） */
export const SONG_EDIT_ERRORS: Record<string, string> = {
  'bad-song-id': '曲目 id 看起来不对。',
  'bad-title': `曲名必填，且不超过 ${LIMITS.title} 个字。`,
  'bad-artist': `艺人名不超过 ${LIMITS.artist} 个字。`,
  'bad-bpm': `BPM 不超过 ${LIMITS.bpm} 个字符。`,
  'bad-diff': `定数要填 0–${DIFF_MAX} 之间的数字，最多一位小数；不确定就留空。`,
  'bad-unlock': `解禁注不超过 ${LIMITS.unlock} 个字。`,
  'bad-cover': '曲绘文件名只能是文件名（不含路径），扩展名 .webp/.gif/.png/.jpg。',
  'bad-form': '提交的数据有问题，请重试。',
  'not-found': '没有找到这个 songId。',
  'no-permission': '当前身份没有编辑曲目的权限。',
};

export function songEditError(code: string | null | undefined): string | null {
  if (!code) return null;
  return SONG_EDIT_ERRORS[code] ?? '出了点问题，请重试。';
}