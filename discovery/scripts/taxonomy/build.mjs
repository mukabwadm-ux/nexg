/**
 * Discovery's navigation from NexG's master category list (owner, 16 Nov 2026).
 *
 *   node scripts/taxonomy/build.mjs           write docs/discovery/MASTER_NAVIGATION.json
 *   node scripts/taxonomy/build.mjs --check   write nothing; exit 1 if it is out of date
 *
 * Inputs, both hand-maintained:
 *   ../packages/contracts/src/data/category-master.json   the 22 categories, their subcategories, names and order
 *   docs/discovery/MASTER_CATEGORIES_OVERLAY.json         what Discovery adds: ids, pack icons, journeys, old ids
 *
 * Discovery ids: a category's id is set in the overlay (kept from the icon-pack taxonomy where the category kept
 * its meaning); a subcategory's id is `<category id>:<Supabase subcategory key, kebab-case>`, and its source
 * group is `<Supabase category key>_<Supabase subcategory key>`, kebab-case, the id the bridge map gives it.
 * A subcategory with no matching pack icon draws its category's icon (no new artwork).
 *
 * TAXONOMY_V1.1.json and DISCOVERY_CONFIGURATION_V1.1.json are the icon-pack taxonomy from before the master
 * list: history, kept unchanged because the Discovery Engine's baseline release pins them by hash.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const paths = {
  master: join(root, '../packages/contracts/src/data/category-master.json'),
  overlay: join(root, 'docs/discovery/MASTER_CATEGORIES_OVERLAY.json'),
  navigation: join(root, 'docs/discovery/MASTER_NAVIGATION.json'),
};
const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
const fail = (message) => { throw new Error(message); };
const kebab = (key) => key.replace(/_/g, '-');
const iconPrefix = 'references/icons-v1.1/NexG_Discovery_Icons/';
const journeys = new Set(['PURCHASE', 'RESTRICTED_PURCHASE', 'APPOINTMENT', 'RENTAL', 'SERVICE', 'TICKET', 'TOUR', 'CARE', 'REQUEST', 'TRANSFER']);

/** The navigation file from the master list and the overlay. Pure, so a test can run it. */
export function buildNavigation(master, overlay) {
  const owners = new Map();
  for (const category of master.categories) for (const sub of category.subcategories) {
    if (owners.has(sub.id)) fail(`Subcategory ${sub.id} is in two categories`);
    owners.set(sub.id, category.id);
  }
  for (const key of [...Object.keys(overlay.subcategoryIcons), ...Object.keys(overlay.journeys)]) if (!owners.has(key)) fail(`Overlay names unknown subcategory ${key}`);
  const ids = new Set();
  const categoryIds = new Map();
  for (const category of master.categories) {
    const extra = overlay.categories[category.id] ?? fail(`Overlay has no Discovery id for ${category.id}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(extra.id) || ids.has(extra.id)) fail(`Bad or repeated Discovery id ${extra.id}`);
    if (!extra.icon) fail(`${category.id} has no icon`);
    ids.add(extra.id);
    categoryIds.set(category.id, extra.id);
  }
  for (const key of Object.keys(overlay.categories)) if (!categoryIds.has(key)) fail(`Overlay names unknown category ${key}`);
  const keyOf = (id) => [...categoryIds].find(([, value]) => value === id)?.[0];
  const legacyCategories = {};
  for (const category of master.categories) for (const legacy of overlay.categories[category.id].legacyIds ?? []) {
    if (ids.has(legacy) || legacyCategories[legacy]) fail(`Old category id ${legacy} is still in use`);
    legacyCategories[legacy] = categoryIds.get(category.id);
  }
  const legacySubcategories = {};
  for (const [old, next] of Object.entries(overlay.legacySubcategoryIds)) {
    const [category, sub] = next.split(':');
    const key = keyOf(category);
    if (!key || owners.get(sub.replace(/-/g, '_')) !== key) fail(`Old subcategory ${old} points at unknown ${next}`);
    const [oldCategory, oldSub] = old.split(':');
    const oldKey = keyOf(oldCategory);
    if (oldKey && owners.get(oldSub.replace(/-/g, '_')) === oldKey) fail(`Old subcategory ${old} is still a current id`);
    (legacySubcategories[next] ??= []).push(old);
  }
  for (const pair of Object.keys(overlay.demoApiSourceIds)) {
    const [category, sub] = pair.split('/');
    if (owners.get(sub) !== category) fail(`Demo API groups listed for unknown pair ${pair}`);
  }
  const icon = (file) => (file ? iconPrefix + file : null);
  const categories = master.categories.map((category, index) => {
    const names = new Set(category.subcategories.map((sub) => sub.name));
    if (names.size !== category.subcategories.length) fail(`${category.name} repeats a subcategory name`);
    return {
      position: index + 1,
      category: category.name,
      discovery_key: categoryIds.get(category.id),
      supabase_category: category.id,
      customer_task: category.desc,
      icon_reference: icon(overlay.categories[category.id].icon),
      source_category_ids: [kebab(category.id)],
      legacy_discovery_keys: overlay.categories[category.id].legacyIds ?? [],
      subcategories: category.subcategories.map((sub, position) => {
        const pair = `${category.id}/${sub.id}`;
        const journey = overlay.journeys[sub.id] ?? overlay.journeyByBase[sub.base] ?? fail(`No journey for ${pair} (base ${sub.base})`);
        if (!journeys.has(journey)) fail(`Unknown journey ${journey} for ${pair}`);
        const id = `${categoryIds.get(category.id)}:${kebab(sub.id)}`;
        return {
          position: position + 1,
          name: sub.name,
          discovery_key: id,
          supabase: { category: category.id, subcategory: sub.id },
          base: sub.base,
          ...(sub.group ? { group: sub.group } : {}),
          icon_reference: icon(overlay.subcategoryIcons[sub.id]),
          source_subcategory_ids: [`${kebab(category.id)}_${kebab(sub.id)}`, ...(overlay.demoApiSourceIds[pair] ?? [])],
          nested_option_candidates: [],
          journey,
          legacy_discovery_keys: legacySubcategories[id] ?? [],
        };
      }),
    };
  });
  return {
    version: 'master-2026-11-16',
    status: 'Generated by scripts/taxonomy/build.mjs from the NexG master category list and MASTER_CATEGORIES_OVERLAY.json. Edit those, not this file.',
    source: 'packages/contracts/src/data/category-master.json',
    master_revision: master.revision,
    key_policy: 'A category id is kept from the icon-pack taxonomy where the category kept its meaning. A subcategory id is <category id>:<Supabase subcategory key in kebab-case>. A source subcategory id is <Supabase category>_<Supabase subcategory>, kebab-case: the id the bridge map (demo-seed/subcategory-map.json) gives that Supabase pair; the demo API\'s older group ids that now land there follow it. legacy_discovery_keys are old Discovery ids that still open this entry.',
    icon_policy: 'Icons come from the original NexG Discovery icon pack. A subcategory whose icon_reference is null draws its category\'s icon; no artwork was made for the master list.',
    history: 'Before 16 Nov 2026 Discovery had its own taxonomy from the icon pack (TAXONOMY_V1.1.json and DISCOVERY_CONFIGURATION_V1.1.json: 18 categories, 115 subcategories, among them Health And Pharmacy, Play and Flights). Those files are history, kept for the Discovery Engine\'s pinned baseline release.',
    main_category_count: categories.length,
    subcategory_count: categories.reduce((total, category) => total + category.subcategories.length, 0),
    homepage_category_order: categories.map((category) => category.discovery_key),
    legacy_category_keys: legacyCategories,
    categories,
  };
}

const json = (value) => JSON.stringify(value, null, 2) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const navigation = buildNavigation(await readJson(paths.master), await readJson(paths.overlay));
  if (process.argv.includes('--check')) {
    const current = await readFile(paths.navigation, 'utf8').catch(() => '');
    if (current !== json(navigation)) { console.error(`Out of date: ${relative(root, paths.navigation)}`); process.exitCode = 1; }
  } else await writeFile(paths.navigation, json(navigation));
  if (!process.exitCode) console.log(`${navigation.main_category_count} categories, ${navigation.subcategory_count} subcategories`);
}
