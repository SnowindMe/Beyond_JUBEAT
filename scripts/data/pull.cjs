#!/usr/bin/env node
/**
 * 从 R2（beyond-jubeat-data）把数据拉回工作区，补齐 clone 后缺失的 data/ 与构建期产物。
 *
 * 本地和 CI 都在构建前跑它（package.json 的 prebuild）。已存在的文件不重复下载——
 * 本地改完数据直接构建时不必再等一遍全量拉取，CI 则因为目录是空的而拿到全部。
 *   npm run data:pull
 *   npm run data:pull -- --force   连已存在的也重下（怀疑本地脏了时用）
 *
 * 凭据同 push：CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BUCKET = 'beyond-jubeat-data';
const force = process.argv.includes('--force');

/**
 * 列远端对象。用 Cloudflare 的 REST 接口而不是 `wrangler r2 object list`——
 * 本机的 wrangler 4.156.2 里 wrangler r2 object 只认 get / put / delete 三个子命令，
 * 没有 list（2026-11-18 实撞，执行后只打帮助就退出）。REST 一次最多 1000 条、按
 * cursor 翻页；对象只有几十个，一次拿完。
 */
async function listRemote() {
  const keys = [];
  let cursor = '';
  for (;;) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?per_page=1000` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } });
    if (!res.ok) throw new Error(`列远端失败 ${res.status}：${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    for (const o of body.result || []) if (o.key) keys.push(o.key);
    // R2 的翻页信息在 result_info.cursor，空串表示到底
    const next = body.result_info && body.result_info.cursor;
    if (!next) break;
    cursor = next;
  }
  return keys;
}

async function main() {
  // 没有凭据时跳过而不是报错：本地开发常常不配 CLOUDFLARE_* 变量，
  // 而 prebuild 挂在每次 npm run build 前面，硬失败会让人以为代码坏了。
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.log('缺 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID，跳过数据拉取（本地已有文件即可构建）');
    return;
  }
  const keys = await listRemote();
  if (!keys.length) {
    console.error('远端是空的——先 npm run data:push');
    process.exit(1);
  }
  let done = 0;
  let skipped = 0;
  for (const key of keys) {
    const abs = path.join(ROOT, key);
    if (!force && fs.existsSync(abs)) { skipped++; continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['wrangler', 'r2', 'object', 'get', `${BUCKET}/${key}`, `--file=${abs}`, '--remote'],
      { cwd: ROOT, shell: true, stdio: ['ignore', 'ignore', 'inherit'] }
    );
    done++;
  }
  console.log(`完成：下载 ${done}、跳过已存在 ${skipped}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
