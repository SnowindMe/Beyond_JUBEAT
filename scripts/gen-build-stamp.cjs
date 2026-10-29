#!/usr/bin/env node
/**
 * 生成构建时间戳常量，供页脚「最后一次编辑」使用。
 *
 * 为什么需要它：原先 Base.astro 里直接 new Date() 取时间——
 *   静态页在**构建期**把它算定死（09:47），
 *   SSR 页（/songs/、/jubility/、/recent/ 等 prerender=false）每次请求**现算**（12:36）。
 *   结果同一站点不同页面显示不同时间，用户看来就是"每个页面的最后编辑时间都不一样"。
 *
 * 正确语义："最后一次编辑"= 最后一次上线的构建时刻，全站应当一致。
 * 所以构建前跑一次本脚本写死到 src/data/build-stamp.json，
 * 静态页与 SSR 页都 import 这个常量，天然同源。
 *
 * 时区显式按北京时间（Asia/Shanghai）：CI 跑在 UTC，直接 toISOString 会跨天。
 *
 * 用法：node scripts/gen-build-stamp.cjs（由 npm run build 在最前面调度）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'src', 'data', 'build-stamp.json');

const fmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const parts = {};
for (const { type, value } of fmt.formatToParts(new Date())) parts[type] = value;
// zh-CN 的 hourCycle 在 0 点可能给 24，需要归一到 00
const hh = parts.hour === '24' ? '00' : parts.hour;
const stamp = `${parts.year}-${parts.month}-${parts.day} ${hh}:${parts.minute}`;

fs.writeFileSync(
  DEST,
  JSON.stringify(
    {
      _comment:
        '由 scripts/gen-build-stamp.cjs 生成，勿手改。全站页脚「最后一次编辑」读这里，' +
        '保证静态页与 SSR 页显示同一时刻（构建时刻）。',
      stamp,
      builtAt: new Date().toISOString(),
    },
    null,
    2
  ) + '\n'
);

console.log('build-stamp -> ' + path.relative(ROOT, DEST) + '  (' + stamp + ')');
