/**
 * Pin the baseline release to the web copies of the Discovery icons.
 *
 *   node scripts/pin-web-icons.mjs           write the icon index and the approval file
 *   node scripts/pin-web-icons.mjs --check   write nothing; exit 1 if either is missing or stale
 *
 * The approved originals (ICONS/NexG_Discovery_Icons: 133 PNGs at 1254 px, 190 MB) are not in the
 * repository. assets/icons-web holds a 256 px WebP copy of each one, made from exactly the approved
 * original: assets/icons-web/manifest.json records every original's SHA-256. The release now pins
 * those copies instead, which the owner approved on 10 November 2026.
 *
 * This writes, relative to the discovery folder:
 *   assets/icons-web/NexG_Discovery_Icons_Manifest.csv   one row per category and subcategory icon
 *   discovery-engine/config/baseline-approval.v1.json   SHA-256 of the taxonomy, the configuration,
 *                                                       the index and every icon copy, and the
 *                                                       binding from each index row to its file
 *
 * Re-run it after the taxonomy or an icon copy changes, and review the diff: a changed pin is a
 * changed release.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const taxonomyPath = 'docs/discovery/TAXONOMY_V1.1.json';
const configPath = 'docs/discovery/DISCOVERY_CONFIGURATION_V1.1.json';
const iconRoot = 'assets/icons-web/';
const indexPath = `${iconRoot}NexG_Discovery_Icons_Manifest.csv`;
const approvalPath = 'discovery-engine/config/baseline-approval.v1.json';
const referencePrefix = 'references/icons-v1.1/NexG_Discovery_Icons/';
const header = 'Asset Type,Category No.,Subcategory No.,Category,Asset Label,Relative Path';
const authority =
  'Derived pins for the owner-approved baseline: the taxonomy, its configuration, and the 256 px WebP ' +
  'copy of each approved icon (assets/icons-web/manifest.json records the SHA-256 of the original each ' +
  'copy was made from). Re-pinned to the copies with the owner’s approval on 10 November 2026; ' +
  'regenerate with scripts/pin-web-icons.mjs. No mutable taxonomy or publisher signature.';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check')) {
  console.error('Usage: node scripts/pin-web-icons.mjs [--check]');
  process.exit(2);
}
const checking = args.includes('--check');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const csvCell = (value) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const readJson = async (path) => JSON.parse((await readFile(join(root, path), 'utf8')).replace(/^﻿/, ''));

/** The web copy a taxonomy icon reference names, relative to assets/icons-web. */
function copyPath(reference) {
  if (!reference.startsWith(referencePrefix) || !reference.endsWith('.png')) {
    throw new Error(`Unsupported icon reference: ${reference}`);
  }
  const relative = reference.slice(referencePrefix.length).replace(/\.png$/, '.webp');
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.webp$/.test(relative)) throw new Error(`Unsafe icon path: ${relative}`);
  if (!existsSync(join(root, iconRoot, relative))) throw new Error(`Missing web copy: ${iconRoot}${relative}`);
  return relative;
}

const taxonomy = await readJson(taxonomyPath);
const rows = [header];
const bindings = [];
const icons = [];
for (const category of [...taxonomy.categories].sort((a, b) => a.position - b.position)) {
  const main = copyPath(category.icon_reference);
  rows.push(['Main Category', String(category.position), '', category.name, category.name, main].map(csvCell).join(','));
  bindings.push({ manifestPath: main, assetPath: iconRoot + main });
  icons.push(main);
  for (const sub of [...category.subcategories].sort((a, b) => a.position - b.position)) {
    const path = copyPath(sub.icon_reference);
    rows.push(['Subcategory', String(category.position), String(sub.position), category.name, sub.name, path].map(csvCell).join(','));
    bindings.push({ manifestPath: path, assetPath: iconRoot + path });
    icons.push(path);
  }
}
if (new Set(icons).size !== icons.length) throw new Error('Two taxonomy entries share one icon file.');
const index = rows.join('\n') + '\n';

const pinned = [taxonomyPath, configPath, indexPath, ...icons.map((path) => iconRoot + path)];
const files = [];
for (const path of pinned) {
  const bytes = path === indexPath ? Buffer.from(index, 'utf8') : await readFile(join(root, path));
  files.push({ path, sha256: sha256(bytes) });
}
files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const approval = JSON.stringify({ schemaVersion: '1', authority, assetBindings: bindings, files }, null, 2) + '\n';

const targets = [
  [indexPath, index],
  [approvalPath, approval],
];
if (checking) {
  const stale = [];
  for (const [path, text] of targets) {
    const current = existsSync(join(root, path)) ? await readFile(join(root, path), 'utf8') : null;
    if (current !== text) stale.push(path);
  }
  if (stale.length) {
    console.error(`Stale or missing: ${stale.join(', ')}. Run node scripts/pin-web-icons.mjs and review the diff.`);
    process.exit(1);
  }
  console.log(`Icon pins are current: ${icons.length} icons, ${files.length} pinned files.`);
} else {
  for (const [path, text] of targets) await writeFile(join(root, path), text);
  console.log(`Wrote ${indexPath} (${icons.length} icons) and ${approvalPath} (${files.length} pinned files).`);
}
