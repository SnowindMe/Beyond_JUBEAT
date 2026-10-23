#!/usr/bin/env node
/**
 * 把「音乐魔方更新歌曲.xlsx」全量解析成 JSON（纯手工解析 OOXML + 自带 ZIP 解包，零依赖）
 *
 *   node scripts/db/parse-xlsx.cjs                 默认：data/xlsx/source.xlsx -> data/xlsx/
 *   node scripts/db/parse-xlsx.cjs --xlsx=<路径>    换一份 xlsx（不必先解压）
 *   node scripts/db/parse-xlsx.cjs --out=<目录>     换产物目录
 *
 * 输入（受版本控制）：data/xlsx/source.xlsx
 *   源文件名本来是「音乐魔方更新歌曲.xlsx」，入库改名 source.xlsx 以避免非 ASCII 路径问题；
 *   原始 sha256 与采集时间见 docs/data-pipeline.md。
 * 产物（受版本控制）：data/xlsx/sheet1.json … sheet7.json + all.json
 *
 * 不再依赖 scripts/tmp：ZIP 由本脚本用 node:zlib 的 inflateRaw 自己解，省掉手工解压这一步，
 * 新机器 clone 后一条命令即可重建（见 docs/data-pipeline.md）。
 *
 * 解析覆盖：共享字符串（含富文本多 run）、inlineStr、数字/布尔/公式缓存值、
 *          &#10; 等数字实体、&amp;/&quot; 等命名实体、合并单元格空洞、空 <c/> 单元格。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '../..');
const DEFAULT_XLSX = path.join(ROOT, 'data/xlsx/source.xlsx');
const DEFAULT_OUT = path.join(ROOT, 'data/xlsx');
const REL_XLSX = 'data/xlsx/source.xlsx';

// ---------------------------------------------------------------------------
// ZIP（xlsx 就是 ZIP，只读不写；够用即可，不做 ZIP64 / 加密）
// ---------------------------------------------------------------------------

/**
 * 读出 ZIP 里全部文件的 { name -> Buffer }。
 * 长度以「中央目录」为准（本地头可能因 data descriptor 写 0），数据起点按本地头重算。
 */
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是 ZIP/xlsx（找不到 EOCD）：' + file);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('中央目录损坏 @' + p);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('本地头损坏：' + name);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, zlib.inflateRawSync(raw));
    else throw new Error('不支持的 ZIP 压缩方式 ' + method + '：' + name);
  }
  return files;
}

function readZipText(files, name) {
  const b = files.get(name);
  if (!b) throw new Error('xlsx 内缺少 ' + name);
  return b.toString('utf8').replace(/^\uFEFF/, '');
}

// ---------------------------------------------------------------------------
// XML 基础
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

/** 解码 XML 实体：命名实体 + 十进制/十六进制数字实体（&#10; / &#xA;） */
function decodeEntities(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? m : named;
  });
}

/** 取一个元素里所有 <t> 的文本拼接（富文本会拆成多个 <r><t>），忽略 <rPh> 注音 */
function collectText(xml) {
  const cleaned = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) out += decodeEntities(m[1]);
  return out;
}

function attr(tag, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"');
  const m = re.exec(tag);
  return m ? decodeEntities(m[1]) : null;
}

/**
 * 扫描指定名字的元素，正确处理自闭合标签与带引号的属性。
 * 返回 [{ attrs, body, selfClosing, end }]
 *
 * 关键点：属性值里可能出现 '>' 吗？不会，但会出现 '/'。
 * 早期版本用 <c\b[^>]*> 匹配，自闭合的 <c r="F1" s="81"/> 会把斜杠吃进属性、
 * 再走 '>' 分支，于是把后面若干个单元格的内容全吞进来（表头因此错位）。
 */
function scanTags(xml, name, from = 0) {
  const out = [];
  const open = new RegExp('<' + name + '\\b((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)>', 'g');
  open.lastIndex = from;
  let m;
  while ((m = open.exec(xml)) !== null) {
    const raw = m[1];
    const selfClosing = /\/\s*$/.test(raw);
    const attrs = selfClosing ? raw.replace(/\/\s*$/, '') : raw;
    let body = '';
    let end = open.lastIndex;
    if (!selfClosing) {
      const close = '</' + name + '>';
      const idx = xml.indexOf(close, open.lastIndex);
      if (idx === -1) { body = xml.slice(open.lastIndex); end = xml.length; }
      else { body = xml.slice(open.lastIndex, idx); end = idx + close.length; }
    }
    out.push({ attrs, body, selfClosing, end });
    open.lastIndex = end;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 共享字符串
// ---------------------------------------------------------------------------

function parseSharedStrings(files) {
  if (!files.has('xl/sharedStrings.xml')) return [];
  const xml = readZipText(files, 'xl/sharedStrings.xml');
  const strings = [];
  for (const tag of scanTags(xml, 'si')) {
    strings.push(tag.selfClosing ? '' : collectText(tag.body));
  }
  return strings;
}

// ---------------------------------------------------------------------------
// 工作表
// ---------------------------------------------------------------------------

/** "AB" -> 27（0-based 列号） */
function colToIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function indexToCol(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * 解析一张表成二维网格。
 * 返回 { maxRow, maxCol, rows: [[cell|null]], merges: [{ref, from:{r,c}, to:{r,c}}] }
 * cell = { v: string, t: 's'|'n'|'str'|'b'|'e'|'inline', f: 公式文本|null }
 */
function parseSheet(xml, shared) {
  const rows = [];
  const formulas = {};   // "L3" -> { f: 表达式, v: 缓存值 }
  let maxRow = 0;
  let maxCol = 0;

  for (const rowTag of scanTags(xml, 'row')) {
    const rNum = parseInt(attr(rowTag.attrs, 'r') || '0', 10);
    const rowIdx = (Number.isFinite(rNum) && rNum > 0) ? rNum - 1 : rows.length;
    const cells = [];
    let lastCol = -1;

    if (!rowTag.selfClosing) {
      for (const cellTag of scanTags(rowTag.body, 'c')) {
        const ref = attr(cellTag.attrs, 'r');
        const colIdx = ref ? colToIndex(ref.replace(/[0-9]+$/, '')) : lastCol + 1;
        lastCol = colIdx;
        const type = attr(cellTag.attrs, 't') || 'n';
        const cBody = cellTag.body;

        const fMatch = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(cBody);
        const formula = fMatch ? decodeEntities(fMatch[1]) : null;
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cBody);

        let value = null;
        if (type === 's') {
          const idx = vMatch ? parseInt(vMatch[1], 10) : NaN;
          value = Number.isFinite(idx) && shared[idx] !== undefined ? shared[idx] : null;
        } else if (type === 'inlineStr') {
          const isMatch = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(cBody);
          value = isMatch ? collectText(isMatch[1]) : (vMatch ? decodeEntities(vMatch[1]) : null);
        } else if (type === 'b') {
          value = vMatch ? (vMatch[1] === '1' ? 'TRUE' : 'FALSE') : null;
        } else if (type === 'str') {
          value = vMatch ? decodeEntities(vMatch[1]) : null;
        } else if (type === 'e') {
          value = vMatch ? decodeEntities(vMatch[1]) : null;
        } else {
          value = vMatch ? decodeEntities(vMatch[1]) : null;
        }

        if (formula) {
          formulas[indexToCol(colIdx) + (rowIdx + 1)] = { f: formula, v: value };
        }
        if (value !== null && value !== '') cells[colIdx] = { v: value, t: type, f: formula };
        else if (formula) cells[colIdx] = { v: null, t: type, f: formula };
      }
    }

    rows[rowIdx] = cells;
    if (rowIdx + 1 > maxRow) maxRow = rowIdx + 1;
    for (let i = 0; i < cells.length; i++) if (cells[i] && i + 1 > maxCol) maxCol = i + 1;
  }

  const merges = [];
  const mergeRe = /<mergeCell\b([^>]*)\/>/g;
  let mm;
  while ((mm = mergeRe.exec(xml)) !== null) {
    const ref = attr(mm[1], 'ref');
    if (!ref) continue;
    const [a, b] = ref.split(':');
    const from = { r: parseInt(a.replace(/^[A-Z]+/, ''), 10) - 1, c: colToIndex(a.replace(/[0-9]+$/, '')) };
    const to = b
      ? { r: parseInt(b.replace(/^[A-Z]+/, ''), 10) - 1, c: colToIndex(b.replace(/[0-9]+$/, '')) }
      : { ...from };
    merges.push({ ref, from, to });
  }

  return { maxRow, maxCol, rows, merges, formulas };
}

/** 把稀疏 cells 数组压平成值数组（null 占位），供 JSON 输出 */
function gridValues(sheet) {
  const out = [];
  for (let r = 0; r < sheet.maxRow; r++) {
    const src = sheet.rows[r] || [];
    const line = new Array(sheet.maxCol).fill(null);
    for (let c = 0; c < sheet.maxCol; c++) {
      const cell = src[c];
      if (cell && cell.v !== null && cell.v !== '') line[c] = cell.v;
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 工作簿元数据
// ---------------------------------------------------------------------------

function parseWorkbook(files) {
  const xml = readZipText(files, 'xl/workbook.xml');
  const relsXml = readZipText(files, 'xl/_rels/workbook.xml.rels');
  const relMap = new Map();
  const relRe = /<Relationship\b([^>]*)\/>/g;
  let m;
  while ((m = relRe.exec(relsXml)) !== null) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    // rels 的 Target 相对 xl/ 目录；也可能写成 /xl/worksheets/sheet1.xml
    if (id && target) relMap.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const sheets = [];
  const sheetRe = /<sheet\b([^>]*)\/>/g;
  while ((m = sheetRe.exec(xml)) !== null) {
    const name = attr(m[1], 'name');
    const state = attr(m[1], 'state');
    const rid = attr(m[1], 'r:id');
    const target = relMap.get(rid) || '';
    const entry = target ? 'xl/' + target.replace(/^\//, '') : '';
    sheets.push({ name, hidden: state === 'hidden' || state === 'veryHidden', state: state || 'visible', rid, entry });
  }

  // 筛选器范围（A1:J700 之类），用于核对「表声明范围 vs 真实数据范围」
  const filters = [];
  const dnRe = /<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g;
  while ((m = dnRe.exec(xml)) !== null) {
    const nm = attr(m[1], 'name');
    if (!nm || !/FilterDatabase/i.test(nm)) continue;
    filters.push({ name: decodeEntities(m[2]), localSheetId: attr(m[1], 'localSheetId') });
  }
  return { sheets, filters };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const xlsxArg = argv.find((a) => a.startsWith('--xlsx='));
  const outArg = argv.find((a) => a.startsWith('--out='));
  const XLSX = xlsxArg ? path.resolve(ROOT, xlsxArg.slice(7)) : DEFAULT_XLSX;
  const OUT = outArg ? path.resolve(ROOT, outArg.slice(6)) : DEFAULT_OUT;

  if (!fs.existsSync(XLSX)) {
    throw new Error('缺少输入 ' + path.relative(ROOT, XLSX) + '（源文件说明见 docs/data-pipeline.md）');
  }
  const files = readZip(XLSX);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(XLSX)).digest('hex');

  const shared = parseSharedStrings(files);
  const { sheets, filters } = parseWorkbook(files);
  fs.mkdirSync(OUT, { recursive: true });

  const sheetsOut = [];
  sheets.forEach((s, i) => {
    if (!s.entry || !files.has(s.entry)) {
      console.warn('missing sheet file: ' + s.entry);
      return;
    }
    const parsed = parseSheet(readZipText(files, s.entry), shared);
    const grid = gridValues(parsed);

    const nonEmptyRows = [];
    grid.forEach((line, idx) => {
      if (line.some((v) => v !== null && String(v).trim() !== '')) nonEmptyRows.push(idx + 1);
    });

    const doc = {
      sheetIndex: i + 1,
      sheetName: s.name,
      state: s.state,
      hidden: s.hidden,
      sourceFile: REL_XLSX + '#' + s.entry,
      maxRow: parsed.maxRow,
      maxCol: parsed.maxCol,
      declaredRange: filters.find((f) => f.localSheetId === String(i))?.name || null,
      merges: parsed.merges.map((x) => x.ref),
      formulaCount: Object.keys(parsed.formulas).length,
      formulas: parsed.formulas,
      nonEmptyRowCount: nonEmptyRows.length,
      nonEmptyRows,
      rows: grid,
    };
    const outFile = path.join(OUT, 'sheet' + (i + 1) + '.json');
    fs.writeFileSync(outFile, JSON.stringify(doc, null, 0));
    sheetsOut.push({ doc, file: outFile });
    console.log(
      'sheet' + (i + 1) + '  ' + s.name + (s.hidden ? '  [隐藏]' : '') +
      '  行=' + parsed.maxRow + ' 列=' + parsed.maxCol + ' 非空行=' + nonEmptyRows.length
    );
  });

  const all = {
    sourceXlsx: REL_XLSX,
    sourceSha256: sha256,
    sharedStringCount: shared.length,
    sheets: sheetsOut.map(({ doc }) => ({
      sheetIndex: doc.sheetIndex,
      sheetName: doc.sheetName,
      state: doc.state,
      sourceFile: doc.sourceFile,
      maxRow: doc.maxRow,
      maxCol: doc.maxCol,
      declaredRange: doc.declaredRange,
      mergeCount: doc.merges.length,
      nonEmptyRowCount: doc.nonEmptyRowCount,
      json: 'data/xlsx/sheet' + doc.sheetIndex + '.json',
    })),
  };
  fs.writeFileSync(path.join(OUT, 'all.json'), JSON.stringify(all, null, 2));
  console.log('\nsharedStrings: ' + shared.length);
  console.log('已写出 ' + sheetsOut.length + ' 个 sheet JSON + all.json -> ' + path.relative(ROOT, OUT) + '/');
}

main();
