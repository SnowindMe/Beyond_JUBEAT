// 被动录制：让主人在小程序里正常操作，我把每一次发往 wamusic 的请求
// 连同 body / 响应一起录下来，从中找出 music_detail 的真实参数形态。
//
// 为什么不继续猜参数：2026-10-31 我试了 6 组常见写法（songId / songid / musicId /
// id / songId+diff / songId+song_id）全部 `无 data`。与其继续穷举，不如直接录真实请求。
//
// 用法：node scripts/yyj/record-detail.mjs
//   → 起代理 127.0.0.1:8899，请主人打开小程序并点开任意一首「音乐魔方」曲子的详情。
//   → 需要系统代理指向 8899（脚本只在结束时提醒手动改回，绝不自动改系统代理）。
//
// 输出：.devhome/yyj-record.jsonl（每条一行：{time, url, reqBody, resBody}）
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { MitmProxy } from '../../archive/legacy/yyj-extractor/proxy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, '.devhome', 'yyj-record.jsonl');
const MAX_MS = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=300000').slice(6));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '');

const certDir = path.join(ROOT, 'archive/legacy/yyj-extractor/certs');
const proxy = new MitmProxy({ port: 8899, certDir, upstream: null });

let n = 0;
const log = (...a) => console.log(...a);

// 拦 HTTP 层的请求：把 reqBody 与 resBody 都记下来
const origHandleInner = proxy.handleInner.bind(proxy);
proxy.handleInner = function (host, port, req, res) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const reqBody = body.toString('utf8');
    const headers = Object.assign({}, req.headers);
    delete headers['proxy-connection'];
    headers['content-length'] = String(body.length);
    headers['host'] = host;
    const up = https.request({ host, port, path: req.url, method: req.method, headers }, (upRes) => {
      const rc = [];
      upRes.on('data', (c) => rc.push(c));
      upRes.on('end', () => {
        const rbody = Buffer.concat(rc);
        const text = rbody.toString('utf8');
        n++;
        // 只记 wamusic（曲库接口），静态资源/CDN 不记，避免文件爆掉
        if (String(host).includes('wamusic')) {
          fs.appendFileSync(OUT, JSON.stringify({
            time: new Date().toISOString(),
            path: req.url,
            reqBody,
            resBody: text.slice(0, 8000),
          }) + '\n');
          const act = (/"action"\s*:\s*"([^"]+)"/.exec(reqBody) || [])[1] || '?';
          log(`[${n}] action=${act} req=${reqBody.slice(0, 220).replace(/\s+/g, ' ')}`);
          log(`      res=${text.slice(0, 160).replace(/\s+/g, ' ')}`);
        }
        const h2 = Object.assign({}, upRes.headers);
        delete h2['content-encoding'];
        delete h2['content-length'];
        delete h2['transfer-encoding'];
        res.writeHead(upRes.statusCode, h2);
        res.end(rbody);
      });
    });
    up.on('error', () => { try { res.writeHead(502); res.end('proxy upstream error'); } catch {} });
    up.end(body);
  });
};

await proxy.start();
log('录制代理已启动 127.0.0.1:8899');
log('>>> 请把系统代理指到 127.0.0.1:8899，然后在微信里：');
log('    音游街 → 音乐魔方 → 点开任意一首曲子的【曲目详情】');
log('    每点一首就会录一条 music_detail 请求，参数形态立刻暴露。');
log('最多录制 ' + Math.round(MAX_MS / 1000) + ' 秒。');

setTimeout(() => {
  proxy.stop();
  log('');
  log('录制结束，共 ' + n + ' 次 wamusic 请求，已写入 ' + path.relative(ROOT, OUT));
  log('*** 记得把系统代理改回原状 ***');
  process.exit(0);
}, MAX_MS);