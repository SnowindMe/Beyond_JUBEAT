// Jubility（ジュビリティ）层级口径 —— /jubility/ 页唯一数据源。
//
// 【数据来源】层级名称与分数线取自 BEMANIWiki 2nd「jubeat beyond the Ave./jubility」
// 的「ネームカラー」表（游戏内名片颜色，TOTAL jubility 达到该值即换色）：
//   NORMAL 0 / YELLOW GREEN 250 / GREEN 750 / LIGHT BLUE 1500 / BLUE 2500 /
//   VIOLET 4000 / PURPLE 5500 / PINK 7000 / ORANGE 8500 / GOLD 9500
// 前作 festo 的分数线与此完全相同，国服「音乐魔方」沿用同一套。
//
// 【第 11 档 PRIME GOLD】站长自创，游戏内不存在：TOTAL jubility 达到理论值的 99%
// 才算，且该阈值低于 9500 时不设此档（否则曲库小的服务器会轻易「白拿」最高档）。
// 判定见 primeThreshold()；层级图标 jby_ttljby_gauge_10 就是为它准备的。
//
// 【单曲 jubility 公式】官方原文：
//   jubility = LEVEL × 12.5 × (MUSIC RATE / 99)，小数第 2 位以下切舍
//   MUSIC RATE 最高 100.0%（NORMAL）/ 120.0%（HARD MODE 下 EXC）
// 所以单曲理论上限 = ROUNDDOWN(定数 × 12.5 × 120 / 99, 1)。
// 与源表 sheet3/sheet4「国框Jubiility理论值」的 F 列公式 ROUNDDOWN(D*12.5*120/99,1)
// 完全一致（sheet4 已验证：60 首求和 = 9641.9 = 表头 MAX）。
//
// 【TOTAL 组成】COMMON 与 PICK UP 各取上位 30 谱面（谱面为单位，不是曲为单位；
// 同一首的 BSC/ADV/EXT 与 [2] 长押各自独立参评），合计 60 谱面。
// 「PICK UP」的归属口径直接复用 lib/song-view.ts 的 isPickUp()——与 /songs/ 的
// 范围筛选同一个函数，绝不另写一份（否则同一首在两页会是两种身份）。
//
// 【两处独立校验（2026-10-26）】
//   国服：按本文件口径现算 4832.8 + 4809.1 = 9641.9，与源表 sheet4 表头 MAX 完全吻合；
//   日服：算得 4879.5 + 4797.0 = 9676.5，与 BEMANIWiki 记载的 COMMON 4879.5 /
//         PICK UP 4797.0 / TOTAL 9676.5 逐项吻合。
import type { Song } from './db';
import type { Srv } from './song-view';
import { inView, isPickUp, songKey } from './song-view';

export type Diff = 'bsc' | 'adv' | 'ext';
export const DIFFS: Diff[] = ['bsc', 'adv', 'ext'];

export interface Tier {
  /** 稳定 key */
  k: string;
  /** 显示名（游戏内就是这串拉丁字母，不是翻译壳） */
  n: string;
  /** 该档起始分数（含）；PRIME GOLD 用 -1 表示「按下界现算」 */
  min: number;
  /** 层级图标主色：由原图去白底加权采样得到，只作装饰（描边/辉光），
   *  不用于文字，避免 NORMAL / YELLOW GREEN 这类浅色档对比度不足。 */
  c: string;
}

// 数组下标 = 图标文件名下标（/assets/jubility/tier-NN.webp），改动顺序会同时改错图。
export const TIERS: Tier[] = [
  { k: 'normal', n: 'NORMAL', min: 0, c: '#eddfda' },
  { k: 'ygreen', n: 'YELLOW GREEN', min: 250, c: '#e5dba3' },
  { k: 'green', n: 'GREEN', min: 750, c: '#b3c182' },
  { k: 'lblue', n: 'LIGHT BLUE', min: 1500, c: '#c1dbe3' },
  { k: 'blue', n: 'BLUE', min: 2500, c: '#959fe7' },
  { k: 'violet', n: 'VIOLET', min: 4000, c: '#e49cdb' },
  { k: 'purple', n: 'PURPLE', min: 5500, c: '#b386da' },
  { k: 'pink', n: 'PINK', min: 7000, c: '#faa8c6' },
  { k: 'orange', n: 'ORANGE', min: 8500, c: '#f5996a' },
  { k: 'gold', n: 'GOLD', min: 9500, c: '#fdc365' },
  // PRIME GOLD 的图由站长另做（原 gauge_10 偏珊瑚粉，2026-10-26 换成金黄色棒棒糖），
  // 主色按新图重新采样 = #f8c94a。
  { k: 'prime', n: 'PRIME GOLD', min: -1, c: '#f8c94a' },
];

/** 每档参评谱面数：COMMON 30 + PICK UP 30。算「平均每谱面」用，别散落成魔数。 */
export const SLOT_COUNT = 60;

/** PRIME GOLD 阈值：理论值的 99%（切到 0.1），低于 9500 时该档不成立、返回 null。 */
export function primeThreshold(theory: number): number | null {
  const v = Math.floor(theory * 0.99 * 10) / 10;
  return v >= 9500 ? v : null;
}

// ---------------------------------------------------------------------------
// 单曲 / TOTAL 理论值
// ---------------------------------------------------------------------------

/** 单曲 jubility：定数 × 12.5 × (rate / 99)，小数第 2 位以下切舍。rate=120 即 HARD EXC。 */
export const chartJubility = (lv: number, rate = 120) =>
  Math.floor((lv * 12.5 * rate * 10) / 99) / 10;

/** 8 及以下一律按 8.0 计（官方：LEVEL 8 以下没有小数，取整档）。 */
export const effLevel = (lv: number) => (lv <= 8 ? 8 : lv);

export interface ChartEntry {
  song: Song;
  d: Diff;
  lv: number;
  /** HARD MODE EXC 时的单曲 jubility（理论值） */
  hard: number;
  /** NORMAL MODE EXC 时的单曲 jubility */
  normal: number;
  scope: 'pick' | 'common';
}

/**
 * 把一个服务器视图摊成「谱面」列表 —— TOTAL jubility 的参评单位。
 * 视图口径与 /songs/ 完全一致（inView + 国服双服去重），否则同一首在曲目页有、
 * 在 jubility 页没有；scope 用 isPickUp()，与范围筛选用的是同一个函数。
 */
export function chartsOf(songs: Song[], srv: Srv): ChartEntry[] {
  const cnSeen = new Set(
    songs.filter((s) => s.cn && s.gen === '音乐魔方').map(songKey)
  );
  const rows = songs.filter((s) => {
    if (!inView(s, srv)) return false;
    if (srv === 'cn' && s.gen !== '音乐魔方' && s.jp && cnSeen.has(songKey(s))) return false;
    return true;
  });
  const out: ChartEntry[] = [];
  for (const s of rows) {
    const scope: 'pick' | 'common' = isPickUp(s, srv) ? 'pick' : 'common';
    for (const d of DIFFS) {
      const raw = s.lv?.[d];
      if (typeof raw !== 'number') continue;
      const lv = effLevel(raw);
      out.push({ song: s, d, lv, hard: chartJubility(lv, 120), normal: chartJubility(lv, 100), scope });
    }
  }
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 取分池上位 30 谱面（同值时的次序按定数降序、曲名升序，保证两次渲染稳定）。 */
export function topCharts(charts: ChartEntry[], scope: 'pick' | 'common', key: 'hard' | 'normal' = 'hard') {
  return charts
    .filter((c) => c.scope === scope)
    .sort((a, b) => b[key] - a[key] || b.lv - a.lv || a.song.t.localeCompare(b.song.t))
    .slice(0, 30);
}

export interface Theory {
  common: number;
  pick: number;
  total: number;
  /** NORMAL MODE（100%）口径 */
  commonN: number;
  pickN: number;
  totalN: number;
  /** 分池里可参评的谱面总数（不是 30） */
  commonPool: number;
  pickPool: number;
  /** 上位 60 谱面的定数分布（定数字符串 → 数量） */
  top60Levels: Record<string, number>;
}

/** 按曲库现算理论值。曲库增减曲目时这里自动跟着变，不需要手工维护常数。 */
export function theoryOf(charts: ChartEntry[]): Theory {
  const c30 = topCharts(charts, 'common');
  const p30 = topCharts(charts, 'pick');
  const c30n = topCharts(charts, 'common', 'normal');
  const p30n = topCharts(charts, 'pick', 'normal');
  const common = round1(c30.reduce((a, c) => a + c.hard, 0));
  const pick = round1(p30.reduce((a, c) => a + c.hard, 0));
  const commonN = round1(c30n.reduce((a, c) => a + c.normal, 0));
  const pickN = round1(p30n.reduce((a, c) => a + c.normal, 0));
  const top60Levels: Record<string, number> = {};
  for (const c of [...c30, ...p30]) {
    const k = c.lv.toFixed(1);
    top60Levels[k] = (top60Levels[k] ?? 0) + 1;
  }
  return {
    common,
    pick,
    total: round1(common + pick),
    commonN,
    pickN,
    totalN: round1(commonN + pickN),
    commonPool: charts.filter((c) => c.scope === 'common').length,
    pickPool: charts.filter((c) => c.scope === 'pick').length,
    top60Levels,
  };
}

/** 落在哪一档（含 PRIME GOLD；未达 PRIME 阈值时退回 GOLD）。 */
export function tierOf(value: number, theory: number): Tier {
  const prime = primeThreshold(theory);
  if (prime !== null && value >= prime) return TIERS[TIERS.length - 1];
  let hit = TIERS[0];
  for (const t of TIERS) if (t.min >= 0 && value >= t.min) hit = t;
  return hit;
}

/** 完整区间（含上界与 PRIME 阈值），页面画阶梯与刻度尺用。 */
export interface TierBand {
  tier: Tier;
  /** 起始（含）；PRIME 档为阈值，不成立时为 Infinity */
  from: number;
  /** 结束（不含）；最高档或「上界不成立」时为 null */
  to: number | null;
  /** 该档在当前理论值下是否成立（只对 PRIME 有意义） */
  active: boolean;
  /** 达成该档需要的平均每谱面 jubility（from / 60） */
  perChart: number;
  /** 图标路径 */
  icon: string;
  idx: number;
}

/**
 * 某档「理论上能不能填满」：把每张可参评谱面都打到该档均分以上，
 * COMMON 与 PICK UP 各最多 30 槽，两池加起来就是这档最多能填多少槽。
 * 它直接回答「这一档可不可能」——total < 60 时，无论怎么刷都达不到该档分数线。
 * （比「有多少谱面够格」有用：够格数没有上限的概念，槽位有。）
 */
export function fillableSlots(charts: ChartEntry[], perChart: number): { common: number; pick: number; total: number } {
  const fit = (scope: 'common' | 'pick') =>
    Math.min(30, charts.filter((c) => c.scope === scope && c.hard >= perChart).length);
  const common = fit('common');
  const pick = fit('pick');
  return { common, pick, total: common + pick };
}

export function tierBands(theory: number): TierBand[] {
  const prime = primeThreshold(theory);
  return TIERS.map((tier, idx) => {
    const isPrime = tier.k === 'prime';
    const from = isPrime ? prime ?? Number.POSITIVE_INFINITY : tier.min;
    const next = TIERS[idx + 1];
    const to = next ? (next.k === 'prime' ? prime : next.min) : null;
    return {
      tier,
      from,
      to,
      active: !isPrime || prime !== null,
      perChart: Number.isFinite(from) ? round1(from / SLOT_COUNT) : 0,
      icon: `/assets/jubility/tier-${String(idx).padStart(2, '0')}.webp`,
      idx,
    };
  });
}
