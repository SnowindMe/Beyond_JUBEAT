// 曲绘地址解析：优先走 src/data/cdn.json 的图床映射，缺映射时回退站内 /assets/images/jackets/。
//
// 【为什么 key 是 id<歌id>.webp 而不是库里现有的 cover 名】
// 图床是按天分批搬的（服务端 1200 张/日、120 张/分钟），迁移期间必然一半在图床、一半还站内，
// 所以要有映射表让两边都不裂、也不必等全搬完才上线。而曲绘本就要统一改名成 id<歌id>.webp
// （主人 2026-11-15：「记得改成 idXXX.webp 的形式再上传」），D1 的 cover 字段随后灌成同一串——
// 库、图床、CDN 三处同名，将来换床或回滚都逐一对得上。key 用规范名，改名动作就不用二次维护映射。
//
// 映射缺项时回退站内原路径：搬完之前站点照常，搬完删掉本地图也不必改代码。
// 命中映射时返回站内反代 /api/jacket/<name>（2026-11-16 起；不再把图床域名暴露给浏览器）。
import cdn from '../data/cdn.json';

const BASE = '/assets/images/jackets/';
const map: Record<string, string> = (cdn as { jackets?: Record<string, string> }).jackets ?? {};

/** 曲绘规范文件名。唯一改名口径，脚本也按这个拼目标名。 */
export function jacketName(songId: string | number): string {
  return 'id' + String(songId) + '.webp';
}

/**
 * 曲绘完整 URL。
 * @param songId 曲目 id（映射 key 的组成部分）
 * @param cover  库里当前的 cover 名，仅作回退用；缺省会退到规范名
 */
export function jacketUrl(songId: string | number | null | undefined, cover?: string | null): string {
  const bare = String(cover || '').split('/').pop() ?? '';
  // 调用方可能只有 cover、没有 songId（首页 top16 快照就没带 id）。
  // 规范名本身就是 idN.webp，从它里面抠 id 即可，不用为此改数据形状。
  // 【2026-11-22 修首页方阵 U'nit 曲绘不显示】原来只从 cover 里抠纯数字 id，
  // 占位 id（idunit-013.webp）抠不出来 → id 为空 → 直接回退站内路径 → 404。
  // 改成抠 id 前缀后的整段（数字或 unit-NNN），映射表就能命中、走 /api/jacket。
  const id = String(songId ?? '') || (bare.match(/^id(.+)\.webp$/)?.[1] ?? '');
  if (!id) return bare ? BASE + bare : '';
  // 【2026-11-16 起不再直连图床】有映射就走站内反代 /api/jacket/<name>：
  // 图床给的是 5 小时缓存、没有防盗链，直连等于每个人的浏览器都要跨境取图、
  // 还每 5 小时重取一遍。反代替成同源后由本站边缘缓存、并发 immutable 长缓存，
  // 并在那一层做 Referer 防盗链（详见 src/pages/api/jacket/[name].ts 头注释）。
  // 映射缺项（还没搬的 54 张）仍回退站内原图，搬完自然全走反代。
  if (map[jacketName(id)]) return '/api/jacket/' + jacketName(id);
  // 【2026-11-22】共享占位图这类「cover 名本身就是映射 key、和歌 id 无关」的图
  // （国服缺曲绘统一用 idph-cn.webp）：规范名没命中时再看 cover 自己有没有映射，
  // 否则会回退站内路径 → 404。
  if (bare && map[bare]) return '/api/jacket/' + bare;
  return BASE + (bare || jacketName(id));
}
