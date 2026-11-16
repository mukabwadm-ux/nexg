/**
 * Local demo seed builder (owner decision, 8 Nov 2026; plan steps D2 and D3).
 *
 *   node scripts/demo-seed/build.ts extract [seed.sql]  copy merchant facts from Derrick NexG's seed file (read only)
 *   node scripts/demo-seed/build.ts                     write the subcategory map, its review table and the seed SQL
 *   node scripts/demo-seed/build.ts --check             fail if the committed outputs are out of date
 *
 * Reads and writes files in this repository only. It never touches a database or the network.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { buildSubcategoryMap, demoCatalog, parseSupabaseSeed, renderMapReview, renderSeedSql, type Configuration, type GapFill, type KeyTranslation, type SeedMerchant, type Snapshot } from './lib.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const paths = {
  snapshot: join(root, 'demo-seed/source/demo-api-snapshot.json'),
  seed: join(root, 'demo-seed/source/supabase-merchant-seed.json'),
  gapFill: join(root, 'demo-seed/source/gap-fill.json'),
  configuration: join(root, 'docs/discovery/MASTER_NAVIGATION.json'),
  master: join(root, '../packages/contracts/src/data/category-master.json'),
  overlay: join(root, 'docs/discovery/MASTER_CATEGORIES_OVERLAY.json'),
  map: join(root, 'demo-seed/subcategory-map.json'),
  review: join(root, 'demo-seed/SUBCATEGORY_MAP.md'),
  sql: join(root, 'demo-seed/catalogue-demo-seed.sql'),
};
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const args = process.argv.slice(2);

if (args[0] === 'extract') {
  const source = args[1] ?? join(root, '../Derrick NexG/supabase/seeds/merchants-seed-catalog.sql');
  const bytes = await readFile(source);
  const merchants = parseSupabaseSeed(bytes.toString('utf8'));
  await writeFile(paths.seed, json({ source: 'Derrick NexG/supabase/seeds/merchants-seed-catalog.sql', sha256: sha256(bytes), merchants }));
  console.log(`Extracted ${merchants.length} merchants from ${source}`);
} else {
  const check = args.includes('--check');
  const snapshotBytes = await readFile(paths.snapshot);
  const gapFillBytes = await readFile(paths.gapFill);
  const extracted = JSON.parse(await readFile(paths.seed, 'utf8')) as { sha256: string; merchants: SeedMerchant[] };
  const { snapshot, seed } = demoCatalog({ snapshot: JSON.parse(snapshotBytes.toString('utf8')) as Snapshot, seed: extracted.merchants,
    gapFill: JSON.parse(gapFillBytes.toString('utf8')) as GapFill });
  const configuration = JSON.parse((await readFile(paths.configuration, 'utf8')).replace(/^﻿/, '')) as Configuration;
  const master = JSON.parse(await readFile(paths.master, 'utf8')) as Pick<KeyTranslation, 'categories' | 'retiredSubcategories'>;
  const overlay = JSON.parse(await readFile(paths.overlay, 'utf8')) as Pick<KeyTranslation, 'demoKeys' | 'seedSpellings'>;
  const translation: KeyTranslation = { categories: master.categories, retiredSubcategories: master.retiredSubcategories, demoKeys: overlay.demoKeys, seedSpellings: overlay.seedSpellings };
  const map = buildSubcategoryMap({ snapshot, seed, configuration, translation });
  const seedSql = renderSeedSql({ snapshot, seed, map,
    sources: { snapshotSha256: sha256(snapshotBytes), supabaseSeedSha256: extracted.sha256, gapFillSha256: sha256(gapFillBytes) } });
  const outputs = new Map([[paths.map, json(map)], [paths.review, renderMapReview(map, configuration)], [paths.sql, seedSql]]);
  let stale = 0;
  for (const [path, content] of outputs) {
    if (!check) { await writeFile(path, content); continue; }
    const current = await readFile(path, 'utf8').catch(() => '');
    if (current !== content) { stale++; console.error(`Out of date: ${relative(root, path)}`); }
  }
  if (stale) process.exitCode = 1;
  console.log(JSON.stringify(map.summary, null, 1));
}
