// 压缩 public/assets/images 下的图片（原地替换，原图在 git 历史里）
//   node scripts/optimize-images.cjs
// 依赖 sharp（当前只装在根 node_modules，未写进 package.json）
// 注意：必须先把源文件读进 Buffer 再处理。sharp 直接吃文件路径时会持有句柄，
// 同目录下 rename 覆盖同名源文件会报 EPERM (operation not permitted)。
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(ROOT, 'public', 'assets', 'images');
const kb = (n) => Math.round(n / 1024) + 'KB';

async function convert(dir, filter, handler, outExt) {
  const src = path.join(IMG, dir);
  let before = 0, after = 0, n = 0;
  for (const f of fs.readdirSync(src).filter(filter)) {
    const from = path.join(src, f);
    const beforeSize = fs.statSync(from).size;
    const input = fs.readFileSync(from); // 先读进内存，释放文件句柄
    const meta = await sharp(input).metadata();
    const to = path.join(src, f.replace(/\.[^.]+$/, outExt));
    const buf = await handler(sharp(input), meta, beforeSize);
    fs.writeFileSync(to, buf);
    if (to !== from) fs.unlinkSync(from);
    before += beforeSize;
    after += fs.statSync(to).size;
    n++;
  }
  console.log(`${dir}: ${n} files ${kb(before)} -> ${kb(after)}`);
  return [before, after];
}

(async () => {
  const total = [0, 0];
  const add = ([b, a]) => { total[0] += b; total[1] += a; };

  // 站标：显示宽 285 CSS px，DPR 2 → 570 上限；转 WebP q88（PNG 已转完则为 0 个）
  add(await convert('logo', (f) => f.endsWith('.png'),
    (s, m) => s.resize({ width: Math.min(570, m.width) }).webp({ quality: 88, effort: 6 }).toBuffer(), '.webp'));

  // 背景：1920 → 1600 宽，q72（原本就是 webp）
  add(await convert('bg', (f) => f.endsWith('.webp') && !f.endsWith('.tmp'),
    (s, m, size) => (size < 60000 ? s.toBuffer() : s.resize({ width: 1600 }).webp({ quality: 72, effort: 6 }).toBuffer()), '.webp'));

  // 曲绘：显示 84 CSS px，DPR 2 → 168；正方形裁切，q80
  add(await convert('jackets', (f) => f.endsWith('.webp') && !f.endsWith('.tmp'),
    (s) => s.resize({ width: 168, height: 168, fit: 'cover' }).webp({ quality: 80, effort: 6 }).toBuffer(), '.webp'));

  console.log(`TOTAL ${kb(total[0])} -> ${kb(total[1])}`);
})().catch((e) => { console.error(e); process.exit(1); });
