/** Offline actual-SQL fixture test. No server, disk database, Supabase or network.
 * Uses installed PGlite; reduced schema is NOT full migration/RLS rollout proof.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let modulePath;
try {
  modulePath = require.resolve('@electric-sql/pglite');
} catch {
  modulePath = path.join(
    root,
    'node_modules/.pnpm/@electric-sql+pglite@0.5.14/node_modules/@electric-sql/pglite/dist/index.js',
  );
}
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const read = (name) => readFile(path.join(root, 'supabase/migrations', name), 'utf8');
const base = await read('20261118000100_stay_holds_and_blocks.sql');
const sample = await read('20261122000100_sample_listings.sql');
const source = await read('20261224000100_stay_filter_candidates.sql');
function fn(sql, name) {
  const result = sql.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'),
  );
  assert.ok(result, `Existing source function ${name}`);
  return result[0];
}
function view(sql, name) {
  const result = sql.match(
    new RegExp(`create or replace view public\\.${name}\\s[\\s\\S]*?;`, 'i'),
  );
  assert.ok(result, `Existing public view ${name}`);
  return result[0];
}
let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks++;
  console.log(`ok ${checks} - ${message}`);
}
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
try {
  await db.exec(`
    create role anon; create role authenticated;
    create table public.host(id uuid primary key, status text, time_zone text);
    create table public.city(id uuid primary key, name text);
    create table public.property(id uuid primary key, host_id uuid, slug text, name text, kind text,
      area text, city_id uuid, summary text, description text, amenities text[], photos jsonb,
      neighbourhood_note text, check_in_from time, check_out_by time, is_sample boolean, listed boolean);
    create table public.unit(id uuid primary key, property_id uuid, host_id uuid, label_public text,
      name text, unit_summary text, bedrooms integer, bathrooms numeric, max_guests integer,
      size_sqm integer, bed_setup text, nightly_rate_kes bigint, min_nights integer,
      unit_amenities text[], photos jsonb, floor text, area text, handoff text,
      status text, listed boolean, archived_at timestamptz, checkin_time time, checkout_time time);
    create table public.stay(unit_id uuid, status text, hold_expires_at timestamptz, check_in timestamptz, check_out timestamptz);
  `);
  for (const name of ['property_public', 'property_unit_public']) await db.exec(view(sample, name));
  for (const name of ['fn_stay_dates_check', 'fn_stay_window', 'fn_stay_occupies'])
    await db.exec(fn(base, name));
  await db.exec(fn(sample, 'rpc_stay_search'));
  await db.exec(source);
  await db.query('insert into public.city values ($1,$2)', [uid(1), 'Fixture city']);
  await db.query('insert into public.host values ($1,$2,$3),($4,$5,$3)', [
    uid(10),
    'live',
    'Africa/Nairobi',
    uid(11),
    'paused',
  ]);
  for (const [id, host, isSample, listed, area] of [
    [20, 10, false, true, 'Test area'],
    [21, 10, true, true, 'Test area'],
    [22, 10, false, false, 'Test area'],
    [23, 11, false, true, 'Test area'],
    [24, 10, false, true, 'Overflow'],
  ]) {
    await db.query(
      `insert into public.property(id,host_id,slug,name,kind,area,city_id,amenities,is_sample,listed)
      values($1,$2,$3,$3,'apartment',$4,$5,array['pool'],$6,$7)`,
      [uid(id), uid(host), `fixture-${id}`, area, uid(1), isSample, listed],
    );
  }
  async function unit(
    id,
    property = 20,
    guests = 4,
    rate = 2000,
    amenities = ['wifi'],
    min = 1,
    host = 10,
  ) {
    await db.query(
      `insert into public.unit(id,property_id,host_id,name,bedrooms,max_guests,nightly_rate_kes,
      min_nights,unit_amenities,status,listed,photos) values($1,$2,$3,$4,2,$5,$6,$7,$8,'live',true,'[]')`,
      [uid(id), uid(property), uid(host), `unit-${id}`, guests, rate, min, amenities],
    );
  }
  await unit(30, 20, 4, 1000); // blocked, ideal price/capacity cannot be mixed with other unit's vacancy
  await unit(31, 20, 2, 500, []);
  await unit(32);
  await unit(33, 20, 4, null);
  await unit(34, 20, 4, 1500, ['wifi'], 4);
  await unit(35, 21);
  await unit(36, 22);
  await unit(37, 23, 4, 1000, ['wifi'], 1, 11);
  const dates = (
    await db.query(`select ((now() at time zone 'Africa/Nairobi')::date+10)::text as a,
    ((now() at time zone 'Africa/Nairobi')::date+12)::text as b`)
  ).rows[0];
  await db.query(
    `insert into public.stay select $1,'blocked',null,
    lower(public.fn_stay_window($1,$2::date,$3::date)),upper(public.fn_stay_window($1,$2::date,$3::date))`,
    [uid(30), dates.a, dates.b],
  );
  async function query(overrides = {}) {
    const p = {
      checkIn: dates.a,
      checkOut: dates.b,
      guests: 4,
      city: uid(1),
      area: 'Test area',
      budget: null,
      amenities: ['wifi'],
      bedrooms: null,
      property: null,
      minBudget: null,
      maxBedrooms: null,
      propertyTypes: [],
      cityName: null,
      ...overrides,
    };
    return (
      await db.query(
        'select public.rpc_stay_filter_candidates_v1($1::date,$2::date,$3::integer,$4::uuid,$5::text,$6::bigint,$7::text[],$8::integer,$9::uuid,$10::bigint,$11::integer,$12::text[],$13::text) as result',
        Object.values(p),
      )
    ).rows[0].result;
  }
  let r = await query();
  check(
    r.complete && r.count === 1 && r.items[0].unit_id === uid(32),
    'Global exact same-unit intersection excludes blocked, unknown-rate, min-night, sample, hidden and paused-host units',
  );
  check(
    r.items[0].nightly_rate_kes === 2000 &&
      r.items[0].room_subtotal_kes === 4000 &&
      r.price_basis === 'room_only',
    'Room subtotal is source nightly rate times nights, not an all-in quote',
  );
  check(
    r.held === false && r.booking === 'not_checked',
    'Availability is not a hold or completed booking',
  );
  check(
    (await query({ budget: 1500 })).count === 0,
    'Does not combine cheap blocked unit A with vacant expensive unit C',
  );
  check(
    (await query({ guests: 2, amenities: [] })).items.map((x) => x.unit_id).join() ===
      [uid(31), uid(32)].join(),
    'All matches sorted by nightly price then identity',
  );
  check(
    (await query({ amenities: ['pool', 'wifi', 'wifi'] })).count === 1,
    'Property amenities union with that same unit; duplicate requested keys harmless',
  );
  check(
    (await query({ amenities: ['not-published'] })).count === 0,
    'Unknown amenity never silently ignored',
  );
  check((await query({ bedrooms: 3 })).count === 0, 'Bedrooms apply to same unit');
  check(
    (await query({ bedrooms: 2, maxBedrooms: 2 })).count === 1 &&
      (await query({ bedrooms: 1, maxBedrooms: 1 })).count === 0,
    'Exact bedroom range selects same-unit count rather than property minimum',
  );
  check(
    (await query({ minBudget: 2001 })).count === 0 &&
      (await query({ minBudget: 2000, budget: 2000 })).count === 1,
    'Min and max nightly rate apply before candidate bounds',
  );
  check(
    (await query({ propertyTypes: ['villa'] })).count === 0 &&
      (await query({ propertyTypes: ['apartment', 'apartment'] })).count === 1,
    'Exact raw property types constrain source, duplicates harmless',
  );
  check(
    (await query({ cityName: ' fixture CITY ' })).count === 1 &&
      (await query({ cityName: 'Elsewhere' })).count === 0,
    'City-name scope normalized exactly without slug guessing',
  );
  const meta = r.items[0].property;
  check(
    meta.id === uid(20) &&
      meta.name === 'fixture-20' &&
      meta.property_type === 'apartment' &&
      meta.latitude === null &&
      meta.longitude === null &&
      Array.isArray(meta.photos),
    'Same-statement public property metadata; no invented map coordinates',
  );
  await db.query(`update public.property set photos=$1::jsonb where id=$2`, [
    JSON.stringify([
      { path: 'private-bucket/sensitive.jpg', alt: 'Living room', cover: true, secret: 'hidden' },
      { placeholder: true, caption: 'Balcony' },
      { unknown: 'skip' },
    ]),
    uid(20),
  ]);
  const imageMeta = (await query()).items[0].property.photos;
  check(
    imageMeta.length === 2 &&
      imageMeta[0].label === 'Living room' &&
      imageMeta[0].cover === true &&
      !JSON.stringify(imageMeta).includes('private-bucket') &&
      !JSON.stringify(imageMeta).includes('hidden'),
    'Photos expose safe label and cover only, never storage path or arbitrary metadata',
  );
  const echoed = (
    await query({
      minBudget: 100,
      maxBedrooms: 2,
      propertyTypes: ['villa', 'apartment', 'villa'],
      cityName: ' Fixture City ',
    })
  ).request;
  check(
    echoed.min_nightly_kes === 100 &&
      echoed.max_bedrooms === 2 &&
      echoed.city_name === 'fixture city' &&
      echoed.property_types.join() === 'apartment,villa',
    'Extended normalized request echo binds every predicate',
  );
  check(
    (await query({ city: uid(99) })).count === 0 && (await query({ area: 'Other' })).count === 0,
    'City and area are strict scopes',
  );
  check(
    (await query({ area: ' test AREA ' })).count === 1,
    'Area trim/case normalization preserves exact matching',
  );
  check(
    (await query({ property: uid(21) })).count === 0,
    'Explicit sample property cannot bypass visibility',
  );
  for (const overrides of [
    { guests: 0 },
    { guests: null },
    { budget: 0 },
    { minBudget: -1 },
    { minBudget: 3000, budget: 2000 },
    { bedrooms: 3, maxBedrooms: 2 },
    { propertyTypes: [null] },
    { cityName: '' },
    { area: '' },
    { amenities: [null] },
    { amenities: Array(33).fill('wifi') },
    { checkOut: dates.a },
  ]) {
    await assert.rejects(query(overrides), (e) => e.code === '22023');
  }
  check(true, 'Invalid dates, guests, budget, blank area and invalid amenity arrays rejected');
  await db.query(
    `update public.stay set status='held',hold_expires_at=now()-interval '1 minute' where unit_id=$1`,
    [uid(30)],
  );
  check((await query()).items[0].unit_id === uid(30), 'Expired holds do not block');
  await db.query(
    `update public.stay set status='blocked',check_in=lower(public.fn_stay_window($1,$2::date,$3::date))-interval '1 day',check_out=lower(public.fn_stay_window($1,$2::date,$3::date)) where unit_id=$1`,
    [uid(30), dates.a, dates.b],
  );
  check(
    (await query()).items[0].unit_id === uid(30),
    'Nonoverlapping boundary does not block (existing range rule)',
  );
  await db.query(`update public.unit set max_guests=null where id=$1`, [uid(30)]);
  check((await query()).count === 1, 'Unknown capacity is not presented as confirmed capacity');
  await db.query(`update public.unit set archived_at=now() where id=$1`, [uid(32)]);
  check((await query()).count === 0, 'Archived units disappear without stale positive claims');
  await db.query(`update public.unit set archived_at=null where id=$1`, [uid(32)]);
  await db.exec('set role anon');
  r = await query();
  check(
    r.count === 1 &&
      Object.keys(r.items[0]).sort().join() ===
        [
          'amenities',
          'bedrooms',
          'max_guests',
          'nightly_rate_kes',
          'nights',
          'property_id',
          'property',
          'room_subtotal_kes',
          'unit_id',
        ]
          .sort()
          .join(),
    'Anonymous API output is restricted public facts, no occupant/hold/payment/private address',
  );
  await assert.rejects(db.query('select * from public.stay'), (e) => e.code === '42501');
  check(true, 'Granting the RPC does not grant anonymous stay-table access');
  await db.exec('reset role');
  await db.query(
    `insert into public.unit(id,property_id,host_id,name,bedrooms,max_guests,nightly_rate_kes,min_nights,unit_amenities,status,listed)
    select ('00000000-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,$1,$2,'overflow-'||i,2,4,1000,1,array['wifi'],'live',true from generate_series(1,1000) i`,
    [uid(24), uid(10)],
  );
  r = await query({ area: 'Overflow' });
  check(
    r.complete && r.count === 1000 && r.items.length === 1000,
    'Exactly 1000 matches returned completely',
  );
  await unit(10001, 24);
  r = await query({ area: 'Overflow' });
  check(
    r.status === 'too_broad' && r.complete === false && r.items.length === 0 && !('count' in r),
    '1001 matches return explicit incomplete status, never partial inventory or a false total',
  );
  check(
    (await query({ area: 'Overflow', minBudget: 1500 })).count === 1,
    'Minimum budget applies before overflow bound, not to a fetched page',
  );
  await db.query('update public.unit set bedrooms=3 where id=$1', [uid(10001)]);
  check(
    (await query({ area: 'Overflow', bedrooms: 3 })).count === 1 &&
      (await query({ area: 'Overflow', bedrooms: 2, maxBedrooms: 2 })).count === 1000,
    '3+ and exact2 distinguish same-unit counts before overflow bound',
  );
  check(
    (await query({ area: 'Overflow', property: uid(20) })).count === 0,
    'Overflow population does not contaminate explicit different-property scope',
  );
  check(
    (await db.query('select count(*)::int as n from public.stay')).rows[0].n === 1,
    'Read RPC never created holds or booking rows',
  );
  console.log(
    `PASS ${checks} actual-SQL fixture checks. Full Supabase migrations/RLS/performance and deployment remain untested.`,
  );
} finally {
  await db.close();
}
