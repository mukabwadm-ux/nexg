-- Three more logins, in the half-finished state.
--
-- `demo-partners.sql` creates partners who are live. These are
-- the same three roles mid-onboarding, because the setup state
-- is half the work in each portal and the easiest half to never
-- look at: whoever is testing signs in, sees a working
-- dashboard, and never discovers that the screen a real
-- applicant stares at for a week is a different screen.
--
-- Each is placed at the step the design draws:
--
--   merchant  4 of 7, documents next
--   rider     3 of 7, documents next
--   host      2 of 5, hand-off next
--
-- The password is supplied by whoever runs this, as a psql
-- variable. It is not in this file and not in the repository.
--
--   bash scripts/demo-partners.sh --setup
--
-- Removal is the last block, and the --remove flag covers both
-- sets.

\set ON_ERROR_STOP on

begin;

-- ══════════════════════════════════════════════ the logins

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'demo.merchant.setup@nexgapp.com',
   crypt(:'pw', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Demo Merchant Setup"}'::jsonb,
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'demo.rider.setup@nexgapp.com',
   crypt(:'pw', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Demo Rider Setup"}'::jsonb,
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'demo.host.setup@nexgapp.com',
   crypt(:'pw', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Demo Host Setup"}'::jsonb,
   '', '', '', '', '', '', '', ''),
  /* The second person on the merchant account. Step 3 checks
     that somebody besides the owner exists, so this script
     carries its own rather than borrowing the live set's — two
     scripts that must run in order is one that will be run out
     of order. */
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'demo.merchant.manager@nexgapp.com',
   crypt(:'pw', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Demo Manager"}'::jsonb,
   '', '', '', '', '', '', '', '')
on conflict (id) do update
  set encrypted_password = excluded.encrypted_password,
      email_confirmed_at = now(),
      updated_at = now();

insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id::text like 'eeeeeeee-0000-%'
on conflict (provider, provider_id) do nothing;

-- ════════════════════════ merchant · 4 of 7, documents next

/*
 * Steps 1, 2, 3 and 4 done: profile with a pinned branch,
 * hours, a second person on the account, and a catalogue with
 * prices. Documents, payout and go-live outstanding — which
 * puts the strip exactly where the design draws it.
 *
 * Status stays `applied`: the portal reads the status for which
 * home to show and nothing here may write a merchant live.
 */
insert into merchant (
  id, trading_name, legal_name, contact_name, contact_phone, contact_email,
  category, city_id, status, accepting_orders, explore_visible,
  commission_pct, prep_minutes, hours_pattern, answers)
select
  'eeeeeeee-1111-4000-8000-000000000001',
  'Demo Kitchen (setting up)', 'Demo Kitchen Setup Limited',
  'Demo Owner', '+254700000111', 'demo.merchant.setup@nexgapp.com',
  /*
   * `answers` and `hours_pattern` are what steps 1 and 2
   * actually check — `fn_merchant_readiness` wants an answer to
   * every question its category asks, not merely a category.
   */
  'restaurant', c.id, 'applied', false, false, 18.00, 25,
  'same_daily',
  '{"cuisine":"Kenyan","serves_alcohol":false,"dietary":["vegetarian"],"spend_band":"mid"}'::jsonb
from city c where c.slug = 'nairobi'
on conflict (id) do update
  set status = 'applied', hours_pattern = excluded.hours_pattern,
      answers = excluded.answers;

insert into merchant_user (merchant_id, user_id, role)
values ('eeeeeeee-1111-4000-8000-000000000001',
        'eeeeeeee-0000-4000-8000-000000000001', 'owner')
on conflict (merchant_id, user_id) do nothing;

/* A second person, which is what step 3 actually checks. */
insert into merchant_user (merchant_id, user_id, role)
values ('eeeeeeee-1111-4000-8000-000000000001',
        'eeeeeeee-0000-4000-8000-000000000004', 'manager')
on conflict (merchant_id, user_id) do nothing;

insert into merchant_branch (
  id, merchant_id, name, address_text, latitude, longitude,
  zone_id, is_primary, source)
select
  'eeeeeeee-2222-4000-8000-000000000001',
  'eeeeeeee-1111-4000-8000-000000000001',
  'Kilimani', 'Demo address, Kilimani, Nairobi',
  -1.2906, 36.7873, z.id, true, 'manual'
from zone z join city c on c.id = z.city_id
where c.slug = 'nairobi' and z.active
order by z.created_at limit 1
on conflict (id) do nothing;

/* Step 4 wants something a guest could actually order. */
insert into catalogue_section (id, merchant_id, name, sort)
values ('eeeeeeee-8888-4000-8000-000000000001',
        'eeeeeeee-1111-4000-8000-000000000001', 'Mains', 1)
on conflict (id) do nothing;

/* Five, because that is the threshold `first_items` uses — a
   menu with one dish is not a menu a guest can order from. */
insert into catalogue_item (id, section_id, merchant_id, name, price_kes, available, sort)
select
  ('eeeeeeee-9999-4000-8000-00000000000' || n)::uuid,
  'eeeeeeee-8888-4000-8000-000000000001',
  'eeeeeeee-1111-4000-8000-000000000001',
  'Demo item ' || n, 250 + (n * 100), true, n
from generate_series(1, 5) as n
on conflict (id) do nothing;

commit;

-- ═══════════════════════════ rider · 3 of 7, documents next

begin;

/*
 * `phone_verified_at`, `areas`, `ownership` and `insurance` are
 * what steps 1 and 2 check. Without them the strip reads 1 of 7
 * however complete the application looks.
 */
insert into rider (
  id, user_id, first_name, last_name, phone, phone_verified_at,
  city_id, areas, shifts, vehicle, plate_no, ownership, insurance,
  status, submitted_at)
select
  'eeeeeeee-3333-4000-8000-000000000001',
  'eeeeeeee-0000-4000-8000-000000000002',
  'Demo', 'Applicant', '+254700000112', now(),
  /* `areas_hours` wants both — the areas they will ride and the
     shifts they will ride them in. The name says so and it is
     easy to read as areas alone. */
  c.id, array['Kilimani'], array['weekday_morning', 'weekday_evening'],
  'motorbike', 'KDD 002A', 'own', 'third_party',
  'documents_pending', now()
from city c where c.slug = 'nairobi'
on conflict (id) do update
  set status = 'documents_pending', phone_verified_at = now(),
      areas = excluded.areas, shifts = excluded.shifts,
      ownership = excluded.ownership,
      insurance = excluded.insurance;

/*
 * The phone, with both permissions. This is what makes step 3
 * pass — and before the rider_device table existed it could
 * not, which meant no rider reached seven of seven.
 */
insert into rider_device (
  id, rider_id, platform, label,
  notification_permission, location_permission, is_job_device, last_seen_at)
values (
  'eeeeeeee-4444-4000-8000-000000000001',
  'eeeeeeee-3333-4000-8000-000000000001',
  'android', 'Demo phone', true, true, true, now())
on conflict (id) do nothing;

commit;

-- ════════════════════════════ host · 2 of 5, hand-off next

begin;

insert into host (
  id, kind, display_name, contact_name, phone, email, city_id,
  status, default_handoff)
select
  'eeeeeeee-5555-4000-8000-000000000001',
  'single_unit', 'Demo Stays (setting up)', 'Demo Host',
  '+254700000113', 'demo.host.setup@nexgapp.com', c.id,
  'applied', 'leave_with_askari'
from city c where c.slug = 'nairobi'
on conflict (id) do update set status = 'applied';

insert into host_user (host_id, user_id, role, accepted_at)
values ('eeeeeeee-5555-4000-8000-000000000001',
        'eeeeeeee-0000-4000-8000-000000000003', 'owner', now())
on conflict (host_id, user_id) do nothing;

insert into property (id, host_id, slug, name, kind, area, city_id)
select
  'eeeeeeee-6666-4000-8000-000000000001',
  'eeeeeeee-5555-4000-8000-000000000001',
  'demo-stays-setup', 'Demo Stays Kilimani', 'apartment_block', 'Kilimani', c.id
from city c where c.slug = 'nairobi'
on conflict (id) do nothing;

/*
 * Address done, hand-off chosen, caretaker asked and silent.
 * That last part is the single most common way a real host
 * stalls, and it is what the attention card on the setup home
 * exists to surface — so the demo account has it rather than a
 * tidy state nobody learns anything from.
 */
insert into unit (
  id, host_id, property_id, name, label_public, address_line,
  building, unit_no, city_id, zone_id, status, handoff,
  caretaker_name, caretaker_token_sent_at, caretaker_confirmed_at, readiness)
select
  'eeeeeeee-7777-4000-8000-000000000001',
  'eeeeeeee-5555-4000-8000-000000000001',
  'eeeeeeee-6666-4000-8000-000000000001',
  'A1204', 'Apartment A1204', 'Demo address, Kilimani, Nairobi',
  'Demo Stays Kilimani', 'A1204', c.id, z.id, 'setting_up', 'leave_with_askari',
  'Demo Caretaker', now() - interval '2 days', null,
  '{"address":true,"handoff":true,"contact_confirmed":false,"hours":false,"qr_placed":false}'::jsonb
from city c join zone z on z.city_id = c.id and z.active
where c.slug = 'nairobi'
order by z.created_at limit 1
on conflict (id) do nothing;

commit;

-- ═════════════════════════════════════ what you now have

\echo ''
select u.email,
       coalesce(m.trading_name, r.first_name || ' ' || r.last_name, h.display_name) as partner,
       coalesce(m.status::text, r.status::text, h.status::text) as status,
       case when m.id is not null then '/merchant'
            when r.id is not null then '/rider'
            when h.id is not null then '/host' end as lands_on
  from auth.users u
  left join merchant_user mu on mu.user_id = u.id
  left join merchant m on m.id = mu.merchant_id
  left join rider r on r.user_id = u.id
  left join host_user hu on hu.user_id = u.id
  left join host h on h.id = hu.host_id
 where u.email like 'demo.%.setup@nexgapp.com'
 order by u.email;

\echo 'step counts:'
select 'merchant ' || done_count || '/7, next ' || coalesce(next_step::text, 'done')
  from merchant_setup_progress_v where merchant_id = 'eeeeeeee-1111-4000-8000-000000000001'
union all
select 'rider ' || done_count || '/7, next ' || coalesce(next_step::text, 'done')
  from rider_setup_progress_v where rider_id = 'eeeeeeee-3333-4000-8000-000000000001'
union all
select 'host ' || done_count || '/5, next ' || coalesce(next_step::text, 'done')
  from host_setup_progress_v where host_id = 'eeeeeeee-5555-4000-8000-000000000001';

-- ═══════════════════════════════════════════ to remove them
--
--   bash scripts/demo-partners.sh --remove
--
-- which clears both the dddddddd- (live) and eeeeeeee- (setup)
-- sets in one go.
