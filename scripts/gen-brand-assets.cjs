// 生成品牌附属图：og 分享图 + iOS 图标
//   node scripts/gen-brand-assets.cjs
// og 图只做「世代背景 + 字标」，文字交给 <meta> 的 og:title，避免在无字体的
// librsvg 里排版中文翻车。
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

(async () => {
  // ---- og: 1200x630 ----
  const W = 1200, H = 630;
  const ogDir = path.join(PUB, 'assets', 'images', 'og');
  fs.mkdirSync(ogDir, { recursive: true });

  const bg = await sharp(path.join(PUB, 'assets', 'images', 'bg', 'ave.webp'))
    .resize(W, H, { fit: 'cover', position: 'center' })
    .toBuffer();

  // 压暗 + 中央柔光，保证白色字标在任何缩略尺寸下都读得出来
  const scrim = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="45%" r="70%">
          <stop offset="0" stop-color="#04121a" stop-opacity=".18"/>
          <stop offset="1" stop-color="#04121a" stop-opacity=".72"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`
  );

  // ave 的字标是纯黑线稿，站内靠 CSS `invert(1) brightness(1.12)` 提亮；
  // sharp 没有 CSS filter，用 negate + modulate 复刻同一效果。
  const logoRaw = await sharp(path.join(PUB, 'assets', 'images', 'logo', 'ave.webp'))
    .resize({ width: 560 })
    .negate({ alpha: false })
    .modulate({ brightness: 1.12 })
    .toBuffer();
  const logoMeta = await sharp(logoRaw).metadata();
  const logo = await sharp(logoRaw)
    .resize(560, Math.round((560 * logoMeta.height) / logoMeta.width), { fit: 'inside' })
    .toBuffer();
  const logoH = Math.round((560 * logoMeta.height) / logoMeta.width);

  await sharp(bg)
    .composite([
      { input: scrim, top: 0, left: 0 },
      { input: logo, top: Math.round((H - logoH) / 2) - 24, left: Math.round((W - 560) / 2) },
    ])
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(path.join(ogDir, 'cover.png'));

  // ---- apple-touch-icon: 180x180，直接渲染 favicon.svg ----
  const icon = fs.readFileSync(path.join(PUB, 'favicon.svg'));
  await sharp(icon, { density: 720 })
    .resize(180, 180, { fit: 'contain', background: { r: 11, g: 26, b: 34, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUB, 'apple-touch-icon.png'));

  for (const f of [path.join(ogDir, 'cover.png'), path.join(PUB, 'apple-touch-icon.png')]) {
    const s = fs.statSync(f);
    const m = await sharp(f).metadata();
    console.log(path.relative(ROOT, f), m.width + 'x' + m.height, s.size + 'B');
  }
})();
