// 页面标题统一成「XXX · Beyond ↑ JUBEAT ♪~」。
// 站点名后面的 ♪ 与 ~ 是品牌字的一部分，不用引号包，避免标题里出现多余符号。
export const SITE_NAME = 'Beyond ↑ JUBEAT ♪~';

export function pageTitle(name: string): string {
  return `${name} · ${SITE_NAME}`;
}
