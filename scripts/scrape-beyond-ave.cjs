
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'C:/Users/19457/Desktop/Beyond_JUBEAT';
const TMP = path.join(BASE, 'scripts/tmp');
const DATA = path.join(BASE, 'data/beyond-the-ave');
const JACKETS = path.join(DATA, 'jackets');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const HOST = 'https://p.eagate.573.jp';
const LISTS = {
  license: '/game/jubeat/beyond/music/index.html',
  original: '/game/jubeat/beyond/music/original.html',
};

// 命名实体表：eagate 的曲名里会出现 &ecirc; / &eacute; 这类 Latin-1 命名实体，
// 早期只写了 6 个基础实体，导致 "cr&ecirc;pe suzette" 这类标题带着原始实体串进库。
// 这里补齐 HTML 4 的 Latin-1 常用集合 + 若干标点实体；未收录的实体原样保留，不猜。
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', atilde: 'ã', aring: 'å', aelig: 'æ',
  ccedil: 'ç', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö', otilde: 'õ', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', yuml: 'ÿ', szlig: 'ß',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Auml: 'Ä', Atilde: 'Ã', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Ouml: 'Ö', Otilde: 'Õ', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  Yacute: 'Ý', szlig_: 'ß',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', middot: '·', times: '×', divide: '÷', deg: '°',
  copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»', bull: '•',
};
const decodeEntities = (s) => s
  .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m)
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
const stripTags = (h) => decodeEntities(h.replace(/<[^>]*>/g, '')).trim();

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(url + ' HTTP ' + res.status);
  return res.text();
}

// 站点的翻页上限之后会回落到 page1，因此页数只能从分页条里读，不能靠试探。
function lastPage(html) {
  const nums = [...html.matchAll(/\?page=(\d+)/g)].map((m) => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) : 1;
}

function parseCards(html, page) {
  return html.split('<div class="list_data">').slice(1).map((raw) => {
    const block = raw.split('<div class="list_data">')[0];
    const img = block.match(/<img\s+src="([^"]+)"/);
    const lis = block.match(/<li>[\s\S]*?<\/li>/g) || [];
    const levelUl = block.split('</li>').slice(2).join('</li>').match(/<ul>([\s\S]*?)<\/ul>/);
    const levels = levelUl
      ? (levelUl[1].match(/<li>[\s\S]*?<\/li>/g) || []).map(stripTags)
          .filter((t) => t !== '' && t !== '/' && !/^Lv$/i.test(t))
      : [];
    return {
      page,
      title: lis[0] ? stripTags(lis[0]) : null,
      artist: lis[1] ? stripTags(lis[1]) : null,
      bsc: levels[0] ?? null,
      adv: levels[1] ?? null,
      ext: levels[2] ?? null,
      jacketSourcePath: img ? img[1] : null,
      jacketFile: img ? path.basename(img[1]) : null,
    };
  });
}

(async () => {
  fs.mkdirSync(JACKETS, { recursive: true });
  const raw = path.join(TMP, 'beyond-pages');
  fs.mkdirSync(raw, { recursive: true });

  const songs = [];
  const pages = {};
  for (const [kind, urlPath] of Object.entries(LISTS)) {
    const p1 = await get(HOST + urlPath);
    fs.writeFileSync(path.join(raw, kind + '-1.html'), p1, 'utf8');
    const total = lastPage(p1);
    pages[kind] = total;
    songs.push(...parseCards(p1, 1).map((s) => ({ ...s, category: kind })));
    for (let p = 2; p <= total; p++) {
      const html = await get(HOST + urlPath + '?page=' + p);
      fs.writeFileSync(path.join(raw, kind + '-' + p + '.html'), html, 'utf8');
      songs.push(...parseCards(html, p).map((s) => ({ ...s, category: kind })));
    }
  }

  // 曲绘下载（并发 8）
  let done = 0;
  const failed = [];
  let cursor = 0;
  async function worker() {
    while (cursor < songs.length) {
      const s = songs[cursor++];
      if (!s.jacketSourcePath) { failed.push(s.title + ': no jacket path'); continue; }
      const dest = path.join(JACKETS, s.jacketFile);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 200) { done++; continue; }
      try {
        const res = await fetch(HOST + s.jacketSourcePath, { headers: { 'user-agent': UA } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.slice(0, 3).toString('latin1') !== 'GIF') throw new Error('not gif');
        fs.writeFileSync(dest, buf);
        done++;
      } catch (e) {
        failed.push(s.jacketFile + ': ' + e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, () => worker()));

  const dataset = {
    generation: 'beyond the Ave.',
    generationShortKey: 'Ave.',
    server: 'jp',
    scrapedAt: new Date().toISOString(),
    sourceUrls: { license: HOST + LISTS.license, original: HOST + LISTS.original, jacketBase: HOST },
    pagination: pages,
    counts: {
      license: songs.filter((s) => s.category === 'license').length,
      original: songs.filter((s) => s.category === 'original').length,
      total: songs.length,
    },
    jacketDownload: { ok: done, failed: failed.length, failedSample: failed.slice(0, 10) },
    songs: songs.map((s, i) => ({
      seq: i + 1,
      category: s.category,
      page: s.page,
      title: s.title,
      artist: s.artist,
      bsc: s.bsc,
      adv: s.adv,
      ext: s.ext,
      jacketSourcePath: s.jacketSourcePath,
      jacketFile: s.jacketFile,
      jacketLocalPath: '/jackets/' + s.jacketFile,
    })),
  };
  fs.writeFileSync(path.join(DATA, 'songs.json'), JSON.stringify(dataset, null, 2), 'utf8');

  // 附带一份 CSV，方便主人直接用表格软件核对
  const cols = ['seq', 'category', 'page', 'title', 'artist', 'bsc', 'adv', 'ext', 'jacketFile'];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [cols.join(',')]
    .concat(dataset.songs.map((s) => cols.map((k) => esc(s[k])).join(',')))
    .join('\n');
  fs.writeFileSync(path.join(DATA, 'songs.csv'), '\ufeff' + csv, 'utf8');

  const alt = songs.filter((s) => /\[\s*2\s*\]/.test(s.title)).length;
  console.log(JSON.stringify({
    pages, counts: dataset.counts, jackets: dataset.jacketDownload,
    holdStyleTitles: alt,
    bytes: fs.readdirSync(JACKETS).reduce((a, f) => a + fs.statSync(path.join(JACKETS, f)).size, 0),
  }, null, 1));
})();
