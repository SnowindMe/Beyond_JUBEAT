#!/usr/bin/env node
/**
 * 按 src/data/site.json 的版本号打 tag 并建 Release（发版自动化，2026-11-22）。
 *
 * 【为什么是同一个文件】版本号只有这一个出处——页脚 v X.X.X 读它、EdgeOne 清缓存等它上线、
 * 这次打 tag 也取它。手工另填一次版本号，就是给「tag 与页脚对不上」留口子。
 *
 * 【为什么要判重】版本号没变的情况下 main 也会推进（改样式、改文案都可能不动版本）。
 * 默认模式 silent：base tag v1.2.3 已被**别的提交**占着 → 什么都不做、正常退出，日志写清原因。
 * 代价是 tag 只代表「这个版本号的第一次出现」，不覆盖每一次提交——对「发布」语义足够的，
 * 因为同一版本号的后续提交本来就还属于同一个发布。要每个发版提交都留标记就用 --mode strict，
 * 它会退化成 v1.2.3-abc1234（仍带版本号前缀，可追溯、不静默丢弃）。两个模式都**不移动**已有 tag。
 *
 * 【为什么是注释标签】tag 打到哪个提交、什么时候、谁打的，都在 tag 对象里，
 * 而不是挂在某个可被强推改写的分支指针上。
 *
 * 用法：
 *   node scripts/ops/release-tag.mjs --ref origin/main                 # 默认 silent，判重后跳过
 *   node scripts/ops/release-tag.mjs --ref origin/main --mode strict   # 冲突时退回 <tag>-<sha7>
 *   node scripts/ops/release-tag.mjs --ref origin/main --dry           # 只算，不 tag 不 push
 *   node scripts/ops/release-tag.mjs --sha <sha> --tag v1.2.3          # 直接用给定值（补救/重跑用）
 *
 * 环境变量：GITHUB_TOKEN（gh 建 Release 用，需 contents: write）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, fallback = '') => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dry = flag('dry');
const mode = opt('mode', 'silent');
if (!['silent', 'strict'].includes(mode)) {
  console.error('--mode 只能是 silent 或 strict，收到 "' + mode + '"');
  process.exit(2);
}

const ref = opt('ref', 'HEAD');
const forcedTag = opt('tag');
const forcedSha = opt('sha');

const sh = (cmd, argv) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

/** 解析引用到提交 sha（取不到就失败退出，不要静默用 HEAD 兜） */
const revParse = (r) => sh('git', ['rev-parse', '--verify', r + '^{commit}']).trim();

/** 读某个提交里的 site.json 版本号（不依赖工作区内容，工作区可能正被别的步骤改） */
function versionAt(rev) {
  const raw = sh('git', ['show', rev + ':src/data/site.json']);
  const v = JSON.parse(raw).version;
  if (!/^\d+\.\d+\.\d+$/.test(v || '')) throw new Error('site.json 的 version 不是 X.Y.Z：' + JSON.stringify(v));
  return v;
}

/** 现有标签 → 指向的提交（没有就 null）。只看本地已取的标签。 */
function tagPointsAt(tag) {
  try {
    return sh('git', ['rev-parse', '--verify', 'refs/tags/' + tag + '^{commit}']).trim();
  } catch {
    return null;
  }
}

/** 失败时把可复制的补救命令写进 step summary，别让下一次只剩「红了一次」的记忆 */
function summary(lines) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  const text = lines.join('\n') + '\n';
  if (target) fs.appendFileSync(target, text);
  console.log(text);
}

const commit = forcedSha ? revParse(forcedSha) : revParse(ref);
const version = versionAt(forcedTag ? commit : ref);
const base = 'v' + version;

console.log('目标提交 ' + commit.slice(0, 7) + ' / 版本 ' + version + ' / 模式 ' + mode);

let tag = base;
const occupiedBy = tagPointsAt(base);
let skipped = '';

if (occupiedBy === commit) {
  console.log(base + ' 已经指向该提交，无需重复。');
} else if (occupiedBy && mode === 'silent') {
  skipped = base + ' 已指向 ' + occupiedBy.slice(0, 7) + '（版本号未变）。silent 模式跳过；' +
    '要单独留标记就用 --mode strict，它会打到 ' + base + '-' + commit.slice(0, 7) + '。';
  console.log(skipped);
} else if (occupiedBy) {
  tag = base + '-' + commit.slice(0, 7);
  console.log(base + ' 已被 ' + occupiedBy.slice(0, 7) + ' 占用，strict 模式改用 ' + tag + '。');
}

const short = commit.slice(0, 7);

if (skipped) {
  summary([
    '- 跳过：' + base,
    '- 原因：' + skipped,
    '- 手动补打：`gh workflow run release-tag -f sha=' + commit + ' -f mode=strict`',
  ]);
  process.exit(0);
}

if (tagPointsAt(tag) === commit) {
  console.log(tag + ' 已存在且指向该提交，无需重复。');
  process.exit(0);
}

const message = sh('git', ['log', '-1', '--pretty=%s', commit]).trim().slice(0, 72);

if (dry) {
  console.log('[dry] 将执行：git tag -a ' + tag + ' ' + short + ' -m <release 说明>');
  // 正文也一起预览：说明文件写没写、取到的是哪一份，dry 阶段就该看出来
  console.log('[dry] Release 正文预览：\n' + releaseBody(commit, version, tag).split('\n').slice(0, 24).join('\n'));
  process.exit(0);
}

/* 注释标签必须带作者身份，而 runner 上没有全局 git 配置：
   2026-11-22 第一次真跑就死在 fatal: empty ident name（run 44928848974）。
   用 -c 就地给身份：只作用于这一条命令，不改 runner 的全局配置，本地手跑也不受污染。 */
const IDENT = [
  '-c', 'user.name=' + (process.env.GIT_AUTHOR_NAME || 'github-actions[bot]'),
  '-c', 'user.email=' + (process.env.GIT_AUTHOR_EMAIL || '41898282+github-actions[bot]@users.noreply.github.com'),
];

try {
  sh('git', [...IDENT, 'tag', '-a', tag, commit, '-m', 'release ' + version + ' (' + short + ')\n\n' + message]);
} catch (e) {
  // 并发里另一份刚建过同一个标签：-f 安全，因为本模式从不移动已存在的标签（上面已判过）
  console.log('本地建标签失败，尝试覆盖重建：' + e.message.trim());
  sh('git', [...IDENT, 'tag', '-f', '-a', tag, commit, '-m', 'release ' + version + ' (' + short + ')\n\n' + message]);
}

try {
  sh('git', ['push', 'origin', 'refs/tags/' + tag]);
} catch (e) {
  let remote = '';
  try { remote = sh('git', ['ls-remote', '--tags', 'origin', 'refs/tags/' + tag]).trim(); } catch { /* ignore */ }
  if (remote.includes(commit)) {
    console.log('远端已有该标签且指向同一提交，push 冲突可忽略。');
  } else {
    summary([
      '- 失败：把 ' + tag + ' 推到 origin 时出错',
      '```',
      (e.stderr ? String(e.stderr) : e.message).trim().slice(0, 2000),
      '```',
      '- 补救：`git push origin refs/tags/' + tag + '`',
    ]);
    process.exit(1);
  }
}
console.log('已推送标签 ' + tag + ' → ' + short);

/* Release 正文：以人写的 docs/releases/v<版本号>.md 为准。
   2026-11-22 首次真发布当场暴露：--generate-notes 在没有上一个标签时，只能生成一条
   Full Changelog 链接，Release 页面等于空白——别人看不出这版改了什么。
   缺文件时不静默留白：退化成从提交列表自动整理，并在正文顶部与 job summary 里都标出来。 */
function releaseBody(rev, ver, tagName) {
  const notePath = 'docs/releases/v' + ver + '.md';
  let written = '';
  try { written = sh('git', ['show', rev + ':' + notePath]).trim(); } catch { /* 没写就兜底 */ }
  const slug = process.env.GITHUB_REPOSITORY || repoSlug();
  let prev = '';
  try { prev = sh('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*', commit + '^']).trim(); } catch { /* 第一版没有上一标签 */ }
  const range = prev ? prev + '..' + commit : commit;
  let commits = '';
  try {
    commits = sh('git', ['log', '--no-merges', '--pretty=- %s（%h）', range + (prev ? '' : ' -n 20')]).trim();
  } catch { /* ignore */ }
  const link = prev
    ? '**提交对比**：[`' + prev + '...' + tagName + '`](https://github.com/' + slug + '/compare/' + prev + '...' + tagName + ')'
    : '**全部提交**：https://github.com/' + slug + '/commits/' + tagName;
  if (written) return written + '\n\n---\n\n' + link + '\n';
  console.warn('缺 ' + notePath + '，Release 正文退化成自动整理的提交列表。');
  summary(['- ⚠️ 本次发版缺 `' + notePath + '`：Release 正文用的是自动整理的提交列表，建议补写后 `gh release edit ' + tagName + ' --notes-file ' + notePath + '`']);
  return [
    '> ⚠️ 这一版没有写版本说明（`' + notePath + '`）。下面是自动整理的提交列表，供参考。',
    '',
    commits || '- （取不到提交列表）',
    '',
    '---',
    '',
    link,
    '',
  ].join('\n');
}

function repoSlug() {
  const url = sh('git', ['remote', 'get-url', 'origin']).trim();
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : 'SnowindMe/Beyond_JUBEAT';
}

const bodyFile = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'release-body-' + tag + '.md');
fs.writeFileSync(bodyFile, releaseBody(commit, version, tag), 'utf8');

// 标题直接用版本号，正文来自上面组装的说明文件
try {
  console.log(sh('gh', ['release', 'create', tag, '--target', commit, '--verify-tag', '--title', 'v' + version, '--notes-file', bodyFile]).trim());
} catch (e) {
  summary([
    '- 标签 ' + tag + ' 已成功推送，但创建 Release 失败',
    '```',
    (e.stderr ? String(e.stderr) : e.message).trim().slice(0, 2000),
    '```',
    '- 补救：`gh release create ' + tag + ' --verify-tag --notes-file ' + bodyFile + '` 会把 Release 补在这个标签上',
  ]);
  process.exit(1);
}

summary(['- 已发布 ' + tag + ' → ' + short]);
