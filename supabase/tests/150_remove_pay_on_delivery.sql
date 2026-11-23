-- Pay on delivery is removed from the system (20270301000100).

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1500000-0000-4000-8000-00000000000a', '[Legal 150] Ltd', '[Shop 150]', 'restaurant',
        '[Contact]', '+254700015000', 'shop150@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');

create function pg_temp.order_with(p_channel text, p_method text) returns void
language sql as $f$
  insert into public.order (reference, merchant_id, city_id, channel, dropoff_label, payment_method, payment_status,
                            subtotal_cents, total_cents, currency)
  values ('T150-' || left(gen_random_uuid()::text, 8), 'c1500000-0000-4000-8000-00000000000a',
          (select id from public.city where slug = 'nairobi'), p_channel::public.order_channel, '[Fixture address]',
          p_method::public.order_payment_method, 'pending', 100000, 100000, 'KES');
$f$;
grant execute on function pg_temp.order_with(text, text) to authenticated, service_role;
grant insert on public.order to authenticated, service_role;

-- ══════════════════════════════════════════════ orders

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select pg_temp.order_with('manual', 'cash_on_delivery')$$,
  '23514', 'Cash on delivery is not available. Pay with M-Pesa instead.',
  'A signed-in session cannot place a cash order on any channel, not only the website.');
reset role;

set local role service_role;
select throws_ok($$select pg_temp.order_with('api', 'cash_on_delivery')$$,
  '23514', 'Cash on delivery is not available. Pay with M-Pesa instead.',
  'Nor can the server.');
reset role;

select lives_ok($$select pg_temp.order_with('manual', 'mpesa_stk')$$,
  'Other methods are untouched.');
select lives_ok($$select pg_temp.order_with('web', 'cash_on_delivery')$$,
  'The database owner can still write an old cash order (imports, repairs).');

-- ══════════════════════════════════════════════ the switches

select is((select count(*)::int from public.merchant where pay_on_delivery), 0, 'No shop takes payment on delivery.');
select throws_ok($$update public.merchant set pay_on_delivery = true
                    where id = 'c1500000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'And no shop can be switched back on.');
select is((select count(*)::int from public.zone where cod_allowed), 0, 'No zone allows cash on delivery.');
select throws_ok($$update public.zone set cod_allowed = true$$, '23514', null,
  'And no zone can be switched back on.');
select is((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'zone' and column_name = 'cod_allowed'),
  'false', 'A new zone starts without it.');
select throws_ok($$update public.rider set pay_on_delivery_eligible = true$$, '23514', null,
  'No rider can be made eligible for cash orders.');

-- ══════════════════════════════════════════════ the apps

select ok(not exists (select 1 from public.merchant_traits_public where 'pay_on_delivery' = any (traits)),
  'No shop card shows pay on delivery.');
select ok(not exists (select 1 from public.order_step_rule where step = 'cash_collected'),
  'Riders have no "Cash collected" step.');

select * from finish();
rollback;
