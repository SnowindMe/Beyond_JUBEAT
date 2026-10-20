// 生成 robots.txt / sitemap.xml（每次 build 前跑，lastmod 自动是当天）
//   node scripts/gen-seo.cjs
// 站点目前只有首页值得收录；施工中的二级页在 _redirects 里被兜到 404，
// 不写进 sitemap，避免给搜索引擎送 302 死链。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SITE = 'https://wiki.byd-ub.top';
const today = new Date().toISOString().slice(0, 10);

fs.writeFileSync(
  path.join(PUB, 'robots.txt'),
  ['User-agent: *', 'Allow: /', '', 'Sitemap: ' + SITE + '/sitemap.xml', ''].join('\n')
);

fs.writeFileSync(
  path.join(PUB, 'sitemap.xml'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    '    <loc>' + SITE + '/</loc>',
    '    <lastmod>' + today + '</lastmod>',
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n')
);

console.log('robots.txt + sitemap.xml 已生成 (lastmod ' + today + ')');
