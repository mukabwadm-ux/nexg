-- Stays admin fixes (20270331000100): a sent-back host who resubmits is pending again and the listing photo
-- guard still refuses them, nights freed by an early check-out are not counted twice, staff check-in needs a
-- unit, a lapsed hold leaves a unit available today, and deleted accounts are not one repeat guest.

begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create temp table d on commit drop as select (now() at time zone 'Africa/Nairobi')::date as today;
grant select on d to authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('c2530000-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'u' || n || '-253@test.local', now(), false, now(), now()
  from generate_series(1, 5) n;
-- 1 ops staff, 2 grant approver, 3 sent-back host, 4 fresh applicant, 5 applicant with no submission time

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2530000-0000-4000-8000-0000000000b1', 'c2530000-0000-4000-8000-000000000001', 'u1-253@test.local', 'Ops 253'),
  ('c2530000-0000-4000-8000-0000000000b2', 'c2530000-0000-4000-8000-000000000002', 'u2-253@test.local', 'Approver 253');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c2530000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c2530000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

-- Occupancy is counted in Mombasa, where the seeds have no units; the rest sits in Nairobi.
insert into public.host (id, phone, kind, status, contact_name, display_name, email, city_id, submitted_at,
                         verified_at, time_zone)
select v.id::uuid, v.phone, 'single_unit', v.status::public.host_status, v.name, '[' || v.name || ']', v.email,
       (select id from public.city where slug = v.city), v.submitted,
       case when v.status = 'live' then now() end, 'Africa/Nairobi'
  from (values
    ('c2530000-0000-4000-8000-0000000000a1', '+254700025301', 'live', 'Mombasa 253', 'm253@test.local', 'mombasa', now()),
    ('c2530000-0000-4000-8000-0000000000a2', '+254700025302', 'live', 'Nairobi 253', 'n253@test.local', 'nairobi', now()),
    ('c2530000-0000-4000-8000-0000000000a3', '+254700025303', 'verifying', 'Sentback 253', 's253@test.local', 'nairobi',
     now() - interval '3 days'),
    ('c2530000-0000-4000-8000-0000000000a4', '+254700025304', 'applied', 'Fresh 253', 'f253@test.local', 'nairobi', now()),
    ('c2530000-0000-4000-8000-0000000000a5', '+254700025305', 'applied', 'Notime 253', 't253@test.local', 'nairobi',
     null::timestamptz)
  ) v(id, phone, status, name, email, city, submitted);

insert into public.host_user (host_id, user_id, role)
select ('c2530000-0000-4000-8000-0000000000a' || n)::uuid, ('c2530000-0000-4000-8000-00000000000' || n)::uuid, 'owner'
  from generate_series(3, 5) n;

insert into public.host_document (host_id, kind, storage_path, file_name, mime, size_bytes, uploaded_by)
select h.host_id, k, h.host_id || '/' || k || '.pdf', k || '.pdf', 'application/pdf', 100, h.user_id
  from public.host_user h cross join (values ('id_document'), ('authority')) v(k)
 where h.host_id in ('c2530000-0000-4000-8000-0000000000a3', 'c2530000-0000-4000-8000-0000000000a4');

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, review_status)
values ('c2530000-0000-4000-8000-0000000000e1', 'c2530000-0000-4000-8000-0000000000a1', 'block-253', '[Block 253]',
        'apartment_block', 'Nyali253', (select id from public.city where slug = 'mombasa'), true, now(), 'approved');

insert into public.unit (id, host_id, property_id, name, label_public, address_line, area, city_id, handoff, status,
                         listed, max_guests, nightly_rate_kes)
select v.id::uuid, v.host::uuid, v.property::uuid, v.name, v.name, '[Address]',
       case v.city when 'mombasa' then 'Nyali253' else 'Elsewhere253' end,
       (select id from public.city where slug = v.city), 'lockbox', 'live', true, 2, 7000
  from (values
    ('c2530000-0000-4000-8000-0000000000c1', 'c2530000-0000-4000-8000-0000000000a1',
     'c2530000-0000-4000-8000-0000000000e1', 'T253 early', 'mombasa'),
    ('c2530000-0000-4000-8000-0000000000c2', 'c2530000-0000-4000-8000-0000000000a2', null, 'T253 lapsed', 'nairobi'),
    ('c2530000-0000-4000-8000-0000000000c3', 'c2530000-0000-4000-8000-0000000000a2', null, 'T253 held', 'nairobi'),
    ('c2530000-0000-4000-8000-0000000000c4', 'c2530000-0000-4000-8000-0000000000a2', null, 'T253 desk', 'nairobi')
  ) v(id, host, property, name, city);

/* Mombasa, one unit. Days are counted back from today; null "left" means no check-out time was recorded.
   Early: 7 nights booked, left the next morning. Rebook: the 6 freed nights, booked again.
   SameDay: in and straight out. NoTime: departed without a time. Then two names twice each, long ago. */
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, party_adults, party_children,
                         check_in, check_out, source, status, rate_kes, quote_total_kes, checked_in_at, checked_out_at)
select ('c2530000-0000-4000-8000-0000000000d' || v.n)::uuid, 'c2530000-0000-4000-8000-0000000000a1',
       'c2530000-0000-4000-8000-0000000000e1', 'c2530000-0000-4000-8000-0000000000c1', v.guest, 1, 0,
       (d.today - v.came + time '14:00') at time zone 'Africa/Nairobi',
       (d.today - v.due + time '10:00') at time zone 'Africa/Nairobi',
       'entered', v.status, 7000, 7000 * (v.came - v.due),
       case when v.status = 'departed' then (d.today - v.came + time '15:00') at time zone 'Africa/Nairobi' end,
       (d.today - v.gone + v.gone_at) at time zone 'Africa/Nairobi'
  from d, (values
    (1, 'Early', 10, 3, 'departed', 9, time '09:00'),
    (2, 'Rebook', 9, 3, 'booked', null::int, null::time),
    (3, 'SameDay', 20, 18, 'departed', 20, time '18:00'),
    (4, 'NoTime', 30, 28, 'departed', null, null),
    (5, 'Former member', 210, 209, 'departed', null, null),
    (6, 'Former member', 208, 207, 'departed', null, null),
    (7, 'Repeat253', 206, 205, 'departed', null, null),
    (8, 'Repeat253', 204, 203, 'departed', null, null)
  ) v(n, guest, came, due, status, gone, gone_at);

/* Nairobi: a lapsed hold and a live one over today, and two arrivals, one with no unit. */
insert into public.stay (id, host_id, unit_id, guest_first_name, party_adults, party_children, check_in, check_out,
                         source, status, hold_expires_at)
select v.id::uuid, 'c2530000-0000-4000-8000-0000000000a2', v.unit::uuid, 'Guest', 1, 0,
       (d.today + time '00:00') at time zone 'Africa/Nairobi', (d.today + 2 + time '10:00') at time zone 'Africa/Nairobi',
       'entered', v.status, v.expires
  from d, (values
    ('c2530000-0000-4000-8000-0000000000f2', 'c2530000-0000-4000-8000-0000000000c2', 'held', now() - interval '1 hour'),
    ('c2530000-0000-4000-8000-0000000000f3', 'c2530000-0000-4000-8000-0000000000c3', 'held', now() + interval '1 hour'),
    ('c2530000-0000-4000-8000-0000000000f4', 'c2530000-0000-4000-8000-0000000000c4', 'booked', null::timestamptz),
    ('c2530000-0000-4000-8000-0000000000f5', null, 'booked', null)
  ) v(id, unit, status, expires);

-- ─────────────────────────────────────────── sent back, then resubmitted

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_console_host_reject('c2530000-0000-4000-8000-0000000000a3', 'Clearer ID please.', false);

select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_host_listing_photo_set('c2530000-0000-4000-8000-0000000000a3',
    'c2530000-0000-4000-8000-0000000000c1', 'x') $$,
  '22023', 'Add photos from your workspace instead.', 'the photo import refuses a sent-back host');
select is(public.rpc_host_documents_submit('c2530000-0000-4000-8000-0000000000a3')::text, 'verifying',
  'the sent-back host resubmits');
select throws_ok($$ select public.rpc_host_listing_photo_set('c2530000-0000-4000-8000-0000000000a3',
    'c2530000-0000-4000-8000-0000000000c1', 'x') $$,
  '22023', 'Add photos from your workspace instead.', 'and still cannot use the photo import');

reset role;
select ok((select submitted_at is not null and submitted_at = verification_submitted_at and rejected_at is not null
             from public.host where id = 'c2530000-0000-4000-8000-0000000000a3'),
  'the application has a submission time again, and the send-back stays on record');
select results_eq($$ select step_verify, next_step is distinct from 5 from public.host_setup_progress_v
                      where host_id = 'c2530000-0000-4000-8000-0000000000a3' $$,
  $$ values (true, true) $$, 'setup progress counts the submission');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_console_stays_hosts('pending', '[Sentback 253]') -> 'rows' -> 0 ->> 'bucket', 'pending',
  'the Stays hosts screen lists them as pending');
select is(jsonb_array_length(public.rpc_console_stays_hosts('sent_back', '[Sentback 253]') -> 'rows'), 0,
  'and no longer as sent back');

-- A document rejected after the resubmission makes them 'applied' again, within the hour.
reset role;
update public.host set status = 'applied' where id = 'c2530000-0000-4000-8000-0000000000a3';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_host_listing_photo_set('c2530000-0000-4000-8000-0000000000a3',
    'c2530000-0000-4000-8000-0000000000c1', 'x') $$,
  '22023', 'Add photos from your workspace instead.', 'a sent-back application never counts as fresh');

select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_host_listing_photo_set('c2530000-0000-4000-8000-0000000000a5',
    'c2530000-0000-4000-8000-0000000000c1', 'x') $$,
  '22023', 'Add photos from your workspace instead.', 'nor does one with no submission time');

select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_host_listing_photo_set('c2530000-0000-4000-8000-0000000000a4',
    'c2530000-0000-4000-8000-0000000000c1', 'x') $$,
  '42501', 'That unit is not on your account.', 'a fresh application still passes the guard');
reset role;
create temp table fresh on commit drop as
  select submitted_at from public.host where id = 'c2530000-0000-4000-8000-0000000000a4';
update public.host set submitted_at = submitted_at - interval '2 days'
 where id = 'c2530000-0000-4000-8000-0000000000a4';
set local role authenticated;
select public.rpc_host_documents_submit('c2530000-0000-4000-8000-0000000000a4');
reset role;
select is((select submitted_at from public.host where id = 'c2530000-0000-4000-8000-0000000000a4'),
  (select submitted_at - interval '2 days' from fresh), 'a first submission keeps its own submission time');

-- ─────────────────────────────────────────── nights freed by an early check-out

select is(public.fn_stays_held_until('departed', '2026-01-01 14:00+03', '2026-01-05 10:00+03', '2026-01-06 09:00+03'),
  '2026-01-05 10:00+03'::timestamptz, 'a late check-out counts no extra night');
select is(public.fn_stays_held_until('booked', '2026-01-01 14:00+03', '2026-01-05 10:00+03', '2026-01-02 09:00+03'),
  '2026-01-05 10:00+03'::timestamptz, 'only a departed stay ends early');
select ok(not has_function_privilege('authenticated',
    'public.fn_stays_held_until(text, timestamptz, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_console_stays_units(date, date, uuid, text, text, uuid, integer, integer)',
    'execute'), 'the helper is internal and the readers stay closed to anon');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temp table r on commit drop as
select public.rpc_console_stays_units(d.today - 10, d.today - 4, c.id) as units,
       public.rpc_console_stays_properties(d.today - 10, d.today - 4, c.id) as properties,
       public.rpc_console_stays_overview(d.today - 10, d.today - 4, c.id) as overview,
       public.rpc_console_stays_overview(d.today - 3, d.today + 3, c.id) as overview_next,
       public.rpc_console_stays_performance(d.today - 10, d.today - 4, c.id) as performance,
       public.rpc_console_stays_performance(d.today - 3, d.today + 3, c.id) as performance_next,
       public.rpc_console_stays_units(d.today - 20, d.today - 19, c.id) as same_day,
       public.rpc_console_stays_units(d.today - 30, d.today - 29, c.id) as no_time
  from d, public.city c where c.slug = 'mombasa';

select results_eq($$ select (units -> 'rows' -> 0 ->> 'nights')::int, (units -> 'rows' -> 0 ->> 'occupancy_pct')::numeric,
    (units -> 'kpis' ->> 'occupancy_pct')::numeric from r $$,
  $$ values (7, 100.0, 100.0) $$, 'units: 7 nights out of 7, not 13');
select results_eq($$ select (units -> 'kpis' ->> 'revenue_kes')::int, (units -> 'kpis' ->> 'adr_kes')::int,
    (units -> 'rows' -> 0 ->> 'sold_nights')::int from r $$,
  $$ values (91000, 7000, 13) $$, 'units: revenue is whole and ADR is still per night as booked');
select results_eq($$ select (properties -> 'rows' -> 0 ->> 'nights')::int,
    (properties -> 'rows' -> 0 ->> 'occupancy_pct')::numeric, (properties -> 'kpis' ->> 'occupancy_pct')::numeric from r $$,
  $$ values (7, 100.0, 100.0) $$, 'properties: no night counted twice');
select results_eq($$ select (properties -> 'rows' -> 0 ->> 'value_kes')::int,
    (properties -> 'rows' -> 0 ->> 'sold_nights')::int from r $$,
  $$ values (91000, 13) $$, 'properties: booking value is whole, over the nights as booked');
select is((select (overview -> 'kpis' ->> 'occupancy_pct')::numeric from r), 100.0, 'overview: occupancy rate');
select is((select (overview_next -> 'kpis' ->> 'occupancy_prev_pct')::numeric from r), 100.0,
  'overview: the period before');
select results_eq($$ select min((x ->> 'pct')::numeric), max((x ->> 'pct')::numeric), count(*)::int
    from r, jsonb_array_elements(r.overview -> 'occupancy') x $$,
  $$ values (100.0, 100.0, 7) $$, 'overview: every day of the chart');
select results_eq($$ select (overview -> 'top' -> 0 ->> 'occupancy_pct')::numeric,
    (overview -> 'kpis' ->> 'booking_value')::int from r $$,
  $$ values (100.0, 91000) $$, 'overview: top buildings, with booking value unchanged');
select results_eq($$ select (performance -> 'kpis' ->> 'occupancy_pct')::numeric,
    (performance_next -> 'kpis' ->> 'occupancy_prev_pct')::numeric from r $$,
  $$ values (100.0, 100.0) $$, 'performance: this period and the one before');
select results_eq($$ select (performance -> 'areas' -> 0 ->> 'occupancy_pct')::numeric,
    (performance -> 'top_properties' -> 0 ->> 'occupancy_pct')::numeric from r $$,
  $$ values (100.0, 100.0) $$, 'performance: areas and top properties');
select results_eq($$ select (performance -> 'kpis' ->> 'gbv')::int, (performance -> 'kpis' ->> 'adr')::int,
    (performance -> 'kpis' ->> 'revpar')::int from r $$,
  $$ values (91000, 7000, 13000) $$, 'performance: money figures as before');
select is((select (same_day -> 'rows' -> 0 ->> 'nights')::int from r), 0,
  'a guest checked out on the arrival day counts no night');
select is((select (no_time -> 'rows' -> 0 ->> 'nights')::int from r), 2,
  'a departed stay with no check-out time counts as booked');

-- ─────────────────────────────────────────── repeat guests

select is((select (performance -> 'kpis' ->> 'repeat_pct')::numeric from r), 20.0,
  'deleted accounts are not one repeat guest');

-- ─────────────────────────────────────────── available today

select results_eq($$ with c as (select public.rpc_console_stays_calendar((select today from d), null, 'T253 lapsed') j)
    select (j -> 'kpis' ->> 'available_today')::int, j -> 'rows' -> 0 -> 'days' -> 0 ->> 'state' from c $$,
  $$ values (1, 'available'::text) $$, 'a lapsed hold leaves the unit available, as on the grid');
select results_eq($$ with c as (select public.rpc_console_stays_calendar((select today from d), null, 'T253 held') j)
    select (j -> 'kpis' ->> 'available_today')::int, j -> 'rows' -> 0 -> 'days' -> 0 ->> 'state' from c $$,
  $$ values (0, 'hold'::text) $$, 'a live hold still takes it');

-- ─────────────────────────────────────────── staff check-in needs a unit

select throws_ok($$ select public.rpc_console_stay_check_in('c2530000-0000-4000-8000-0000000000f5') $$,
  '22023', 'This stay has no unit, so the guest cannot be checked in.', 'a stay with no unit is refused');
reset role;
select is((select status from public.stay where id = 'c2530000-0000-4000-8000-0000000000f5'), 'booked',
  'and stays booked');
set local role authenticated;
select is(public.rpc_console_stay_check_in('c2530000-0000-4000-8000-0000000000f4') ->> 'status', 'in_stay',
  'a stay on a unit checks in');

select * from finish();
rollback;
