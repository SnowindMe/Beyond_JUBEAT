// 世代主题（视觉皮肤）清单 —— 全站唯一的主题表。
//
// 为什么单开一个文件：主题是 html[data-g] 上的一组 CSS 变量（见 theme.css），
// 与世代（lib/gens.ts 的 GEN_ORDER）是两套口径 —— clan 一个世代在这里拆成 4 套皮肤，
// 所以主题数本来就不等于世代数。要这个数字就取 THEMES.length，别在页面里另抄一个常量。
//
// 加 / 改 / 删主题时，三处必须同动：
//   1. 这里的条目（k 同时决定 /assets/images/bg/<k>.webp 与 logo/<k>.webp；clan_* 共用 clan.webp）；
//   2. theme.css 里 html[data-g="<k>"] 那一组变量（含 --base，必须与下面的 b 同值）；
//   3. 用到的图片资源。
export type FontGroup = 'C' | 'D' | 'E' | 'F' | 'G';

export type Theme = {
  /** 内部 key：写进 html[data-g]，同时是背景图 / 字标文件名 */
  k: string;
  /** 切换器与按钮 title 上的正式写法 */
  n: string;
  /** 字形组：写进 html[data-font]，theme.css 按它挑字体族 */
  f: FontGroup;
  /** 切换器里的色点 */
  c: string;
  /** 底色：只用于首帧 theme-color 兜底（正式取值仍是 theme.css 的 --base，两边必须同值） */
  b: string;
  /**
   * 明暗：写进 html[data-lum]，画面层（反相 / 压深 / 白雾 / 去光晕）唯一的判据。
   * 必须与 theme.css 里该主题声明的 color-scheme 一致——color-scheme 是权威，
   * 这里只是它在「样式表还没到位」那一帧的影子。
   */
  l: 'light' | 'dark';
};

/** 顺序 = 世代上线先后（旧→新，主人 2026-10-20 定，别改；它同时就是切换器按钮顺序） */
export const THEMES: Theme[] = [
  { k: 'jubeat', n: 'jubeat', f: 'F', c: '#3b8fe8', b: '#050e22', l: 'dark' },
  { k: 'ripples', n: 'ripples', f: 'F', c: '#70c5b7', b: '#dfeeea', l: 'light' },
  { k: 'knit', n: 'knit', f: 'D', c: '#e0a92e', b: '#f2eee4', l: 'light' },
  { k: 'copious', n: 'copious', f: 'F', c: '#8fa6ff', b: '#080d22', l: 'dark' },
  { k: 'saucer', n: 'saucer', f: 'F', c: '#37474F', b: '#eceff1', l: 'light' },
  { k: 'saucerfulfill', n: 'saucer fulfill', f: 'F', c: '#c9d2d6', b: '#141414', l: 'dark' },
  { k: 'prop', n: 'prop', f: 'E', c: '#e0338f', b: '#f7f6f4', l: 'light' },
  { k: 'qubell', n: 'Qubell', f: 'D', c: '#3E8FBF', b: '#f4f1ea', l: 'light' },
  { k: 'clan_red', n: 'clan Red', f: 'C', c: '#ff6b6b', b: '#1a0a0c', l: 'dark' },
  { k: 'clan_blue', n: 'clan Blue', f: 'C', c: '#5c8dff', b: '#0a1424', l: 'dark' },
  { k: 'clan_green', n: 'clan Green', f: 'C', c: '#57d98a', b: '#08160f', l: 'dark' },
  { k: 'clan_purple', n: 'clan Purple', f: 'C', c: '#b07dff', b: '#120b1c', l: 'dark' },
  { k: 'festo', n: 'festo', f: 'G', c: '#ffd166', b: '#12100c', l: 'dark' },
  { k: 'ave', n: 'Ave.', f: 'F', c: '#2ee8e8', b: '#0a1418', l: 'dark' },
  { k: 'bta', n: 'Beyond the Ave.', f: 'F', c: '#ffa23c', b: '#190f08', l: 'dark' },
  { k: 'yymf', n: '音乐魔方', f: 'F', c: '#8fd0ff', b: '#e9eefb', l: 'light' },
];

/** 切换器按钮容器的 id：Header.astro 开容器、ThemeScript.astro 往里塞按钮，两处共用一个串 */
export const DOCK_ID = 'genDock';

