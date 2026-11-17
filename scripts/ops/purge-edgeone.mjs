#!/usr/bin/env node
/**
 * 部署后清 EdgeOne 边缘缓存（腾讯云 EO CreatePurgeTask，Type=purge_all）。
 *
 * 【为什么需要】2026-11-17 之前每次发版都得手动去控制台点刷新：EdgeOne 会把
 * 旧 HTML 按源站的 max-age 缓存住，源站（workers.dev / wiki.byd-ub.top）已经更新、
 * 加速站（wiki-cn.byd-ub.top）却继续吐旧页。2026-11-17 事故即此：EdgeOne 拿到的是
 * 上一个版本渲染的 HTML（x-jb-cache: HIT），页面上的脚注还停在旧版本号。
 *
 * 【为什么是 purge_all 而不是逐个 URL】路径清单会随路由变化而腐化，漏一条就等于没清；
 * 整站刷新一条请求、语义明确。代价是静态资源边缘缓存一起没，下次访问回源，
 * 但静态资源本身走 /_astro 的 immutable 长缓存，回源一次即可。
 * Worker 侧 caches.default 不用管——缓存 key 里带 SITE_VERSION，发版即自动换 key。
 *
 * 【为什么要先等】本仓的部署是 Cloudflare Workers Builds 在 push 后自动做的，
 * 跟这个 workflow 并行；purge 抢在部署前跑就等于清了个寂寞。
 * 所以先轮询源站（直连 CF，绕过 EdgeOne）直到页脚出现期望版本号，再刷。
 *
 * 所需环境变量：
 *   TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY  腾讯云子账号密钥（只需 EO 刷新权限）
 *   EDGEONE_ZONE_ID                                   站点 ID（zone-3we3ellu1uc3）
 *   EXPECT_VERSION                                    期望的 src/data/site.json 版本号
 * 用法：
 *   node scripts/ops/purge-edgeone.mjs            # 等版本上线后刷新
 *   node scripts/ops/purge-edgeone.mjs --dry      # 只打印签名与请求体，不真发
 *   node scripts/ops/purge-edgeone.mjs --now      # 不等版本，立刻刷
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const HOST = 'teo.tencentcloudapi.com';
const SERVICE = 'teo';
const ACTION = 'CreatePurgeTask';
const VERSION = '2022-09-01';
const ORIGIN = 'https://wiki.byd-ub.top/'; // 直连 CF 的源站域名，绕过 EdgeOne
const WAIT_MS = 5 * 60 * 1000;
const POLL_MS = 10 * 1000;

const args = new Set(process.argv.slice(2));
const dry = args.has('--dry');
const now = args.has('--now');

const zone = process.env.EDGEONE_ZONE_ID || 'zone-3we3ellu1uc3';
const expect = process.env.EXPECT_VERSION
  || JSON.parse(fs.readFileSync(new URL('../../src/data/site.json', import.meta.url), 'utf8')).version;

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

/** TC3-HMAC-SHA256 签名（腾讯云 API 3.0 标准流程），返回可直接 fetch 的请求头 */
function sign(payload) {
  const secretId = process.env.TENCENTCLOUD_SECRET_ID;
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error('缺少 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY');

  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const contentType = 'application/json; charset=utf-8';

  // 1. 规范请求串：方法、URI、查询串、规范头、签名头列表、哈希后的 body
  const canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(body)].join('\n');

  // 2. 待签串
  const scope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', String(ts), scope, sha256Hex(canonicalRequest)].join('\n');

  // 3. 逐级派生签名密钥（日期 -> 服务 -> 请求）
  const kDate = hmac('TC3' + secretKey, date);
  const kService = hmac(kDate, SERVICE);
  const kSigning = hmac(kService, 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    body,
    headers: {
      Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Content-Type': contentType,
      Host: HOST,
      'X-TC-Action': ACTION,
      'X-TC-Version': VERSION,
      'X-TC-Timestamp': String(ts),
    },
  };
}

/** 读源站页脚版本号（直连 CF）。取不到就当还没上线 */
async function liveVersion() {
  try {
    const res = await fetch(ORIGIN + '?_=' + Date.now(), { headers: { 'cache-control': 'no-cache' } });
    const html = await res.text();
    return (html.match(/v(\d+\.\d+\.\d+)/) || [])[1] || '';
  } catch {
    return '';
  }
}

async function waitForVersion() {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const v = await liveVersion();
    if (v === expect) return v;
    if (Date.now() > deadline) {
      // 超时也继续刷：清晚了顶多清到旧内容，总比不清好；只是要在日志里留痕
      console.warn(`[purge] 等版本超时（源站 v${v || '?'}，期望 v${expect}），仍然继续刷新`);
      return v;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

const payload = { ZoneId: zone, Type: 'purge_all' };
const req = dry ? { body: JSON.stringify(payload), headers: sign(payload).headers } : sign(payload);

if (!dry && !now) {
  const v = await waitForVersion();
  console.log(`[purge] 源站已是 v${v}，开始刷新 EdgeOne 站点 ${zone}`);
}

if (dry) {
  console.log('[purge] dry run，请求体：' + req.body);
  console.log('[purge] 头：' + JSON.stringify(req.headers, null, 2));
  process.exit(0);
}

const res = await fetch(`https://${HOST}/`, { method: 'POST', headers: req.headers, body: req.body });
const json = await res.json();
const r = json.Response || {};
if (r.Error) {
  console.error(`[purge] 失败：${r.Error.Code} ${r.Error.Message}`);
  process.exit(1);
}
// 实测（2026-11-17）：成功响应只有 JobId 与空的 FailedList，**没有 TaskId**。
// 早期按文档写 TaskId 会打印 undefined，看着像没提交成功，所以两个字段都认。
if (Array.isArray(r.FailedList) && r.FailedList.length) {
  console.error(`[purge] 部分失败：${JSON.stringify(r.FailedList)}`);
  process.exit(1);
}
console.log(`[purge] 已提交：JobId=${r.JobId || r.TaskId || '?'} RequestId=${r.RequestId}`);
