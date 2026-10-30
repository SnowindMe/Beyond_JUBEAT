// 世代的静态元信息（key / URL slug / 服务器 / 上线日）。
// 曲目数据在 D1，但「世代 → 年份」这类口径不是数据库里的列，
// 与 scripts/db/build-db.cjs 的 GEN_ORDER 保持一致（CONTEXT.md 定的口径）。
//
// slug（2026-10-23 加）是 /songs/gen/<slug>/ 的稳定网址段：
//   * 不用中文、空格和点号——URL 里出现 %20 / 编码串既难看也容易被复制坏；
//   * 定下就不要改：改了等于把已经发出去的链接变成 404（要做别名也要走跳转，别偷偷换）；
//   * 与主题 key（ThemeScript 的 k：bta / yymf / saucerfulfill…）是两回事：
//     主题是视觉皮肤（clan 一个世代拆 4 套），slug 只指世代本身，和曲目数据一一对应。
//     所以这里用「能读懂的短横线写法」，不套主题文件名。
// 【2026-10-31 主人要求】世代标题里的年份从「2008」改成完整「年-月-日」，
// 数据源 https://arcade-songs.zetaraku.dev/jubeat/timeline/（他给的时间轴截图逐条抄下来）。
// 该时间轴上还有 ripples / knit / copious 的 **APPEND 子代**（2010-03-18 / 2011-03-23 / 2012-03-14）——
// 主人明确「APPEND 代年月日不写」：本站曲库的世代只到基代、没有 APPEND 这一档，
// 所以这里不给 APPEND 建条目，也别把子代的日期安到基代头上。
// 音乐魔方不在那个时间轴上，日期由主人直接给出（2025-12-27）。
export type GenMeta = { k: string; slug: string; s: 'jp' | 'cn'; /** 上线日，写死成 YYYY-MM-DD */ date: string };

export const GEN_ORDER: GenMeta[] = [
  { k: 'jubeat', slug: 'jubeat', s: 'jp', date: '2008-07-24' },
  { k: 'ripples', slug: 'ripples', s: 'jp', date: '2009-08-05' },
  { k: 'knit', slug: 'knit', s: 'jp', date: '2010-07-29' },
  { k: 'copious', slug: 'copious', s: 'jp', date: '2011-09-15' },
  { k: 'saucer', slug: 'saucer', s: 'jp', date: '2012-09-25' },
  { k: 'saucer fulfill', slug: 'saucer-fulfill', s: 'jp', date: '2014-03-03' },
  { k: 'prop', slug: 'prop', s: 'jp', date: '2015-02-20' },
  { k: 'Qubell', slug: 'qubell', s: 'jp', date: '2016-03-30' },
  { k: 'clan', slug: 'clan', s: 'jp', date: '2017-07-26' },
  { k: 'festo', slug: 'festo', s: 'jp', date: '2018-09-05' },
  { k: 'Ave.', slug: 'ave', s: 'jp', date: '2022-08-03' },
  { k: 'beyond the Ave.', slug: 'beyond-the-ave', s: 'jp', date: '2023-09-20' },
  { k: '音乐魔方', slug: 'yinyue-mofang', s: 'cn', date: '2025-12-27' },
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
