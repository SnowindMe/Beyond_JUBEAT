/// <reference types="astro/client" />

// Astro.locals 的类型定义（中间件写入、页面读取）。
// 没有这个声明，编辑器里 Astro.locals.user 全是 any / 报错。
declare namespace App {
  interface Locals {
    /** 当前登录用户；游客为 null */
    user: import('./lib/auth').AuthUser | null;
    /**
     * Cloudflare 适配器注入的运行时上下文（node_modules/@astrojs/cloudflare 的
     * createLocals 里 Object.assign 进来）。目前只有 API 端点用它的 waitUntil
     * 做「响应先回、缓存后台写」。
     */
    cfContext: ExecutionContext;
  }
}
