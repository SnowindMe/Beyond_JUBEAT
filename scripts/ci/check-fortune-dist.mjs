// 运势机制的守门脚本（2026-11-05 新增）。
//
// 为什么需要它：fortuneOf 的采样 + GRADES 的阈值，决定的是"每个人今天抽到什么"。
// 这两处任何一处被改，分布都会变，而页面上一眼看不出偏了——旧阈值曾让 EXC 占到 31.7%、
// C/D/E 恒为 0（三张评级图永远用不上），谁也没发现。这个脚本把那串数钉住。
//
// 钉三条口径（主人 2026-11-05 看板标注后的最终形态）：
//   1. 运气值分布要在带宽内——运气值直接印在卡上、也决定评价，偏了就全站偏；
//   2. 难度跟着运气走：运气好时三首多数是挑战，运气差时多数是沉淀（TIER_W 加权）；
//   3. 评价区间要一贯到底——第三首绝不比第一首松；三首的要求逐首抬高（不再与运气逐字相等），
//      末首的下界必须等于它自己的要求（区间收到一个点）。
// 每次跑都重算 20 万样本，不看存档；改完阈值照预期表调目标带宽。
//
// 用法：node scripts/ci/check-fortune-dist.mjs
import {
  GRADES,
  TIERS,
  fortuneOf,
  gradeIndex as gi,
} from "../../src/lib/hot.ts";

const N = 200_000;
// 预期分布（‰）与容忍带宽。带宽按"手改阈值一档"的量级给，不是精度指标。
const TARGET = {
  exc: [5, 3],
  sss: [30, 8],
  ss: [100, 15],
  s: [190, 20],
  a: [280, 25],
  b: [230, 25],
  c: [110, 20],
  d: [40, 12],
  e: [15, 8],
};
// 两端运气下"该档必须占多数"的底线（%）：运气好时挑战压倒性，运气差时沉淀压倒性
const LEAN = {
  exc: { tier: "challenge", min: 60 },
  e: { tier: "sediment", min: 60 },
};

const seed = "dist-probe";
const tally = Object.fromEntries(GRADES.map((g) => [g.key, 0]));
const lean = Object.fromEntries(Object.keys(LEAN).map((h) => [h, 0]));
let luckMin = 120;
let luckMax = 0;

for (let i = 0; i < N; i++) {
  const lines = fortuneOf(seed, "a:" + i);
  if (lines.length !== 3) throw new Error("fortuneOf 必须返回三首");
  const hand = lines[0].grade;
  tally[hand]++;
  // 难度跟着运气走：两端各自要有压倒性的档
  if (LEAN[hand])
    lean[hand] += lines.filter((l) => l.tier === LEAN[hand].tier).length;
  if (new Set(lines.map((l) => l.luck)).size !== 1) {
    throw new Error(
      `三首的运气值不一致：${lines.map((l) => l.luck).join("/")}`,
    );
  }
  const luck = lines[0].luck;
  if (luck < 0 || luck > 120) throw new Error(`运气值越界：${luck}`);
  luckMin = Math.min(luckMin, luck);
  luckMax = Math.max(luckMax, luck);
  // 区间一贯到底：越靠后越紧，第三首的下界序号不许大于第一首（序号越大越松）
  if (gi(lines[2].worstGrade) > gi(lines[0].worstGrade)) {
    throw new Error(
      `区间没有一贯到底：${hand} 第一首 ${lines[0].worstGrade} / 第三首 ${lines[2].worstGrade}`,
    );
  }
  // 区间要一级一级往上收：下界从第一首到第三首只能往手气那边挪（序号不减）。
  // 手气贴到 D/E 时区间只剩一两格，坡会压平，所以判「不减」而不是「严格递减」。
  const floors = lines.map((l) => gi(l.worstGrade));
  if (!(floors[0] >= floors[1] && floors[1] >= floors[2])) {
    throw new Error(
      `区间没有逐级收窄：${hand} → ${lines.map((l) => l.worstGrade).join("/")}`,
    );
  }
  // 要求逐首抬高：序号不许变大（变大 = 变松）
  const needs = lines.map((l) => gi(l.need));
  if (!(needs[0] >= needs[1] && needs[1] >= needs[2])) {
    throw new Error(`要求没有逐首抬高：${lines.map((l) => l.need).join("/")}`);
  }
  // 最后一首的下界就是它自己的要求（区间收到一个点）
  if (lines[2].worstGrade !== lines[2].need) {
    throw new Error(
      `末首的下界应当等于要求：${lines[2].worstGrade} vs ${lines[2].need}`,
    );
  }
  // 首尾三点不能全一样——否则三行又写成一模一样。
  // 两端（exc / e）在贴上边界后会被截平成一档，所以只查中间段。
  if (
    new Set(lines.map((l) => l.need)).size < 2 &&
    gi(hand) > 0 &&
    gi(hand) < 8
  ) {
    throw new Error(`三首要求全相同：${lines[0].need}（运气 ${hand}）`);
  }
}

let bad = 0;
console.log("手气分布（‰，容忍带宽）：");
for (const g of GRADES) {
  const got = (tally[g.key] / N) * 1000;
  const [want, band] = TARGET[g.key];
  const ok = Math.abs(got - want) <= band;
  if (!ok) bad++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"} ${g.key.padEnd(4)} ${got.toFixed(1)}（预期 ${want}±${band}）`,
  );
}

console.log("难度跟着运气走 / 运气值覆盖：");
for (const [hand, rule] of Object.entries(LEAN)) {
  const avg = lean[hand] / tally[hand];
  const ok = avg * 100 >= rule.min;
  if (!ok) bad++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"} 运气 ${hand} → ${rule.tier} 平均 ${avg.toFixed(2)} 首（下限 ${rule.min / 100} 首）`,
  );
}
if (luckMin > 3 || luckMax < 117) {
  bad++;
  console.log(
    `  FAIL 运气值两端没跑满：min ${luckMin} / max ${luckMax}（应覆盖 0 与 120 附近）`,
  );
} else {
  console.log(`  PASS 运气值覆盖 ${luckMin}–${luckMax}`);
}

console.log(bad ? `\n${bad} 项不达标` : "\n全部达标");
process.exit(bad ? 1 : 0);
