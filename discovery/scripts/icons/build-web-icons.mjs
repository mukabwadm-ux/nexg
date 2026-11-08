/**
 * Web-sized copies of the Discovery taxonomy icons.
 *
 *   node scripts/icons/build-web-icons.mjs           write the copies, reusing any whose original is unchanged
 *   node scripts/icons/build-web-icons.mjs --force   re-encode every copy
 *   node scripts/icons/build-web-icons.mjs --check   write nothing; exit 1 if a copy or the module is missing or stale
 *
 * The approved pack in ICONS/NexG_Discovery_Icons holds 1254 px PNGs of up to 2.6 MB each. The rails draw
 * an icon at about 84 CSS px, so a 256 px WebP stays sharp on 3x screens at a fraction of the weight.
 *
 * For every icon the taxonomy references (categories and subcategories, mapped to files the same way as the
 * /icons/ route in vite.config.ts) this writes:
 *   assets/icons-web/<same relative path>.webp   256 px on the longest side, WebP quality 80, transparency kept
 *   assets/icons-web/manifest.json               size and SHA-256 of each original and its copy
 *   src/data/webIcons.generated.ts               icon path -> bundled URL, read by iconUrl in src/data/taxonomy.ts
 *
 * The originals are hash-pinned by the engine's baseline approval and NEXG APP's asset checks, so they are only
 * read here, and an original that no longer matches its approved hash stops the build.
 *
 * sharp is not a dependency of this project. The script imports "sharp" when it resolves, then the copy named by
 * NEXG_SHARP_PATH, then the copy installed in Derrick NexG. It never downloads anything.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative as relativePath, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const paths = {
  taxonomy: join(root, 'docs/discovery/TAXONOMY_V1.1.json'),
  approval: join(root, 'discovery-engine/config/baseline-approval.v1.json'),
  icons: join(root, 'ICONS/NexG_Discovery_Icons'),
  output: join(root, 'assets/icons-web'),
  manifest: join(root, 'assets/icons-web/manifest.json'),
  module: join(root, 'src/data/webIcons.generated.ts'),
};
const referencePrefix = 'references/icons-v1.1/NexG_Discovery_Icons/';
const approvalPrefix = 'ICONS/NexG_Discovery_Icons/';
// Without sharp installed here, point NEXG_SHARP_PATH at an installed copy, e.g. a sibling pnpm store's
// node_modules/.pnpm/sharp@0.34.5/node_modules/sharp.
const derrickSharp = undefined;
const settings = { size: 256, format: 'webp', quality: 80 };

const args = process.argv.slice(2);
const usage = 'Usage: node scripts/icons/build-web-icons.mjs [--check | --force]';
if (args.some((arg) => arg !== '--check' && arg !== '--force') || args.length > 1) {
  console.error(usage);
  process.exit(2);
}
const checking = args.includes('--check');
const forcing = args.includes('--force');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const kilobytes = (bytes) => `${Math.round(bytes / 1024)} KB`;
/** Resolve a path under `base`, refusing anything that escapes it. */
function inside(base, ...segments) {
  const file = join(base, ...segments);
  const child = relativePath(base, file);
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error(`Path escapes ${base}: ${file}`);
  return file;
}
/** The file a taxonomy reference names, relative to ICONS/NexG_Discovery_Icons (same rule as iconUrl and vite.config.ts). */
function iconPath(reference) {
  const relative = reference.startsWith(referencePrefix) ? reference.slice(referencePrefix.length) : reference;
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.png$/.test(relative)) throw new Error(`Unsupported icon reference: ${reference}`);
  return relative;
}
const webPath = (relative) => relative.replace(/\.png$/, '.webp');

// Every icon the taxonomy uses, in a stable order. Categories are tracked apart: the homepage shows only those.
const taxonomy = await readJson(paths.taxonomy);
const categoryIcons = new Set(taxonomy.categories.map((category) => category.icon_reference).filter(Boolean).map(iconPath));
const icons = [...new Set(taxonomy.categories.flatMap((category) => [category.icon_reference, ...category.subcategories.map((subcategory) => subcategory.icon_reference)]).filter(Boolean).map(iconPath))].sort();
if (!icons.length) throw new Error('The taxonomy references no icons');

const approval = existsSync(paths.approval) ? await readJson(paths.approval) : { files: [] };
const approved = new Map(approval.files.map((file) => [file.path, file.sha256]));
const previous = existsSync(paths.manifest) ? await readJson(paths.manifest) : { icons: [] };
const previousByIcon = new Map(previous.icons.map((entry) => [entry.icon, entry]));
const sameSettings = previous.settings && Object.entries(settings).every(([key, value]) => previous.settings[key] === value);

let sharp;
async function loadSharp() {
  const failures = [];
  for (const candidate of ['sharp', process.env.NEXG_SHARP_PATH, derrickSharp].filter(Boolean)) {
    try {
      let specifier = candidate;
      if (candidate !== 'sharp') {
        const pkg = await readJson(join(candidate, 'package.json'));
        specifier = pathToFileURL(join(candidate, pkg.main ?? 'index.js')).href;
      }
      const loaded = await import(specifier);
      const library = loaded.default ?? loaded;
      // One image at a time, no pixel cache: this laptop is short on memory.
      library.cache(false);
      return library;
    } catch (error) {
      failures.push(`${candidate}: ${error?.code ?? error?.message ?? error}`);
    }
  }
  throw new Error(`sharp is not available. Tried:\n  ${failures.join('\n  ')}\nSet NEXG_SHARP_PATH to an installed copy of sharp.`);
}

const problems = [];
const entries = [];
let encoded = 0;
let reused = 0;
for (const relative of icons) {
  const sourceFile = inside(paths.icons, ...relative.split('/'));
  if (!existsSync(sourceFile)) {
    problems.push(`Missing original: ICONS/NexG_Discovery_Icons/${relative}`);
    continue;
  }
  const source = await readFile(sourceFile);
  const sourceSha256 = sha256(source);
  const pinned = approved.get(approvalPrefix + relative);
  if (pinned && pinned !== sourceSha256) {
    problems.push(`ICONS/NexG_Discovery_Icons/${relative} no longer matches its approved hash. The originals are pinned: restore the approved file rather than rebuilding.`);
    continue;
  }
  if (!pinned && approved.size) console.warn(`Not in the baseline approval (copied anyway): ${relative}`);

  const file = webPath(relative);
  const outputFile = inside(paths.output, ...file.split('/'));
  const before = previousByIcon.get(relative);
  const current = existsSync(outputFile) ? await readFile(outputFile) : undefined;
  const upToDate = Boolean(sameSettings && before && current && before.sourceSha256 === sourceSha256 && before.file === file && before.sha256 === sha256(current));

  if (checking) {
    if (!upToDate) problems.push(`Stale or missing web copy: assets/icons-web/${file}`);
    else entries.push(before);
    continue;
  }
  if (upToDate && !forcing) {
    entries.push(before);
    reused++;
    continue;
  }
  sharp ??= await loadSharp();
  const { data, info } = await sharp(source)
    .resize({ width: settings.size, height: settings.size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: settings.quality })
    .toBuffer({ resolveWithObject: true });
  await mkdir(dirname(outputFile), { recursive: true });
  if (!current || !current.equals(data)) await writeFile(outputFile, data);
  entries.push({ icon: relative, sourceBytes: source.length, sourceSha256, file, bytes: data.length, sha256: sha256(data), width: info.width, height: info.height });
  encoded++;
}

if (problems.length) {
  console.error(problems.join('\n'));
  if (checking) console.error('Run: node scripts/icons/build-web-icons.mjs');
  process.exit(1);
}

const total = (list, key) => list.reduce((sum, entry) => sum + entry[key], 0);
const largest = (list, key) => Math.max(...list.map((entry) => entry[key]));
const manifest = {
  generator: 'scripts/icons/build-web-icons.mjs',
  source: 'docs/discovery/TAXONOMY_V1.1.json',
  settings,
  encoder: sharp ? `sharp ${sharp.versions.sharp}, libwebp ${sharp.versions.webp}` : previous.encoder,
  totals: { icons: entries.length, sourceBytes: total(entries, 'sourceBytes'), bytes: total(entries, 'bytes') },
  icons: entries,
};
const manifestText = JSON.stringify(manifest, null, 2) + '\n';

// Plain string literals inside new URL(..., import.meta.url): Vite emits each file and rewrites the URL, and the
// esbuild test bundle keeps a usable file URL. import.meta.glob would tie the module to Vite.
const moduleText = `// Generated by scripts/icons/build-web-icons.mjs from docs/discovery/TAXONOMY_V1.1.json. Do not edit by hand;
// run the script again after the taxonomy or its icons change.
//
// ${settings.size} px WebP copies of the taxonomy icons. The originals in ICONS/NexG_Discovery_Icons stay untouched.
// Keys are icon paths relative to ICONS/NexG_Discovery_Icons, the same paths the /icons/ route serves.

/** Longest side of every web copy, in pixels. */
export const webIconSize = ${settings.size};

/** The web copy of each taxonomy icon, keyed by its path inside ICONS/NexG_Discovery_Icons. */
export const webIcons: ReadonlyMap<string, string> = new Map([
${entries.map((entry) => `  ['${entry.icon}', new URL('../../assets/icons-web/${entry.file}', import.meta.url).href],`).join('\n')}
]);
`;

if (checking) {
  const stale = [];
  if (!existsSync(paths.module) || (await readFile(paths.module, 'utf8')) !== moduleText) stale.push('src/data/webIcons.generated.ts');
  if (previous.icons.length !== entries.length) stale.push('assets/icons-web/manifest.json');
  if (stale.length) {
    console.error(`Out of date: ${stale.join(', ')}\nRun: node scripts/icons/build-web-icons.mjs`);
    process.exit(1);
  }
  console.log(`Web icons are current: ${entries.length} copies, ${megabytes(manifest.totals.bytes)} (originals ${megabytes(manifest.totals.sourceBytes)}).`);
  process.exit(0);
}

// Copies the taxonomy no longer uses. Only files this script recorded are removed, and only inside assets/icons-web.
let removed = 0;
const kept = new Set(entries.map((entry) => entry.file));
for (const entry of previous.icons) {
  if (kept.has(entry.file) || !/\.webp$/.test(entry.file)) continue;
  const stale = inside(paths.output, ...entry.file.split('/'));
  if (existsSync(stale)) { await rm(stale); removed++; }
}

// Write the copies first, then the module that points at them, so the dev server never sees a missing file.
const writeIfChanged = async (file, text) => {
  if (existsSync(file) && (await readFile(file, 'utf8')) === text) return false;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  return true;
};
await writeIfChanged(paths.manifest, manifestText);
const moduleChanged = await writeIfChanged(paths.module, moduleText);

const categories = entries.filter((entry) => categoryIcons.has(entry.icon));
const saved = 1 - manifest.totals.bytes / manifest.totals.sourceBytes;
console.log([
  `Taxonomy icons: ${entries.length} (${categories.length} categories, ${entries.length - categories.length} subcategories)`,
  `  Originals:   ${megabytes(manifest.totals.sourceBytes)} (largest ${megabytes(largest(entries, 'sourceBytes'))})`,
  `  Web copies:  ${megabytes(manifest.totals.bytes)} (largest ${kilobytes(largest(entries, 'bytes'))}), ${(saved * 100).toFixed(1)}% smaller`,
  `  Homepage category icons: ${megabytes(total(categories, 'sourceBytes'))} -> ${kilobytes(total(categories, 'bytes'))}`,
  `Encoded ${encoded}, reused ${reused}, removed ${removed}. ${moduleChanged ? 'Wrote' : 'Unchanged:'} src/data/webIcons.generated.ts`,
].join('\n'));
