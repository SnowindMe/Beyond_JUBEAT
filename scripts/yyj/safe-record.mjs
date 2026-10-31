// 安全录制包装：备份系统代理 → 设置 → 录制 → **无论如何都恢复**。
//
// 【为什么要有这一层】2026-10-31 我直接把系统代理指到 8899 就跑了抓取器，
// 进程退出后代理端口关闭、系统代理指针还在，主人那边所有网页打不开。
// 这一层把「恢复」做成 finally + 信号 + 超时三重保证，不再靠脚本末尾打印一句提示。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BACKUP = path.join(ROOT, '.tmp', 'proxy-backup.json');
const REG = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const PS = 'powershell';

function ps(cmd) {
  return execFileSync(PS, ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim();
}

function readProxy() {
  const out = ps(
    `$k = Get-ItemProperty '${REG}'; ` +
    `@{ e = $k.ProxyEnable; s = $k.ProxyServer; p = $k.AutoConfigURL } | ConvertTo-Json -Compress`
  );
  return JSON.parse(out);
}

function writeProxy(enable, server, pac) {
  const e = enable ? 1 : 0;
  const s = server ? `'${server}'` : "''";
  const a = pac ? `'${pac}'` : "''";
  ps(`Set-ItemProperty '${REG}' -Name ProxyEnable -Value ${e}; ` +
     `Set-ItemProperty '${REG}' -Name ProxyServer -Value ${s}; ` +
     `Set-ItemProperty '${REG}' -Name AutoConfigURL -Value ${a}`);
}

// ---- 1. 备份原始状态 ----
const orig = readProxy();
fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.writeFileSync(BACKUP, JSON.stringify(orig, null, 2));
console.log('已备份原始代理设置:', JSON.stringify(orig));

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  try {
    writeProxy(!!orig.e, orig.s || '', orig.p || '');
    const now = readProxy();
    console.log('已恢复系统代理:', JSON.stringify(now));
  } catch (e) {
    console.error('!!! 恢复失败，请手动把系统代理改回:', JSON.stringify(orig), e.message);
  }
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => { restore(); process.exit(130); });
}
process.on('uncaughtException', (e) => { console.error('异常:', e.message); restore(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('异常:', e && e.message); restore(); process.exit(1); });
process.on('exit', restore);

// ---- 2. 设置代理指向录制器 ----
writeProxy(true, '127.0.0.1:8899', orig.p || '');
console.log('系统代理已指向 127.0.0.1:8899（结束会自动恢复）');

// ---- 3. 起录制器 ----
const MAX_MS = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=240000').slice(6));
const { spawn } = await import('node:child_process');
const child = spawn(process.execPath,
  [path.join(ROOT, 'scripts/yyj/record-detail.mjs'), '--max=' + MAX_MS],
  { stdio: 'inherit', cwd: ROOT });

child.on('exit', (code) => {
  console.log('录制器退出 code=' + code);
  restore();
  process.exit(0);
});