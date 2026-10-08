-- Partner logins for production, so the portals can be opened.
--
-- The portals were never broken. They are gated: `fn_partner_home`
-- sends you to a dashboard only once an application is submitted
-- or 80% complete, and every real account on production sits below
-- that line — so every login bounces back to the application form.
-- Correct behaviour, and a useless way to look at a product.
--
-- These are two accounts past the line, one per role.
--
-- What this deliberately does NOT do: invent orders, earnings or
-- money. The dashboards will show real empty states, because there
-- are no real orders on production. Seeding fake ones would put
-- fictional revenue into the Finance console, which is the one
-- place in this system that must never show a figure nobody can
-- trace back to a real event.
--
-- The password is supplied by whoever runs this, as a psql
-- variable. It is not in this file and not in the repository.
--
--   bash scripts/demo-partners.sh
--
-- Removing them again is the last block in this file.

\set ON_ERROR_STOP on

begin;

-- ═══════════════════════════════════════════════ the two logins

/*
 * Fixed ids in a recognisable range. Nothing else on production
 * uses the dddddddd- prefix, so these rows can always be found
 * and removed without guessing at which ones were seeded.
 */
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
   'dddddddd-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'demo.merchant@nexgapp.com',
   crypt(:'pw', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Demo Merchant"}'::jsonb,
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'demo.rider@nexgapp.com',
   crypt(:'pw', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Demo Rider"}'::jsonb,
   '', '', '', '', '', '', '', '')
on conflict (id) do update
  set encrypted_password = excluded.encrypted_password,
      email_confirmed_at = now(),
      updated_at = now();

/*
 * The identity row beside the user.
 *
 * Local seeds get away without one, so this is easy to leave out.
 * Supabase's hosted GoTrue is stricter: without it the password
 * grant answers "Invalid login credentials", which looks exactly
 * like a mistyped password and sends you hunting in the wrong
 * place.
 */
insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id in ('dddddddd-0000-4000-8000-000000000001',
               'dddddddd-0000-4000-8000-000000000002')
on conflict (provider, provider_id) do nothing;

-- ═════════════════════════════════════════════════════ merchant

/*
 * `submitted_at` is what opens the gate — the same field a real
 * merchant sets by finishing their application. The readiness
 * percentage is left to compute itself from the rows that exist
 * rather than being written to, so the dashboard reports its own
 * real state.
 */
insert into merchant (
  id, trading_name, legal_name, contact_name, contact_phone, contact_email,
  category, city_id, status, submitted_at, went_live_at,
  accepting_orders, explore_visible, commission_pct, prep_minutes)
select
  'dddddddd-1111-4000-8000-000000000001',
  'Demo Kitchen', 'Demo Kitchen Limited', 'Demo Owner', '+254700000101',
  'demo.merchant@nexgapp.com',
  /* `went_live_at` is not decoration: a check constraint refuses
     status 'live' without it, which is the database insisting a
     live merchant has a date it went live. */
  'restaurant', c.id, 'live', now(), now(), true,
  /*
   * Not visible on the public site. This is a test account, and a
   * plausible-looking business on a live homepage is one a real
   * guest could try to order from.
   */
  false,
  18.00, 25
from city c where c.slug = 'nairobi'
on conflict (id) do update
  set status = 'live', submitted_at = now(), went_live_at = now(),
      accepting_orders = true, explore_visible = false;

insert into merchant_user (merchant_id, user_id, role)
values ('dddddddd-1111-4000-8000-000000000001',
        'dddddddd-0000-4000-8000-000000000001', 'owner')
on conflict (merchant_id, user_id) do nothing;

/* A branch with real coordinates inside a live Nairobi zone.
   Without one there is nowhere for the dashboard to say it is. */
insert into merchant_branch (
  id, merchant_id, name, address_text, latitude, longitude,
  zone_id, is_primary, source)
select
  'dddddddd-2222-4000-8000-000000000001',
  'dddddddd-1111-4000-8000-000000000001',
  'Westlands', 'Demo address, Westlands, Nairobi',
  -1.2676, 36.8108, z.id, true, 'manual'
from zone z
join city c on c.id = z.city_id
where c.slug = 'nairobi' and z.active
order by z.created_at
limit 1
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════ rider

insert into rider (
  id, user_id, first_name, last_name, phone,
  city_id, vehicle, plate_no, status, submitted_at, activated_at)
select
  'dddddddd-3333-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000002',
  'Demo', 'Rider', '+254700000102',
  /* A plate is required for an active rider on anything but a
     bicycle — another constraint that only shows itself when you
     try to make one active. */
  c.id, 'motorbike', 'KDD 001A', 'active', now(), now()
from city c where c.slug = 'nairobi'
on conflict (id) do update
  set status = 'active', submitted_at = now(), activated_at = now();

commit;

-- ═══════════════════════════════════════════════ what you now have

\echo ''
select u.email,
       coalesce(m.trading_name, r.first_name || ' ' || r.last_name) as partner,
       coalesce(m.status::text, r.status::text) as status,
       case when m.id is not null then '/merchant' else '/rider' end as lands_on
  from auth.users u
  left join merchant_user mu on mu.user_id = u.id
  left join merchant m on m.id = mu.merchant_id
  left join rider r on r.user_id = u.id
 where u.email in ('demo.merchant@nexgapp.com', 'demo.rider@nexgapp.com')
 order by u.email;

-- ════════════════════════════════════════════════ to remove them
--
-- These are real logins on a live system. When the testing is
-- done, this takes them away again:
--
--   delete from merchant_branch where id::text like 'dddddddd-2222-%';
--   delete from merchant_user   where user_id::text like 'dddddddd-0000-%';
--   delete from merchant        where id::text like 'dddddddd-1111-%';
--   delete from rider           where id::text like 'dddddddd-3333-%';
--   delete from auth.users      where id::text like 'dddddddd-0000-%';
--
-- Or run:  bash scripts/demo-partners.sh --remove
