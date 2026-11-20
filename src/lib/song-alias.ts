// 曲目别名（俗称）的公共规则（2026-11-20 主人给的规格）。
//
// 与标签的区别，逐条对应主人的话：
//   · 「别名复用标签的设计」——同样是登录才能增删、右上角小叉、手机长按出叉；
//   · 「别名无需审核也无需展示创建者」——入库即生效，页面不印 by_user；
//   · 「点击别名可以复制别名」——词钮本身是复制按钮，不是投票按钮；
//   · 别名是自由文本，没有词表，所以这里只给长度与归一化。
// 与标签一样：只有这一份规则，页面与接口都从这里取，别两头各写一套。

export const ALIAS_MAX_LEN = 40;

/** 归一化：全角空格转半角、合并连续空白、去首尾。别名里允许有空格（"喇叭 口"）。 */
export const normAlias = (v: string) => v.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 搜索用：别名拼进卡片 haystack 时的分隔符。
 * 用 \n（与歌曲列表 matchCard 里各字段之间的分隔一致）——别名里不可能出现换行，
 * 一条别名也就不会被查询串从中间跨成两段。
 */
export const ALIAS_HAY_SEP = '\n';

/** 一首曲最多带多少个别名进搜索串（防止某首被刷几百条把 haystack 撑大） */
export const ALIAS_HAY_MAX = 30;
/** 单曲别名串的总长上限，超出就截断（haystack 只是子串比对的原料，截了不影响其它字段） */
export const ALIAS_HAY_CHARS = 600;

/**
 * 搜索用的别名索引：song_id → 所有别名拼成的串（小写、\n 分隔）。
 *
 * 【为什么在请求期查】别名是运行时数据，加完要能立刻被搜到；
 * 而 search-keys.json 是构建期产物，装不下它。song_alias 表很小（一首曲最多几十条），
 * 一次全表取回再本地分组，比按 1248 首逐首查便宜得多。
 *
 * 一张卡只有一个 data-al，谁也不许把这个串塞进 data-sk —— 读音与别名是两回事，
 * 混在一起搜可以、分开排查就难了。
 */
/**
 * 别名增删写进【最近更改】的文案（2026-11-20 主人「添加/删除别名或标签之后
 * 都要在最近更改里加一条记录」）。
 *
 * 这里只给**文案**，INSERT 走 song-admin.ts 的 logRecentChange —— 表结构与写入方式
 * 是 recent_changes 的事，放 lib/song-admin.ts 一处，别在别名这边再抄一遍 SQL。
 * 记录本身就是「写完之后」的事实，所以两个字段分别落在 before / after（加=改后，删=改前）。
 */
export function aliasChangeText(action: 'add' | 'del', name: string) {
  const add = action === 'add';
  return {
    summary: add ? '添加别名' : '删除别名',
    before: add ? null : name,
    after: add ? name : null,
  };
}

export async function loadAliasIndex(db: D1Database | undefined): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!db) return out;
  // 别名是纯附加信息：查询失败不该把列表页整页打垮，退化成「搜不到别名」即可。
  try {
    const rows = await db
      .prepare('SELECT song_id, name FROM song_alias ORDER BY created_at ASC')
      .all<{ song_id: string; name: string }>();
    for (const r of rows.results ?? []) {
      const id = String(r.song_id);
      const cur = out.get(id);
      if (cur && cur.split(ALIAS_HAY_SEP).length >= ALIAS_HAY_MAX) continue;
      const next = (cur ? cur + ALIAS_HAY_SEP : '') + r.name.toLowerCase();
      if (next.length > ALIAS_HAY_CHARS) continue;
      out.set(id, next);
    }
  } catch {
    return new Map();
  }
  return out;
}
