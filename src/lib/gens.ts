// 世代的静态元信息（key / 服务器 / 年份）。
// 曲目数据在 D1，但「世代 → 年份」这类口径不是数据库里的列，
// 与 scripts/db/build-db.cjs 的 GEN_ORDER 保持一致（CONTEXT.md 定的口径）。
export type GenMeta = { k: string; s: 'jp' | 'cn'; y: string };

export const GEN_ORDER: GenMeta[] = [
  { k: 'jubeat', s: 'jp', y: '2008' },
  { k: 'ripples', s: 'jp', y: '2009' },
  { k: 'knit', s: 'jp', y: '2010' },
  { k: 'copious', s: 'jp', y: '2011' },
  { k: 'saucer', s: 'jp', y: '2012' },
  { k: 'saucer fulfill', s: 'jp', y: '2014' },
  { k: 'prop', s: 'jp', y: '2015' },
  { k: 'Qubell', s: 'jp', y: '2016' },
  { k: 'clan', s: 'jp', y: '2017' },
  { k: 'festo', s: 'jp', y: '2018' },
  { k: 'Ave.', s: 'jp', y: '2022' },
  { k: 'beyond the Ave.', s: 'jp', y: '2024' },
  { k: '音乐魔方', s: 'cn', y: '2023' },
];

export const GEN_JP = GEN_ORDER.filter((g) => g.s === 'jp');
export const GEN_CN = GEN_ORDER.filter((g) => g.s === 'cn');
