// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// 混合渲染：绝大多数页面在构建期预渲染成静态 HTML（交给 Workers 静态资源层，
// 零运行时开销）；只有需要运行时数据的页面（/songs/ 查 D1）标 prerender = false，
// 由 Cloudflare 适配器产出 Worker 入口在边缘执行。
//
// prerenderEnvironment 显式设为 node：适配器默认在构建期起 workerd 预渲染，
// 本机 Windows 上 miniflare 创建 Durable Object 存储目录会被拒绝（CreateDirectory #5），
// 改用 Node 预渲染即可，产物完全一致。
export default defineConfig({
  output: 'static',
  adapter: cloudflare({
    platformProxy: { enabled: false },
    prerenderEnvironment: 'node',
  }),
  site: 'https://wiki.byd-ub.top',
  build: {
    assets: '_astro',
  },
  vite: {
    build: {
      // 关掉 sourcemap（2026-10-27 构建提速）：@astrojs/cloudflare 的 server build
      // 默认产出 41 个 .map、额外 3M 产物，打包阶段也慢。线上出错看 Worker 日志的
      // 压缩后堆栈已够定位，需要时本地单开即可。
      sourcemap: false,
    },
  },
  devToolbar: { enabled: false },
});
