// CSP 违规上报端点：POST /api/csp-report
//
// 接收者是浏览器，不是人：只要有一条规则被违反，浏览器就会往 report-uri 指的这里
// 塞一份 application/csp-report（老格式，body 是 {"csp-report":{...}}）。
// 现在 public/_headers 里那条策略还是 Report-Only，所以这里目前**只收集、不拦**。
//
// 【为什么不落库】违规量的量级是「改一次内联脚本冒几条」，不是访问量级别；
// 落 D1 要为它多开一张表、多写一份保留策略，而现在连一条真实违规都还没有。
// 先打到 Worker 日志（wrangler tail / 面板里能看），攒够再决定要不要建表。
//
// 【安全】端点公开、无鉴权，任何人可以 POST 进来把日志刷满，所以：
//   · 只收 POST，其余 405；
//   · body 上限 16KB（正常报告 2–4KB，超了直接丢）——挡大包；
//   · 每份报告只摘 6 个字段、每个截断到 300 字，不让一条长 URL 把一整屏日志糊掉；
//   · 永远回 204：浏览器不重试也不显示，出错更不能把 500 甩给页面。

import type { APIRoute } from 'astro';

export const prerender = false;

const MAX_BODY = 16 * 1024;
const FIELD_CAP = 300;

/** 报告里值得看的字段。其余（status-code / script-sample 之类）要么恒为 200，要么是噪音。 */
const FIELDS = [
  'document-uri',
  'violated-directive',
  'effective-directive',
  'blocked-uri',
  'source-file',
  'line-number',
] as const;

const clip = (v: unknown) => (typeof v === 'string' ? v.slice(0, FIELD_CAP) : '');
const noContent = { status: 204, headers: { 'cache-control': 'no-store' } };

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return new Response(null, noContent);

    const parsed = JSON.parse(raw) as { 'csp-report'?: Record<string, unknown> };
    const r = parsed?.['csp-report'];
    if (!r || typeof r !== 'object') return new Response(null, noContent);

    const picked: Record<string, string> = {};
    for (const f of FIELDS) picked[f] = clip(r[f]);
    // 单行 JSON：日志按行切，换行会把一条报告拆成好几行
    console.log('[csp]', JSON.stringify(picked));
  } catch {
    // 空 body、非 JSON、字段结构不对：都不值得让浏览器重试
  }
  return new Response(null, noContent);
};

/** 有人直接用浏览器打开这个地址时给一句人话，而不是 405 */
export const GET: APIRoute = () =>
  new Response('POST only.（CSP report-uri 端点）', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
