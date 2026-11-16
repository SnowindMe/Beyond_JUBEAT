// 把曲绘搬到图床：按 id<歌id>.webp 改名上传，成功后把本地文件移进 archive/（保留副本、出仓库）。
//
//   node scripts/cdn-jackets.cjs --token=<Bearer> [--limit=N] [--dry]
//
// 【为什么要改名】仓库里的曲绘 155 张是历史 hash 名（3a20d75cb9.webp），
// 和图床自动生成的随机名一样看不出是哪个 id。主人要求统一成 id<歌id>.webp：
// 源站、图床、CDN 三处的文件名一致，将来换图床或回滚时逐一对得上，
// 也不会因为图床改名而出现"同一张图两个名字"。
//
// 【本地副本】上传成功才移动，源文件进 archive/materials/jackets/（
// archive/ 在 .gitignore 里，本地留档、不占仓库）。中断时已传的那张映射已落盘，
// 重跑会跳过；文件若还在原地也无害。
//
// 【配额】图床三道闸：每天 1200 张、每小时 600 张、每分钟 120 张。
// 脚本按 1200/590/115 自我节流（各留余量），日额度用完就明天再跑。
// 配额、小时窗口与映射全部落盘，进程被杀也能断点续传，不会重算额度再撞 429。
//
// 【查重】上传前先把目标相册（默认 135 = Jubeat）的现有文件名拉成一册，同名的直接复用
// 图床地址、不重传（主人 2026-11-16「上传到图床之前，先去看看相册有没有该照片」）。
// 复用会同时写映射、把本地文件移进 archive/，但**不扣配额**——它根本没占一次上传。
// 拉全册是每页 100 条的翻页 GET，比逐张查省得多；相册是空的或接口挂了就退化成全部上传。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(ROOT, 'public', 'assets', 'images', 'jackets');
const KEEP = path.join(ROOT, 'archive', 'materials', 'jackets');
const MAP_FILE = path.join(ROOT, 'src', 'data', 'cdn.json');
const QUOTA_FILE = path.join(ROOT, '.cdn-quota.json');
const API = 'https://tc.mofashi.ltd/api/v1/upload';
const LIST_API = 'https://tc.mofashi.ltd/api/v1/images';
const DAILY_CAP = 1200;

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const TOKEN = args.token || process.env.IMG_TOKEN || '';
const LIMIT = Number(args.limit || 0) || Infinity;
const CONCURRENCY = Number(args.concurrency || 4);
const DRY = 'dry' in args;
const ALBUM = String(args.album || 135);

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const map = readJson(MAP_FILE, { base: '', jackets: {} });
map.jackets ||= {};

function saveMap() {
  const tmp = MAP_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(map));
  fs.renameSync(tmp, MAP_FILE);
}

const today = new Date().toISOString().slice(0, 10);
const quota = readJson(QUOTA_FILE, { date: '', count: 0, hourStart: 0, hourCount: 0 });
if (quota.date !== today) { quota.date = today; quota.count = 0; quota.hourStart = 0; quota.hourCount = 0; }
// 小时窗口也落盘：进程重启后若还在一小时内，要接着用完的额度等，别又从 0 数起再撞 429。
if (!quota.hourStart || Date.now() - quota.hourStart >= 3600000) { quota.hourStart = Date.now(); quota.hourCount = 0; }

// cover 文件名 -> 目标名 id<歌id>.webp。只做主表里被引用到的那些。
function buildJobs() {
  const songs = require('../src/data/songs.json');
  const arr = Array.isArray(songs) ? songs : (songs.songs || Object.values(songs)[0]);
  const jobs = [];
  for (const s of arr) {
    if (!s.cover || !s.id) continue;
    // 映射的 key 用**规范名** id<歌id>.webp，而不是库里现在的 cover 名：
    // 曲绘本身就要改成这个名字（主人 2026-11-15「记得改成 idXXX.webp 的形式再上传」），
    // 且 D1 的 cover 字段随后灌成同一串，于是库 / 图床 / CDN 三处同名。
    const target = 'id' + s.id + '.webp';
    if (map.jackets[target]) continue;
    const src = path.join(IMG, s.cover);
    if (!fs.existsSync(src)) continue;
    jobs.push({ cover: s.cover, target, src });
  }
  return jobs.sort((a, b) => a.target.localeCompare(b.target));
}

// 拉相册全册文件名 -> 图床地址。翻到 current_page >= last_page 即止；任何异常返回 null，
// 调用方据此跳过查重（宁可贵一点重传，也别因为查重挂了整批停下）。
async function fetchAlbumIndex(album) {
  const seen = new Map();
  for (let page = 1; page <= 40; page++) {
    const res = await fetch(LIST_API + '?album_id=' + album + '&per_page=100&page=' + page, {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + TOKEN },
    });
    if (!res.ok) return null;
    let json; try { json = await res.json(); } catch { return null; }
    const rows = json?.data?.data;
    if (!Array.isArray(rows)) return null;
    for (const r of rows) if (r?.origin_name && r?.links?.url) seen.set(r.origin_name, r.links.url);
    const last = json?.data?.last_page || 1;
    if (page >= last || rows.length === 0) break;
  }
  return seen;
}

async function uploadOne(job) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(job.src)]), job.target);
  form.append('filename', job.target);
  const res = await fetch(API, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: form,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error('HTTP ' + res.status + ' 非 JSON'); }
  // 42900 是限流，但两条闸的处置不同：分钟闸等一分钟就过，小时闸得等到整点，
  // 消息里带「每小时内」的就是后者，单独标出来，否则会每分钟空撞一次。
  if (json.code === 42900 || /频|quota/i.test(json.message || '')) {
    const e = new Error('限流：' + json.message);
    e.rateLimited = true;
    e.hourly = /小时内|hour/i.test(json.message || '');
    throw e;
  }
  if (!json.status || !json.data?.links?.url) throw new Error('HTTP ' + res.status + ' code ' + json.code + ' ' + json.message);
  return json.data.links.url;
}

async function main() {
  const pending = buildJobs();
  console.log('待传 ' + pending.length + ' 张曲绘；今日已用 ' + quota.count + '/' + DAILY_CAP);
  if (DRY) { pending.slice(0, 8).forEach((j) => console.log('  ' + j.cover + ' -> ' + j.target)); return 0; }
  fs.mkdirSync(KEEP, { recursive: true });

  // 查重：相册里已有的直接复用地址，不重传、不扣配额。索引拿不到就整批照传。
  let all = pending;
  let reused = 0;
  if (pending.length) {
    const idx = await fetchAlbumIndex(ALBUM);
    if (idx) {
      all = [];
      for (const job of pending) {
        const hit = idx.get(job.target);
        if (!hit) { all.push(job); continue; }
        map.jackets[job.target] = hit;
        try { fs.renameSync(job.src, path.join(KEEP, job.cover)); } catch {}
        reused++;
      }
      saveMap();
      console.log('相册已有 ' + reused + ' 张，复用不重传；实传 ' + all.length + ' 张');
    } else {
      console.log('相册索引拉取失败（' + LIST_API + '），本次不查重');
    }
  }

  // 【节流】服务端两道上限：120 张/分钟、600 张/小时（主人 2026-11-15 补的）。
  // 撞上去只会连续吃 429，所以两条都主动排队、各留 5 张余量吸收并发抖动。
  const PER_MIN = 115;
  const PER_HOUR = 590;
  let windowStart = Date.now();
  let windowCount = 0;
  let hourStart = quota.hourStart;
  let hourCount = quota.hourCount || 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function throttle() {
    if (hourCount >= PER_HOUR) {
      const wait = 3600000 - (Date.now() - hourStart);
      if (wait > 0) { process.stdout.write('\r小时额度用完，等 ' + Math.ceil(wait / 1000) + 's  '); await sleep(wait); }
      hourStart = Date.now(); hourCount = 0;
      quota.hourStart = hourStart; quota.hourCount = 0;
      fs.writeFileSync(QUOTA_FILE, JSON.stringify(quota));
    }
    if (windowCount >= PER_MIN) {
      const wait = 60000 - (Date.now() - windowStart);
      if (wait > 0) { process.stdout.write('\r节流 ' + Math.ceil(wait / 1000) + 's  '); await sleep(wait); }
      windowStart = Date.now(); windowCount = 0;
    }
    windowCount++; hourCount++;
    quota.hourStart = hourStart; quota.hourCount = hourCount;
  }
  const queue = all.slice();
  let done = 0, stop = false;
  const failures = new Map();
  async function worker() {
    while (queue.length && !stop) {
      if (quota.count >= DAILY_CAP || done >= LIMIT) { stop = true; break; }
      const job = queue.shift();
      let tries = 0;
      while (tries < 3) {
        tries++;
        try {
          await throttle();
          const url = await uploadOne(job);
          map.jackets[job.target] = url;
          quota.count++; done++;
          saveMap();
          fs.writeFileSync(QUOTA_FILE, JSON.stringify(quota));
          fs.renameSync(job.src, path.join(KEEP, job.cover));
          failures.delete(job.target);
          process.stdout.write('\r已传 ' + done + ' / 剩 ' + queue.length + '  ');
          break;
        } catch (err) {
          if (err.rateLimited) {
            tries--;
            if (err.hourly) {
              // 小时额度用尽：等到小时窗口翻页。记成用满，别的并发 worker 也会跟着停。
              hourCount = PER_HOUR; quota.hourCount = hourCount;
              fs.writeFileSync(QUOTA_FILE, JSON.stringify(quota));
              const wait = Math.max(3600000 - (Date.now() - hourStart), 30000);
              process.stdout.write('\r小时额度用尽，等 ' + Math.ceil(wait / 1000) + 's  ');
              await sleep(wait);
              hourStart = Date.now(); hourCount = 0;
              quota.hourStart = hourStart; quota.hourCount = 0;
              windowStart = Date.now(); windowCount = 0;
              fs.writeFileSync(QUOTA_FILE, JSON.stringify(quota));
              continue;
            }
            // 分钟闸：推到下一分钟再试同一张
            const wait = 60000 - (Date.now() - windowStart);
            windowStart = Date.now(); windowCount = 0;
            await sleep(Math.max(wait, 20000));
            continue;
          }
          if (tries < 3) { await new Promise((r) => setTimeout(r, 500 * tries)); continue; }
          failures.set(job.target, err.message);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, 8) }, worker));
  console.log('\n成功 ' + done + ' 失败 ' + failures.size + ' 映射共 ' + Object.keys(map.jackets).length);
  [...failures].slice(0, 10).forEach(([k, m]) => console.log('  ' + k + ' -> ' + m));
  return failures.size ? 1 : 0;
}
main().then((c) => process.exit(c));

