#!/usr/bin/env node
// A NexG Stays review property, so App Store and Google Play reviewers can book a
// night and pay with Paystack test money.
//
//   node scripts/review-merchants/stay.mjs --target local|live \
//     --host-email <review host login> --guest-email <review guest login>
//   ... --photos          also upload the photos, signed in as the review host
//   ... --remove          take the property away again (unlist, archive, drop the reviewer row)
//
// The owner creates both accounts (email and password) in the apps; this script
// never creates, stores or prints a password. It finds the two accounts by email and:
//   - makes the host an approved, live host, with the host account as its owner;
//   - adds one listed, review-approved property in Kilimani, Nairobi, with a map
//     pin, house rules and cancellation text, and `accepts_test_payments`;
//   - adds one published unit with a nightly rate;
//   - adds the guest account to `payment_reviewer` (it then sees test listings and
//     pays with Paystack test keys).
// A test property shows only to staff and `payment_reviewer` accounts
// (property_public: authz.sees_test_tenants()).
//
// --photos signs in as the review host, the way the host portal uploads: the storage
// rules let only members of a host write under its folder of `host-photos`. The host
// password is typed at a hidden prompt (or REVIEW_HOST_PASSWORD) and is not kept.
//
// Re-running is safe: every row has a fixed id and is updated in place.
// SQL runs the same way as seed.mjs: local through the review database container,
// live through scripts/query-production.sh (REVIEW_PROD_SQL to point elsewhere).

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

const root = resolve(import.meta.dirname, '../..');
const local = resolve(root, '.booking-local');
mkdirSync(local, { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = option('target');
if (!['local', 'live'].includes(target)) {
  console.error('Choose --target local or --target live.');
  process.exit(1);
}

// ─────────────────────────────────────────────── the property

/** Fixed ids: ae7e5a00 is "review stay". */
const sid = (n) => `ae7e5a00-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export const STAY = {
  host: sid(1),
  property: sid(2),
  unit: sid(3),
  slug: 'nexg-review-apartment-kilimani',
  lat: -1.2921,
  lng: 36.7856,
};

const PROPERTY_PHOTOS = [
  ['stay-building', 'outside', 'The apartment block from the street'],
  ['stay-living', 'living', 'Living room'],
];
const UNIT_PHOTOS = [
  ['stay-living', 'living', 'Living room with sofa and lounge chairs'],
  ['stay-bedroom', 'bedroom', 'Bedroom with a queen bed'],
  ['stay-kitchen', 'kitchen', 'Kitchen with oven and breakfast bar'],
  ['stay-bathroom', 'washroom', 'Bathroom with shower'],
  ['stay-building', 'outside', 'The apartment block'],
];
const photoPath = (owner, i) =>
  `${STAY.host}/${owner}/${sid(0x100 + (owner === STAY.unit ? 0x10 : 0) + i)}.jpg`;
const photoJson = (owner, list) =>
  JSON.stringify(
    list.map(([, room, alt], i) => ({ path: photoPath(owner, i), alt, room, cover: i === 0 })),
  );

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);

const HOUSE_RULES = [
  'This is a NexG review listing for App Store and Google Play review: no one stays here.',
  'Check-in from 14:00, check-out by 10:00.',
  'No smoking inside. No parties or events.',
  'Quiet hours 22:00 to 07:00.',
  'Up to 2 guests.',
].join('\n');
const CANCELLATION =
  'Flexible: cancel up to 24 hours before check-in for a full refund. Review bookings are paid with Paystack test money, so no real money is charged or refunded.';

function seedSql(hostEmail, guestEmail, withPhotos) {
  const point = `extensions.st_setsrid(extensions.st_makepoint(${STAY.lng}, ${STAY.lat}), 4326)::extensions.geography`;
  return `\\set ON_ERROR_STOP on
begin;
do $$
declare
  v_host_user uuid := (select id from auth.users where lower(email) = lower(${q(hostEmail)}));
  v_guest_user uuid := (select id from auth.users where lower(email) = lower(${q(guestEmail)}));
begin
  if v_host_user is null then raise exception 'No account with the review host email. Create it in the app first.'; end if;
  if v_guest_user is null then raise exception 'No account with the review guest email. Create it in the app first.'; end if;
  if v_host_user = v_guest_user then raise exception 'The host and the guest must be two different accounts.'; end if;
end $$;

-- The host: approved and live (status live needs verified_at).
insert into public.host (id, kind, display_name, contact_name, phone, email, city_id, status,
  submitted_at, verified_at, went_live_at, verification_method, verification_submitted_at,
  default_handoff, notes)
values (${q(STAY.host)}, 'single_unit', 'NexG Review Stays', 'NexG App Review', '+254700000300',
  lower(${q(hostEmail)}), (select id from public.city where slug = 'nairobi'), 'live',
  now(), now(), now(), 'listing_code', now(), 'reception',
  'App Store and Google Play review host. Test payments only.')
on conflict (id) do update set status = 'live', email = excluded.email,
  verified_at = coalesce(public.host.verified_at, now()),
  went_live_at = coalesce(public.host.went_live_at, now()), paused_at = null;

insert into public.host_user (host_id, user_id, role, accepted_at)
select ${q(STAY.host)}, id, 'owner', now() from auth.users where lower(email) = lower(${q(hostEmail)})
on conflict (host_id, user_id) do nothing;

-- The property: listed, review-approved, a test tenant.
insert into public.property (id, host_id, slug, name, kind, area, city_id, point, summary, description,
  neighbourhood_note, amenities, check_in_from, check_out_by, house_rules, cancellation_policy,
  cancellation_terms, listed, listed_at, is_sample, accepts_test_payments, review_status, reviewed_at)
values (${q(STAY.property)}, ${q(STAY.host)}, ${q(STAY.slug)}, 'NexG Review Apartment, Kilimani', 'apartment',
  'Kilimani', (select id from public.city where slug = 'nairobi'), ${point},
  'A review listing for App Store and Google Play reviewers: book a night and pay with Paystack test money.',
  ${q('This listing exists so app reviewers can try NexG Stays from search to payment. It is a one-bedroom apartment in Kilimani, Nairobi, shown only to review and staff accounts. Bookings are paid with Paystack test cards or test M-Pesa, so no money moves and no one checks in.')},
  'Kilimani is a quiet, leafy area close to Yaya Centre and Adlife Plaza, about 15 minutes from the city centre.',
  array['Wi-Fi', 'Parking', 'Kitchen', 'Washing machine', 'Workspace', 'Backup power', 'Lift', 'Guarded gate']::text[],
  '14:00', '10:00', ${q(HOUSE_RULES)}, ${q(CANCELLATION)}, '{"preset":"flexible"}'::jsonb,
  true, now(), false, true, 'approved', now())
on conflict (id) do update set name = excluded.name, slug = excluded.slug, point = excluded.point,
  summary = excluded.summary, description = excluded.description, neighbourhood_note = excluded.neighbourhood_note,
  amenities = excluded.amenities, house_rules = excluded.house_rules, cancellation_policy = excluded.cancellation_policy,
  cancellation_terms = excluded.cancellation_terms, listed = true, listed_at = coalesce(public.property.listed_at, now()),
  is_sample = false, accepts_test_payments = true, review_status = 'approved',
  reviewed_at = coalesce(public.property.reviewed_at, now()), archived_at = null, deleted_at = null,
  unlisted_by_staff_at = null;

-- One unit, published, with a nightly rate.
insert into public.unit (id, host_id, property_id, name, label_public, address_line, building, unit_no,
  area, city_id, point, zone_id, status, handoff, handoff_note, delivery_hours, checkin_time, checkout_time,
  bedrooms, bathrooms, max_guests, size_sqm, bed_setup, nightly_rate_kes, min_nights, unit_summary,
  unit_amenities, listed, host_published)
values (${q(STAY.unit)}, ${q(STAY.host)}, ${q(STAY.property)}, 'Review 1-bedroom', 'One-bedroom apartment',
  'Review listing, Argwings Kodhek Road, Kilimani, Nairobi', 'NexG Review Apartment', 'R1', 'Kilimani',
  (select id from public.city where slug = 'nairobi'), ${point},
  (select z.id from public.zone_for_point(${STAY.lng}, ${STAY.lat}) z limit 1),
  'live', 'reception', 'Review listing: no one checks in.', '{"from":"08:00","to":"20:00"}'::jsonb,
  '14:00', '10:00', 1, 1, 2, 55, '1 queen', 5000, 1,
  'A bright one-bedroom for two, with a full kitchen and a workspace. Review listing: test payments only.',
  array['Wi-Fi', 'Kitchen', 'Washing machine', 'Workspace', 'Balcony']::text[], true, true)
on conflict (id) do update set name = excluded.name, label_public = excluded.label_public,
  address_line = excluded.address_line, point = excluded.point, zone_id = excluded.zone_id, status = 'live',
  handoff = excluded.handoff, bedrooms = excluded.bedrooms, bathrooms = excluded.bathrooms,
  max_guests = excluded.max_guests, size_sqm = excluded.size_sqm, bed_setup = excluded.bed_setup,
  nightly_rate_kes = excluded.nightly_rate_kes, min_nights = excluded.min_nights,
  unit_summary = excluded.unit_summary, unit_amenities = excluded.unit_amenities, listed = true,
  host_published = true, archived_at = null, deleted_at = null;

${
  withPhotos
    ? `update public.property set photos = ${q(photoJson(STAY.property, PROPERTY_PHOTOS))}::jsonb where id = ${q(STAY.property)};
update public.unit set photos = ${q(photoJson(STAY.unit, UNIT_PHOTOS))}::jsonb where id = ${q(STAY.unit)};`
    : ''
}

-- The review guest sees test listings and pays with Paystack test keys.
insert into public.payment_reviewer (user_id, note)
select id, 'App review guest (NexG Stays)' from auth.users where lower(email) = lower(${q(guestEmail)})
on conflict (user_id) do nothing;
commit;
`;
}

function removeSql(guestEmail) {
  return `\\set ON_ERROR_STOP on
begin;
update public.unit set listed = false, status = 'archived', archived_at = coalesce(archived_at, now())
  where id = ${q(STAY.unit)};
update public.property set listed = false, archived_at = coalesce(archived_at, now()) where id = ${q(STAY.property)};
update public.host set status = 'paused', paused_at = now() where id = ${q(STAY.host)};
${
  guestEmail
    ? `delete from public.payment_reviewer where note = 'App review guest (NexG Stays)'
  and user_id = (select id from auth.users where lower(email) = lower(${q(guestEmail)}));`
    : ''
}
commit;
`;
}

const checkSql = `select json_build_object(
  'listed_for_reviewers', exists (select 1 from public.property p join public.host h on h.id = p.host_id
     where p.id = ${q(STAY.property)} and p.listed and h.status = 'live' and p.review_status = 'approved'
       and p.archived_at is null and p.deleted_at is null and p.accepts_test_payments),
  'bookable_unit', exists (select 1 from public.unit u where u.id = ${q(STAY.unit)} and u.status = 'live'
     and u.listed and u.nightly_rate_kes > 0 and u.archived_at is null and u.deleted_at is null),
  'property_photos', (select coalesce(jsonb_array_length(photos), 0) from public.property where id = ${q(STAY.property)}),
  'unit_photos', (select coalesce(jsonb_array_length(photos), 0) from public.unit where id = ${q(STAY.unit)}),
  'reviewers', (select count(*) from public.payment_reviewer));`;

// ─────────────────────────────────────────────── running SQL (as seed.mjs)

function runSql(sql, { tuples = false } = {}) {
  const file = resolve(local, `review-stay-${Date.now()}.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  const flags = tuples ? ['-t', '-A'] : ['-q'];
  try {
    const input = readFileSync(file);
    const result =
      target === 'local'
        ? spawnSync(
            'docker',
            [
              'exec',
              '-i',
              process.env.REVIEW_DB_CONTAINER ?? 'supabase_db_nexg-review',
              'psql',
              '-U',
              'postgres',
              ...flags,
            ],
            { input, encoding: 'utf8' },
          )
        : spawnSync(
            process.env.REVIEW_BASH ?? 'bash',
            [process.env.REVIEW_PROD_SQL ?? resolve(root, 'scripts/query-production.sh'), ...flags],
            { input, encoding: 'utf8', cwd: root },
          );
    if (result.status !== 0 || /ERROR:/.test(result.stderr ?? ''))
      throw new Error((result.stderr || result.stdout || '').trim().slice(0, 2000));
    return result.stdout;
  } finally {
    rmSync(file, { force: true });
  }
}

// ─────────────────────────────────────────────── photos, as the review host

function storageAccess() {
  if (target === 'live') {
    const url = process.env.SUPABASE_URL,
      anon = process.env.SUPABASE_ANON_KEY;
    if (!url || !anon)
      throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY (the public key) for --photos.');
    return { url, anon };
  }
  const workdir = process.env.REVIEW_SUPABASE_WORKDIR;
  if (!workdir)
    throw new Error('Set REVIEW_SUPABASE_WORKDIR (the folder `supabase start` ran in).');
  const env = execFileSync(process.env.SUPABASE_CLI ?? 'supabase', ['status', '-o', 'env'], {
    cwd: workdir,
    encoding: 'utf8',
  });
  const read = (name) => env.match(new RegExp('^' + name + '="?([^"\n]+)"?', 'm'))?.[1];
  return { url: read('API_URL'), anon: read('ANON_KEY') };
}

/** fetch, tried up to four times: a dropped connection should not stop the run. */
async function fetchRetry(url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      if (attempt >= 4) throw new Error(`${String(url).split('?')[0]}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function hostPassword() {
  if (process.env.REVIEW_HOST_PASSWORD) return process.env.REVIEW_HOST_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write('Password of the review host account (not shown, not kept): ');
  const answer = await new Promise((done) => {
    rl.question('', (a) => {
      process.stdout.write('\n');
      done(a);
    });
    rl._writeToOutput = () => {};
  });
  rl.close();
  return answer;
}

async function uploadPhotos(hostEmail) {
  const { url, anon } = storageAccess();
  const r = await fetch(url + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email: hostEmail, password: await hostPassword() }),
  });
  const session = await r.json();
  if (!r.ok || !session.access_token)
    throw new Error('Could not sign in as the review host (' + r.status + ').');
  const photos = JSON.parse(readFileSync(resolve(import.meta.dirname, 'photos.json'), 'utf8'));
  const send = async (path, key) => {
    const image = await fetchRetry(photos[key].url);
    if (!image.ok) throw new Error('photo ' + key + ': ' + image.status);
    const response = await fetchRetry(url + '/storage/v1/object/host-photos/' + path, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + session.access_token,
        apikey: anon,
        'content-type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: Buffer.from(await image.arrayBuffer()),
    });
    if (!response.ok)
      throw new Error(
        'upload ' + path + ': ' + response.status + ' ' + (await response.text()).slice(0, 200),
      );
  };
  for (const [i, [key]] of PROPERTY_PHOTOS.entries()) await send(photoPath(STAY.property, i), key);
  for (const [i, [key]] of UNIT_PHOTOS.entries()) await send(photoPath(STAY.unit, i), key);
  console.log(
    `Photos: ${PROPERTY_PHOTOS.length} for the property, ${UNIT_PHOTOS.length} for the unit.`,
  );
}

// ─────────────────────────────────────────────── main

const hostEmail = option('host-email');
const guestEmail = option('guest-email');
if (flag('remove')) {
  runSql(removeSql(guestEmail));
  console.log('Review property unlisted and archived; review host paused.');
} else {
  if (!hostEmail || !guestEmail) {
    console.error('Pass --host-email and --guest-email (the accounts the owner created).');
    process.exit(1);
  }
  // The rows first (the photo rules need the host and its owner), then the photos.
  runSql(seedSql(hostEmail, guestEmail, false));
  if (flag('photos')) {
    await uploadPhotos(hostEmail);
    runSql(seedSql(hostEmail, guestEmail, true));
  }
  console.log('Review property: ' + STAY.slug + ' (' + STAY.property + ').');
}
console.log(runSql(checkSql, { tuples: true }).trim());
