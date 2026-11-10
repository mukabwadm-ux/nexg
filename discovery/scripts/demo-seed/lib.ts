/**
 * Pure helpers for the local demo seed (owner decision, 8 Nov 2026).
 * No file, network or database access here: callers pass text and data in.
 */

export interface SeedMerchant {
  /** Demo API code, e.g. M0001. */
  code: string;
  merchantId: string;
  legalName: string;
  tradingName: string;
  /** Supabase `merchant_category` value. */
  category: string;
  /** Supabase subcategory key. */
  subcategory: string;
  branchId: string;
  branchName: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface SnapshotItem { id: string; merchantId: string; name: string; description?: string; price?: number; currency?: string; image?: string; isAvailable?: boolean }
export interface SnapshotMerchant {
  id: string; name: string; categoryId: string; category: string; subcategoryId: string; subcategory: string;
  nairobiArea?: string; heroImage?: string; logoUrl?: string; items: SnapshotItem[];
}
export interface Snapshot { counts: { merchants: number; items: number; areas: number }; areas: string[]; merchants: SnapshotMerchant[] }

interface ConfigurationOption { id: string; label: string; source_subcategory_ids: string[] }
interface ConfigurationSubcategory { name: string; discovery_key: string; source_subcategory_ids: string[]; nested_option_candidates: ConfigurationOption[] }
export interface Configuration { categories: { category: string; discovery_key: string; subcategories: ConfigurationSubcategory[] }[] }

/** Default journeys from CATEGORY_FLOWS.md. A verified offering workflow always overrides them. */
export type Journey = 'PURCHASE' | 'RESTRICTED_PURCHASE' | 'APPOINTMENT' | 'RENTAL' | 'SERVICE' | 'TICKET' | 'TOUR' | 'CARE' | 'REQUEST' | 'TRANSFER';
export type Action = 'buy' | 'book' | 'request';
const journeys: Record<Journey, Action> = {
  PURCHASE: 'buy', RESTRICTED_PURCHASE: 'buy',
  APPOINTMENT: 'book', RENTAL: 'book', TICKET: 'book', TOUR: 'book', CARE: 'book', TRANSFER: 'book',
  SERVICE: 'request', REQUEST: 'request',
};

export interface SubcategoryRow {
  demoSubcategoryId: string;
  demoLabel: string;
  demoCategoryId: string;
  demoCategoryLabel: string;
  merchants: number;
  items: number;
  supabase: { category: string; subcategory: string };
  discovery: { categoryId: string; subcategoryId: string; label: string; optionIds: string[] } | null;
  journey: Journey | null;
  action: Action | null;
  status: 'mapped' | 'unmapped';
}

export interface SubcategoryMap {
  note: string;
  summary: { demoSubcategories: number; mapped: number; unmapped: number; merchants: number; mappedMerchants: number; items: number; discoverySubcategoriesWithoutDemo: string[] };
  subcategories: SubcategoryRow[];
}

type SqlValue = string | number | boolean | null | { raw: string };

function fail(message: string): never { throw new Error(message); }

/** Returns the text inside the parentheses that open at `start`, skipping quoted strings. */
function parenthesised(text: string, start: number): { inner: string; end: number } {
  if (text[start] !== '(') fail('Expected "(" in seed SQL');
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (char === "'") {
      let close = text.indexOf("'", index + 1);
      while (close >= 0 && text[close + 1] === "'") close = text.indexOf("'", close + 2);
      if (close < 0) fail('Unclosed quote in seed SQL');
      index = close; continue;
    }
    if (char === '(') depth++;
    if (char === ')' && --depth === 0) return { inner: text.slice(start + 1, index), end: index };
  }
  return fail('Unclosed parenthesis in seed SQL');
}

/** Splits a SQL `values ( … )` list into literals. Strings keep doubled quotes as one quote. */
export function parseSqlValues(inner: string): SqlValue[] {
  const values: SqlValue[] = [];
  let index = 0;
  while (index < inner.length) {
    const char = inner[index]!;
    if (/[\s,]/.test(char)) { index++; continue; }
    if (char === "'") {
      let value = ''; index++;
      for (;;) {
        const close = inner.indexOf("'", index);
        if (close < 0) fail('Unclosed quote in seed SQL values');
        value += inner.slice(index, close);
        if (inner[close + 1] === "'") { value += "'"; index = close + 2; continue; }
        index = close + 1; break;
      }
      values.push(value); continue;
    }
    let depth = 0; let end = index;
    while (end < inner.length && (depth > 0 || inner[end] !== ',')) { if (inner[end] === '(') depth++; if (inner[end] === ')') depth--; end++; }
    const token = inner.slice(index, end).trim();
    values.push(/^-?\d+(\.\d+)?$/.test(token) ? Number(token) : token === 'true' ? true : token === 'false' ? false : token === 'null' ? null : { raw: token });
    index = end;
  }
  return values;
}

function insertRow(block: string, table: string): Record<string, SqlValue> {
  const at = block.search(new RegExp(`insert into public\\.${table}\\s*\\(`));
  if (at < 0) fail(`Missing ${table} insert in seed block`);
  const columns = parenthesised(block, block.indexOf('(', at));
  const valuesAt = block.slice(columns.end).search(/values\s*\(/);
  if (valuesAt < 0) fail(`Missing ${table} values in seed block`);
  const valuesStart = block.indexOf('(', columns.end + valuesAt);
  const names = columns.inner.split(',').map(name => name.trim());
  const values = parseSqlValues(parenthesised(block, valuesStart).inner);
  if (names.length !== values.length) fail(`${table}: ${names.length} columns but ${values.length} values`);
  return Object.fromEntries(names.map((name, position) => [name, values[position]!]));
}

const text = (row: Record<string, SqlValue>, key: string): string => { const value = row[key]; return typeof value === 'string' && value.trim() ? value : fail(`Seed column ${key} is not text`); };
const number = (row: Record<string, SqlValue>, key: string): number => { const value = row[key]; return typeof value === 'number' && Number.isFinite(value) ? value : fail(`Seed column ${key} is not a number`); };

/** Reads Derrick NexG's `merchants-seed-catalog.sql`: one `-- [M0001] …` block per merchant. */
export function parseSupabaseSeed(sql: string): SeedMerchant[] {
  const marker = /^\s*-- \[(M\d{4})\] /gm;
  const starts = [...sql.matchAll(marker)];
  if (!starts.length) fail('No merchant blocks found in the Supabase seed');
  return starts.map((match, position) => {
    const block = sql.slice(match.index, starts[position + 1]?.index ?? sql.length);
    const merchant = insertRow(block, 'merchant');
    const branch = insertRow(block, 'merchant_branch');
    const code = match[1]!;
    const merchantId = text(merchant, 'id');
    if (!/^c1000000-0000-4000-8000-\d{12}$/.test(merchantId) || Number(merchantId.slice(-12)) !== Number(code.slice(1))) fail(`${code}: unexpected merchant id ${merchantId}`);
    if (text(branch, 'merchant_id') !== merchantId) fail(`${code}: branch belongs to another merchant`);
    return { code, merchantId, legalName: text(merchant, 'legal_name'), tradingName: text(merchant, 'trading_name'),
      category: text(merchant, 'category'), subcategory: text(merchant, 'subcategory'),
      branchId: text(branch, 'id'), branchName: text(branch, 'name'), address: text(branch, 'address_text'),
      latitude: number(branch, 'latitude'), longitude: number(branch, 'longitude') };
  });
}

/** Reads the default journey of every subcategory row in CATEGORY_FLOWS.md, keyed by category and subcategory label. */
export function parseJourneys(markdown: string): Map<string, Journey> {
  const result = new Map<string, Journey>();
  let category: string | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^## \d+\. (.+?) — \d+ subcategories/.exec(line);
    if (heading) { category = heading[1]; continue; }
    const row = /^\| \d+\. (.+?) \|.*\| \*\*([A-Z_]+)\*\*/.exec(line);
    if (!row || !category) continue;
    if (!(row[2]! in journeys)) fail(`Unknown journey ${row[2]} for ${row[1]}`);
    result.set(`${category}\u0000${row[1]}`, row[2] as Journey);
  }
  return result;
}

/** Matches each demo subcategory to its Supabase keys, Discovery subcategory and default journey. */
export function buildSubcategoryMap(input: { snapshot: Snapshot; seed: SeedMerchant[]; configuration: Configuration; journeys: Map<string, Journey> }): SubcategoryMap {
  const seedByCode = new Map(input.seed.map(row => [row.code, row]));
  const discoveryBySource = new Map<string, { category: Configuration['categories'][number]; subcategory: ConfigurationSubcategory }>();
  for (const category of input.configuration.categories) for (const subcategory of category.subcategories) for (const id of subcategory.source_subcategory_ids) {
    if (discoveryBySource.has(id)) fail(`Source subcategory ${id} is mapped twice`);
    discoveryBySource.set(id, { category, subcategory });
  }
  const groups = new Map<string, SnapshotMerchant[]>();
  for (const merchant of input.snapshot.merchants) groups.set(merchant.subcategoryId, [...(groups.get(merchant.subcategoryId) ?? []), merchant]);
  // A configured source group with no demo merchants would show an empty screen while looking mapped.
  for (const id of discoveryBySource.keys()) if (!groups.has(id)) fail(`Configured source group ${id} has no demo merchants`);
  const rows = [...groups.entries()].map(([demoSubcategoryId, merchants]): SubcategoryRow => {
    const first = merchants[0]!;
    const pairs = new Set(merchants.map(merchant => {
      const seed = seedByCode.get(merchant.id) ?? fail(`${merchant.id} is missing from the Supabase seed`);
      if (seed.tradingName !== merchant.name) fail(`${merchant.id}: seed name "${seed.tradingName}" differs from "${merchant.name}"`);
      return `${seed.category}/${seed.subcategory}`;
    }));
    if (pairs.size !== 1) fail(`${demoSubcategoryId} spans several Supabase subcategories: ${[...pairs].join(', ')}`);
    const [category, subcategory] = [...pairs][0]!.split('/') as [string, string];
    const match = discoveryBySource.get(demoSubcategoryId);
    const journey = match ? input.journeys.get(`${match.category.category}\u0000${match.subcategory.name}`) ?? fail(`No journey for ${match.subcategory.name}`) : null;
    return {
      demoSubcategoryId, demoLabel: first.subcategory, demoCategoryId: first.categoryId, demoCategoryLabel: first.category,
      merchants: merchants.length, items: merchants.reduce((total, merchant) => total + merchant.items.length, 0),
      supabase: { category, subcategory },
      discovery: match ? { categoryId: match.category.discovery_key, subcategoryId: match.subcategory.discovery_key, label: match.subcategory.name,
        optionIds: match.subcategory.nested_option_candidates.filter(option => option.source_subcategory_ids.includes(demoSubcategoryId)).map(option => option.id) } : null,
      journey, action: journey ? journeys[journey] : null, status: match ? 'mapped' : 'unmapped',
    };
  }).sort((left, right) => left.demoSubcategoryId.localeCompare(right.demoSubcategoryId));
  const covered = new Set(rows.flatMap(row => row.discovery ? [row.discovery.subcategoryId] : []));
  const mapped = rows.filter(row => row.status === 'mapped');
  return {
    note: 'Generated by scripts/demo-seed/build.ts. Journeys are default intent from CATEGORY_FLOWS.md; a verified offering workflow overrides them.',
    summary: {
      demoSubcategories: rows.length, mapped: mapped.length, unmapped: rows.length - mapped.length,
      merchants: rows.reduce((total, row) => total + row.merchants, 0), mappedMerchants: mapped.reduce((total, row) => total + row.merchants, 0),
      items: rows.reduce((total, row) => total + row.items, 0),
      discoverySubcategoriesWithoutDemo: input.configuration.categories.flatMap(category => category.subcategories)
        .filter(subcategory => !covered.has(subcategory.discovery_key)).map(subcategory => subcategory.discovery_key),
    },
    subcategories: rows,
  };
}

/** New synthetic demo merchants for subcategories with none (owner decision, 8 Nov 2026). Source: demo-seed/source/gap-fill.json. */
export interface GapFillGroup {
  discoverySubcategoryId: string; demoSubcategoryId: string; demoCategoryId: string; demoLabel: string;
  /** Needed only for a category the demo API never had (Play, owner, 9 Nov 2026); otherwise its demo label is reused. */
  demoCategoryLabel?: string;
  supabase: { category: string; subcategory: string }; nameWord: string; items: [string, number][];
}
export interface GapFill { firstMerchantNumber: number; firstItemNumber: number; priceLevels: number[]; groups: GapFillGroup[] }

// The demo data's own naming pattern: three prefix sets in rotation, and five suffixes in order.
const prefixSets = [['Nairobi', 'Kijiji', 'Mara', 'Urban', 'Soko'], ['Savanna', 'Jua', 'Kipepeo', 'Atlas', 'Gold'], ['Mtaa', 'Amani', 'Rift', 'Karibu', 'Luxe']];
const suffixes = ['Works', 'Atelier', 'Services', 'House', 'Co.'];

/**
 * The whole demo catalogue: the demo API snapshot and Derrick NexG's seed, plus the gap-fill merchants.
 * Gap-fill merchants take the next demo codes (M0641…, I20001…), the snapshot's areas in turn,
 * and the seed's coordinates for those areas.
 */
export function demoCatalog(input: { snapshot: Snapshot; seed: SeedMerchant[]; gapFill: GapFill }): { snapshot: Snapshot; seed: SeedMerchant[] } {
  const labels = new Map(input.snapshot.merchants.map(merchant => [merchant.categoryId, merchant.category]));
  const places = new Map<string, { latitude: number; longitude: number }>();
  for (const row of input.seed) { const area = row.address.split(',')[0]!.trim(); if (!places.has(area)) places.set(area, { latitude: row.latitude, longitude: row.longitude }); }
  const areas = [...input.snapshot.areas].sort((left, right) => left.localeCompare(right));
  const codes = new Set(input.snapshot.merchants.map(merchant => merchant.id));
  const names = new Set(input.snapshot.merchants.map(merchant => merchant.name));
  const merchants: SnapshotMerchant[] = [];
  const seed: SeedMerchant[] = [];
  let nextItem = input.gapFill.firstItemNumber;
  input.gapFill.groups.forEach((group, groupIndex) => {
    const category = labels.get(group.demoCategoryId) ?? group.demoCategoryLabel ?? fail(`No demo merchants in category ${group.demoCategoryId}`);
    if (!group.items.length) fail(`${group.demoSubcategoryId} has no items`);
    suffixes.forEach((suffix, index) => {
      const slot = groupIndex * suffixes.length + index;
      const number = input.gapFill.firstMerchantNumber + slot;
      const code = `M${String(number).padStart(4, '0')}`;
      const name = `${prefixSets[groupIndex % prefixSets.length]![index]} ${group.nameWord} ${suffix}`;
      if (codes.has(code) || names.has(name)) fail(`Gap-fill merchant ${code} ${name} clashes with an existing demo merchant`);
      codes.add(code); names.add(name);
      const area = areas[slot % areas.length] ?? fail('The snapshot has no areas');
      const place = places.get(area) ?? fail(`No seed coordinates for ${area}`);
      const level = input.gapFill.priceLevels[index] ?? fail('Missing price level');
      merchants.push({ id: code, name, categoryId: group.demoCategoryId, category, subcategoryId: group.demoSubcategoryId, subcategory: group.demoLabel, nairobiArea: area,
        items: group.items.map(([itemName, price]) => ({ id: `I${nextItem++}`, merchantId: code, name: itemName,
          description: `${itemName} from ${name}, ${group.demoLabel} in ${area}.`, price: Math.max(10, Math.round(price * level / 10) * 10), currency: 'KES', isAvailable: true })) });
      seed.push({ code, merchantId: fixedId(demoIdPrefixes.merchant, number), legalName: `${name} Ltd`, tradingName: name,
        category: group.supabase.category, subcategory: group.supabase.subcategory, branchId: fixedId(demoIdPrefixes.branch, number),
        branchName: `${area} Branch`, address: `${area}, Nairobi`, latitude: place.latitude, longitude: place.longitude });
    });
  });
  return { snapshot: { ...input.snapshot, merchants: [...input.snapshot.merchants, ...merchants] }, seed: [...input.seed, ...seed] };
}

/** Reads back the multi-row inserts this module writes, so tests can check every generated row. */
export function parseSqlInserts(text: string): { table: string; columns: string[]; rows: SqlValue[][] }[] {
  const result: { table: string; columns: string[]; rows: SqlValue[][] }[] = [];
  for (const match of text.matchAll(/insert into public\.(\w+) \(([^)]*)\) values\n/g)) {
    const rows: SqlValue[][] = [];
    let index = match.index + match[0].length;
    for (;;) {
      while (/\s/.test(text[index] ?? '')) index++;
      if (text[index] !== '(') break;
      const group = parenthesised(text, index);
      rows.push(parseSqlValues(group.inner));
      index = group.end + 1;
      if (text[index] !== ',') break;
      index++;
    }
    result.push({ table: match[1]!, columns: match[2]!.split(',').map(column => column.trim()), rows });
  }
  return result;
}

/** Fixed ID ranges that mark demo rows, since Supabase has no demo column yet. */
export const demoIdPrefixes = { merchant: 'c1', branch: 'd1', section: 'f2', item: 'f1', licence: 'f3' } as const;
export const fixedId = (prefix: string, value: number) => `${prefix}000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const codeNumber = (code: string, letter: 'M' | 'I') => { const match = new RegExp(`^${letter}(\\d{1,12})$`).exec(code); return match ? Number(match[1]) : fail(`Unexpected demo code ${code}`); };

const restricted = new Set(['adults-only', 'alcohol-beverages']);
function sectionName(row: SubcategoryRow): string {
  if (row.discovery?.categoryId === 'restaurants-food' && row.action === 'buy') return 'Menu';
  switch (row.journey) {
    case 'PURCHASE': case 'RESTRICTED_PURCHASE': return 'Products';
    case 'RENTAL': return 'Rentals';
    case 'TICKET': return 'Tickets';
    case 'TOUR': return 'Tours and packages';
    case 'TRANSFER': return 'Transfers';
    default: return 'Services';
  }
}

const sql = (value: string | number | boolean | null): string =>
  value === null ? 'null' : typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(value);
function inserts(table: string, columns: string[], rows: (string | number | boolean | null)[][], literal: Record<number, string> = {}): string {
  const out: string[] = [];
  for (let start = 0; start < rows.length; start += 500) {
    const values = rows.slice(start, start + 500).map(row => `  (${row.map((value, position) => literal[position] ?? sql(value)).join(', ')})`);
    out.push(`insert into public.${table} (${columns.join(', ')}) values\n${values.join(',\n')}\non conflict do nothing;`);
  }
  return out.join('\n\n');
}

/**
 * The local demo catalogue as one guarded, re-runnable SQL file: the seed's merchants and branches
 * (with undeliverable demo contacts), one section per merchant, and every demo item with its price.
 */
export function renderSeedSql(input: { snapshot: Snapshot; seed: SeedMerchant[]; map: SubcategoryMap; sources: { snapshotSha256: string; supabaseSeedSha256: string; gapFillSha256: string } }): string {
  const rows = new Map(input.map.subcategories.map(row => [row.demoSubcategoryId, row]));
  const seedByCode = new Map(input.seed.map(row => [row.code, row]));
  const merchants: (string | number | boolean | null)[][] = [];
  const branches: (string | number | boolean | null)[][] = [];
  const sections: (string | number | boolean | null)[][] = [];
  const items: (string | number | boolean | null)[][] = [];
  const licences: (string | number | boolean | null)[][] = [];
  const itemIds = new Set<string>();
  for (const merchant of [...input.snapshot.merchants].sort((left, right) => left.id.localeCompare(right.id))) {
    const seed = seedByCode.get(merchant.id) ?? fail(`${merchant.id} is missing from the Supabase seed`);
    const row = rows.get(merchant.subcategoryId) ?? fail(`${merchant.id}: subcategory ${merchant.subcategoryId} is not in the map`);
    const number = codeNumber(merchant.id, 'M');
    const merchantId = fixedId(demoIdPrefixes.merchant, number);
    if (merchantId !== seed.merchantId) fail(`${merchant.id}: seed id ${seed.merchantId} breaks the fixed range`);
    const code = merchant.id.toLowerCase();
    merchants.push([merchantId, seed.legalName, seed.tradingName, seed.category, seed.subcategory, `Demo contact, ${seed.tradingName}`,
      `+254000${String(number).padStart(6, '0')}`, `${code}@example.com`, null, 'live', true, null, true]);
    branches.push([seed.branchId, merchantId, seed.branchName, seed.address, true, seed.latitude, seed.longitude]);
    const sectionId = fixedId(demoIdPrefixes.section, number);
    sections.push([sectionId, merchantId, sectionName(row), 0]);
    const ageRestricted = row.journey === 'RESTRICTED_PURCHASE' && restricted.has(row.discovery?.categoryId ?? '');
    // catalogue_public shows age-restricted items only with a verified liquor licence on file (owner decision, 8 Nov: seed demo licences).
    if (ageRestricted && merchant.items.length) licences.push([fixedId(demoIdPrefixes.licence, number), 'merchant', merchantId, null,
      `demo/liquor-licence/${code}.pdf`, 'application/pdf', 1024, '2026-01-01', '2027-12-31', 'verified', null, 1]);
    merchant.items.forEach((item, position) => {
      if (item.merchantId !== merchant.id) fail(`${item.id} belongs to ${item.merchantId}, not ${merchant.id}`);
      if (item.currency !== 'KES' || !Number.isInteger(item.price) || item.price! <= 0 || item.price! > 1_000_000) fail(`${item.id}: price must be whole KES between 1 and 1,000,000`);
      const description = item.description?.trim() || null;
      if (description && description.length > 400) fail(`${item.id}: description is over 400 characters`);
      const itemId = fixedId(demoIdPrefixes.item, codeNumber(item.id, 'I'));
      if (itemIds.has(itemId)) fail(`${item.id} appears twice`);
      itemIds.add(itemId);
      items.push([itemId, sectionId, merchantId, item.name.trim(), description, item.price!, item.isAvailable !== false, ageRestricted, false, position]);
    });
  }
  const city = "(select id from public.city where name = 'Nairobi' limit 1)";
  const liquorLicence = "(select id from public.document_requirement where owner_type = 'merchant' and kind = 'liquor_licence')";
  return [
    '-- NEXG DISCOVERY local demo catalogue (owner decision, 8 Nov 2026; plan step D3).',
    '-- LOCAL SUPABASE ONLY. Never load this into a hosted project.',
    '-- Generated by scripts/demo-seed/build.ts. Edit the sources, not this file.',
    `--   demo API snapshot: demo-seed/source/demo-api-snapshot.json (sha256 ${input.sources.snapshotSha256})`,
    `--   Supabase merchant seed: Derrick NexG/supabase/seeds/merchants-seed-catalog.sql (sha256 ${input.sources.supabaseSeedSha256})`,
    `--   gap-fill merchants for subcategories with none: demo-seed/source/gap-fill.json (sha256 ${input.sources.gapFillSha256})`,
    `-- Rows: ${merchants.length} merchants, ${branches.length} branches, ${sections.length} sections, ${items.length} items, ${licences.length} demo liquor licences.`,
    '-- Demo rows are marked by their fixed ID ranges: merchants c1000000-0000-4000-8000-…, branches d1000000-…, sections f2000000-…, items f1000000-…, licences f3000000-….',
    '-- Contacts are undeliverable: emails on example.com, phone numbers +254 0… that no Kenyan line can have.',
    '-- Demo liquor licences (verified, no file behind them) let catalogue_public show the adult and alcohol items. Local demo only.',
    '-- Load in one session, after confirming the target is the local database:',
    "--   set nexg.demo_seed_target = 'local';",
    '-- Re-running is safe: rows that already exist are left as they are.',
    '',
    'begin;',
    '',
    'do $$',
    'begin',
    "  if coalesce(current_setting('nexg.demo_seed_target', true), '') <> 'local' then",
    "    raise exception 'This demo catalogue is for the local Supabase only. Run: set nexg.demo_seed_target = ''local''; in the same session first.';",
    '  end if;',
    "  if not exists (select 1 from public.city where name = 'Nairobi') then",
    "    raise exception 'No Nairobi city row. Apply the Derrick NexG migrations first.';",
    '  end if;',
    "  if not exists (select 1 from public.document_requirement where owner_type = 'merchant' and kind = 'liquor_licence') then",
    "    raise exception 'No merchant liquor_licence requirement. Apply the Derrick NexG migrations first.';",
    '  end if;',
    'end $$;',
    '',
    inserts('merchant', ['id', 'legal_name', 'trading_name', 'category', 'subcategory', 'contact_name', 'contact_phone', 'contact_email', 'city_id', 'status', 'explore_visible', 'went_live_at', 'accepting_orders'],
      merchants, { 8: city, 11: 'now()' }),
    '',
    inserts('merchant_branch', ['id', 'merchant_id', 'name', 'address_text', 'is_primary', 'latitude', 'longitude'], branches),
    '',
    inserts('catalogue_section', ['id', 'merchant_id', 'name', 'sort'], sections),
    '',
    inserts('catalogue_item', ['id', 'section_id', 'merchant_id', 'name', 'description', 'price_kes', 'available', 'age_restricted', 'highlighted', 'sort'], items),
    '',
    // After the merchants: each insert re-runs fn_partner_recompute_status, which leaves a live merchant unchanged unless a document is rejected or expired.
    inserts('document', ['id', 'owner_type', 'owner_id', 'requirement_id', 'storage_path', 'mime', 'size_bytes', 'issued_at', 'expires_at', 'status', 'reviewed_at', 'version'],
      licences, { 3: liquorLicence, 10: 'now()' }),
    '',
    'do $$',
    'declare merchants integer; items integer;',
    'begin',
    "  select count(*) into merchants from public.merchant where id::text like 'c1000000-0000-4000-8000-%';",
    "  select count(*) into items from public.catalogue_item where id::text like 'f1000000-0000-4000-8000-%';",
    "  raise notice 'Demo catalogue present: % merchants, % items.', merchants, items;",
    'end $$;',
    '',
    'commit;',
    '',
  ].join('\n');
}

/** A review table for the owner, grouped by Discovery category. */
export function renderMapReview(map: SubcategoryMap, configuration: Configuration): string {
  const lines = ['# Demo subcategory map (for review)', '',
    'Generated by `scripts/demo-seed/build.ts` from `subcategory-map.json`. Edit the sources, not this file.', '',
    `${map.summary.demoSubcategories} demo subcategories: ${map.summary.mapped} mapped onto Discovery (${map.summary.mappedMerchants} of ${map.summary.merchants} merchants), ${map.summary.unmapped} not mapped. ${map.summary.items} items in all.`, '',
    'Journey is the default from `CATEGORY_FLOWS.md`. Action: buy, book or request.', ''];
  for (const category of configuration.categories) {
    lines.push(`## ${category.category}`, '', '| Discovery subcategory | Demo subcategory | Supabase keys | Merchants | Items | Journey | Action |', '|---|---|---|---|---|---|---|');
    for (const subcategory of category.subcategories) {
      const rows = map.subcategories.filter(row => row.discovery?.subcategoryId === subcategory.discovery_key);
      if (!rows.length) lines.push(`| ${subcategory.name} | — (no demo merchants) | — | 0 | 0 | — | — |`);
      for (const row of rows) lines.push(`| ${subcategory.name} | ${row.demoLabel} (\`${row.demoSubcategoryId}\`) | \`${row.supabase.category}\` / \`${row.supabase.subcategory}\` | ${row.merchants} | ${row.items} | ${row.journey} | ${row.action} |`);
    }
    lines.push('');
  }
  lines.push('## Not mapped onto Discovery', '', 'These demo merchants exist in Supabase but have no Discovery subcategory yet, so Discovery doesn\'t show them.', '',
    '| Demo category | Demo subcategory | Supabase keys | Merchants | Items |', '|---|---|---|---|---|');
  for (const row of map.subcategories.filter(entry => entry.status === 'unmapped')) lines.push(`| ${row.demoCategoryLabel} | ${row.demoLabel} (\`${row.demoSubcategoryId}\`) | \`${row.supabase.category}\` / \`${row.supabase.subcategory}\` | ${row.merchants} | ${row.items} |`);
  return lines.join('\n') + '\n';
}
