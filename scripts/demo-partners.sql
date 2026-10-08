-- Partner logins for production, so the portals can be opened.
--
-- Three accounts: merchant, rider and host. The host gets two
-- units deliberately — one ready and one still waiting on its
-- caretaker — because the portal's attention card and readiness
-- ring only mean anything when there is something unfinished to
-- point at, and a demo of a product where nothing needs doing
-- shows none of the work.
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
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'demo.host@nexgapp.com',
   crypt(:'pw', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Demo Host"}'::jsonb,
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
               'dddddddd-0000-4000-8000-000000000002',
               'dddddddd-0000-4000-8000-000000000003')
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

-- ═════════════════════════════════════════════════════════ host

/*
 * Live, so the portal opens on its live home rather than the
 * setup one. `went_live_at` is required by a check constraint
 * for that status — the database insisting a live host has a
 * date it went live.
 */
insert into host (
  id, kind, display_name, contact_name, phone, email, city_id,
  status, submitted_at, went_live_at, verified_at,
  verification_method, verification_submitted_at, default_handoff)
select
  'dddddddd-6666-4000-8000-000000000001',
  'multi_unit', 'Demo Stays', 'Demo Host', '+254700000103',
  'demo.host@nexgapp.com', c.id,
  'live', now(), now(), now(), 'listing_code', now(), 'leave_with_askari'
from city c where c.slug = 'nairobi'
on conflict (id) do update
  set status = 'live', went_live_at = now(), verified_at = now();

insert into host_user (host_id, user_id, role, accepted_at)
values ('dddddddd-6666-4000-8000-000000000001',
        'dddddddd-0000-4000-8000-000000000003', 'owner', now())
on conflict (host_id, user_id) do nothing;

insert into property (id, host_id, slug, name, kind, area, city_id,
                      check_in_from, check_out_by)
select
  'dddddddd-7777-4000-8000-000000000001',
  'dddddddd-6666-4000-8000-000000000001',
  'demo-stays-kilimani', 'Demo Stays Kilimani', 'apartment_block',
  'Kilimani', c.id, '14:00', '11:00'
from city c where c.slug = 'nairobi'
on conflict (id) do nothing;

/*
 * `label_public` is the name a guest sees on the QR card. A unit
 * without one cannot have a card generated — the RPC says so by
 * name now, but it is easier to set it here than to find out
 * later.
 */
insert into unit (
  id, host_id, property_id, name, label_public, address_line,
  building, unit_no, city_id, zone_id, status, handoff,
  caretaker_name, caretaker_confirmed_at, delivery_hours, readiness)
select
  'dddddddd-8888-4000-8000-000000000001',
  'dddddddd-6666-4000-8000-000000000001',
  'dddddddd-7777-4000-8000-000000000001',
  'A1204', 'Apartment A1204', 'Demo address, Kilimani, Nairobi',
  'Demo Stays Kilimani', 'A1204', c.id, z.id, 'live', 'leave_with_askari',
  'Demo Caretaker', now(), '{"from":"06:00","to":"22:00"}'::jsonb,
  '{"address":true,"handoff":true,"contact_confirmed":true,"hours":true,"qr_placed":true}'::jsonb
from city c
join zone z on z.city_id = c.id and z.active
where c.slug = 'nairobi'
order by z.created_at
limit 1
on conflict (id) do nothing;

/*
 * A second unit that is not finished. This is what makes the
 * readiness ring and the attention card show anything — and
 * those are half of what the portal is for.
 */
insert into unit (
  id, host_id, property_id, name, label_public, address_line,
  building, unit_no, city_id, zone_id, status, handoff,
  caretaker_name, caretaker_token_sent_at, caretaker_confirmed_at, readiness)
select
  'dddddddd-8888-4000-8000-000000000002',
  'dddddddd-6666-4000-8000-000000000001',
  'dddddddd-7777-4000-8000-000000000001',
  'B0710', 'Apartment B0710', 'Demo address, Kilimani, Nairobi',
  'Demo Stays Kilimani', 'B0710', c.id, z.id, 'setting_up', 'leave_with_askari',
  'Demo Caretaker', now() - interval '2 days', null,
  '{"address":true,"handoff":true,"contact_confirmed":false,"hours":false,"qr_placed":false}'::jsonb
from city c
join zone z on z.city_id = c.id and z.active
where c.slug = 'nairobi'
order by z.created_at
limit 1
on conflict (id) do nothing;

commit;

-- ═══════════════════════════════════════════════ what you now have

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
 where u.email like 'demo.%@nexgapp.com'
 order by u.email;

-- ════════════════════════════════════════════════ to remove them
--
-- These are real logins on a live system. When the testing is
-- done, this takes them away again:
--
--   delete from unit            where id::text like 'dddddddd-8888-%';
--   delete from property        where id::text like 'dddddddd-7777-%';
--   delete from host_user       where user_id::text like 'dddddddd-0000-%';
--   delete from host            where id::text like 'dddddddd-6666-%';
--   delete from merchant_branch where id::text like 'dddddddd-2222-%';
--   delete from merchant_user   where user_id::text like 'dddddddd-0000-%';
--   delete from merchant        where id::text like 'dddddddd-1111-%';
--   delete from rider           where id::text like 'dddddddd-3333-%';
--   delete from auth.users      where id::text like 'dddddddd-0000-%';
--
-- Or run:  bash scripts/demo-partners.sh --remove
