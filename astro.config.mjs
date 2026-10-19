// @ts-check
import { defineConfig } from 'astro/config';

// 纯静态站：所有页面在构建时预渲染成 HTML，产物 dist/ 交给 Cloudflare Workers 静态资源层。
// 以后要接数据库（D1）时，加 @astrojs/cloudflare 适配器并把需要的页面设成
// `export const prerender = false` 即可，其余页面仍然是纯静态。
export default defineConfig({
  output: 'static',
  site: 'https://wiki.byd-ub.top',
  build: {
    // Astro 自己产出的 JS/CSS 放 /_astro/，public/ 下的资源原样留在 /assets/ 等路径
    assets: '_astro',
  },
  devToolbar: { enabled: false },
});
