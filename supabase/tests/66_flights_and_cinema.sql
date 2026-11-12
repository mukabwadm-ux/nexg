begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

select is(
  (select jsonb_array_length(subcategories) from public.category_config where category = 'flights'),
  4, 'Flights has all four specialties.'
);
select ok(
  (select subcategories @> '[{"id":"cinemas"}]'::jsonb from public.category_config where category = 'experiences'),
  'Cinemas are registered as an Experiences specialty.'
);

insert into public.merchant (
  id, legal_name, trading_name, category, subcategory, contact_name, contact_phone, contact_email, city_id,
  status, explore_visible, went_live_at
)
values
  ('e5000000-0000-4000-8000-000000000001', 'Cinema One', 'Cinema One', 'experiences', 'cinemas',
    'Test Contact', '+254700000951', 'cinema-one@example.test', (select id from public.city where slug = 'nairobi'),
    'live', true, now() - interval '1 day'),
  ('e5000000-0000-4000-8000-000000000002', 'Cinema Two', 'Cinema Two', 'experiences', 'cinemas',
    'Test Contact', '+254700000952', 'cinema-two@example.test', (select id from public.city where slug = 'nairobi'),
    'live', true, now() - interval '1 day');

insert into auth.users (id, email, aud, role)
values
  ('e5000000-0000-4000-8000-000000000003', 'cinema-guest-one@example.test', 'authenticated', 'authenticated'),
  ('e5000000-0000-4000-8000-000000000004', 'cinema-guest-two@example.test', 'authenticated', 'authenticated');

set local role service_role;
select public.rpc_cinema_publish_showing(
  merchant_id, '{"id":"e5000000-0000-4000-8000-000000000005","title":"One Film","languages":["English"]}',
  jsonb_build_object('id', screen_id, 'name', 'Screen One'),
  jsonb_build_object('id', showing_id, 'starts_at', now() + interval '12 hours',
    'ends_at', now() + interval '14 hours', 'format', '2D', 'status', 'on_sale',
    'standard_minor', 80000, 'vip_minor', 120000),
  '[{"position":1,"label":"A","seats":[
    {"code":"A1","column_position":1,"number":1,"seat_type":"standard"},
    {"code":"A2","column_position":3,"number":2,"seat_type":"vip"}
  ]}]'
)
from (values
  ('e5000000-0000-4000-8000-000000000001'::uuid, 'e5000000-0000-4000-8000-000000000006', 'e5000000-0000-4000-8000-000000000008'),
  ('e5000000-0000-4000-8000-000000000002'::uuid, 'e5000000-0000-4000-8000-000000000007', 'e5000000-0000-4000-8000-000000000009')
) as cinemas(merchant_id, screen_id, showing_id);
reset role;
set local role anon;

select is(jsonb_array_length(public.rpc_cinema_programme((now() at time zone 'Africa/Nairobi')::date)->'films'),
  1, 'One film is returned across both cinemas.');
select is(jsonb_array_length(public.rpc_cinema_programme((now() at time zone 'Africa/Nairobi')::date)->'showings'),
  2, 'Both cinemas return their showing.');
select is(jsonb_array_length(public.rpc_cinema_programme((now() at time zone 'Africa/Nairobi')::date,
  7, 'e5000000-0000-4000-8000-000000000002')->'showings'), 1, 'Cinema-first reads are scoped.');
select is(public.rpc_cinema_seat_map('e5000000-0000-4000-8000-000000000008')->'plan'->'rows'->0->'cells'->1,
  'null'::jsonb, 'The seat map preserves the aisle.');
select throws_ok(
  $$select public.rpc_cinema_hold_seats('e5000000-0000-4000-8000-000000000008', array['A1'], 80000,
    'e5000000-0000-4000-8000-000000000011')$$,
  '42501', null, 'A guest must sign in to hold seats.'
);
select throws_ok(
  $$select public.rpc_cinema_programme((now() at time zone 'Africa/Nairobi')::date, 8)$$,
  '22023', null, 'A public programme cannot exceed the seven-day window.'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.rpc_cinema_publish_showing(null, '{}', '{}', '{}')$$,
  '42501', null, 'Only the trusted publisher can write programmes.'
);
select throws_ok(
  $$select public.rpc_cinema_hold_seats('e5000000-0000-4000-8000-000000000008', array['A1'], 1,
    'e5000000-0000-4000-8000-000000000011')$$,
  '22023', null, 'A stale seat price is refused.'
);
select set_config('nexg_test.cinema_hold', public.rpc_cinema_hold_seats(
  'e5000000-0000-4000-8000-000000000008', array['A1', 'A2'], 200000,
  'e5000000-0000-4000-8000-000000000011')->>'holdId', true);
select is(public.rpc_cinema_hold_seats(
  'e5000000-0000-4000-8000-000000000008', array['A2', 'A1'], 200000,
  'e5000000-0000-4000-8000-000000000011')->>'holdId',
  current_setting('nexg_test.cinema_hold'), 'Retrying a selection returns the same hold.');
select is(public.rpc_cinema_seat_map('e5000000-0000-4000-8000-000000000008')->'taken',
  '["A1","A2"]'::jsonb, 'Seats are unavailable while held.');
select throws_ok(
  $$select public.rpc_cinema_confirm_hold(current_setting('nexg_test.cinema_hold')::uuid, 'cinema-123')$$,
  '42501', null, 'Customers cannot confirm their own holds.'
);

select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.rpc_cinema_release_hold(current_setting('nexg_test.cinema_hold')::uuid)$$,
  'P0002', null, 'Another guest cannot release the hold.'
);
select throws_ok(
  $$select public.rpc_cinema_hold_seats('e5000000-0000-4000-8000-000000000008', array['A1'], 80000,
    'e5000000-0000-4000-8000-000000000012')$$,
  '23P01', null, 'An existing hold blocks double booking.'
);

reset role;
update cinema.hold set expires_at = clock_timestamp() - interval '1 second'
where id = current_setting('nexg_test.cinema_hold')::uuid;
set local role authenticated;
select is(public.rpc_cinema_seat_map('e5000000-0000-4000-8000-000000000008')->'taken',
  '[]'::jsonb, 'Expired holds release their seats immediately.');
select set_config('nexg_test.cinema_next_hold', public.rpc_cinema_hold_seats(
  'e5000000-0000-4000-8000-000000000008', array['A1'], 80000,
  'e5000000-0000-4000-8000-000000000012')->>'holdId', true);
select ok(current_setting('nexg_test.cinema_next_hold') <> current_setting('nexg_test.cinema_hold'),
  'Another customer can hold an expired seat.');

reset role;
set local role service_role;
select is(public.rpc_cinema_confirm_hold(current_setting('nexg_test.cinema_next_hold')::uuid, 'cinema-123')->>'status',
  'confirmed', 'A trusted cinema confirmation commits the seat.');
select is(public.rpc_cinema_seat_map('e5000000-0000-4000-8000-000000000008')->'taken',
  '["A1"]'::jsonb, 'Confirmed seats stay unavailable.');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000003', true);
select is(public.rpc_cinema_release_hold(current_setting('nexg_test.cinema_hold')::uuid)->>'status',
  'released', 'A guest can release their own hold.');

-- Every write is in the audit log; fn_wiring_check fails any that is not.
reset role;
select is(
  (select count(*)::int from audit.audit_event where action = 'cinema.showing_published'
     and target_id in ('e5000000-0000-4000-8000-000000000008', 'e5000000-0000-4000-8000-000000000009')),
  2, 'Publishing a showing is audited.');
select is(
  (select count(*)::int from audit.audit_event where action = 'cinema.seats_held'
     and target_id in (current_setting('nexg_test.cinema_hold')::uuid,
                       current_setting('nexg_test.cinema_next_hold')::uuid)),
  2, 'Each new seat hold is audited once; a retried request is not.');
select is(
  (select count(*)::int from audit.audit_event where action = 'cinema.hold_released'
     and target_id = current_setting('nexg_test.cinema_hold')::uuid
     and actor_id = 'e5000000-0000-4000-8000-000000000003'),
  1, 'A released hold is audited with the guest who released it.');
select is(
  (select count(*)::int from audit.audit_event where action = 'cinema.hold_confirmed'
     and target_id = current_setting('nexg_test.cinema_next_hold')::uuid),
  1, 'A confirmed hold is audited.');

select * from finish();
rollback;
