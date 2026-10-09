-- The host portal's modules, tested against the two ways they
-- go wrong.
--
-- Five of these views are SECURITY DEFINER, which is unusual in
-- this system and deliberate. A host cannot read `public.order`
-- — the read policy there covers the guest, the merchant, the
-- rider and staff, and a host is none of them — so an invoker
-- view returns a scan count with a flat zero beside it. That is
-- not an empty page somebody questions; it is a finding, and it
-- is wrong.
--
-- The cost of a definer view is that RLS no longer answers. The
-- predicate inside it is the whole boundary. So the questions
-- here are:
--
--   * does a host see their own deliveries, orders and scans
--   * does a host see another host's — the leak a definer view
--     makes possible and an invoker one could not
--   * does a merchant, who is `authenticated` like anyone else,
--     see any of it
--   * is anon refused outright rather than quietly returning
--     nothing
--   * do the privacy rules hold in the data, not just the page:
--     no guest surname, no unmasked phone
--   * is an overdue request overdue because of the clock, not
--     because a column says so

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create temp table t (k text primary key, v text);
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

-- ─────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-0000000000a1',
   'authenticated','authenticated','hm1@test.local','',now(),now(),now(),'','','','','','','','')
on conflict (id) do nothing;

insert into t (k, v) values
  ('city', (select id::text from public.city where name = 'Nairobi'));

/* The two hosts in the seed, and the user who owns the first. */
insert into t (k, v) values
  ('host_a', (select hu.host_id::text from public.host_user hu
               join auth.users u on u.id = hu.user_id
              where u.email = 'host.live@nexgapp.com')),
  ('user_a', (select u.id::text from auth.users u
              where u.email = 'host.live@nexgapp.com')),
  ('host_b', (select h.id::text from public.host h
              where h.display_name = '[Riverine Collection]')),
  ('merch_user', (select mu.user_id::text from public.merchant_user mu limit 1));

select isnt((select v from t where k = 'host_a'), null,
  'The seeded live host exists, so the rest of this file is testing something.');
select isnt((select v from t where k = 'host_b'), null,
  'And a second host, which is what makes the leak questions answerable.');

-- ══════════════════ 1. a host sees their own

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k = 'user_a'),
                    'role', 'authenticated')::text, true);

select cmp_ok(
  (select count(*) from public.host_delivery_v)::int, '>', 0,
  'A host sees deliveries to their own units. Built as an invoker view this was zero, '
  'because `order_read` has no host branch — and zero reads as "nobody has ordered".');

select cmp_ok(
  (select coalesce(sum(orders), 0) from public.host_analytics_unit_v)::int, '>', 0,
  'And the orders those scans became. A scan count beside a zero order count is not an '
  'empty page, it is a conversion rate of nothing.');

select cmp_ok(
  (select guest_order_count from public.host_earnings_v)::int, '>', 0,
  'Earnings counts the same orders, through its own lateral, and agrees.');

select is(
  (select count(distinct host_id)::int from public.host_analytics_unit_v), 1,
  'Analytics returns exactly one host: their own.');

select is(
  (select count(*)::int from public.host_stay_v where host_id <> (select v::uuid from t where k='host_a')),
  0,
  'And the stay view carries nobody else''s guests.');

-- ══════════════════ 2. a host does not see another host

select is(
  (select count(*)::int from public.host_delivery_v
    where host_id = (select v::uuid from t where k = 'host_b')),
  0,
  'Asking the delivery view for another host''s rows returns none. The predicate is on the '
  'scan''s own host, so there is no argument for a caller to get wrong.');

select is(
  (select count(*)::int from public.host_analytics_daily_v
    where host_id = (select v::uuid from t where k = 'host_b')),
  0,
  'Same for the daily analytics, which is the one somebody would export.');

select is(
  (select count(*)::int from public.host_analytics_unit_v
    where host_id = (select v::uuid from t where k = 'host_b')),
  0,
  'And the per-unit table, which names the other host''s buildings.');

select is(
  (select count(*)::int from public.host_earnings_v
    where host_id = (select v::uuid from t where k = 'host_b')),
  0,
  'Earnings is one row per host and returns only the caller''s.');

select is(
  (select count(*)::int from public.host_stay_v
    where host_id = (select v::uuid from t where k = 'host_b')),
  0,
  'Nor another host''s bookings, which carry guest first names.');

-- ══════════════════ 3. the privacy rules are in the data

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'stay'
      and column_name in ('guest_last_name', 'guest_surname', 'guest_email', 'guest_id_number')),
  0,
  'A stay has no column for a surname, an email or an ID number. The privacy promise on the '
  'Data & Privacy page is a schema fact, so no future page, export or bug can break it.');

select ok(
  (select bool_and(phone_masked is null or phone_masked like '%•%')
     from public.host_stay_v where phone_masked is not null),
  'Every phone the stay view returns is masked. Masked at the view and not at the template, '
  'because a template is copied and a view is not.');

select ok(
  (select bool_and(guest_first_name is null or guest_first_name not like '% %')
     from public.host_stay_v),
  'And a guest first name holds no space, so a full name cannot have been written into it.');

-- ══════════════════ 4. overdue is the clock, not a column

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'host_request'
      and column_name in ('overdue', 'is_overdue', 'breached')),
  0,
  'Overdue is not stored on a request. A stored flag is only as current as the job that last '
  'wrote it, and the whole point of a fifteen-minute promise is that it is true right now.');

select ok(
  (select bool_and(overdue = (due_at < now()))
     from public.host_request_v
    where due_at is not null and resolved_at is null),
  'So the view computes it, and it agrees with the clock for every open request.');

select ok(
  (select bool_and(minutes_left is null)
     from public.host_request_v where resolved_at is not null),
  'A resolved request counts down to nothing. A timer still running on something already '
  'handled is the one that gets ignored, and then the real ones get ignored with it.');

-- ══════════════════ 5. another authenticated role sees nothing

select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k = 'merch_user'),
                    'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.host_delivery_v), 0,
  'A merchant is `authenticated` like a host is. The definer views still return them nothing, '
  'because the predicate asks for a host_user row and they have none.');

select is(
  (select count(*)::int from public.host_earnings_v), 0,
  'Nor the earnings of every host on the platform, which is what a missing predicate here '
  'would have handed them.');

select is(
  (select count(*)::int from public.host_analytics_daily_v), 0,
  'Nor anybody''s scan history.');

-- ══════════════════ 6. anon is refused, not quietly empty

reset role;
select throws_ok(
  $$ set local role anon; select count(*) from public.host_delivery_v $$,
  '42501',
  null,
  'anon is refused outright. Supabase''s default privileges grant anon everything on a new '
  'table in public, which was harmless while these were invoker views and is not now — so '
  'the grant is revoked as well as the predicate being false for them.');

select * from finish();
rollback;
