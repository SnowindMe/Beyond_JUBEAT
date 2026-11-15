// 用 PAC 把 wahlap 流量导给录制代理的包装层（2026-11-16 主人提「用设置脚本pac去抓吧」）。
//
// 【为什么不用改 ProxyServer】本机 AutoConfigURL 指向 mihomo 的本地 PAC，
// 而 PAC 优先级高于 ProxyEnable/ProxyServer —— 只改 ProxyServer，流量照旧按 PAC 走，
// 代理端一条连接都收不到（2026-11-16 第一次尝试就是这样：8899 在听，0 次请求）。
//
// 做法：起一个本地 PAC 服务，对 *wahlap.net 返回录制代理，其余原样交给原 PAC，
// 再只把 AutoConfigURL 指过来。退出时无论因何原因都恢复原值。
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BACKUP = path.join(ROOT, '.tmp', 'pac-backup.json');
const REG = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const PS = 'powershell';
const PORT = Number((process.argv.find((a) => a.startsWith('--pac-port=')) || '--pac-port=45931').slice(11));
const PROXY = (process.argv.find((a) => a.startsWith('--proxy=')) || '--proxy=127.0.0.1:8899').slice(8);
const FALLBACK = (process.argv.find((a) => a.startsWith('--fallback=')) || '').slice(11);

const ps = (cmd) => execFileSync(PS, ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim();

const origPac = ps(`(Get-ItemProperty '${REG}').AutoConfigURL`);
const origEnable = ps(`(Get-ItemProperty '${REG}').ProxyEnable`);
fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.writeFileSync(BACKUP, JSON.stringify({ pac: origPac || '', enable: Number(origEnable) || 0 }, null, 2));
console.log('已备份原 AutoConfigURL:', origPac || '(空)', '原 ProxyEnable:', origEnable);

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  try {
    const v = origPac ? `'${origPac}'` : "''";
    ps(`Set-ItemProperty '${REG}' -Name AutoConfigURL -Value ${v}`);
    console.log('已恢复 AutoConfigURL:', (ps(`(Get-ItemProperty '${REG}').AutoConfigURL`) || '(空)'));
  } catch (e) {
    console.error('!!! 恢复失败，请手动改回 AutoConfigURL =', origPac, e.message);
  }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => { restore(); process.exit(130); });
}
process.on('uncaughtException', (e) => { console.error('异常:', e.message); restore(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('异常:', e && e.message); restore(); process.exit(1); });
process.on('exit', restore);

// PAC：目标域走录制代理；其余走原来的上游（没有就直连）。注意 PAC 里要用 isPlainHostName 之外的
// dnsDomainIs / shExpMatch 才覆盖子域。
const pacBody = `function FindProxyForURL(url, host) {
  if (dnsDomainIs(host, 'wahlap.net') || dnsDomainIs(host, 'servicewechat.com')) return 'PROXY ${PROXY}';
  return '${FALLBACK || 'DIRECT'}; DIRECT;';
}
`;
function startPac() {
  return new Promise((res) => {
    const s = http.createServer((req, rs) => {
      if (req.url.startsWith('/commands/pac') || req.url === '/pac.js') {
        rs.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' });
        rs.end(pacBody);
      } else { rs.writeHead(404); rs.end(); }
    });
    s.listen(PORT, '127.0.0.1', () => res(s));
  });
}

const MAX_MS = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=240000').slice(6));
const pacSrv = await startPac();
console.log('PAC 服务已启动 http://127.0.0.1:' + PORT + '/commands/pac');
ps(`Set-ItemProperty '${REG}' -Name AutoConfigURL -Value 'http://127.0.0.1:${PORT}/commands/pac'`);
console.log('AutoConfigURL 已指向本地 PAC（退出自动恢复）');

const { spawn } = await import('node:child_process');
const child = spawn(process.execPath, [path.join(ROOT, 'scripts/yyj/record-detail.mjs'), '--max=' + MAX_MS], { stdio: 'inherit', cwd: ROOT });
child.on('exit', () => { try { pacSrv.close(); } catch {} restore(); process.exit(0); });
