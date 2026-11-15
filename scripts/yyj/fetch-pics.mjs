// 下载曲绘 PNG → public/assets/images/jackets/id<歌id>.webp（2026-11-16）。
// 曲绘真名是接口里的 pic 字段（music-st.wahlap.net/wazone-jubeat/...），cover/img 一直是 null。
// 尺寸按 optimize-images.cjs 的既有定稿：详情页封面 208 CSS px → 208 宽 webp q84。
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, '.devhome', 'yyj-today.json');
const OUT = path.join(ROOT, 'public', 'assets', 'images', 'jackets');
const REFERER = 'https://servicewechat.com/wx133c9dfee00bbfec/60/page-frame.html';

const get = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { Referer: REFERER, 'User-Agent': 'Mozilla/5.0 MicroMessenger/7.0.20' } }, (res) => {
    if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
    const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => resolve(Buffer.concat(c)));
  }).on('error', reject);
});

const d = JSON.parse(fs.readFileSync(SRC, 'utf8')).details;
let ok = 0;
for (const [id, v] of Object.entries(d)) {
  const pic = ['bsc', 'adv', 'ext'].map((k) => v.detail?.[k]?.pic).find(Boolean);
  if (!pic) { console.log(id, v.name, '→ 无 pic'); continue; }
  const png = await get(pic);
  const webp = await sharp(png).resize({ width: 208, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  const to = path.join(OUT, 'id' + id + '.webp');
  // 先读进内存再写：sharp 持有句柄时 rename 覆盖会 EPERM（optimize-images.cjs 记过同一个坑）
  fs.writeFileSync(to, webp);
  console.log(id, v.name, '→', path.basename(to), Math.round(webp.length / 1024) + 'KB');
  ok++;
}
console.log('完成', ok, '张');
