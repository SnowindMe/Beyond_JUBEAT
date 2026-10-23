// 曲目编辑的服务端逻辑（不含 Astro 路由外壳）。
//
// 拆出来的唯一理由是可验证：真正的写入口逻辑（身份复核 → 参数校验 → 查旧值 →
// 比对 → 同事务写 songs + recent_changes）在这里，Astro 路由只是把 Request 摊开再
// 把返回值拼成 Response。scripts/ci/check-song-edits.cjs 用一个 in-memory SQLite
// 冒充 D1 直接调用本函数，就能断言「越权时 401/403 且根本没碰表单/数据库」。
//
// 安全红线（与 src/pages/api/admin/decide.ts 同一口径）：
//   高权限动作必须在服务端复核 role，页面藏按钮不是防线；
//   这里的第一句就是复核，任何分支都排在它后面。
//
// 注意 import 写的是 './song-admin.ts'（带扩展名）：Node 直接 import 本文件跑 CI 校验时，
// 不带扩展名的相对路径解析不到（ERR_MODULE_NOT_FOUND）。Astro/Vite 两种写法都认，
// 所以统一带 .ts —— 别为了「看起来干净」把扩展名去掉，会直接弄坏 npm run check。
import {
  buildRecentChangeRow,
  diffSong,
  GUARD_STATUS,
  parseSongForm,
  songEditGuard,
  SQL_EDIT_ROW,
  SQL_RECENT_INSERT,
  SQL_UPDATE,
  type SongEditFields,
} from './song-admin.ts';

/** D1 的最小结构类型：只声明本模块用到的那几个方法，测试里才好塞假实现 */
export type SongStmt = {
  bind(...values: unknown[]): SongStmt;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};
export type SongDB = {
  prepare(sql: string): SongStmt;
  batch(statements: SongStmt[]): Promise<unknown>;
};

export type SongRow = {
  song_id: string;
  title: string;
  artist: string | null;
  bpm: string | null;
  bsc: number | null;
  adv: number | null;
  ext: number | null;
  unlock_note: string | null;
  cover: string | null;
};

/** 处理结果：路由按 status 直接回；location 是 303 时的跳转目标 */
export type UpdateResult = {
  status: number;
  location?: string;
  json?: Record<string, unknown>;
  /** 401/403 时给浏览器看的一句话（纯文本，不回 HTML，避免把用户输入带进页面） */
  message?: string;
};

export type UpdateInput = {
  user: { id: string; name: string; role: 'player' | 'maintainer' | 'owner' } | null;
  db: SongDB | undefined;
  /** 懒读表单：越权请求不该被解析请求体（大包 DoS），所以只在通过复核后才调用 */
  readForm: () => Promise<{ get(name: string): unknown } | null>;
  /** 请求头 accept 里有 application/json 时回 JSON，便于用 curl 验越权分支 */
  wantsJson: boolean;
  /** 注入时间，测试里固定成已知值 */
  now: string;
};

const editHref = (songId: string, code?: string, ok?: string) => {
  const qs = new URLSearchParams();
  if (code) qs.set('e', code);
  if (ok) qs.set('ok', ok);
  const s = qs.toString();
  return '/admin/songs/' + encodeURIComponent(songId) + '/' + (s ? '?' + s : '');
};

const listHref = (code: string) => '/admin/songs/?e=' + encodeURIComponent(code);

export async function handleSongUpdate(input: UpdateInput): Promise<UpdateResult> {
  const { user, db, readForm, wantsJson, now } = input;

  // ---- 第一道也是唯一一道防线：服务端复核 role ----
  const guard = songEditGuard(user);
  if (guard !== 'ok') {
    const status = GUARD_STATUS[guard];
    if (wantsJson) {
      return { status, json: { ok: false, error: guard } };
    }
    return {
      status,
      message:
        guard === 'unauthorized'
          ? '请先登录，再回来编辑曲目。'
          : '当前身份没有编辑曲目的权限。',
    };
  }

  if (!db) return { status: 500, message: 'D1 binding missing' };

  const form = await readForm();
  if (!form) {
    return wantsJson
      ? { status: 400, json: { ok: false, error: 'bad-form' } }
      : { status: 303, location: listHref('bad-form') };
  }

  const parsed = parseSongForm(form);
  if (!parsed.ok) {
    const rawId = String(form.get('song_id') ?? '');
    return { status: 303, location: editHref(rawId, parsed.code) };
  }
  const next = parsed.value;

  // songId 必须真实存在于 songs 表：占位 id 与删除过的 id 都不能凭一个字符串写记录
  const row = await db.prepare(SQL_EDIT_ROW).bind(next.id).first<SongRow>();
  if (!row) {
    return { status: 303, location: listHref('not-found') };
  }

  const before: SongEditFields = {
    id: row.song_id,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    bsc: row.bsc,
    adv: row.adv,
    ext: row.ext,
    unlock: row.unlock_note,
    cover: row.cover,
  };

  const diffs = diffSong(before, next);
  if (!diffs.length) {
    // 没改动就不写库、也不留痕：最近更改只记录真实变更
    return { status: 303, location: editHref(row.song_id, undefined, 'nochange') };
  }

  const change = buildRecentChangeRow(user!, diffs, { id: row.song_id, title: next.title }, now);

  // 两件事要么都成、要么都不成：曲目改了却没留记录，等于悄悄改数据。
  // D1 的 batch 在同一事务里顺序执行。
  await db.batch([
    db
      .prepare(SQL_UPDATE)
      .bind(
        next.title,
        next.artist,
        next.bpm,
        next.bsc,
        next.adv,
        next.ext,
        next.unlock,
        next.cover,
        row.song_id
      ),
    db
      .prepare(SQL_RECENT_INSERT)
      .bind(
        change.changed_at,
        change.user,
        change.target_label,
        change.target_href,
        change.summary,
        change.before_text,
        change.after_text
      ),
  ]);

  return { status: 303, location: editHref(row.song_id, undefined, 'saved') };
}