// Jubility（ジュビリティ）层级口径 —— /jubility/ 页唯一数据源。
//
// 【数据来源】层级名称与分数线取自 BEMANIWiki 2nd「jubeat beyond the Ave./jubility」
// 的「ネームカラー」表（游戏内名片颜色，TOTAL jubility 达到该值即换色）：
//   NORMAL 0 / YELLOW GREEN 250 / GREEN 750 / LIGHT BLUE 1500 / BLUE 2500 /
//   VIOLET 4000 / PURPLE 5500 / PINK 7000 / ORANGE 8500 / GOLD 9500
// 前作 festo 的分数线与此完全相同，国服「音乐魔方」沿用同一套。
//
// 【两个自创档，游戏内都不存在】
//   ① PEACH（图标 gauge_11）：**NORMAL 模式**理论值的 96.5% 才算，低于 7000 不设此档。
//      按分数落在 PINK(7000) 与 ORANGE(8500) 之间，所以数组里插在中间，
//      但图标编号显式指定为 11（见 Tier.icon）——编号顺序与分数顺序在这里不一致。
//   ② PRIME GOLD（图标 gauge_10）：HARD 口径 TOTAL 理论值的 99.5% 才算，低于 9500
//      不设此档（否则曲库小的服务器会轻易「白拿」最高档）。
// 判定分别见 peachThreshold() / primeThreshold()。
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
import { countedIn, isPickUp, todayISO } from './song-view';

export type Diff = 'bsc' | 'adv' | 'ext';
export const DIFFS: Diff[] = ['bsc', 'adv', 'ext'];

export interface Tier {
  /** 稳定 key */
  k: string;
  /** 显示名（游戏内就是这串拉丁字母，不是翻译壳） */
  n: string;
  /** 该档起始分数（含）；自创档（PEACH / PRIME GOLD）用 -1 表示「按下界现算」 */
  min: number;
  /** 层级图标主色：由原图去白底加权采样得到，只作装饰（描边/辉光），
   *  不用于文字，避免 NORMAL / YELLOW GREEN 这类浅色档对比度不足。 */
  c: string;
  /** 图标文件名里的编号（/assets/jubility/tier-NN.webp）。
   *  不写则默认等于数组下标 —— 只有「图标编号 ≠ 分数顺序」时才需要显式给。
   *  PEACH 就是这种情况：图标是站长做的第 11 张（gauge_11），
   *  但分数线落在 PINK 与 ORANGE 之间，所以插在数组中间而图标仍是 11。 */
  icon?: number;
}

// 数组顺序 = 分数顺序（阶梯就是按这个顺序画的）。图标默认取同一下标，
// 但可用 Tier.icon 覆盖（PEACH 用 11）；改动顺序前先确认图标编号是否跟着变。
export const TIERS: Tier[] = [
  { k: 'normal', n: 'NORMAL', min: 0, c: '#eddfda' },
  { k: 'ygreen', n: 'YELLOW GREEN', min: 250, c: '#e5dba3' },
  { k: 'green', n: 'GREEN', min: 750, c: '#b3c182' },
  { k: 'lblue', n: 'LIGHT BLUE', min: 1500, c: '#c1dbe3' },
  { k: 'blue', n: 'BLUE', min: 2500, c: '#959fe7' },
  { k: 'violet', n: 'VIOLET', min: 4000, c: '#e49cdb' },
  { k: 'purple', n: 'PURPLE', min: 5500, c: '#b386da' },
  { k: 'pink', n: 'PINK', min: 7000, c: '#faa8c6' },
  // PEACH 是自创第 11 档（图标 gauge_11），但阈值按 NORMAL 理论值算、落在 7000–8500
  // 区间内，所以这里按「分数顺序」插在 PINK 与 ORANGE 之间，图标编号显式指定。
  { k: 'peach', n: 'PEACH', min: -1, c: '#fda78b', icon: 11 },
  // ↓ 以下三档的图标编号全部显式写出：插入 PEACH 后它们的数组下标各 +1，
  //   若靠「下标 = 图标号」的默认值会集体错位（ORANGE 会拿到 GOLD 的图、
  //   GOLD 拿到 PRIME 的图、PRIME 拿到 PEACH 的图）。
  //   实际素材是固定的：tier-08=ORANGE / tier-09=GOLD / tier-10=PRIME GOLD / tier-11=PEACH。
  { k: 'orange', n: 'ORANGE', min: 8500, c: '#f5996a', icon: 8 },
  { k: 'gold', n: 'GOLD', min: 9500, c: '#fdc365', icon: 9 },
  // PRIME GOLD 的图由站长另做（原 gauge_10 偏珊瑚粉，2026-10-26 换成金黄色棒棒糖），
  // 主色按新图重新采样 = #f8c94a。
  { k: 'prime', n: 'PRIME GOLD', min: -1, c: '#f8c94a', icon: 10 },
];

/** 每档参评谱面数：COMMON 30 + PICK UP 30。算「平均每谱面」用，别散落成魔数。 */
export const SLOT_COUNT = 60;

/** PRIME GOLD 阈值：理论值的 99.5%（切到 0.1），低于 9500 时该档不成立、返回 null。
 *  比例历史：2026-10-26 初版 99%，当日主人改为 99.5%。 */
export function primeThreshold(theory: number): number | null {
  const v = Math.floor(theory * 0.995 * 10) / 10;
  return v >= 9500 ? v : null;
}

/**
 * PEACH 阈值：**NORMAL 模式**理论值的 96.5%（切到 0.1），低于 7000 时该档不成立。
 *
 * 与 PRIME GOLD 的区别只有两点：一是基数是 totalN（NORMAL 上限 100%）而不是
 * total（HARD 上限 120%），二是下界取 7000 而不是 9500。
 * 下界取 7000 的理由：PEACH 按分数排在 PINK(7000) 与 ORANGE(8500) 之间，
 * 若算出来低于 7000，它会掉到 PINK 之下，与「PINK → PEACH → ORANGE」的
 * 排序矛盾 —— 那种情况下这一档在本服不成立。
 *
 * 比例历史：2026-10-26 初版 99%（日服 7983.6 / 国服 7954.3）→ 当日改 96% → 再改 96.5%。
 */
export function peachThreshold(theoryN: number): number | null {
  const v = Math.floor(theoryN * 0.965 * 10) / 10;
  return v >= 7000 ? v : null;
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
 *
 * 【2026-10-28】视图行改由 song-view.ts 的 countedIn() 统一提供。此前这里自己写了一份
 * filter，注释自称「与 /songs/ 完全一致」，实际漏了限时曲：/songs/ 排除已结束的限时曲、
 * 这里不排除，国服谱面池 1569 vs 应 1563。理论值当天恰好 0 差异（那 2 首挤不进上位 30），
 * 所以页面看不出来 —— 这类「注释说一致、实现不一致」的偏差只能靠共用函数根治。
 * scope 仍用 isPickUp()，与范围筛选用同一个函数。
 */
export function chartsOf(songs: Song[], srv: Srv, today: string = todayISO()): ChartEntry[] {
  const rows = countedIn(songs, srv, today);
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

/** 自创档的横向阈值（小写 k → 该理论值下的阈值，不成立为 null）。 */
export function customThresholds(theory: number, theoryN: number): Record<string, number | null> {
  return { peach: peachThreshold(theoryN), prime: primeThreshold(theory) };
}

/**
 * 落在哪一档（含 PEACH / PRIME GOLD 两个自创档）。
 *
 * 判据是「从高到低，第一个 value >= from 的档」——不能写成「先试自创档」，
 * 因为自创档的阈值不一定比官方档高（PEACH 只有 7983.6，比 ORANGE 8500 低，
 * 若先试自创档会把 8500 误判成 PEACH）。tierBands 的 from 已验证严格递增，
 * 所以倒序扫一遍就是正确答案。
 */
export function tierOf(value: number, theory: number, theoryN: number): Tier {
  const bands = tierBands(theory, theoryN);
  for (let i = bands.length - 1; i >= 0; i--) {
    const b = bands[i];
    if (b.active && value >= b.from) return b.tier;
  }
  return TIERS[0];
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
  /** 图标路径（编号可能不等于 idx，见 Tier.icon） */
  icon: string;
  /** 数组下标 = 分数顺序（阶梯显示的顺序号） */
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

/** 某档的起始分数：自创档（min<0）按下界现算，其余用 min。 */
function fromOf(tier: Tier, th: Record<string, number | null>): number {
  if (tier.min >= 0) return tier.min;
  const v = th[tier.k];
  return v === null || v === undefined ? Number.POSITIVE_INFINITY : v;
}

export function tierBands(theory: number, theoryN: number): TierBand[] {
  const th = customThresholds(theory, theoryN);
  return TIERS.map((tier, idx) => {
    const isCustom = tier.min < 0;
    const from = fromOf(tier, th);
    const next = TIERS[idx + 1];
    const to = next ? fromOf(next, th) : null;
    return {
      tier,
      from,
      to,
      active: !isCustom || Number.isFinite(from),
      perChart: Number.isFinite(from) ? round1(from / SLOT_COUNT) : 0,
      // 图标编号：显式给了用显式值（PEACH=11），否则默认等于数组下标
      icon: `/assets/jubility/tier-${String(tier.icon ?? idx).padStart(2, '0')}.webp`,
      idx,
    };
  });
}
