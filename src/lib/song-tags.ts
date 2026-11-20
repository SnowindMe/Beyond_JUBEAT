// 曲目标签的词表（2026-11-19 主人给的图二）。
//
// 三类标签三档通用：配置（cfg，打法形态）、难度（lv，难度感受）、评价（eval，整体评价）。
// 词表在这里、渲染在页面、校验在接口——**只有这一份**，别在两端各写一遍。
//
// 词条本身是给玩家点选的快捷项，不是硬白名单：玩家也可以自己填词，
// 所以接口只校验长度与档位/类别合法，不校验「是不是在词表里」。
// 想收紧成白名单时改接口那一行即可。

export const TAG_KINDS = ['cfg', 'lv', 'eval'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const TAG_KIND_LABEL: Record<TagKind, string> = {
  cfg: '配置',
  lv: '难度',
  eval: '评价',
};

export const TAG_WORDS: Record<TagKind, string[]> = {
  cfg: ['桂马', '回旋', '浊流', '同时押', '出张', '钢琴', '锁手', '爆发', '扫键', '混Fr', '交互'],
  lv: ['诈称', '逆诈称', '儿歌', '魔王', '合理'],
  eval: ['高物量', '高hold', '高技巧', '高底力', '初见杀', '个人差'],
};

export const DIFFS = ['bsc', 'adv', 'ext'] as const;
export type Diff = (typeof DIFFS)[number];

/** 三类标签三档目前都开放；保留这张表是为了将来「某档不给某类」时只改这里 */
export const KINDS_BY_DIFF: Record<Diff, TagKind[]> = {
  bsc: ['cfg', 'lv', 'eval'],
  adv: ['cfg', 'lv', 'eval'],
  ext: ['cfg', 'lv', 'eval'],
};

export const TAG_MAX_LEN = 20;

export const isDiff = (v: string): v is Diff => (DIFFS as readonly string[]).includes(v);

/**
 * 标签增删写进【最近更改】的文案（2026-11-20 主人「添加/删除别名或标签之后
 * 都要在最近更改里加一条记录」）。
 *
 * 标签与别名的差别：标签还带档位与类别（「EXT 配置」），一起写进 summary，
 * 否则一条「添加标签」看不出改的是哪一档的哪一类。
 * 文案在这里、INSERT 在 song-admin.ts 的 logRecentChange，两处不重叠。
 */
export function tagChangeText(action: 'add' | 'del', diff: Diff, kind: TagKind, name: string) {
  const add = action === 'add';
  const where = `${diff.toUpperCase()} ${TAG_KIND_LABEL[kind]}`;
  return {
    summary: `${add ? '添加' : '删除'}标签（${where}）`,
    before: add ? null : name,
    after: add ? name : null,
  };
}

/** 归一化：去首尾空白、合并连续空格、全角空格转半角。词里没有空格，但玩家会手填。 */
export const normTag = (v: string) => v.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
