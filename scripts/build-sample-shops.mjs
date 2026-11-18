/*
 * Builds supabase/sample-shops.sql from the Discovery demo catalogue
 * (NEXG DISCOVERY/demo-seed/catalogue-demo-seed.sql, a generated file in the
 * private langs4u/nexg-discovery repository).
 *
 *   node scripts/build-sample-shops.mjs <path to catalogue-demo-seed.sql>
 *
 * The Discovery file is written for a local database only. This turns it into
 * the hosted-safe sample-shop load (owner decision, 18 Nov 2026):
 *   - every merchant is marked is_sample and takes no orders
 *     (20270107000100_sample_merchants)
 *   - categories left out: activities_games_sports (not on main; R11 is
 *     paused), adults_only (tobacco, vapes, adult products: App Store
 *     guideline 1.4.3) and financial_services (regulated, and Discovery hides
 *     it anyway)
 *   - age-restricted items are left out, and so are the demo liquor licences,
 *     which were marked verified with no document behind them
 *   - a merchant left with no items is left out, with its branch and section
 *   - the local-only guard is replaced by an explicit opt-in for any database
 *
 * Re-run it whenever Discovery regenerates its seed. Nothing here is read at
 * build or deploy time.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/build-sample-shops.mjs <path to catalogue-demo-seed.sql>');
  process.exit(1);
}

const LEFT_OUT = new Set(['activities_games_sports', 'adults_only', 'financial_services']);
const MERCHANT = /^insert into public\.merchant \(/;
const BRANCH = /^insert into public\.merchant_branch \(/;
const SECTION = /^insert into public\.catalogue_section \(/;
const ITEM = /^insert into public\.catalogue_item \(/;
const DOCUMENT = /^insert into public\.document \(/;

const text = readFileSync(source, 'utf8');
const lines = text.split(/\r?\n/);

/* Collect each insert block's header and rows. */
const blocks = { merchant: [], branch: [], section: [], item: [] };
const headers = {};
let current = null;
for (const line of lines) {
  if (MERCHANT.test(line)) current = 'merchant';
  else if (BRANCH.test(line)) current = 'branch';
  else if (SECTION.test(line)) current = 'section';
  else if (ITEM.test(line)) current = 'item';
  else if (DOCUMENT.test(line)) current = 'skip';
  else if (line.startsWith('on conflict')) {
    current = null;
    continue;
  } else if (current && current !== 'skip' && line.startsWith('  (')) {
    blocks[current].push(line.replace(/,$/, ''));
    continue;
  } else continue;
  if (current !== 'skip') headers[current] = line;
}

const uuidAt = (row, index) => row.match(/'[0-9a-f-]{36}'/g)?.[index]?.slice(1, -1);
const merchantCategory = (row) =>
  row.match(/^  \('[^']+', '(?:[^']|'')*', '(?:[^']|'')*', '([a-z_]+)'/)?.[1];

const keptMerchants = new Set();
for (const row of blocks.merchant) {
  const category = merchantCategory(row);
  if (!category) throw new Error(`Unreadable merchant row: ${row.slice(0, 80)}`);
  if (!LEFT_OUT.has(category)) keptMerchants.add(uuidAt(row, 0));
}

/* Items: (id, section_id, merchant_id, ..., price_kes, available, age_restricted, highlighted, sort) */
const ITEM_TAIL = /, (\d+), (true|false), (true|false), (true|false), (\d+)\)$/;
const items = blocks.item.filter((row) => {
  const tail = row.match(ITEM_TAIL);
  if (!tail) throw new Error(`Unreadable item row: ${row.slice(0, 80)}`);
  return keptMerchants.has(uuidAt(row, 2)) && tail[3] === 'false';
});
const withItems = new Set(items.map((row) => uuidAt(row, 2)));
for (const id of [...keptMerchants]) if (!withItems.has(id)) keptMerchants.delete(id);

const MERCHANT_TAIL = /, now\(\), true\)$/;
const merchants = blocks.merchant
  .filter((row) => keptMerchants.has(uuidAt(row, 0)))
  .map((row) => {
    if (!MERCHANT_TAIL.test(row))
      throw new Error(`Unexpected merchant row ending: ${row.slice(-60)}`);
    return row.replace(MERCHANT_TAIL, ', now(), false, true)');
  });
const branches = blocks.branch.filter((row) => keptMerchants.has(uuidAt(row, 1)));
const sections = blocks.section.filter((row) => keptMerchants.has(uuidAt(row, 1)));

const merchantHeader = headers.merchant.replace(
  'accepting_orders) values',
  'accepting_orders, is_sample) values',
);
if (merchantHeader === headers.merchant)
  throw new Error('The merchant column list changed; update this script.');

const CHUNK = 500;
function insert(header, rows, conflict) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    out.push(header, rows.slice(i, i + CHUNK).join(',\n'), conflict, '');
  }
  return out.join('\n');
}

const sha = createHash('sha256').update(text).digest('hex');
const output = `-- Sample shops: invented Nairobi merchants, shown and labelled, never ordered from.
--
-- NOT a migration and NOT a seed that db reset loads. Run it by hand, once,
-- against the database that should show sample shops (the owner's decision,
-- 18 Nov 2026, so the Consumer app can be reviewed against the hosted stack):
--
--   set nexg.sample_shops = 'load';
--   \\i supabase/sample-shops.sql
--
-- It needs 20270107000100_sample_merchants first. Every merchant here is
-- is_sample, takes no orders and is nobody's concierge pick; the database
-- refuses an order for any of them. supabase/sample-shops-remove.sql deletes
-- exactly these rows.
--
-- Generated by scripts/build-sample-shops.mjs from the Discovery demo seed
-- (sha256 ${sha}). Edit the script or the Discovery sources, not this file.
-- Rows: ${merchants.length} merchants, ${branches.length} branches, ${sections.length} sections, ${items.length} items.
-- Left out: categories ${[...LEFT_OUT].join(', ')}; every age-restricted
-- item; the demo liquor licences; merchants left with no items.
--
-- Ids: merchants c1000000-0000-4000-8000-…, branches d1000000-…, sections
-- f2000000-…, items f1000000-…. Contacts reach nobody: example.com emails,
-- and +254 0… numbers no Kenyan line can have. Prices are invented, in whole
-- shillings (price_kes), like every catalogue item.
-- Re-running is safe: existing rows are kept, and existing merchants in the
-- range are marked sample.

begin;

do $$
begin
  if coalesce(current_setting('nexg.sample_shops', true), '') <> 'load' then
    raise exception 'Sample shops load only on purpose. Run: set nexg.sample_shops = ''load''; in the same session first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'merchant' and column_name = 'is_sample') then
    raise exception 'merchant.is_sample is missing. Apply 20270107000100_sample_merchants first.';
  end if;
  if not exists (select 1 from public.city where name = 'Nairobi') then
    raise exception 'No Nairobi city row. Apply the migrations first.';
  end if;
end $$;

${insert(
  merchantHeader,
  merchants,
  `on conflict (id) do update
  set is_sample = true, accepting_orders = false, concierge_pick = false
  where public.merchant.id::text like 'c1000000-0000-4000-8000-%';`,
)}
${insert(headers.branch, branches, 'on conflict do nothing;')}
${insert(headers.section, sections, 'on conflict do nothing;')}
${insert(headers.item, items, 'on conflict do nothing;')}
do $$
declare merchants integer; items integer;
begin
  select count(*) into merchants from public.merchant where is_sample;
  select count(*) into items from public.catalogue_item i
    join public.merchant m on m.id = i.merchant_id where m.is_sample;
  raise notice 'Sample shops present: % merchants, % items.', merchants, items;
end $$;

commit;
`;

const target = fileURLToPath(new URL('../supabase/sample-shops.sql', import.meta.url));
writeFileSync(target, output);
console.log(
  `Wrote supabase/sample-shops.sql: ${merchants.length} merchants, ${branches.length} branches, ${sections.length} sections, ${items.length} items.`,
);
