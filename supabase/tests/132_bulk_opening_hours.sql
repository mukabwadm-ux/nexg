-- Opening hours for many shops on a chosen date, in one call, by the same
-- rules as the store page; only listed shops; bounded.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values
  ('c1320000-0000-4000-8000-00000000000a', '[Legal 132a] Ltd', '[Cafe 132]', 'restaurant',
   '[Contact]', '+254700013200', 'cafe132@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days'),
  ('c1320000-0000-4000-8000-00000000000b', '[Legal 132b] Ltd', '[Bar 132]', 'restaurant',
   '[Contact]', '+254700013201', 'bar132@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days'),
  ('c1320000-0000-4000-8000-00000000000c', '[Legal 132c] Ltd', '[Hidden 132]', 'restaurant',
   '[Contact]', '+254700013202', 'hidden132@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', false, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary) values
  ('c1320000-0000-4000-8000-00000000000a', 'Main', '[Address]', true),
  ('c1320000-0000-4000-8000-00000000000b', 'Main', '[Address]', true),
  ('c1320000-0000-4000-8000-00000000000c', 'Main', '[Address]', true);

-- The cafe keeps hours every day; the bar has none on file.
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
select 'c1320000-0000-4000-8000-00000000000a', d, '08:00', '17:00' from generate_series(0, 6) d;

create function pg_temp.hours(p_ids uuid[], p_date date) returns jsonb language sql as $f$
  select public.rpc_merchant_hours_on(p_ids, p_date)
$f$;

set local role anon;
select is(jsonb_array_length(pg_temp.hours(array[
            'c1320000-0000-4000-8000-00000000000a', 'c1320000-0000-4000-8000-00000000000b',
            'c1320000-0000-4000-8000-00000000000c']::uuid[], current_date + 1)), 2,
  'A visitor gets one answer per listed shop; a hidden shop is left out.');
select is((select a ->> 'opens' from jsonb_array_elements(pg_temp.hours(array[
            'c1320000-0000-4000-8000-00000000000a']::uuid[], current_date + 1)) a), '08:00:00',
  'A shop''s hours for the chosen date...');
select is((select row(a ->> 'opens', a ->> 'closes', a ->> 'closed')::text
             from jsonb_array_elements(pg_temp.hours(array['c1320000-0000-4000-8000-00000000000a']::uuid[],
                                                       current_date + 1)) a),
          (select row(h.opens::text, h.closes::text, coalesce(h.closed, false)::text)::text
             from public.fn_merchant_effective_hours('c1320000-0000-4000-8000-00000000000a',
                    (select id from public.merchant_branch where merchant_id = 'c1320000-0000-4000-8000-00000000000a'),
                    current_date + 1) h),
  '...match the single answer the store page uses.');
select ok((select a ->> 'opens' is null and not (a ->> 'closed')::boolean
             from jsonb_array_elements(pg_temp.hours(array[
               'c1320000-0000-4000-8000-00000000000b']::uuid[], current_date + 1)) a),
  'A shop with no hours on file shows as open, with no times.');
select throws_ok($$select pg_temp.hours(array['c1320000-0000-4000-8000-00000000000a']::uuid[], current_date + 91)$$,
  '22023', null, 'More than 90 days ahead is refused.');
select throws_ok($$select pg_temp.hours((select array_agg(gen_random_uuid()) from generate_series(1, 201)), current_date)$$,
  '22023', null, 'More than 200 shops at once is refused.');
select is(pg_temp.hours('{}'::uuid[], current_date), '[]'::jsonb, 'No shops, no answer.');
reset role;

select * from finish();
rollback;
