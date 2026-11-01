// 难度等级的唯一来源：标签、刻度、显示取值，以及「键数 / 长押」的参照系。
//
// 【为什么抽出来】原先 SCALE_MAX / gauge() / 三行 [key,label,val] 元组散在
// src/pages/songs/[songId].astro 里，难度的"顺序"与"刻度上限"各写一份，
// 加一档或改上限就得同时改模板与样式注解。现在只有一个地方定义。
export const SCALE_MAX = 11;

/** 定数 → 横条填充百分比。null 表示这一档没有谱面。
 *  低于 1 的给 4% 最小可见宽度，避免短到看不见被误读成"没加载"。 */
export const gauge = (v: number | null) =>
  v == null ? null : Math.max(4, Math.round((v / SCALE_MAX) * 100));

/** 三个难度的固定顺序与标签（BSC → ADV → EXT，与游戏内一致）。 */
export const LEVELS = [
  { key: 'bsc', label: 'BSC' },
  { key: 'adv', label: 'ADV' },
  { key: 'ext', label: 'EXT' },
] as const;

export type LevelKey = (typeof LEVELS)[number]['key'];

/** 定数空值统一显示破折号 */
export const dash = (v: number | null) => (v == null ? '—' : String(v));

// ---------------------------------------------------------------------------
// 【2026-11-01 主人「现在键数和长押数的展示也很简陋」——给每个数字配参照系】
//
// 裸数字之所以简陋，不是字太小，而是**读不出它算多还是算少**：
//   · 「1,111 键」单独看毫无意义，但如果知道它落在同难度同整级的 P99，
//     立刻变成「这首的 EXT 是超长谱」；
//   · 「长押 34」更糟——全库 25.9% 的谱面根本没有长押，读者既不知道 34 是大是小，
//     也不知道「没有长押」才是多数情况。
//
// 所以这里给两个参照系，全部由曲库现算，不写死任何数字：
//   ① 键数分位：按「难度 × 整数定数」分桶（EXT-10 档有 420 个谱面），
//      算某个键数在同档里超过了百分之多少。桶太小时不给分位（见 MIN_BUCKET）。
//   ② 长押率：长押数 ÷ 该档键数。基准线用「有长押谱面」的中位率，
//      因为把 0% 的谱面算进中位数会让基准线掉到 0，基准线就没意义了。
//
// 【为什么分位按「整数定数」而不是按整个难度】
//   同一难度内定数 7 和定数 10 的键数量级差一倍（BSC 中位 524 vs 932）；
//   拿全难度比会把「10 级谱当然键多」这个常识误读成「这首特别长」。
//   分到整数级后，比的才是「同为 EXT 10 级，谁的键更多」——那才是有用的信息。
//
// 【为什么下限是 MIN_BUCKET = 8】
//   BSC 8 级全库只有 2 个谱面、10 级只有 1 个，分位数在这种桶里没有统计意义
//   （1 个样本的 P99 必然成立）。样本不足时**不显示分位**，而不是显示一个假的分位。
//   实测分布：BSC 多数档 21~413 个、ADV 36~375、EXT 22~506，只有高等级 BSC 会落到线下。
export const MIN_BUCKET = 8;

/** 有长押谱面的长押率中位数（%）。null = 样本不足，不画基准线。 */
export type HoldBaseline = { medianPct: number; sample: number };

export type DifficultyStats = {
  /** 键数在同「难度×整级」桶里的分位（0-100 的整数）。null = 样本不足，不显示 */
  notesPctl: number | null;
  /** 该桶的样本数（调试与 tooltip 用） */
  bucketSize: number;
  /** 长押占该档键数的百分比；null = 无长押或键数未知 */
  holdPct: number | null;
  /** 长押率基准线：有长押谱面的中位率 */
  holdBaseline: HoldBaseline | null;
};

type ChartRef = {
  lv: { bsc: number | null; adv: number | null; ext: number | null };
  notecounts?: Record<string, number> | null;
  holds?: Record<string, number> | null;
};

/**
 * 从**整个曲库**现算参照系。每次请求都算一遍的成本：1248 首 × 3 档 = 3744 条，
 * 排序 O(n log n)，实测个位数毫秒，比在构建期焊死一份 JSON 更省心——
 * 曲库一变参照系自动跟着变，不会出现「曲线加了但分位还是旧的」。
 *
 * 注意：传进来的应该是**全量曲目**，不是当前视图。分位要拿全站同档谱面当分母，
 * 否则日服/国服各算一套，同一首在两屏下分位不同，看起来像 bug。
 */
export function buildDifficultyStats(songs: ChartRef[]): Map<string, DifficultyStats> {
  // ① 按「难度|整级」收集键数
  const buckets = new Map<string, number[]>();
  // ② 收集有长押谱面的长押率，用于基准线
  const holdRates: number[] = [];

  for (const s of songs) {
    if (!s.notecounts) continue;
    for (const { key } of LEVELS) {
      const lv = s.lv[key];
      const notes = s.notecounts[key];
      if (lv == null || notes == null || notes <= 0) continue;
      const bk = `${key}|${Math.floor(lv)}`;
      let arr = buckets.get(bk);
      if (!arr) buckets.set(bk, (arr = []));
      arr.push(notes);

      const h = s.holds?.[key];
      if (h != null && h > 0) holdRates.push((h / notes) * 100);
    }
  }

  for (const arr of buckets.values()) arr.sort((a, b) => a - b);
  holdRates.sort((a, b) => a - b);

  const baseline: HoldBaseline | null = holdRates.length
    ? {
        medianPct: holdRates[Math.floor(holdRates.length / 2)],
        sample: holdRates.length,
      }
    : null;

  // ③ 每首曲的每一项都算好，键用 songId 索引
  const out = new Map<string, DifficultyStats>();
  for (const s of songs as (ChartRef & { id: string })[]) {
    if (!s.notecounts) continue;
    for (const { key } of LEVELS) {
      const lv = s.lv[key];
      const notes = s.notecounts[key];
      if (lv == null || notes == null) continue;

      const arr = buckets.get(`${key}|${Math.floor(lv)}`) ?? [];
      let notesPctl: number | null = null;
      if (arr.length >= MIN_BUCKET) {
        // 严格小于的个数 → 「超过了同档百分之多少」
        let below = 0;
        for (const x of arr) {
          if (x < notes) below++;
          else break;
        }
        notesPctl = Math.round((below / arr.length) * 100);
      }

      const h = s.holds?.[key] ?? null;
      const holdPct = h != null && h > 0 && notes > 0 ? (h / notes) * 100 : null;

      out.set(`${s.id}|${key}`, {
        notesPctl,
        bucketSize: arr.length,
        holdPct,
        holdBaseline: baseline,
      });
    }
  }
  return out;
}

/** 长押率条的显示上限（%）：超过它的按满格画。
 *  实测 P99 约 18.7%、最高 41.5%，取 20 作上限——绝大多数谱面都落在条的前半段。 */
export const HOLD_PCT_MAX = 20;
