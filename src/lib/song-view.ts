// 曲目的「视图」口径：哪些行落在哪个服务器视图、算哪个分区。
// /songs/ 与 /songs/gen/[gen]/ 必须用同一套判断，否则同一个世代在两个页面上的
// 曲数与分区分组会对不上（用户一眼就能看出来）。所以抽到这里，谁都不许各写一份。
import type { Song } from './db';
import type { GenMeta } from './gens';

export type Srv = GenMeta['s'];

// 分区顺序：日服 版权 → 原创；国服 KONAMI原创 → 音乐魔方原创 → 音乐魔方流行。
export const CATS: Record<Srv, string[]> = {
  jp: ['版权', '原创'],
  cn: ['KONAMI原创', '音乐魔方原创', '音乐魔方流行'],
};

// 分区归属（主人 2026-10-22 口径）：音乐魔方里「两者都有」的曲目显示在 KONAMI原创 分区，
// 其余按库里的 category。日服视图只走自己的两个分区。
export const catOf = (s: Song, srv: Srv) => (srv === 'cn' && s.jp && s.cn ? 'KONAMI原创' : s.cat);

// 视图归属：行 = 一份谱面记录，各归各的世代。双服曲（如 Big Daddy）两服各有一行，
// 国服视图只收「音乐魔方」世代的行，日服视图只收日服世代的行，避免同一首的两行串视图。
export const inView = (s: Song, srv: Srv) =>
  srv === 'cn' ? s.cn && s.gen === '音乐魔方' : s.jp && s.gen !== '音乐魔方';

// 世代页的归属：世代名本身就是精确归属（一个世代只属于一个服务器），
// 不必再过 inView 的服务器标志——否则「双服都有的那行」会在日服世代页里被漏掉。
export const inGen = (s: Song, gen: string) => s.gen === gen;
