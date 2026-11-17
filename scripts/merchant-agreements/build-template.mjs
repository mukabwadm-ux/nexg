#!/usr/bin/env node
/**
 * Builds packages/merchant-agreement/src/template.generated.ts from the Word
 * originals of the 18 NexG merchant agreements, so no clause is retyped.
 *
 *   node scripts/merchant-agreements/build-template.mjs <folder with the .docx files>
 *
 * The folder holds the files as they were exported on 2026-11-09
 * (01_NexGenius_Merchant_Agreement_Airport_Transfers.docx … 18_…). Each file
 * is matched to its agreement by the title in its document properties
 * ("Merchant Agreement – Beauty"), which must equal a title in
 * packages/contracts/src/merchant-agreements.ts.
 *
 * What it writes:
 *   - body: the paragraphs and tables every agreement shares, in order, with
 *     a slot wherever the agreements differ;
 *   - categories: for each agreement, what fills each slot;
 *   - fields: the blanks of the published PDFs ("______ (address)", the
 *     dotted cover lines, the empty notice cells), each named, with the
 *     blank text it replaces;
 *   - sourceSha256: per agreement, the SHA-256 of the original's text, so
 *     a test can prove the template still reproduces each original exactly.
 *
 * Before writing, it expands the template for every agreement and checks
 * the result against that agreement's own paragraphs, block by block. Any
 * difference stops the build. The .docx files are not kept in the repo; the
 * published PDFs under apps/web/public/legal/merchant-agreements are the
 * reference (a word-for-word match was checked on 2026-11-17).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = process.argv[2];
if (!source) {
  console.error(
    'Usage: node scripts/merchant-agreements/build-template.mjs <folder with the .docx files>',
  );
  process.exit(2);
}

/* ------------------------------------------------------------------ zip */

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('Not a zip file.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad central directory.');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, inflateRawSync(data));
    p += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/* ----------------------------------------------------------- docx → blocks */

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

function flag(rPr, tag) {
  const m = rPr.match(new RegExp(`<w:${tag}(?:\\s+w:val="([^"]*)")?\\s*/>`));
  return Boolean(m) && !['0', 'false', 'none'].includes(m[1]);
}

function runsOf(pXml) {
  const runs = [];
  const runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  let m;
  while ((m = runRe.exec(pXml))) {
    const body = m[1];
    const rPr = (body.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [, ''])[1];
    const tokens =
      /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\s*\/>|<w:tab\s*\/>|<w:br(?:\s+w:type="([^"]+)")?\s*\/>/g;
    let t;
    let text = '';
    while ((t = tokens.exec(body))) {
      if (t[0].startsWith('<w:tab')) text += '\t';
      else if (t[0].startsWith('<w:br')) text += t[2] === 'page' ? '\f' : '\n';
      else text += decode(t[1] ?? '');
    }
    if (!text) continue;
    const run = { t: text };
    if (flag(rPr, 'b')) run.b = 1;
    if (flag(rPr, 'i')) run.i = 1;
    if (/<w:u\s+w:val="(?!none)[^"]+"/.test(rPr)) run.u = 1;
    runs.push(run);
  }
  // Word splits runs at revision marks; join neighbours that look the same.
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.b === run.b && last.i === run.i && last.u === run.u) last.t += run.t;
    else merged.push({ ...run });
  }
  return merged;
}

const twips = (pPr, attr) => {
  const ind = pPr.match(/<w:ind\s+([^>]*)\/>/);
  if (!ind) return undefined;
  const v = ind[1].match(new RegExp(`w:${attr}="(\\d+)"`));
  return v ? Number(v[1]) : undefined;
};

function paragraph(pXml) {
  const pPr = (pXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [, ''])[1];
  const style = (pPr.match(/<w:pStyle\s+w:val="([^"]+)"/) || [])[1];
  const numId = (pPr.match(/<w:numId\s+w:val="([^"]+)"/) || [])[1];
  const ilvl = (pPr.match(/<w:ilvl\s+w:val="([^"]+)"/) || [])[1];
  const jc = (pPr.match(/<w:jc\s+w:val="([^"]+)"/) || [])[1];
  const block = { k: 'p' };
  if (style === 'Heading1') block.s = 'h1';
  else if (style === 'ListParagraph') block.s = 'list';
  else if (style) throw new Error(`Unexpected paragraph style ${style}`);
  if (numId === '2') block.n = Number(ilvl ?? 0);
  else if (numId === '3') block.n = 'b';
  else if (numId) throw new Error(`Unexpected numbering ${numId}`);
  if (jc === 'center') block.a = 'c';
  else if (jc === 'both') block.a = 'j';
  else if (jc === 'right') block.a = 'r';
  else if (jc && jc !== 'left' && jc !== 'start') throw new Error(`Unexpected alignment ${jc}`);
  const left = twips(pPr, 'left');
  const hanging = twips(pPr, 'hanging');
  if (left !== undefined) block.il = left;
  if (hanging !== undefined) block.ih = hanging;
  if (/<w:pageBreakBefore(?!\s+w:val="(?:0|false)")/.test(pPr)) block.pb = 1;
  block.r = runsOf(pXml.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, ''));
  return block;
}

function closeOf(src, tag, from) {
  const open = new RegExp(`<w:${tag}\\b[^>]*?(/?)>`, 'g');
  const close = `</w:${tag}>`;
  let depth = 1;
  let pos = from;
  while (depth > 0) {
    open.lastIndex = pos;
    const o = open.exec(src);
    const c = src.indexOf(close, pos);
    if (c < 0) throw new Error(`Unclosed ${tag}`);
    if (o && o.index < c) {
      if (o[1] !== '/') depth++;
      pos = o.index + o[0].length;
    } else {
      depth--;
      pos = c + close.length;
    }
  }
  return pos;
}

function blocksOf(xml) {
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)[1];
  const blocks = [];
  const top = /<w:(p|tbl|sectPr)\b[^>]*?(\/>|>)/g;
  let m;
  while ((m = top.exec(body))) {
    if (m[2] === '/>') {
      if (m[1] === 'p') blocks.push({ k: 'p', r: [] });
      continue;
    }
    const end = closeOf(body, m[1], m.index + m[0].length);
    const chunk = body.slice(m.index, end);
    if (m[1] === 'p') blocks.push(paragraph(chunk));
    else if (m[1] === 'tbl') {
      const cols = [...chunk.matchAll(/<w:gridCol\s+w:w="(\d+)"/g)].map((g) => Number(g[1]));
      const rows = [];
      for (const tr of chunk.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)) {
        const cells = [];
        for (const tc of tr[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g))
          cells.push(
            [...tc[1].matchAll(/<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g)].map((p) =>
              paragraph(p[0]),
            ),
          );
        rows.push(cells);
      }
      blocks.push({ k: 't', cols, rows });
    }
    top.lastIndex = end;
  }
  return blocks;
}

/* ------------------------------------------------------- fields and names */

/*
 * Every blank in the published agreements, by the text it is printed as.
 * Each rule names the paragraph it belongs to (by a pattern on the whole
 * paragraph's text) and the blanks inside it, in order of appearance.
 */
const COVER_DAY = '.'.repeat(30);
const COVER_MONTH_YEAR = `${'.'.repeat(48)} 2026`;
const RULES = [
  {
    where: /^DATED THE \.+ DAY OF \.+ 2026$/,
    fields: [
      ['cover_day', COVER_DAY],
      ['cover_month_year', COVER_MONTH_YEAR],
    ],
  },
  { where: /^\.{40,}$/, fields: [['merchant_cover', '.'.repeat(75)]] },
  {
    where: /^THIS MERCHANT AGREEMENT is made on the _+ day of _+, 2026$/,
    fields: [
      ['made_day', '______'],
      ['made_month_year', '____________________, 2026'],
    ],
  },
  {
    where: /^NEXGENIUS CONCIERGE LIMITED, a company duly incorporated/,
    fields: [['company_po_box', '______________']],
  },
  {
    where: /^_+ \(Merchant business name\), a business duly registered in Kenya/,
    fields: [
      ['merchant_name', '______________________________________ (Merchant business name)'],
      ['merchant_registration', '______________'],
      ['merchant_address', '______________________________________ (address)'],
      ['merchant_kra_pin', '______________'],
    ],
  },
  {
    where: /^Settlement frequency \(select on onboarding\):/,
    fields: [
      ['weekly_box', '☐'],
      ['biweekly_box', '☐'],
    ],
  },
];

/* Commission and notice tables: blanks by row label and column. */
const TABLE_FIELDS = {
  commission: (rowLabel) =>
    rowLabel.startsWith('Property Partner in-room orders')
      ? { 1: [['in_room_pct', '____']] }
      : / merchants$/.test(rowLabel)
        ? { 1: [['commission_pct', '____']] }
        : null,
  notices: (rowLabel) =>
    ({
      'Name of party': { 2: [['merchant_party', '']] },
      'Postal address': { 1: [['company_po_box', '______________']], 2: [['merchant_postal', '']] },
      'Email for notices': { 1: [['company_email', '']], 2: [['merchant_email', '']] },
      Telephone: { 1: [['company_phone', '']], 2: [['merchant_phone', '']] },
      'Designated representative (Stage 1)': {
        1: [
          ['company_rep_name', '____________________'],
          ['company_rep_title', '_____________________'],
        ],
        2: [
          ['merchant_rep_name', '____________________'],
          ['merchant_rep_title', '_____________________'],
        ],
      },
      'Senior executive (Stage 2)': { 2: [['merchant_principal', '____________________']] },
    })[rowLabel] ?? null,
};

const plainOf = (runs) => runs.map((r) => ('f' in r ? r.blank : r.t)).join('');

/* Replace the blanks, in order, inside a paragraph's runs. */
function withFields(block, fields, blanks) {
  let runs = block.r;
  for (const [id, blank] of fields) {
    blanks[id] ??= blank;
    if (blanks[id] !== blank) throw new Error(`Field ${id} has two blanks`);
    if (blank === '') {
      if (runs.some((r) => !('f' in r) && r.t !== ''))
        throw new Error(`Expected an empty cell for ${id}, found "${plainOf(runs)}"`);
      runs = [...runs, { f: id }];
      continue;
    }
    const next = [];
    let done = false;
    for (const run of runs) {
      const at = done || 'f' in run ? -1 : run.t.indexOf(blank);
      if (at < 0) {
        next.push(run);
        continue;
      }
      const { t, ...marks } = run;
      if (at > 0) next.push({ ...marks, t: t.slice(0, at) });
      next.push({ ...marks, f: id });
      if (at + blank.length < t.length) next.push({ ...marks, t: t.slice(at + blank.length) });
      done = true;
    }
    if (!done) throw new Error(`Blank for ${id} not found in "${plainOf(runs)}"`);
    runs = next;
  }
  return { ...block, r: runs };
}

/* The category's name, as it is printed, becomes a field too. */
function withCategory(block, title) {
  const upper = title.toUpperCase();
  const runs = [];
  for (const run of block.r) {
    if ('f' in run) {
      runs.push(run);
      continue;
    }
    const { t, ...marks } = run;
    const parts = t.split(new RegExp(`(${escape(title)}|${escape(upper)})`));
    parts.forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 1) runs.push({ ...marks, f: part === title ? 'category' : 'CATEGORY' });
      else runs.push({ ...marks, t: part });
    });
  }
  return { ...block, r: runs };
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function prepare(blocks, title, blanks) {
  let seenWitness = false;
  return blocks.map((block) => {
    if (block.k === 'p') {
      const text = plainOf(block.r);
      if (/^IN WITNESS WHEREOF/.test(text)) seenWitness = true;
      const rule = RULES.find((r) => r.where.test(text));
      const filled = rule ? withFields(block, rule.fields, blanks) : block;
      return withCategory(filled, title);
    }
    const header = block.rows[0].map((cell) => cell.map((p) => plainOf(p.r)).join(' '));
    let role;
    if (seenWitness && !block.role && header[0].startsWith('SIGNED')) role = 'execution';
    else if (header.join('|') === 'Merchant Category|Standard Commission|Notes')
      role = 'commission';
    else if (header.join('|') === 'Item|The Company|The Merchant') role = 'notices';
    else if (header[0] === 'No.' && header[1] === 'Step') role = 'timetable';
    else throw new Error(`Unknown table: ${header.join(' | ')}`);
    seenWitness = role === 'execution' ? false : seenWitness;
    const rows = block.rows.map((cells, rowIndex) => {
      const label = cells[0].map((p) => plainOf(p.r)).join(' ');
      const plan = rowIndex > 0 && TABLE_FIELDS[role] ? TABLE_FIELDS[role](label) : null;
      return cells.map((paragraphs, col) => {
        const fields = plan?.[col];
        if (!fields) return paragraphs.map((p) => withCategory(p, title));
        // One field per paragraph, in order (Stage 1 cells have Name and Title lines).
        if (fields.length === 1 && paragraphs.length === 1)
          return [withCategory(withFields(paragraphs[0], fields, blanks), title)];
        if (fields.length !== paragraphs.length)
          throw new Error(
            `Row "${label}" column ${col}: ${fields.length} blanks, ${paragraphs.length} lines`,
          );
        return paragraphs.map((p, i) => withCategory(withFields(p, [fields[i]], blanks), title));
      });
    });
    return { ...block, role, rows };
  });
}

/* ------------------------------------------------------------- alignment */

const key = (block) => JSON.stringify(block);

/* Longest common subsequence of two key lists: matched index pairs. */
function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/* Clause numbers as Word prints them, for naming slots. */
function sectionNames(blocks) {
  const names = [];
  let section = 'cover';
  let clause = 0;
  for (const block of blocks) {
    if (block.k === 'p') {
      const text = plainOf(block.r);
      if (/^BACKGROUND$/.test(text)) section = 'background';
      if (block.s === 'h1' && block.n === 0) section = `clause-${++clause}`;
      const annex = text.match(/^ANNEX ([A-D]) —/);
      if (annex) section = `annex-${annex[1].toLowerCase()}`;
      if (/^IN WITNESS WHEREOF/.test(text)) section = 'execution';
    }
    names.push(section);
  }
  return names;
}

function align(docs) {
  const ids = Object.keys(docs);
  const base = docs[ids[0]];
  const baseKeys = base.map(key);
  const matches = {};
  for (const id of ids) {
    const pairs = lcs(baseKeys, docs[id].map(key));
    matches[id] = new Map(pairs);
  }
  // Base blocks every agreement shares, in the same order: the anchors.
  const anchors = baseKeys.map((_, i) => i).filter((i) => ids.every((id) => matches[id].has(i)));
  const names = sectionNames(base);
  const body = [];
  const slots = Object.fromEntries(ids.map((id) => [id, {}]));
  const used = new Map();
  const gap = (from, to, label) => {
    // The blocks between two anchors, per agreement.
    const runs = Object.fromEntries(
      ids.map((id) => {
        const start = from < 0 ? 0 : matches[id].get(from) + 1;
        const end = to === undefined ? docs[id].length : matches[id].get(to);
        return [id, docs[id].slice(start, end)];
      }),
    );
    const distinct = new Set(ids.map((id) => JSON.stringify(runs[id])));
    if (distinct.size === 1) {
      body.push(...runs[ids[0]]);
      return;
    }
    const n = (used.get(label) ?? 0) + 1;
    used.set(label, n);
    const slot = n === 1 ? label : `${label}-${n}`;
    body.push({ k: 'slot', id: slot });
    for (const id of ids) slots[id][slot] = runs[id];
  };
  let previous = -1;
  for (const anchor of anchors) {
    gap(
      previous,
      anchor,
      names[Math.max(0, previous)] === names[anchor] ? names[anchor] : names[anchor],
    );
    body.push(base[anchor]);
    previous = anchor;
  }
  gap(previous, undefined, names[previous] ?? 'end');
  return { body, slots };
}

function expand(body, slots) {
  return body.flatMap((block) => (block.k === 'slot' ? slots[block.id] : [block]));
}

/* ---------------------------------------------------------------- text */

/*
 * The canonical text of an agreement with its blanks printed as blanks: one
 * line per paragraph, table cells in reading order. Must match plainText()
 * in packages/merchant-agreement/src/document.ts.
 */
function plainText(blocks, values) {
  const line = (p) => p.r.map((r) => ('f' in r ? (values[r.f] ?? '') : r.t)).join('');
  const lines = [];
  for (const block of blocks) {
    if (block.k === 'p') lines.push(line(block));
    else
      for (const row of block.rows)
        for (const cell of row) for (const p of cell) lines.push(line(p));
  }
  return lines.join('\n');
}

/* ----------------------------------------------------------------- main */

const registry = readFileSync(join(root, 'packages/contracts/src/merchant-agreements.ts'), 'utf8');
const titles = new Map(
  [...registry.matchAll(/id: '([a-z-]+)',\s*\n\s*title: '([^']+)'/g)].map((m) => [m[2], m[1]]),
);
if (titles.size !== 18)
  throw new Error(`Expected 18 agreements in the registry, found ${titles.size}`);

const files = readdirSync(source)
  .filter((f) => /^\d\d_NexGenius_Merchant_Agreement_.+\.docx$/.test(f))
  .sort();
if (files.length !== 18)
  throw new Error(`Expected 18 .docx files in ${source}, found ${files.length}`);

const blanks = {};
const docs = {};
const originals = {};
const docTitles = {};
for (const file of files) {
  const zip = unzip(readFileSync(join(source, file)));
  const core = zip.get('docProps/core.xml').toString('utf8');
  const title = decode((core.match(/<dc:title>([^<]*)<\/dc:title>/) || [])[1] ?? '').replace(
    /^Merchant Agreement – /,
    '',
  );
  const id = titles.get(title);
  if (!id) throw new Error(`${file}: title "${title}" is not in the registry`);
  const raw = blocksOf(zip.get('word/document.xml').toString('utf8'));
  originals[id] = raw;
  docTitles[id] = title;
  docs[id] = prepare(raw, title, blanks);
}

// Registry order, so the base agreement and slot order are stable.
const ordered = Object.fromEntries([...titles.values()].map((id) => [id, docs[id]]));
const { body, slots } = align(ordered);

// Each slot keeps its distinct variants once; an agreement picks one per slot.
const slotIds = body.filter((b) => b.k === 'slot').map((b) => b.id);
const variants = Object.fromEntries(slotIds.map((slot) => [slot, []]));
const categories = {};
for (const [title, id] of titles) {
  const expanded = expand(body, slots[id]);
  if (JSON.stringify(expanded) !== JSON.stringify(docs[id]))
    throw new Error(`${id}: the template does not reproduce the original`);
  const blankValues = { ...blanks, category: title, CATEGORY: title.toUpperCase() };
  const text = plainText(expanded, blankValues);
  const original = plainText(originals[id], {});
  if (text !== original) throw new Error(`${id}: text differs from the original`);
  const pick = {};
  for (const slot of slotIds) {
    const value = JSON.stringify(slots[id][slot]);
    let index = variants[slot].findIndex((v) => JSON.stringify(v) === value);
    if (index < 0) index = variants[slot].push(slots[id][slot]) - 1;
    pick[slot] = index;
  }
  categories[id] = {
    title,
    pick,
    sourceSha256: createHash('sha256').update(original, 'utf8').digest('hex'),
  };
}

const sharedBlocks = body.filter((b) => b.k !== 'slot').length;
const out = join(root, 'packages/merchant-agreement/src/template.generated.ts');
writeFileSync(
  out,
  `/* Generated by scripts/merchant-agreements/build-template.mjs from the Word
 * originals of the 18 merchant agreements. Do not edit by hand: change the
 * Word files and run the script again. Kept on one line (see .prettierignore). */
import type { AgreementTemplate } from './template';

export const TEMPLATE: AgreementTemplate = ${JSON.stringify({ blanks, body, slots: variants, categories })};
`,
);
console.log(
  `Wrote ${out}: ${sharedBlocks} shared blocks, ${slotIds.length} slots (${Object.values(variants).reduce((n, v) => n + v.length, 0)} variants), ${Object.keys(blanks).length} fields, 18 agreements reproduced exactly.`,
);
