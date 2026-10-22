/// <reference types="astro/client" />

// Astro.locals 的类型定义（中间件写入、页面读取）。
// 没有这个声明，编辑器里 Astro.locals.user 全是 any / 报错。
declare namespace App {
  interface Locals {
    /** 当前登录用户；游客为 null */
    user: import('./lib/auth').AuthUser | null;
  }
}
