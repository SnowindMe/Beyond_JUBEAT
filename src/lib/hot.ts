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
const TZ_OFFSET = 8 * 3600000; // 北京时间固定 +08:00，无夏令时
export const WINDOW = 7;
const POOL = 40; // 参与名次计算与比对的池子
export const TOP = 25; // 对外只出 25 名（2026-11-03 先定 10，同日改 25）

/** 把毫秒时间戳（UTC）切成北京时间日历日 YYYY-MM-DD。
 *  注意偏移只加一次：早先默认参数写成 Date.now() + TZ_OFFSET、函数体里又加一次，
 *  等于加了 16 小时，北京时间 16:00 之后整天都会算成"明天"
 *  （2026-11-03 16:50 实撞：dayOf() 返回 11-04，页面去读一个不存在的快照）。 */
export function dayOf(ts = Date.now()): string {
  return new Date(ts + TZ_OFFSET).toISOString().slice(0, 10);
}

/** 把 YYYY-MM-DD 还原成"北京这天 00:00"的毫秒时间戳 */
export function dayStart(day: string): number {
  return Date.parse(day + "T00:00:00Z") - TZ_OFFSET;
}

export function addDays(day: string, n: number): string {
  return dayOf(dayStart(day) + n * DAY_MS);
}

/** 算今天该出哪个窗口：末日 = 昨天，往前 WINDOW 天 */
export function windowEndingYesterday(now = Date.now()): {
  from: string;
  to: string;
} {
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
 * 评级档。阈值是 0–1000 分数轴上的上界（越小越好），**不是**概率。
 * 概率由 `fortuneOf` 的采样 + 下面这串阈值共同决定，见那段注释里的实测表；
 * 改这里就等于改手感，别在别处另写一份。
 *
 * 【2026-11-05 重排】旧阈值（2/12/60/180/380/580/780/920）从来没按最终分布校准过：
 * 它配上采样实测偏得离谱——EXC 31.7%、C/D/E 全是 0‰（三张评级图永远用不上）。
 * 现在这串是**反解**出来的：先定目标分布，再对 100 万样本的三角分布取分位点。
 * 实测落在 5/30/100/190/280/230/110/40/15 ‰，合计正好 1000‰。
 * 要调手感就改目标分布后重解（对分位点即可，别手拍）。
 */
export const GRADES = [
  { key: "exc", cap: 203 },
  { key: "sss", cap: 257 },
  { key: "ss", cap: 341 },
  { key: "s", cap: 436 },
  { key: "a", cap: 537 },
  { key: "b", cap: 641 },
  { key: "c", cap: 721 },
  { key: "d", cap: 773 },
  { key: "e", cap: 1000 },
] as const;

export type GradeKey = (typeof GRADES)[number]["key"];

/**
 * 三档：档名 → 打哪个难度 + 该难度下的定数闭区间。
 *
 * 档与难度一一对应（沉淀→BSC / 均衡→ADV / 挑战→EXT，主人 2026-11-03 追加「要指定难度」）：
 * 推荐卡上因此能画出「难度-定数」徽章——三档不再是"同一难度的三段"，而是三首各有其难度。
 * 区间是各难度自己的手感刻度，不共用一套（EXT 的 7 分与 BSC 的 7 分不是一个东西）。
 */
export const TIERS = [
  { key: "sediment", label: "沉淀", diff: "bsc", lo: 0, hi: 4 },
  { key: "balance", label: "均衡", diff: "adv", lo: 4.5, hi: 7 },
  { key: "challenge", label: "挑战", diff: "ext", lo: 7.5, hi: 10.5 },
] as const;

const GRADES_LEN = GRADES.length;

/**
 * 运气 → 三首歌各打哪一档的权重 [沉淀, 均衡, 挑战]（合计 100）。
 *
 * 【2026-11-05 定稿】难度由运气决定，但**不绑死序号**：运气好时三首会重到挑战
 * （抽到 exc 时平均 2 首以上是挑战），运气差时反过来，运气在中间时才会出现
 * 沉淀/均衡/挑战各一首。表围绕 a 对称，改的时候保持对称，
 * 否则好日子里也会混进沉淀档。与 GRADES 一样由 scripts/ci/check-fortune-dist.mjs 守门。
 */
const TIER_W: Record<GradeKey, readonly [number, number, number]> = {
  exc: [0, 30, 70],
  sss: [5, 30, 65],
  ss: [10, 35, 55],
  s: [15, 40, 45],
  a: [25, 40, 35],
  b: [35, 40, 25],
  c: [45, 40, 15],
  d: [55, 35, 10],
  e: [70, 30, 0],
};

/** 按权重抽一档 */
function pickTier(w: readonly [number, number, number], r: number): string {
  const x = r * 100;
  let acc = 0;
  for (let i = 0; i < TIERS.length; i++) {
    acc += w[i];
    if (x < acc) return TIERS[i].key;
  }
  return TIERS[TIERS.length - 1].key;
}

/** 评级 → 序号（0 = EXC 最好，8 = E 最差）。境界判定与区间换算都靠它 */
export function gradeIndex(g: GradeKey): number {
  return GRADES.findIndex((x) => x.key === g);
}

export function gradeOf(score: number): GradeKey {
  const hit = GRADES.find((g) => score < g.cap);
  return (hit ?? GRADES[GRADES.length - 1]).key;
}

/** FNV-1a 32 位 + 一轮 murmur3 尾混：只用于摊开稳定的伪随机序列，不需要加密强度。
 *  【2026-11-05 修】原来只有 FNV-1a，没做尾混。FNV-1a 末轮是 (h ^ c) * prime，
 *  两个抽样键只差**结尾一个字符**时输出只差一个常数，高位强相关——
 *  实测 corr(u1,u2) = 0.95，于是"两次抽样取平均 = 三角分布"退化成近似均匀分布，
 *  端部不再变薄，EXC 因此冲到 31.7%。加尾混后 corr 降到 0.002。
 *  另一条等价修法是让抽样键在末字符之前分叉；两种都验过，这里取尾混（调用方不用改）。 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 由一个种子键摊出 [0,1) —— 同一个键（天 + 访客）永远同一个值 */
export function unit(key: string): number {
  return fnv1a(key) / 4294967296;
}

/** 三首歌各自的定数区间，用评级边界换算：第 i 首落在"手气往上抬 i 档"那一级的区间里。
 *  下面三张表是「评级 → 第 0 / 1 / 2 首各自的下界评级序号」——越往后抬得越高，
 *  也就是难度越高、要求的评价也越高（主人口径）。 */
export type FortuneLine = {
  tier: string;
  score: number;
  grade: GradeKey;
  /** 这首歌从池子里挑时用的定数闭区间（评级换算出来的，见 pickFortune） */
  lo: number;
  hi: number;
  /** 区间最差那一头对应的评级，页面上画「S…EXC」用 */
  worstGrade: GradeKey;
  /** 这一首要求打到的评级（= 今日手气，区间的上界） */
  need: GradeKey;
  /** 今日运气值 0–120（三首共用一个，页面画刻度条）。评价由它换算而来：
   *  运气值越高，需要的评价越高。显示值是 0–120 的「分」，落到 GRADES 上仍走 score。 */
  luck: number;
};

/** 服务器：运势块的两个选项（2026-11-03 先加、当日下午砍掉、随后又被主人要求加回来
 *  「把今日运势的服务器选项卡加回来」）。库里的行以 server_jp / server_cn 标「在哪个服有谱」。
 *  热榜不分服，所以它只在运势块用。 */
export type Svr = "jp" | "cn";
export const SRV_COL: Record<Svr, string> = {
  jp: "server_jp",
  cn: "server_cn",
};

/** 难度：徽章显示的就是这个难度与它的定数（2026-11-03 起**没有**难度选项卡，
 *  三档与难度是绑定的，难度是每首的属性而不是筛选项） */
export type Diff = "bsc" | "adv" | "ext";
export const DIFFS: readonly Diff[] = ["bsc", "adv", "ext"] as const;
export const DIFF_LABEL: Record<Diff, string> = {
  bsc: "BSC",
  adv: "ADV",
  ext: "EXT",
};

export function isSvr(v: unknown): v is Svr {
  return v === "jp" || v === "cn";
}
export function isDiff(v: unknown): v is Diff {
  return v === "bsc" || v === "adv" || v === "ext";
}

/** 把评级序号落成某难度区间里的一个定数（0 = EXC 取区间顶端，8 = E 取底端） */
function levelAt(t: (typeof TIERS)[number], at: number): number {
  const v = t.hi - (at / (GRADES_LEN - 1)) * (t.hi - t.lo);
  return Math.round(v * 10) / 10;
}

/**
 * 当日运势：一次手气，摊出三首歌**各自的难度与评价区间**。
 *
 * 口径（主人 2026-11-05，含看板标注）：
 * - 运气值全站同一个人同一天只有一个（`seed|visitor|lvl`），0–120 分，三首共用；
 * - 难度由运气加权抽：运气好时三首会重到挑战，运气差时反过来，中间才各一首（TIER_W）；
 * - 运气值定的是三首的**中心**，不是逐字相等（主人 2026-11-05「下面的歌曲评价并不要
 *   完全等于上面的运气评价」）：第 i 首的要求从中心往下错一级，即【中心+1 / 中心 / 中心-1】。
 *   运气值越好中心越高，整组因此跟着抬高；贴到两端时错位的部分被截平。
 *   这么做还消掉了原来三行都写「只要 B」的重复。
 * - 两服之间只有**手气值**必须相同，歌曲、难度、要求都可以不同（主人 2026-11-05
 *   「日服和国服的推荐歌曲，[难度，等级，达成评价]都可以不一样」）：salt 只进难度与
 *   这组错位的抽样键（整组一起平移 -1…+1，保住"越靠后越高"的坡），不进运气值，
 *   所以同一个人的两服看到的运气值一样、具体要求不一样。
 *
 * 手气本身是三角分布（两次抽样取平均，中间厚两端薄），整套采样 + GRADES 阈值的实测分布
 * 是 exc 5 / sss 30 / ss 100 / s 190 / a 280 / b 230 / c 110 / d 40 / e 15 ‰。
 * 改采样、改阈值、改 TIER_W 都会动这串数，动完要重跑 scripts/ci/check-fortune-dist.mjs。
 */
export function fortuneOf(
  seed: string,
  visitor: string,
  salt = "",
): FortuneLine[] {
  const tri = (k: string, span: number) =>
    ((unit(`${seed}|${visitor}|${k}|1`) + unit(`${seed}|${visitor}|${k}|2`)) /
      2 -
      0.5) *
    2 *
    span;
  const dev = tri("lvl", 330);
  const score = Math.max(0, Math.min(1000, 500 + dev));
  const best = gradeIndex(gradeOf(score));
  // 运气值是 score 的另一种读数（score 越小越好，所以此处反向）：0 = 最差，120 = 最好。
  // 与 score 严格单调、共用同一个采样，两端都能跑满。三首共用一个值，页面画刻度条；
  // 评价直接由 score 换算，所以「运气值越高、要求的评价也越高」是同一件事的两种说法。
  const luck = Math.round(((1 - dev / 330) / 2) * 120);
  // 这一服把整组要求往高（-1）或往低（+1）平移一格：只用 salt 抽，运气值不跟着变。
  // 整组一起平移才不会打乱"越靠后要求越高"的坡。
  const shift = Math.round(unit(`${seed}|${visitor}|salt|${salt}`) * 2) - 1;
  const lines: FortuneLine[] = [];
  for (let i = 0; i < 3; i++) {
    // 要求逐首抬高一级（序号 -1 = 更高）：第 1 首比中心低一格、第 2 首就是中心、第 3 首高一格。
    // 两端截平：中心已经贴在 exc 时，第 3 首没法再高，就与第 2 首同档。
    const needIdx = Math.max(
      0,
      Math.min(GRADES_LEN - 1, best + shift + (1 - i)),
    );
    // 区间下界另走一条更松的坡：从第 1 首往下两级，收到末首与要求同档。
    const worst = Math.min(GRADES_LEN - 1, needIdx + (2 - i));
    // 难度由运气加权抽（主人 2026-11-05「难度根据运势评价来定，并不一定非要每个一首」）：
    // 运气好时三首容易重到挑战，运气差时反过来，中间才各一首。
    const tier = pickTier(
      TIER_W[GRADES[best].key],
      unit(`${seed}|${visitor}|salt|${salt}|tier|${i}`),
    );
    const t = TIERS.find((x) => x.key === tier) ?? TIERS[0];
    // 上下界都落成定数段：a 是要求（区间上界），b 是及格线（下界）。
    const a = levelAt(t, needIdx);
    const b = levelAt(t, worst);
    lines.push({
      tier,
      score,
      grade: GRADES[best].key,
      worstGrade: GRADES[worst].key,
      need: GRADES[needIdx].key,
      luck,
      lo: Math.min(a, b),
      hi: Math.max(a, b),
    });
  }
  return lines;
}

/** 今日推荐的候选池：未来窗口（含今天）里，按窗口热度前 POOL */
export function futureWindow(now = Date.now()): { from: string; to: string } {
  const today = dayOf(now);
  return { from: addDays(today, 1 - WINDOW), to: today };
}
