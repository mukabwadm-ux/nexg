import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildSubcategoryMap, demoCatalog, parseJourneys, parseSqlInserts, parseSqlValues, parseSupabaseSeed, renderSeedSql,
  type Configuration, type GapFill, type SeedMerchant, type Snapshot, type SubcategoryMap } from '../scripts/demo-seed/lib';

// Local demo seed (owner decision, 8 Nov 2026). These checks read files only; no database is involved.
const read = (path: string) => readFileSync(path, 'utf8').replace(/^﻿/, '');
const configuration = JSON.parse(read('docs/discovery/DISCOVERY_CONFIGURATION_V1.1.json')) as Configuration;
const committed = JSON.parse(read('demo-seed/subcategory-map.json')) as SubcategoryMap;

test('seed SQL values keep doubled quotes, numbers, booleans, null and raw expressions', () => {
  assert.deepEqual(parseSqlValues(`'Mama''s Kitchen', 12, -1.2921, true, now(), v_city, null`),
    ["Mama's Kitchen", 12, -1.2921, true, { raw: 'now()' }, { raw: 'v_city' }, null]);
});

test('seed blocks give one merchant and its branch, and reject a mismatched id', () => {
  const block = (code: string, id: string, name: string) => `
  -- [${code}] ${name} (Kilimani)
  if not exists (select 1 from public.merchant where id = '${id}') then
    insert into public.merchant (id, legal_name, trading_name, category, subcategory, city_id) values ('${id}', '${name} Ltd', '${name}', 'restaurants_food', 'caf', v_city);
    insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary, latitude, longitude) values ('d1${id.slice(2)}', '${id}', 'Kilimani Branch', 'Kilimani, Nairobi', true, -1.2921, 36.7856);
  end if;`;
  const [first, second] = parseSupabaseSeed(block('M0001', 'c1000000-0000-4000-8000-000000000001', "Jo''s Café")
    + block('M0002', 'c1000000-0000-4000-8000-000000000002', 'Kipepeo Café'));
  assert.equal(first?.tradingName, "Jo's Café");
  assert.equal(first?.subcategory, 'caf');
  assert.equal(second?.branchId, 'd1000000-0000-4000-8000-000000000002');
  assert.equal(second?.latitude, -1.2921);
  assert.throws(() => parseSupabaseSeed(block('M0003', 'c1000000-0000-4000-8000-000000000004', 'Wrong Number')), /unexpected merchant id/);
});

test('journeys are read per category and subcategory label', () => {
  const journeys = parseJourneys(['## 10. Restaurants And Food — 2 subcategories', '', '| Order / exact subcategory | L4 | Journey |', '| --- | --- | --- |',
    '| 1. Restaurant | Menu item | **PURCHASE** — Cart → payment |', '| 7. Catering | Event date | **SERVICE** — Quote → request |'].join('\n'));
  assert.equal(journeys.get('Restaurants And Food\u0000Restaurant'), 'PURCHASE');
  assert.equal(journeys.get('Restaurants And Food\u0000Catering'), 'SERVICE');
});

test('the committed map covers every demo subcategory and every Discovery subcategory', () => {
  assert.deepEqual({ ...committed.summary, discoverySubcategoriesWithoutDemo: committed.summary.discoverySubcategoriesWithoutDemo.length },
    { demoSubcategories: 137, mapped: 125, unmapped: 12, merchants: 685, mappedMerchants: 625, items: 15435, discoverySubcategoriesWithoutDemo: 0 });
  for (const row of committed.subcategories) {
    if (row.status === 'mapped') assert.ok(row.discovery && row.journey && row.action, row.demoSubcategoryId);
    else assert.ok(!row.discovery && !row.journey && !row.action, row.demoSubcategoryId);
  }
  const discovery = configuration.categories.flatMap(category => category.subcategories.map(subcategory => subcategory.discovery_key));
  const covered = new Set([...committed.subcategories.flatMap(row => row.discovery ? [row.discovery.subcategoryId] : []), ...committed.summary.discoverySubcategoriesWithoutDemo]);
  assert.equal(discovery.length, 98);
  assert.deepEqual([...covered].sort(), [...discovery].sort());
  // Only categories that Discovery keeps off customer screens, plus Health Coaching, stay unmapped.
  assert.deepEqual(committed.subcategories.filter(row => row.status === 'unmapped').map(row => row.demoSubcategoryId).filter(id => !/^(financial-services|logistics-shipping)_/.test(id)),
    ['health_coaching']);
});

const snapshotText = read('demo-seed/source/demo-api-snapshot.json');
const gapFillText = read('demo-seed/source/gap-fill.json');
const gapFill = JSON.parse(gapFillText) as GapFill;
const extracted = JSON.parse(read('demo-seed/source/supabase-merchant-seed.json')) as { sha256: string; merchants: SeedMerchant[] };
const catalog = demoCatalog({ snapshot: JSON.parse(snapshotText) as Snapshot, seed: extracted.merchants, gapFill });
const snapshot = catalog.snapshot;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

test('the committed map is what the sources produce today', () => {
  const journeys = parseJourneys(read('docs/discovery/CATEGORY_FLOWS.md'));
  assert.deepEqual(buildSubcategoryMap({ snapshot, seed: catalog.seed, configuration, journeys }), committed);
});

test('gap-fill merchants fill exactly the empty Discovery subcategories, in the demo style, with whole-shilling prices', () => {
  const added = snapshot.merchants.slice(-45);
  assert.deepEqual([added[0]?.id, added.at(-1)?.id], ['M0641', 'M0685']);
  assert.equal(new Set(snapshot.merchants.map(merchant => merchant.name)).size, snapshot.merchants.length);
  for (const group of gapFill.groups) {
    const row = committed.subcategories.find(entry => entry.demoSubcategoryId === group.demoSubcategoryId);
    assert.equal(row?.discovery?.subcategoryId, group.discoverySubcategoryId, group.demoSubcategoryId);
    assert.deepEqual(row?.supabase, group.supabase);
  }
  const areas = new Set(snapshot.areas);
  const seedByCode = new Map(catalog.seed.map(row => [row.code, row]));
  for (const merchant of added) {
    assert.ok(areas.has(merchant.nairobiArea ?? ''), merchant.id);
    assert.equal(seedByCode.get(merchant.id)?.address, `${merchant.nairobiArea}, Nairobi`);
    assert.ok(merchant.items.every(item => item.currency === 'KES' && Number.isInteger(item.price) && item.price! % 10 === 0 && item.price! > 0));
  }
  // Each of the five merchants in a group has its own price level for the same items.
  const salons = added.filter(merchant => merchant.subcategoryId === 'beauty_salon-barber').map(merchant => merchant.items[0]?.price);
  assert.equal(new Set(salons).size, 5);
});

test('the committed seed SQL is current, guarded and complete', () => {
  const committedSql = read('demo-seed/catalogue-demo-seed.sql');
  const sources = { snapshotSha256: sha(snapshotText), supabaseSeedSha256: extracted.sha256, gapFillSha256: sha(gapFillText) };
  assert.equal(renderSeedSql({ snapshot, seed: catalog.seed, map: committed, sources }), committedSql);
  // The local-only guard runs inside the transaction, before any row is written.
  const guard = committedSql.indexOf("raise exception 'This demo catalogue is for the local Supabase only");
  assert.ok(committedSql.indexOf('begin;') < guard && guard < committedSql.indexOf('insert into'));
  assert.ok(committedSql.trimEnd().endsWith('commit;'));

  const tables = new Map<string, { columns: string[]; rows: unknown[][] }>();
  for (const insert of parseSqlInserts(committedSql)) {
    for (const row of insert.rows) assert.equal(row.length, insert.columns.length, insert.table);
    const entry = tables.get(insert.table) ?? { columns: insert.columns, rows: [] };
    entry.rows.push(...insert.rows); tables.set(insert.table, entry);
  }
  // Only adult and alcohol items are age-restricted; pharmacy rules are not an ID check.
  const restrictedGroups = new Set(committed.subcategories.filter(row => row.journey === 'RESTRICTED_PURCHASE'
    && ['adults-only', 'alcohol-beverages'].includes(row.discovery?.categoryId ?? '')).map(row => row.demoSubcategoryId));
  const restrictedMerchants = snapshot.merchants.filter(merchant => restrictedGroups.has(merchant.subcategoryId) && merchant.items.length);
  assert.deepEqual([...tables].map(([table, entry]) => [table, entry.rows.length]),
    [['merchant', 685], ['merchant_branch', 685], ['catalogue_section', 685], ['catalogue_item', 15435], ['document', restrictedMerchants.length]]);
  const column = (table: string, name: string) => { const entry = tables.get(table)!; const at = entry.columns.indexOf(name); return entry.rows.map(row => row[at]); };
  const merchants = new Set(column('merchant', 'id'));
  const sections = new Set(column('catalogue_section', 'id'));
  const items = column('catalogue_item', 'id');
  assert.equal(new Set(items).size, items.length);
  assert.ok(items.every(id => /^f1000000-0000-4000-8000-\d{12}$/.test(String(id))));
  assert.ok([...sections].every(id => /^f2000000-0000-4000-8000-\d{12}$/.test(String(id))));
  assert.ok(column('catalogue_item', 'section_id').every(id => sections.has(id)));
  assert.ok(column('catalogue_item', 'merchant_id').every(id => merchants.has(id)));
  assert.ok(column('catalogue_item', 'price_kes').every(price => Number.isInteger(price) && (price as number) >= 1 && (price as number) <= 1_000_000));
  assert.ok(column('merchant', 'contact_email').every(email => /^m\d{4}@example\.com$/.test(String(email))));
  assert.ok(column('merchant', 'contact_phone').every(phone => /^\+2540\d{8}$/.test(String(phone))));
  const expected = restrictedMerchants.reduce((total, merchant) => total + merchant.items.length, 0);
  assert.equal(column('catalogue_item', 'age_restricted').filter(value => value === true).length, expected);
  assert.ok(expected > 0);
  // Every merchant with age-restricted items gets one verified demo liquor licence, so catalogue_public shows them.
  const owners = column('document', 'owner_id');
  assert.deepEqual([...owners].sort(), restrictedMerchants.map(merchant => `c1000000-0000-4000-8000-${merchant.id.slice(1).padStart(12, '0')}`).sort());
  assert.ok(column('document', 'id').every(id => /^f3000000-0000-4000-8000-\d{12}$/.test(String(id))));
  assert.ok(column('document', 'status').every(status => status === 'verified'));
  assert.ok(column('document', 'expires_at').every(date => date === '2027-12-31'));
  assert.ok(column('document', 'requirement_id').every(value => JSON.stringify(value).includes("kind = 'liquor_licence'")));
  assert.ok(column('document', 'reviewed_at').every(value => JSON.stringify(value) === '{"raw":"now()"}'));
});
