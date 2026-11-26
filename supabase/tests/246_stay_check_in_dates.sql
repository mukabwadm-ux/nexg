-- Check-in follows the host's calendar day, and an early check-out frees the unit (20270328000200).
--
-- A confirmed stay can be checked in from its arrival date to the night before departure, whatever the
-- session's time zone, from the workspace and with the reservation code alike. After a check-out the nights left over can be blocked, held, booked and searched
-- again, the stay keeps its dates, and the unit list no longer shows the guest. A guest who is still
-- checked in keeps the nights.

begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ─────────────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','f4600000-0000-4000-8000-000000000001',
   'authenticated','authenticated','host246@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','f4600000-0000-4000-8000-000000000002',
   'authenticated','authenticated','guest246@example.test',now(),now(),now());

/* A Nairobi host, and one 14 hours ahead of UTC whose calendar day is often not Nairobi's. */
insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at, time_zone)
values
  ('f4610000-0000-4000-8000-00000000000a','multi_unit','[Host 246]','+254700246000',
   (select id from public.city where slug = 'nairobi'),'live', now(), now(), 'Africa/Nairobi'),
  ('f4610000-0000-4000-8000-00000000000b','multi_unit','[Host 246 far]','+254700246001',
   (select id from public.city where slug = 'nairobi'),'live', now(), now(), 'Pacific/Kiritimati');

insert into public.host_user (host_id, user_id, role)
values
  ('f4610000-0000-4000-8000-00000000000a','f4600000-0000-4000-8000-000000000001','owner'),
  ('f4610000-0000-4000-8000-00000000000b','f4600000-0000-4000-8000-000000000001','owner');

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, review_status)
values
  ('f4620000-0000-4000-8000-00000000000a','f4610000-0000-4000-8000-00000000000a',
   'block-246','[Block 246]','apartment_block','Kilimani',
   (select id from public.city where slug = 'nairobi'), true, now(), 'approved'),
  ('f4620000-0000-4000-8000-00000000000b','f4610000-0000-4000-8000-00000000000b',
   'block-246-far','[Block 246 far]','apartment_block','Kilimani',
   (select id from public.city where slug = 'nairobi'), true, now(), 'approved');

/* One unit for each stay, numbered like the stay. Units 31 and 32 are the far host's. */
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
select ('f4630000-0000-4000-8000-0000000000' || n)::uuid,
       ('f4610000-0000-4000-8000-00000000000' || case when n in (31, 32) then 'b' else 'a' end)::uuid,
       ('f4620000-0000-4000-8000-00000000000' || case when n in (31, 32) then 'b' else 'a' end)::uuid,
       'U' || n, 'U' || n, '[Address]', 'Kilimani', (select id from public.city where slug = 'nairobi'),
       'lockbox', 'live', true, 1, 2, 7000
  from unnest(array[11,12,13,14,15,16,17,21,22,23,24,31,32,41,42,43,51,52,53,54,55,56]) n;

create temp table d as
select (now() at time zone 'Africa/Nairobi')::date as today,
       (now() at time zone 'Pacific/Kiritimati')::date as far_today;
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 'd' and n.nspname like 'pg_temp%'));
end
$grant$;
grant select on d to anon, authenticated, service_role;

/* Booked stays at 14:00 to 10:00 local, as days from today. */
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, party_adults, party_children,
                         check_in, check_out, source, status)
select ('f4640000-0000-4000-8000-0000000000' || v.n)::uuid, u.host_id, u.property_id, u.id, 'G' || v.n, 1, 0,
       (d.today + v.arrives + time '14:00') at time zone 'Africa/Nairobi',
       (d.today + v.departs + time '10:00') at time zone 'Africa/Nairobi',
       'entered', 'booked'
  from d, (values
    -- checked in with the session on UTC
    (11,  1, 2), (12,  0, 1), (13, -1, 0), (14, -2, -1), (15,  0, 2), (16, -1, 1), (17, -2, 0),
    -- checked in with the session on Africa/Nairobi
    (21,  1, 2), (22,  0, 1), (23, -1, 0), (24, -2, -1),
    -- early check-out (41), and guests who stay checked in (43)
    (41, -1, 4), (43, -1, 4),
    -- checked in with the reservation code
    (51,  1, 2), (52,  0, 1), (53, -1, 0), (54, -2, -1), (55,  0, 2), (56, -1, 1)
  ) v(n, arrives, departs)
  join public.unit u on u.id = ('f4630000-0000-4000-8000-0000000000' || v.n)::uuid;

/* Another booking on unit 55, from an earlier date, whose guest has not been checked out. */
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, party_adults, party_children,
                         check_in, check_out, source, status)
select 'f4640000-0000-4000-8000-000000000057', u.host_id, u.property_id, u.id, 'G57', 1, 0,
       (d.today - 2 + time '14:00') at time zone 'Africa/Nairobi',
       (d.today + time '10:00') at time zone 'Africa/Nairobi',
       'entered', 'in_stay'
  from d, public.unit u where u.id = 'f4630000-0000-4000-8000-000000000055';

/* The reservation codes of the stays checked in with one. */
insert into public.reservation_code (stay_id, code)
select ('f4640000-0000-4000-8000-0000000000' || v.n)::uuid, v.code
  from (values (51, 'DAYSAA'), (52, 'DAYSBB'), (53, 'DAYSCC'), (54, 'DAYSDD'), (55, 'DAYSEE'),
               (56, 'DAYSFF')) v(n, code);

/* The far host: arriving today late in the evening, and tomorrow just after midnight, local time. */
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, party_adults, party_children,
                         check_in, check_out, source, status)
select ('f4640000-0000-4000-8000-0000000000' || v.n)::uuid, u.host_id, u.property_id, u.id, 'G' || v.n, 1, 0,
       (d.far_today + v.arrives + v.at_time) at time zone 'Pacific/Kiritimati',
       (d.far_today + v.arrives + 1 + time '10:00') at time zone 'Pacific/Kiritimati',
       'entered', 'booked'
  from d, (values (31, 0, time '23:30'), (32, 1, time '00:30')) v(n, arrives, at_time)
  join public.unit u on u.id = ('f4630000-0000-4000-8000-0000000000' || v.n)::uuid;

/* A paid NexG stay under way, to be checked out early (42). */
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, party_adults, party_children,
                         check_in, check_out, source, status, paid_kes, confirmed_at)
select 'f4640000-0000-4000-8000-000000000042', u.host_id, u.property_id, u.id, 'G42', 1, 0,
       (d.today - 1 + time '14:00') at time zone 'Africa/Nairobi',
       (d.today + 4 + time '10:00') at time zone 'Africa/Nairobi',
       'nexg', 'booked', 35000, now()
  from d, public.unit u where u.id = 'f4630000-0000-4000-8000-000000000042';

-- ══════════════════════════════════════════════ 1. the check-in days, session on UTC

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f4600000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local timezone = 'UTC';

select throws_ok(
  $$ select public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000011') $$,
  '22023',
  (select 'The guest can be checked in from ' || to_char(today + 1, 'FMDD Mon YYYY') || '.' from d),
  'UTC: a guest arriving tomorrow is not checked in today, and the message names the arrival date.');
select is(
  (select status from public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000012')),
  'in_stay', 'UTC: a one-night stay is checked in on the arrival day.');
select throws_ok(
  $$ select public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000013') $$,
  '22023', 'This stay has already ended.',
  'UTC: a one-night stay is not checked in on the departure day.');
select throws_ok(
  $$ select public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000014') $$,
  '22023', 'This stay has already ended.',
  'UTC: nor on the day after.');
select is(
  (select status from public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000015')),
  'in_stay', 'UTC: a two-night stay is checked in on the arrival day.');
select is(
  (select status from public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000016')),
  'in_stay', 'UTC: and on the day between.');
select throws_ok(
  $$ select public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000017') $$,
  '22023', 'This stay has already ended.',
  'UTC: but not on its departure day.');

-- ══════════════════════════════════════════════ 2. the same, session on Africa/Nairobi

set local timezone = 'Africa/Nairobi';

select throws_ok(
  $$ select public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000021') $$,
  '22023',
  (select 'The guest can be checked in from ' || to_char(today + 1, 'FMDD Mon YYYY') || '.' from d),
  'Nairobi: a guest arriving tomorrow is not checked in today.');
select is(
  (select status from public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000022')),
  'in_stay', 'Nairobi: a one-night stay is checked in on the arrival day.');
select throws_ok(
  $$ select public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000023') $$,
  '22023', 'This stay has already ended.',
  'Nairobi: not on the departure day.');
select throws_ok(
  $$ select public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000024') $$,
  '22023', 'This stay has already ended.',
  'Nairobi: nor on the day after.');

-- ══════════════════════════════════════════════ 3. the day is the host's, not UTC's or Nairobi's

set local timezone = 'UTC';

select is(
  (select status from public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000031')),
  'in_stay', 'A host far from UTC checks a guest in on the host''s arrival day.');
select throws_ok(
  $$ select public.rpc_host_stay_mark_checked_in('f4640000-0000-4000-8000-000000000032') $$,
  '22023',
  (select 'The guest can be checked in from ' || to_char(far_today + 1, 'FMDD Mon YYYY') || '.' from d),
  'And not on the host''s day before, although that arrival falls on the earlier date in UTC.');

-- ══════════════════════════════════════════════ 4. the reservation code keeps the same days

select is(
  (select public.rpc_host_stay_check_in('DAYSAA') - 'ok'),
  (select jsonb_build_object('reason', 'too_early',
            'message', 'The guest can be checked in from ' || to_char(today + 1, 'FMDD Mon YYYY') || '.') from d),
  'Code: a guest arriving tomorrow is not checked in today, and the answer names the arrival date.');
select is(public.rpc_host_stay_check_in('DAYSBB') ->> 'ok', 'true',
  'Code: a one-night stay is checked in on the arrival day.');
select is(public.rpc_host_stay_check_in('DAYSCC') ->> 'reason', 'ended',
  'Code: not on the departure day.');
select is(public.rpc_host_stay_check_in('DAYSDD') ->> 'reason', 'ended',
  'Code: nor on the day after.');
select is(public.rpc_host_stay_check_in('DAYSFF') ->> 'ok', 'true',
  'Code: and on the day between.');
select is(public.rpc_host_stay_check_in('DAYSEE') ->> 'reason', 'unit_occupied',
  'Code: not while another guest is still checked in to the unit.');

reset role;
select results_eq(
  $$ select s.status, c.used_at is null from public.stay s
       join public.reservation_code c on c.stay_id = s.id
      where s.id in ('f4640000-0000-4000-8000-000000000051', 'f4640000-0000-4000-8000-000000000053',
                     'f4640000-0000-4000-8000-000000000055')
      order by s.id $$,
  $$ values ('booked'::text, true), ('booked'::text, true), ('booked'::text, true) $$,
  'A refused stay stays booked, and its code unused.');

set local role authenticated;
select is(
  (select status from public.rpc_host_stay_mark_checked_out('f4640000-0000-4000-8000-000000000057')),
  'departed', 'The earlier guest checks out.');
select is(public.rpc_host_stay_check_in('DAYSEE') ->> 'ok', 'true',
  'Code: then the arriving guest is checked in with the same code.');

-- ══════════════════════════════════════════════ 5. an early check-out

select is(
  (select count(*)::int from (
     select public.rpc_host_stay_mark_checked_in(id::uuid)
       from unnest(array['f4640000-0000-4000-8000-000000000041',
                         'f4640000-0000-4000-8000-000000000042',
                         'f4640000-0000-4000-8000-000000000043']) id) x),
  3, 'Three guests with four more nights are checked in.');
select is(
  (select status from public.rpc_host_stay_mark_checked_out('f4640000-0000-4000-8000-000000000041')),
  'departed', 'One checks out early.');
select is(
  (select status from public.rpc_host_stay_mark_checked_out('f4640000-0000-4000-8000-000000000042')),
  'departed', 'So does a guest who paid through NexG.');

reset role;
select is(
  (select count(*)::int from public.stay s, d
    where s.id in ('f4640000-0000-4000-8000-000000000041', 'f4640000-0000-4000-8000-000000000042')
      and s.check_out = (d.today + 4 + time '10:00') at time zone 'Africa/Nairobi'),
  2, 'Their stays keep the check-out they were booked with.');
select ok(not public.fn_stay_occupies('departed', null), 'A departed stay keeps no dates.');
select ok(
  public.fn_stay_occupies('booked', null) and public.fn_stay_occupies('in_stay', null)
  and public.fn_stay_occupies('blocked', null)
  and public.fn_stay_occupies('held', now() + interval '1 hour')
  and not public.fn_stay_occupies('held', now() - interval '1 hour')
  and not public.fn_stay_occupies('cancelled', null),
  'Everything else keeps its dates as before.');

set local role authenticated;
select results_eq(
  $$ select occupied, departing_today, guest_now, guest_out is null from public.host_unit_list_v
      where id = 'f4630000-0000-4000-8000-000000000041' $$,
  $$ values (false, false, null::text, true) $$,
  'The unit list no longer shows the guest who left.');

-- ══════════════════════════════════════════════ 6. the guest side of the freed nights

select set_config('request.jwt.claims',
  '{"sub":"f4600000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::int from d, public.rpc_unit_busy('f4630000-0000-4000-8000-000000000042',
     d.today + 1, d.today + 4)),
  0, 'The freed nights are no longer busy.');
select is(
  (select count(*)::int from d, public.rpc_stay_search(d.today + 1, d.today + 3, 1,
     'f4620000-0000-4000-8000-00000000000a') r
    where r.unit_id = 'f4630000-0000-4000-8000-000000000042'),
  1, 'Search offers the unit for them.');
select lives_ok(
  $$ select public.rpc_stay_hold('f4630000-0000-4000-8000-000000000042',
       (select today + 1 from d), (select today + 3 from d), '{"first_name":"Next"}') $$,
  'A guest can hold them, after a paid NexG stay too.');

select is(
  (select count(*)::int from d, public.rpc_unit_busy('f4630000-0000-4000-8000-000000000043',
     d.today + 1, d.today + 4)),
  1, 'A guest still checked in keeps the nights busy.');
select is(
  (select count(*)::int from d, public.rpc_stay_search(d.today + 1, d.today + 3, 1,
     'f4620000-0000-4000-8000-00000000000a') r
    where r.unit_id = 'f4630000-0000-4000-8000-000000000043'),
  0, 'Search leaves that unit out.');
select throws_ok(
  $$ select public.rpc_stay_hold('f4630000-0000-4000-8000-000000000043',
       (select today + 1 from d), (select today + 3 from d), '{"first_name":"Next"}') $$,
  '23P01', 'Those dates are no longer available.',
  'And no guest can hold them.');

-- ══════════════════════════════════════════════ 7. the host side

select set_config('request.jwt.claims',
  '{"sub":"f4600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.rpc_stay_block('f4610000-0000-4000-8000-00000000000a',
       'f4630000-0000-4000-8000-000000000041', (select today + 1 from d), (select today + 2 from d)) $$,
  'The host can block a freed night.');
create temp table held as
select h.id, h.rate_kes
  from d, public.rpc_stay_host_hold('f4610000-0000-4000-8000-00000000000a',
         jsonb_build_object('unit_id', 'f4630000-0000-4000-8000-000000000041', 'guest_first_name', 'Held',
           'rate_kes', 6500,
           'check_in', (d.today + 2)::text || ' 14:00:00 Africa/Nairobi',
           'check_out', (d.today + 3)::text || ' 10:00:00 Africa/Nairobi'), 24) h;
select is((select rate_kes::int from held), 6500, 'A hold keeps its nightly rate.');
select is(
  (select status from public.rpc_stay_confirm((select id from held))),
  'booked', 'The host can hold another and confirm it.');
select is(
  (select conflict_flagged from d, public.rpc_stay_upsert('f4610000-0000-4000-8000-00000000000a',
     jsonb_build_object('unit_id', 'f4630000-0000-4000-8000-000000000041', 'guest_first_name', 'Entered',
       'check_in', (d.today + 3)::text || ' 14:00:00 Africa/Nairobi',
       'check_out', (d.today + 4)::text || ' 10:00:00 Africa/Nairobi'))),
  false, 'A booking entered over the nights left of a departed stay is not flagged.');

select throws_ok(
  $$ select public.rpc_stay_block('f4610000-0000-4000-8000-00000000000a',
       'f4630000-0000-4000-8000-000000000043', (select today + 1 from d), (select today + 2 from d)) $$,
  '23P01', null, 'A night of a guest still checked in cannot be blocked.');
select throws_ok(
  $$ select public.rpc_stay_host_hold('f4610000-0000-4000-8000-00000000000a',
       (select jsonb_build_object('unit_id', 'f4630000-0000-4000-8000-000000000043',
          'guest_first_name', 'Held',
          'check_in', (today + 2)::text || ' 14:00:00 Africa/Nairobi',
          'check_out', (today + 3)::text || ' 10:00:00 Africa/Nairobi') from d), 24) $$,
  '23P01', null, 'Nor held.');
select is(
  (select conflict_flagged from d, public.rpc_stay_upsert('f4610000-0000-4000-8000-00000000000a',
     jsonb_build_object('unit_id', 'f4630000-0000-4000-8000-000000000043', 'guest_first_name', 'Entered',
       'check_in', (d.today + 3)::text || ' 14:00:00 Africa/Nairobi',
       'check_out', (d.today + 4)::text || ' 10:00:00 Africa/Nairobi'))),
  true, 'A booking entered over it is flagged.');
select results_eq(
  $$ select occupied, guest_now from public.host_unit_list_v
      where id = 'f4630000-0000-4000-8000-000000000043' $$,
  $$ values (true, 'G43'::text) $$,
  'The unit list shows the guest who is still there.');

reset role;
select * from finish();
rollback;
