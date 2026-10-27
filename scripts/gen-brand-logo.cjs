// 生成站点品牌标识的各类产物（2026-10-27 主人给的定稿图）。
//   node scripts/gen-brand-logo.cjs
//
// 主人交付两张同稿不同底的图：
//   图一 logo.png      2048x2048 白底无透明 → PWA 应用图标 + 标签页图标（favicon）
//   图二 logo_1.png    2048x2048 透明      → 顶栏/页脚品牌字左边那个标识（替换原来的色点）
// 母版归档在 archive/materials/brand/。两图内容 bbox 完全一致（1542x1163，长宽比 1.326，
// 占画布 75.3% x 56.8%），平均像素差 0.02 —— 确认是同一稿。
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SRC_WHITE = path.join(ROOT, 'archive', 'materials', 'brand', 'logo-white.png');
const SRC_CLEAR = path.join(ROOT, 'archive', 'materials', 'brand', 'logo-transparent.png');
const OUT_LOGO = path.join(PUB, 'assets', 'images', 'logo');

/* 手写 ICO 容器（不引第三方依赖）：ICO 格式允许每帧直接内嵌一张 PNG，
   所以按规范拼好 ICONDIR + ICONDIRENTRY，后面接各帧 PNG 数据即可。 */
function buildIco(frames) {
  const n = frames.length;
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // type: 1 = icon
  head.writeUInt16LE(n, 4);
  const dir = Buffer.alloc(16 * n);
  let offset = 6 + 16 * n;
  frames.forEach((f, i) => {
    const b = i * 16;
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, b + 0); // 宽（256 记 0）
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, b + 1); // 高
    dir.writeUInt8(0, b + 2);                          // 调色板色数（PNG 帧填 0）
    dir.writeUInt8(0, b + 3);                          // reserved
    dir.writeUInt16LE(1, b + 4);                       // color planes
    dir.writeUInt16LE(32, b + 6);                      // bits per pixel
    dir.writeUInt32LE(f.buf.length, b + 8);            // 该帧数据长度
    dir.writeUInt32LE(offset, b + 12);                 // 该帧数据偏移
    offset += f.buf.length;
  });
  return Buffer.concat([head, dir, ...frames.map((f) => f.buf)]);
}

// 内容 bbox（两图一致）。透明版裁到内容再输出，避免透明边距把顶栏那行的
// 视觉左侧撑歪（img 的盒子宽度会算进 flex 间距）。
const BBOX = { left: 252, top: 448, width: 1542, height: 1163 };
const PAD = 24; // 少量余量，保留描边/光晕不被切

(async () => {
  /* 母版在 archive/materials/ 下，而该目录是 gitignore 的（项目约定：素材库留在本地，
     仓库不存二进制）——所以这个脚本只在"本机有母版"时可跑，CI/新克隆跑不了。
     这是有意的：产物（public/ 下的图标）已随仓库提交，构建不需要重新生成。
     这里给一句清楚的提示，别让它抛裸的 ENOENT。 */
  if (!fs.existsSync(SRC_WHITE) || !fs.existsSync(SRC_CLEAR)) {
    console.error('缺少品牌母版。需要以下两个文件（不在仓库里，属本地素材库）：');
    console.error('  ' + path.relative(ROOT, SRC_WHITE));
    console.error('  ' + path.relative(ROOT, SRC_CLEAR));
    console.error('把它们放回 archive/materials/brand/ 后再跑本脚本。');
    process.exit(1);
  }

  // ---------- 1) PWA 图标 + favicon（白底版，整张画布直接用）----------
  // 白底版画布本身就是「标识居中 + 留白」的构图，直接缩放即符合应用图标观感。
  const white = fs.readFileSync(SRC_WHITE);

  await sharp(white).resize(192, 192, { fit: 'cover' }).png({ compressionLevel: 9 })
    .toFile(path.join(PUB, 'icon-192.png'));
  await sharp(white).resize(512, 512, { fit: 'cover' }).png({ compressionLevel: 9 })
    .toFile(path.join(PUB, 'icon-512.png'));

  /* maskable 必须把内容收进「安全圆」：规范要求关键内容落在直径 80% 的圆内，
     即半径 = 0.4 x 边长。实测本图内容四角半径 241.5px（512 画布下）> 安全半径 204.8，
     直接套用在圆形/圆角裁切时会被切掉角。所以先整体缩到 0.848 再居中补白。 */
  const SAFE = 0.848;
  const inner = Math.round(512 * SAFE);
  const scaled = await sharp(white).resize(inner, inner, { fit: 'cover' }).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: scaled, top: Math.round((512 - inner) / 2), left: Math.round((512 - inner) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUB, 'icon-maskable-512.png'));

  await sharp(white).resize(180, 180, { fit: 'cover' }).png({ compressionLevel: 9 })
    .toFile(path.join(PUB, 'apple-touch-icon.png'));

  /* favicon 用「裁到内容」的版本，不要整张 2048 画布：画布里内容只占 75.3% x 56.8%，
     直接缩放会让标识缩成中间一条、四周全是白，16px 的标签页上看着就像没图标。
     裁到内容再按 contain 放进正方形，标识高度能从 ~18px 提到 ~25px。 */
  const FAV_PAD = 60;
  const WHITE_BG = { r: 255, g: 255, b: 255, alpha: 1 };
  const whiteCrop = await sharp(white).extract({
    left: Math.max(0, BBOX.left - FAV_PAD),
    top: Math.max(0, BBOX.top - FAV_PAD),
    width: BBOX.width + FAV_PAD * 2,
    height: BBOX.height + FAV_PAD * 2,
  }).png().toBuffer();

  const favicon = async (size) => sharp(whiteCrop)
    .resize(size, size, { fit: 'contain', background: WHITE_BG })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 }).toBuffer();

  const fav16 = await favicon(16);
  const fav32 = await favicon(32);
  fs.writeFileSync(path.join(PUB, 'favicon-16.png'), fav16);
  fs.writeFileSync(path.join(PUB, 'favicon-32.png'), fav32);

  /* 多尺寸 ICO：不少浏览器仍会自动请求 /favicon.ico（取不到就退回默认图标），
     给一个 16/32/48 的就能覆盖，顺带省掉一次 404 请求。 */
  fs.writeFileSync(path.join(PUB, 'favicon.ico'), buildIco([
    { size: 16, buf: fav16 },
    { size: 32, buf: fav32 },
    { size: 48, buf: await favicon(48) },
  ]));

  // ---------- 2) 顶栏标识（透明版，裁到内容）----------
  fs.mkdirSync(OUT_LOGO, { recursive: true });
  const crop = {
    left: Math.max(0, BBOX.left - PAD),
    top: Math.max(0, BBOX.top - PAD),
    width: BBOX.width + PAD * 2,
    height: BBOX.height + PAD * 2,
  };
  const trimmed = await sharp(fs.readFileSync(SRC_CLEAR)).extract(crop).png().toBuffer();

  // 顶栏按 2x 供图（显示高 24px → 出 48px 高），窄屏另有更小档位
  await sharp(trimmed).resize({ height: 96 }).webp({ quality: 92, effort: 6, alphaQuality: 100 })
    .toFile(path.join(OUT_LOGO, 'brand.webp'));

  const report = async (f) => {
    // sharp 读不了 ICO 容器，单独报一下体积
    if (f.endsWith('.ico')) {
      console.log(path.relative(ROOT, f), fs.statSync(f).size + 'B', '(ICO: 16/32/48 三帧)');
      return;
    }
    const m = await sharp(f).metadata();
    console.log(path.relative(ROOT, f), m.width + 'x' + m.height, fs.statSync(f).size + 'B', m.hasAlpha ? '有透明' : '无透明');
  };
  for (const f of [
    path.join(PUB, 'icon-192.png'), path.join(PUB, 'icon-512.png'),
    path.join(PUB, 'icon-maskable-512.png'), path.join(PUB, 'apple-touch-icon.png'),
    path.join(PUB, 'favicon-32.png'), path.join(PUB, 'favicon-16.png'), path.join(PUB, 'favicon.ico'),
    path.join(OUT_LOGO, 'brand.webp'),
  ]) await report(f);
})();
