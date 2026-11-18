#!/usr/bin/env node
/**
 * 把 data/ 与构建期数据产物推到 R2（beyond-jubeat-data），供 pull 与 CI 取用。
 *
 * 为什么要有这一对脚本（2026-11-18 主人：「想吧前端和数据分离，数据不进入 GitHub 仓库」）：
 * 仓库只留代码与表结构，曲库源数据（xlsx 原件、upstream 快照、RemyWiki 谱面快照、覆盖层）
 * 与生成物（data.json / songs.json / cdn.json / search-keys.json …）全部移出。
 *
 * 用法：
 *   npm run data:push                  推导出会动哪些文件，确认后推送（全量）
 *   npm run data:push -- --changed     只推内容变了的（按 md5 比 R2 对象的 ETag，一致就跳过）
 *   npm run data:push -- --only=data/xlsx  只推某个前缀
 *   npm run data:push -- --dry         只打印清单
 *
 * 【2026-11-19 主人「不想每次都要全量推送数据，可不可以加入个专用 github action」】
 * 于是有了 --changed 与 .github/workflows/data-push.yml：
 *   · --changed 对每个文件现算 sha256，和 R2 对象的 ETag 比，一致就跳过。对象只有几十个、
 *     没有上传流量，全量重推 96 个文件（238 MB，主要是音频）要十几分钟，改一个覆盖层
 *     却只能等它跑完，这才是主人嫌的地方。
 *   · 专用 Action 在 push main 后按「先拉最新 → 重跑数据管线 → 只推变化」的顺序跑，
 *     代码改动引起的数据变化（改常量、改映射）不再需要人肉全量推。
 *   · 覆盖层这类只在本地改的文件，Action 看不到，仍由本机用 --changed 推——同样只传变化的。
 *
 * 凭据：R2 的 S3 兼容接口，走 wrangler r2 object put，复用 CLOUDFLARE_API_TOKEN /
 * CLOUDFLARE_ACCOUNT_ID（CI 里是仓库 secret）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BUCKET = 'beyond-jubeat-data';
// 只推这些路径（相对仓库根）。用白名单而不是排除表：data/ 下将来长出新东西时
// 默认不会被带上，得先在这里登记，推上去的内容才可预期。
const WHITELIST = [
  'data/xlsx',
  'data/upstream',
  'data/remy',
  'data/audio-overrides.json',
  'src/data/audio-map.json',
  'data/chart-overrides.json',
  'data/cn-extra-songs.json',
  'data/cn-online-overrides.json',
  'data/gen-overrides.json',
  'data/id-fixes.json',
  'data/title-overrides.json',
  'db/seed.sql',
  'public/data/songs.json',
  // 音频原文件（2026-11-18 起）：key 就是 public/songs/<songId>.mp3，与运行时映射一致
  'public/songs',
  'src/data/data.json',
  'src/data/songs.json',
  'src/data/songs-version.json',
  'src/data/cdn.json',
  'src/data/search-keys.json',
  'src/data/difficulty-stats.json',
  'src/data/ub-charts.json',
  'src/data/ub-audio.json',
  'src/data/recent-changes.json',
];
// 这两个不进库但也别带上去：build-stamp 由构建现写、site.json 是站点配置（含版本号，
// 跟代码一起 review 才有意义）。
const dry = process.argv.includes('--dry');
const changedOnly = process.argv.includes('--changed');
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

/* content-type 按扩展名给：原先一律 application/json，2026-11-18 加入音频后
   一度让 mp3 也带着 JSON 类型（浏览器靠嗅探也播得出来，但 <audio> 的
   media type 判定、以及部分代理的转码判断都会看它，给错是隐患）。 */
function contentType(f) {
  if (f.endsWith('.mp3')) return 'audio/mpeg';
  // 分号后面不能直接跟 charset：`--content-type=text/plain; charset=utf-8` 会被 yargs
  // 按空格拆成两个参数，报 Unknown argument: charset=utf-8（2026-11-19 实撞，seed.sql 永远推不上去）。
  // 去掉 charset，默认就是 UTF-8。
  if (f.endsWith('.sql')) return 'text/plain';
  return 'application/json';
}

function walk(target, acc) {
  const abs = path.join(ROOT, target);
  if (!fs.existsSync(abs)) return acc;
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs)) walk(path.posix.join(target, name), acc);
    return acc;
  }
  acc.push(target);
  return acc;
}

/* 远端对象的 ETag，用来判「这个文件到底变没变」。
   R2 的 ETag 就是内容的 MD5（wrangler r2 object put 不分段上传，实测与本地 md5 逐位一致），
   所以本地也算 MD5 来比，不要用 sha256 —— 两端算的不是同一个函数，比出来永远不等。

   取法有个坑：**REST 的 HEAD 返 405**（2026-11-19 实撞），必须用 GET + `Range: bytes=0-0`，
   拿响应头里的 ETag，body 只有 1 字节，等于只取元数据。

   返回 null 表示「比对不了」（404 或异常），调用方一律按变了处理：宁可多传一个，也别漏。 */
async function remoteEtag(key) {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/${BUCKET}/objects/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  try {
    const r = await fetch(url, {
      headers: {
        authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        range: 'bytes=0-0',
      },
    });
    if (!r.ok) return null;
    return (r.headers.get('etag') || '').replace(/"/g, '').toLowerCase();
  } catch {
    return null;
  }
}

function md5(f) {
  return crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.error('缺 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID');
    process.exit(2);
  }
  let files = WHITELIST.reduce((acc, t) => walk(t, acc), []);
  if (onlyArg) files = files.filter((f) => f.startsWith(onlyArg));
  if (!files.length) {
    console.error('没有任何文件可推——先确认路径对不对');
    process.exit(1);
  }
  if (changedOnly) {
    // 只留内容真变了的。逐个比哈希，命中就跳过、不计失败。
    const keep = [];
    for (const f of files) {
      const et = await remoteEtag(f);
      if (et && et === md5(f)) continue;
      keep.push(f);
    }
    console.log(`增量推送：跳过多余 ${files.length - keep.length} 个，待推 ${keep.length} 个`);
    files = keep;
    if (!files.length) {
      console.log('远端已是最新，无需推送');
      return;
    }
  }
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  console.log(`待推 ${files.length} 个文件、${(bytes / 1024).toFixed(0)} KB → r2://${BUCKET}`);
  if (dry) {
    for (const f of files) console.log('  ' + f);
    return;
  }
  // 单条失败不中断：实撞过「前面全成、中间某条莫名 exit 1、单跑又正常」的网络抖动，
  // 一条挂掉就让整批白等一下午没有必要。失败的收集起来在最后统一报、并以非零码退出，
  // 这样既不会静默漏掉、也不至于整批废弃。
  const failed = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      execFileSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${f}`, `--file=${f}`, '--remote', `--content-type=${contentType(f)}`],
        // shell: true 是必须的：Windows 上 spawnSync 直接执行 npx.cmd 会 EINVAL（2026-11-18 实撞），
        // 交给 shell 解析才能起得来。路径里没有空格，不必额外加引号。
        { cwd: ROOT, shell: true, stdio: ['ignore', 'ignore', 'pipe'] }
      );
    } catch (e) {
      failed.push(f + (e.stderr ? ' :: ' + String(e.stderr).trim().split('\n').pop() : ''));
    }
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${files.length}（失败 ${failed.length}）`);
  }
  console.log(`完成：成功 ${files.length - failed.length}、失败 ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log('  失败 ' + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
