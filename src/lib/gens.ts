// 世代的静态元信息（key / URL slug / 服务器 / 年份）。
// 曲目数据在 D1，但「世代 → 年份」这类口径不是数据库里的列，
// 与 scripts/db/build-db.cjs 的 GEN_ORDER 保持一致（CONTEXT.md 定的口径）。
//
// slug（2026-10-23 加）是 /songs/gen/<slug>/ 的稳定网址段：
//   * 不用中文、空格和点号——URL 里出现 %20 / 编码串既难看也容易被复制坏；
//   * 定下就不要改：改了等于把已经发出去的链接变成 404（要做别名也要走跳转，别偷偷换）；
//   * 与主题 key（ThemeScript 的 k：bta / yymf / saucerfulfill…）是两回事：
//     主题是视觉皮肤（clan 一个世代拆 4 套），slug 只指世代本身，和曲目数据一一对应。
//     所以这里用「能读懂的短横线写法」，不套主题文件名。
export type GenMeta = { k: string; slug: string; s: 'jp' | 'cn'; y: string };

export const GEN_ORDER: GenMeta[] = [
  { k: 'jubeat', slug: 'jubeat', s: 'jp', y: '2008' },
  { k: 'ripples', slug: 'ripples', s: 'jp', y: '2009' },
  { k: 'knit', slug: 'knit', s: 'jp', y: '2010' },
  { k: 'copious', slug: 'copious', s: 'jp', y: '2011' },
  { k: 'saucer', slug: 'saucer', s: 'jp', y: '2012' },
  { k: 'saucer fulfill', slug: 'saucer-fulfill', s: 'jp', y: '2014' },
  { k: 'prop', slug: 'prop', s: 'jp', y: '2015' },
  { k: 'Qubell', slug: 'qubell', s: 'jp', y: '2016' },
  { k: 'clan', slug: 'clan', s: 'jp', y: '2017' },
  { k: 'festo', slug: 'festo', s: 'jp', y: '2018' },
  { k: 'Ave.', slug: 'ave', s: 'jp', y: '2022' },
  { k: 'beyond the Ave.', slug: 'beyond-the-ave', s: 'jp', y: '2024' },
  { k: '音乐魔方', slug: 'yinyue-mofang', s: 'cn', y: '2023' },
];

export const GEN_JP = GEN_ORDER.filter((g) => g.s === 'jp');
export const GEN_CN = GEN_ORDER.filter((g) => g.s === 'cn');

/** 服务器 → 中文名（世代页与分组标题共用，别在模板里各写一份） */
export const SRV_LABEL: Record<GenMeta['s'], string> = { jp: '日服', cn: '国服' };

/* 【2026-10-28 移除】原先这里还有 genBySlug() 与 slugOf()，服务于 /songs/gen/<slug>/
   世代筛选页。主人要求「/songs/gen/jubeat/ 这个页面不要」，该页已删除、世代名改为纯文字，
   两个函数再无调用方，一并删掉。
   GEN_ORDER 里的 slug 字段暂时保留：它是世代网址段的既有口径，将来若要做世代页或
   外部深链可复用；但当前**没有任何页面在读它**，别误以为它还在生效。 */
