// Turnstile 配置（2026-10-23）。
//
// site key 是公开值——它本来就要写进 HTML 给浏览器看，进仓库没问题；
// secret 是机密，只存在于 Worker 的 secret 里（wrangler secret put），绝不进仓库。
//
// 为什么写成常量而不是读构建期环境变量：
//   本站由 Cloudflare Workers Builds 自动构建，环境变量要在控制台里另外配一遍，
//   漏配的后果是「widget 不渲染、注册按钮直接拒绝」这种静默失败。
//   site key 又不是秘密，写死在仓库里少一个出错点。
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFhJHAckw5B0GmuS';

/** 当前标签页是否该渲染人机验证 widget。
 *  本地开发（astro dev）也渲染：widget 允许 localhost / 127.0.0.1，
 *  这样注册登录流程在本地也是真的走的，不等到上线才发现问题。 */
export const TURNSTILE_ENABLED = true;
