// 压缩 public/assets/images 下的图片（原地替换）
//   node scripts/optimize-images.cjs
// 依赖 sharp（未写进 package.json，当前在根 node_modules）
//
// 两个坑，都踩过：
// 1. 必须先把源文件读进 Buffer 再处理。sharp 直接吃文件路径时会持有句柄，
//    同目录下 rename 覆盖同名源文件会报 EPERM (operation not permitted)。
// 2. 本脚本读的是已压过的图，重复跑只会越压越糊。要重压请从 git 历史取原图：
//    git worktree add 某个提交（91e698e 是最后一个未压缩提交）。
//
// 当前参数（2026-10-20 定稿，依据实际渲染尺寸与 DPR）：
//   logo    显示 285 CSS px，DPR 2 上限 570 -> 570 宽 webp q90（且只加载当前世代 1 张）
//           ripples 于 2026-10-20 换成高清抠图（源在 archive/materials/jubeat_bg/logo_raw/ripples_logo_hi.png）
//   bg      全屏铺满，按 1440 宽压 webp q62
//   jackets 显示 84 CSS px，DPR 2 上限 168 -> 取 144 webp q78
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
    const to = path.join(src, f.replace(/\.[^.]+$/, outExt));
    const buf = await handler(sharp(input));
    fs.writeFileSync(to, buf);
    if (to !== from) fs.unlinkSync(from);
    before += beforeSize;
    after += fs.statSync(to).size;
    n++;
  }
  console.log(dir + ': ' + n + ' files ' + kb(before) + ' -> ' + kb(after));
  return [before, after];
}

(async () => {
  const total = [0, 0];
  const add = (p) => { total[0] += p[0]; total[1] += p[1]; };

  // 站标：只加载当前世代那一张（见 Hero.astro + ThemeScript.astro）
  add(await convert('logo', (f) => f.endsWith('.png'),
    (s) => s.resize({ width: 570, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer(), '.webp'));

  // 背景：1440 宽 q62
  add(await convert('bg', (f) => f.endsWith('.webp') && !f.endsWith('.tmp'),
    (s) => s.resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 62, effort: 6 }).toBuffer(), '.webp'));

  // 曲绘：144 正方裁切 q78
  add(await convert('jackets', (f) => f.endsWith('.webp') && !f.endsWith('.tmp'),
    (s) => s.resize({ width: 144, height: 144, fit: 'cover' }).webp({ quality: 78, effort: 6 }).toBuffer(), '.webp'));

  console.log('TOTAL ' + kb(total[0]) + ' -> ' + kb(total[1]));
})().catch((e) => { console.error(e); process.exit(1); });