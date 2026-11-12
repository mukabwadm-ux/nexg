-- "Close early today" on the merchant Hours board.
--
-- The button sends a closing time and no opening time (closed = false,
-- opens = null), and `hours_override_is_coherent` used to refuse that row,
-- so closing early never worked. The opening time now comes from the hours
-- that day. Closing times that would read as something else are refused
-- with a reason, and the other uses of the function are unchanged.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ------------------------------------------------------------------ fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '66000000-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'early.owner@shop.example', '', now(), now(), now());

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id
)
values
  ('66000000-0000-0000-0000-000000000002', 'Mapema Limited', 'Mapema', 'restaurant',
   'Wambui Njoroge', '+254700000661', 'early.owner@shop.example',
   (select id from public.city where slug = 'nairobi')),
  /* Open through midnight: 18:00 to 02:00. */
  ('66000000-0000-0000-0000-000000000003', 'Usiku Limited', 'Usiku', 'restaurant',
   'Wambui Njoroge', '+254700000662', 'late.owner@shop.example',
   (select id from public.city where slug = 'nairobi')),
  /* No hours at all. */
  ('66000000-0000-0000-0000-000000000004', 'Bila Saa Limited', 'Bila Saa', 'restaurant',
   'Wambui Njoroge', '+254700000663', 'nohours.owner@shop.example',
   (select id from public.city where slug = 'nairobi'));

insert into public.merchant_user (merchant_id, user_id, role)
select m, '66000000-0000-0000-0000-000000000001', 'owner'
from unnest(array['66000000-0000-0000-0000-000000000002',
                  '66000000-0000-0000-0000-000000000003',
                  '66000000-0000-0000-0000-000000000004']::uuid[]) m;

insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
select '66000000-0000-0000-0000-000000000002'::uuid, d, '09:00'::time, '17:00'::time
from generate_series(0, 6) d
union all
select '66000000-0000-0000-0000-000000000003'::uuid, d, '18:00'::time, '02:00'::time
from generate_series(0, 6) d;

set local role authenticated;
set local request.jwt.claims = '{"sub":"66000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------- what the button sends

select lives_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000002',
      current_date + 3, null, '15:00', false, null, 'Private event', 'merchant')$$,
  'closing early with only a closing time is accepted'
);

select results_eq(
  $$select opens, closes, closed, reason from public.merchant_hours_override
    where merchant_id = '66000000-0000-0000-0000-000000000002' and date = current_date + 3$$,
  $$values ('09:00'::time, '15:00'::time, false, 'Private event'::text)$$,
  'the override keeps the usual opening time'
);

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '66000000-0000-0000-0000-000000000002', null, current_date + 3)$$,
  $$values ('09:00'::time, '15:00'::time, false, 'merchant override'::text)$$,
  'and guests see the earlier close that day'
);

select lives_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000002',
      current_date + 3, null, '14:00', false, null, 'Private event', 'merchant')$$,
  'closing earlier again the same day is accepted'
);

select results_eq(
  $$select opens, closes from public.merchant_hours_override
    where merchant_id = '66000000-0000-0000-0000-000000000002' and date = current_date + 3$$,
  $$values ('09:00'::time, '14:00'::time)$$,
  'and still opens at the usual time'
);

-- ------------------------------------------------- refused, with a reason

select throws_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000002',
      current_date + 4, null, '08:00', false, null, null, 'merchant')$$,
  '22023', 'Pick a closing time after you open that day.',
  'a closing time before opening would mean closing the next morning'
);

select throws_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000002',
      current_date + 4, null, '09:00', false, null, null, 'merchant')$$,
  '22023', 'Pick a closing time after you open that day.',
  'a closing time equal to opening would mean open all day'
);

select throws_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000004',
      current_date + 4, null, '15:00', false, null, null, 'merchant')$$,
  '22023', 'There are no opening hours that day to close early from.',
  'a business with no hours that day has nothing to close early from'
);

-- --------------------------------------------- open through midnight

select lives_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000003',
      current_date + 3, null, '23:00', false, null, null, 'merchant')$$,
  'a late business can close before midnight'
);

select lives_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000003',
      current_date + 4, null, '01:00', false, null, null, 'merchant')$$,
  'or after midnight, before its usual close'
);

select throws_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000003',
      current_date + 5, null, '17:00', false, null, null, 'merchant')$$,
  '22023', 'Pick a closing time after you open that day.',
  'but not in the afternoon before it opens'
);

-- ----------------------------------------------- the other uses, unchanged

select lives_ok(
  $$select public.rpc_merchant_hours_override('66000000-0000-0000-0000-000000000002',
      current_date + 6, '11:00', '13:00', false, null, 'Short day', 'merchant')$$,
  'special hours with both times still save as given'
);

select results_eq(
  $$select opens, closes, closed from public.merchant_hours_override
    where merchant_id = '66000000-0000-0000-0000-000000000002' and date = current_date + 6$$,
  $$values ('11:00'::time, '13:00'::time, false)$$,
  'with the opening time they were given'
);

select * from finish();
rollback;
