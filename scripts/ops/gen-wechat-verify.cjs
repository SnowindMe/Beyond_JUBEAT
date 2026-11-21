#!/usr/bin/env node
'use strict';
// 微信网站管理员认证校验文件：public/<hash>.txt（内容是一串 40 位十六进制校验串）。
//
// 【2026-11-22】这个文件原先直接入库。仓库是 PUBLIC 的，等于把账号级校验凭据公开留档，
// 因此改成「构建时生成、仓库不留副本」：
//   - 内容来自环境变量 WECHAT_SITE_VERIFY；
//   - 没配变量时**什么都不做**（不删已有文件）——本地开发、以及「Actions 已经写好文件、
//     紧接着跑 npm run build」这两种情形都不会把副本抹掉；
//   - 变量存在但格式不对（不是 40 位十六进制）直接失败，不静默写坏文件。
//
// 两条构建链路都覆盖：GitHub Actions 在 build-check.yml 里有一处写入步骤（跑在 build 之前），
// Cloudflare Workers Builds 走这里的 prebuild（变量配在面板的构建环境变量里）。
const fs = require('node:fs');
const path = require('node:path');

const NAME = '8c7bceecf5d6ebbe58a0e8482e448a50.txt';
const token = (process.env.WECHAT_SITE_VERIFY || '').trim();

if (!token) {
  console.log('[wechat-verify] 未配置 WECHAT_SITE_VERIFY，跳过（保留现有文件）');
  process.exit(0);
}
if (!/^[0-9a-f]{40}$/i.test(token)) {
  console.error('[wechat-verify] WECHAT_SITE_VERIFY 不是 40 位十六进制串，拒绝写入');
  process.exit(1);
}

const out = path.join(__dirname, '..', '..', 'public', NAME);
fs.writeFileSync(out, token);
console.log('[wechat-verify] 已写入 public/' + NAME);
