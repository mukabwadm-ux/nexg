-- Stay booking, phase 1: holds, blocks, availability, and no double booking.
--
-- A guest holds dates for 15 minutes while they pay; nobody else can take
-- those nights, and the payment (service role) turns the hold into a
-- booking. A host can block dates or hold them for somebody. Stays a host
-- types in keep their old behaviour: a clash saves, flagged.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ─────────────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d4600000-0000-4000-8000-000000000001',
   'authenticated','authenticated','host46@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','d4600000-0000-4000-8000-000000000002',
   'authenticated','authenticated','guest46a@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','d4600000-0000-4000-8000-000000000003',
   'authenticated','authenticated','guest46b@example.test',now(),now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d4610000-0000-4000-8000-00000000000a','multi_unit','[Host 46]','+254700046000',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());

insert into public.host_user (host_id, user_id, role)
values ('d4610000-0000-4000-8000-00000000000a','d4600000-0000-4000-8000-000000000001','owner');

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d4620000-0000-4000-8000-00000000000a','d4610000-0000-4000-8000-00000000000a',
        'block-46','[Block 46]','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());

/* A sleeps 2 at 7,000; B sleeps 4 at 11,000; C has no rate (price on request). */
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values
  ('d4630000-0000-4000-8000-00000000000a','d4610000-0000-4000-8000-00000000000a',
   'd4620000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 7000),
  ('d4630000-0000-4000-8000-00000000000b','d4610000-0000-4000-8000-00000000000a',
   'd4620000-0000-4000-8000-00000000000a','B','B','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 2, 4, 11000),
  ('d4630000-0000-4000-8000-00000000000c','d4610000-0000-4000-8000-00000000000a',
   'd4620000-0000-4000-8000-00000000000a','C','C','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, null);

create temp table d as
select (now() at time zone 'Africa/Nairobi')::date as today;
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 'd' and n.nspname like 'pg_temp%'));
end
$grant$;
grant select on d to anon, authenticated, service_role;

-- ══════════════════════════════════════════════ 1. a guest holds dates

set local role anon;
select throws_ok(
  $$ select public.rpc_stay_hold('d4630000-0000-4000-8000-00000000000a',
       (select today + 10 from d), (select today + 13 from d)) $$,
  '42501', null,
  'Somebody who is not signed in cannot hold dates.');

select is(
  (select count(*)::int from public.rpc_unit_busy('d4630000-0000-4000-8000-00000000000a',
     (select today from d), (select today + 60 from d))),
  0,
  'But anybody can ask which nights a public unit is taken, and A is free.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4600000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (public.rpc_stay_hold('d4630000-0000-4000-8000-00000000000a',
     (select today + 10 from d), (select today + 13 from d),
     '{"first_name":"Amina","adults":2}'::jsonb) ->> 'total_kes')::int,
  21000,
  'A signed-in guest holds three nights of A and is quoted 3 × 7,000.');

select throws_ok(
  $$ select public.rpc_stay_hold('d4630000-0000-4000-8000-00000000000a',
       (select today + 20 from d), (select today + 22 from d), '{"adults":3}'::jsonb) $$,
  '22023', 'This home sleeps up to 2 guests.',
  'A hold for more guests than the unit sleeps is refused.');

select throws_ok(
  $$ select public.rpc_stay_hold('d4630000-0000-4000-8000-00000000000c',
       (select today + 20 from d), (select today + 22 from d)) $$,
  '22023', 'This home is priced on request. Send an enquiry instead.',
  'A unit without a nightly rate cannot be held online.');

select throws_ok(
  $$ select public.rpc_stay_hold('d4630000-0000-4000-8000-00000000000b',
       (select today - 1 from d), (select today + 2 from d)) $$,
  '22023', 'Check-in cannot be in the past.',
  'Dates in the past are refused.');

reset role;

select is(
  (select status || '/' || source || '/' || guest_user_id::text
     from public.stay where unit_id = 'd4630000-0000-4000-8000-00000000000a'),
  'held/nexg/d4600000-0000-4000-8000-000000000002',
  'The hold is a NexG stay in the held state, linked to the guest.');

select ok(
  (select hold_expires_at between now() + interval '14 minutes' and now() + interval '16 minutes'
     from public.stay where unit_id = 'd4630000-0000-4000-8000-00000000000a'),
  'It lasts 15 minutes.');

-- ═══════════════════════════════════════ 2. nobody else gets those nights

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4600000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$ select public.rpc_stay_hold('d4630000-0000-4000-8000-00000000000a',
       (select today + 12 from d), (select today + 14 from d)) $$,
  '23P01', 'Those dates are no longer available.',
  'A second guest cannot hold nights that overlap the first hold.');

select lives_ok(
  $$ select public.rpc_stay_hold('d4630000-0000-4000-8000-00000000000a',
       (select today + 13 from d), (select today + 15 from d)) $$,
  'But they can check in on the day the first guest checks out.');

select is(
  (select count(*)::int from public.stay
    where guest_user_id = 'd4600000-0000-4000-8000-000000000002'),
  0,
  'A guest cannot see anybody else''s hold.');

select is(
  (select count(*)::int from public.stay
    where guest_user_id = 'd4600000-0000-4000-8000-000000000003'),
  1,
  'They can see their own.');

select is(
  (select array_agg(unit_id::text order by unit_id) from public.rpc_stay_search(
     (select today + 11 from d), (select today + 12 from d), 2,
     'd4620000-0000-4000-8000-00000000000a')),
  array['d4630000-0000-4000-8000-00000000000b','d4630000-0000-4000-8000-00000000000c'],
  'Search for a night A is held leaves A out, and keeps the free units.');

select throws_ok(
  format($$ select public.rpc_stay_confirm(%L) $$,
    (select id from public.stay where guest_user_id = 'd4600000-0000-4000-8000-000000000003')),
  '42501', null,
  'A guest cannot confirm their own hold: only the payment can.');

reset role;

set local role anon;
select is(
  (select count(*)::int from public.rpc_unit_busy('d4630000-0000-4000-8000-00000000000a',
     (select today from d), (select today + 60 from d))),
  2,
  'The public busy list now shows both holds, and nothing about who holds them.');
reset role;

select throws_ok(
  $$ insert into public.stay (host_id, unit_id, check_in, check_out, source, status, hold_expires_at)
     select 'd4610000-0000-4000-8000-00000000000a', 'd4630000-0000-4000-8000-00000000000a',
            check_in + interval '1 hour', check_out, 'nexg', 'held', now() + interval '5 minutes'
       from public.stay where guest_user_id = 'd4600000-0000-4000-8000-000000000002' $$,
  '23P01', null,
  'Even a direct insert cannot overlap a hold: the database itself refuses it.');

-- ════════════════════════════════════════ 3. expiry and confirmation

update public.stay set hold_expires_at = now() - interval '1 minute'
 where guest_user_id = 'd4600000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4600000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select lives_ok(
  $$ select public.rpc_stay_hold('d4630000-0000-4000-8000-00000000000a',
       (select today + 10 from d), (select today + 12 from d)) $$,
  'Once a hold runs out its nights are free again, even before the cron runs.');
reset role;

select is(
  (select status from public.stay where guest_user_id = 'd4600000-0000-4000-8000-000000000002'),
  'cancelled',
  'And the expired hold was released on the way.');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select status from public.rpc_stay_confirm(
     (select id from public.stay where guest_user_id = 'd4600000-0000-4000-8000-000000000003'
         and check_in::date < (select today + 12 from d) and status = 'held'),
     'MPESA-TEST')),
  'booked',
  'The payment callback confirms a guest hold as a booking.');
reset role;

-- ══════════════════════════════════════════════ 4. what the host can do

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  format($$ select public.rpc_stay_confirm(%L) $$,
    (select id from public.stay where guest_user_id = 'd4600000-0000-4000-8000-000000000003'
        and status = 'held')),
  '42501', null,
  'A host cannot confirm a guest''s NexG hold either.');

select throws_ok(
  format($$ select public.rpc_stay_cancel(%L) $$,
    (select id from public.stay where guest_user_id = 'd4600000-0000-4000-8000-000000000003'
        and status = 'booked')),
  '22023', 'This guest paid through NexG. Contact NexG to cancel it.',
  'Nor cancel a booking the guest has paid NexG for.');

select is(
  (select status from public.rpc_stay_block('d4610000-0000-4000-8000-00000000000a',
     'd4630000-0000-4000-8000-00000000000a', (select today + 20 from d), (select today + 22 from d),
     'Painting')),
  'blocked',
  'A host blocks two nights on A.');

select throws_ok(
  $$ select public.rpc_stay_block('d4610000-0000-4000-8000-00000000000a',
       'd4630000-0000-4000-8000-00000000000a', (select today + 10 from d), (select today + 11 from d)) $$,
  '23P01', 'Those dates already have a booking, hold or block. Cancel it first.',
  'A block cannot cover a night that is already booked.');

select is(
  (select conflict_flagged from public.rpc_stay_upsert('d4610000-0000-4000-8000-00000000000a',
     jsonb_build_object('unit_id','d4630000-0000-4000-8000-00000000000a','guest_first_name','Walk-in',
       'check_in', ((select today + 20 from d) + time '14:00') at time zone 'Africa/Nairobi',
       'check_out', ((select today + 21 from d) + time '10:00') at time zone 'Africa/Nairobi'))),
  true,
  'A stay the host types in over the block still saves, flagged, as before.');

select throws_ok(
  format($$ select public.rpc_stay_upsert('d4610000-0000-4000-8000-00000000000a',
       jsonb_build_object('unit_id','d4630000-0000-4000-8000-00000000000a',
         'check_in', now() + interval '20 days', 'check_out', now() + interval '22 days'), %L) $$,
    (select id from public.stay where status = 'blocked')),
  '22023', 'Holds, blocks and NexG bookings are changed from their own actions.',
  'The block itself is not edited as if it were a reservation.');

select lives_ok(
  format($$ select public.rpc_stay_cancel(%L, 'Painting finished early') $$,
    (select id from public.stay where status = 'blocked')),
  'Lifting the block is a cancel.');

select is(
  (select conflict_flagged from public.stay where guest_first_name = 'Walk-in'),
  false,
  'And lifting it clears the flag on the stay it overlapped.');

select is(
  (select status from public.rpc_stay_host_hold('d4610000-0000-4000-8000-00000000000a',
     jsonb_build_object('unit_id','d4630000-0000-4000-8000-00000000000b','guest_first_name','Caller',
       'check_in', now() + interval '30 days', 'check_out', now() + interval '32 days'), 24)),
  'held',
  'A host holds B for a caller for 24 hours.');

select is(
  (select status from public.rpc_stay_confirm(
     (select id from public.stay where guest_first_name = 'Caller'))),
  'booked',
  'And confirms their own hold when the caller commits.');

reset role;

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical'
      and (finding ilike '%stay%' or finding ilike '%unit_busy%')),
  0,
  'Every new stay RPC is audited, and anon can run only the read-only ones.');

select * from finish();
rollback;
