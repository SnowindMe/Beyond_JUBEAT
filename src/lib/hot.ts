// 热门榜与今日运势的计算层（2026-11-03）
//
// 三块内容都在这里，因为它们共用同一份"窗口 → 名次"的数据：
//   1. 榜单：游标窗口计票、快照落库、读快照出展示数据；
//   2. 运势：用当日种子在"未来窗口"里按评级取三首；
//   3. 限流：同一 IP 每分钟/每天的打点次数闸门。
//
// 窗口为什么是游标（即"算今天、但不含今天"）：
//   主人要"当日固定"——今天在看的人不能把自己的播放算进此刻的名次，
//   否则名次会随自己刷新而抖动。所以每天 00:05 把**昨天为末日的 7 天**封成快照，
//   这个快照今天全天都用。附带好处：榜天然比现实滞后一小时左右缓存，
//   刷量脚本当天刷不动窗口里的数字。

const DAY_MS = 86400000;
const TZ_OFFSET = 8 * 3600000;   // 北京时间固定 +08:00，无夏令时
export const WINDOW = 7;
const POOL = 40;                 // 参与名次计算与比对的池子
const TOP = 10;                  // 对外只出 10 名（主人 2026-11-03 追加）

/** 把毫秒时间戳切成北京时间日历日 YYYY-MM-DD */
export function dayOf(ts = Date.now() + TZ_OFFSET): string {
  return new Date(ts + TZ_OFFSET).toISOString().slice(0, 10);
}

/** 把 YYYY-MM-DD 还原成"北京这天 00:00"的毫秒时间戳 */
export function dayStart(day: string): number {
  return Date.parse(day + 'T00:00:00Z') - TZ_OFFSET;
}

export function addDays(day: string, n: number): string {
  return dayOf(dayStart(day) + n * DAY_MS);
}

/** 算今天该出哪个窗口：末日 = 昨天，往前 WINDOW 天 */
export function windowEndingYesterday(now = Date.now()): { from: string; to: string } {
  const to = addDays(dayOf(now), -1);
  return { from: addDays(to, -(WINDOW - 1)), to };
}

export type HitRow = { song_id: string; visitor: string };

/** 一组命中行 → 名次表（同票按 song_id 稳定排序，保证同一份数据永远同一名次） */
export function rankOf(rows: HitRow[]): Map<string, number> {
  const tally = new Map<string, Set<string>>();
  for (const r of rows) {
    let set = tally.get(r.song_id);
    if (!set) tally.set(r.song_id, (set = new Set()));
    set.add(r.visitor);
  }
  const sorted = [...tally.entries()]
    .map(([id, set]) => ({ id, n: set.size }))
    .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
  const rank = new Map<string, number>();
  sorted.forEach((e, i) => rank.set(e.id, i + 1));
  return rank;
}

/** 池子：名次前 POOL 的曲目 id（按名次顺序） */
export function poolOf(rank: Map<string, number>, size = POOL): string[] {
  return [...rank.entries()]
    .filter(([, r]) => r <= size)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
}

export type HotEntry = {
  songId: string;
  rank: number;
  /** 比上一个同长窗口的名次变化：正数=上升，负数=下降，0=持平 */
  delta: number;
  /** 上一个窗口前 POOL 里没有它 */
  isNew: boolean;
};

/**
 * 上一窗口名次 → 变化量。
 * 主人 2026-11-03 两者都要（比名次 + 新进榜标"新"）：新进榜的 delta 恒为 0，靠 isNew 区分。
 */
export function compareWith(
  current: Map<string, number>,
  previous: Map<string, number> | null,
  size = POOL,
): HotEntry[] {
  const out: HotEntry[] = [];
  for (const [songId, rank] of current) {
    if (rank > size) continue;
    const before = previous?.get(songId);
    const isNew = !before || before > size;
    out.push({ songId, rank, delta: isNew ? 0 : before - rank, isNew });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/* ------------------------------ 运势 ------------------------------ */

/**
 * 评级档。阈值是"每千人落点"（per-mille），从最好的 EXC 往上累加；
 * offset 越大（当日越不吉）落点越靠后，因此判出的档越差。
 * 阈值直接决定各档出现概率，改这里就等于改手感，别在别处另写一份。
 */
export const GRADES = [
  { key: 'exc', cap: 2 },
  { key: 'sss', cap: 12 },
  { key: 'ss', cap: 60 },
  { key: 's', cap: 180 },
  { key: 'a', cap: 380 },
  { key: 'b', cap: 580 },
  { key: 'c', cap: 780 },
  { key: 'd', cap: 920 },
  { key: 'e', cap: 1000 },
] as const;

export type GradeKey = (typeof GRADES)[number]['key'];

/**
 * 三档：档名 → 打哪个难度 + 该难度下的定数闭区间。
 *
 * 档与难度一一对应（沉淀→BSC / 均衡→ADV / 挑战→EXT，主人 2026-11-03 追加「要指定难度」）：
 * 推荐卡上因此能画出「难度-定数」徽章——三档不再是"同一难度的三段"，而是三首各有其难度。
 * 区间是各难度自己的手感刻度，不共用一套（EXT 的 7 分与 BSC 的 7 分不是一个东西）。
 */
export const TIERS = [
  { key: 'sediment', label: '沉淀', diff: 'bsc', lo: 0, hi: 4 },
  { key: 'balance', label: '均衡', diff: 'adv', lo: 4.5, hi: 7 },
  { key: 'challenge', label: '挑战', diff: 'ext', lo: 7.5, hi: 10.5 },
] as const;

/**
 * 每档的基准分，用的是 0–1000 的刻度——和 GRADES 那串阈值同一把尺，
 * 所以"分数"与"评级"永远对得上，不需要第二套换算。
 * 档与档之间隔着 380 分，正好等于整体运气的最大振幅，
 * 好日子是"连沉淀档都能出 SSS"，坏日子是"连挑战档也只有 E"。
 */
const TIER_BASE = { sediment: 120, balance: 500, challenge: 880 } as const;

export function gradeOf(score: number): GradeKey {
  const hit = GRADES.find((g) => score < g.cap);
  return (hit ?? GRADES[GRADES.length - 1]).key;
}

/** FNV-1a 32 位：只用于把种子摊开成稳定的伪随机序列，不需要加密强度 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 由一个种子键摊出 [0,1) —— 同一个键（天 + 访客）永远同一个值 */
export function unit(key: string): number {
  return fnv1a(key) / 4294967296;
}

export type FortuneLine = { tier: string; score: number; grade: GradeKey };

/** 服务器：页面上的两个选项。库里的行以 server_jp / server_cn 标「在哪个服有谱」 */
export type Svr = 'jp' | 'cn';
export const SRV_COL: Record<Svr, string> = { jp: 'server_jp', cn: 'server_cn' };

/** 难度：运势要"指定难度"，徽章显示的就是这个难度与它的定数（主人 2026-11-03 追加） */
export type Diff = 'bsc' | 'adv' | 'ext';
export const DIFFS: readonly Diff[] = ['bsc', 'adv', 'ext'] as const;
export const DIFF_LABEL: Record<Diff, string> = { bsc: 'BSC', adv: 'ADV', ext: 'EXT' };

export function isSvr(v: unknown): v is Svr {
  return v === 'jp' || v === 'cn';
}
export function isDiff(v: unknown): v is Diff {
  return v === 'bsc' || v === 'adv' || v === 'ext';
}

/**
 * 当日运势：先摊一个 0..4 的档位偏移，再在三档各自的落点上平移。
 * 返回按"评级从好到坏"排好的三行——展示顺序与档位顺序无关，
 * 所以同一张卡里最好的那首可能出自任何一档。
 */
export function fortuneOf(seed: string, visitor: string): FortuneLine[] {
  // 两次抽样取平均 = 三角分布：中间厚、两端薄，比均匀分布更像"运气"，
  // 也让极端评级（EXC / E）只在真正的大好大坏日子才出现。
  const tri = (k: string, span: number) =>
    ((unit(`${seed}|${visitor}|${k}|1`) + unit(`${seed}|${visitor}|${k}|2`)) / 2 - 0.5) * 2 * span;
  const luck = tri('lvl', 330);
  const lines = TIERS.map((t) => {
    const score = Math.max(0, Math.min(1000, TIER_BASE[t.key] + luck + tri(t.key, 120)));
    return { tier: t.key, score, grade: gradeOf(score) };
  });
  lines.sort((a, b) => a.score - b.score);
  return lines;
}

/** 今日推荐的候选池：未来窗口（含今天）里，按窗口热度前 POOL */
export function futureWindow(now = Date.now()): { from: string; to: string } {
  const today = dayOf(now);
  return { from: addDays(today, 1 - WINDOW), to: today };
}