-- Ledger and Finance fixes, each checked where it went wrong.
--
--   1. Nobody signed in can reverse a ledger transaction or post host money.
--   2. A host invoice can be marked paid, and the money lands on M-Pesa.
--   3. An order can carry a weather surcharge, and its sale balances; a bank
--      transfer lands on the bank account.
--   4. Shillings are shown as shillings: merchant statements in the invoice
--      list and the tax position, and featured fees in the tax position.
--   5. A host owed money has a name on the payout list.
--   6. The calendar finds a built settlement week with the server in UTC, as
--      production runs.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create temporary table t (k text primary key, v text) on commit drop;

insert into t (k, v) values
  ('host', (select hu.host_id::text from public.host_user hu
              join auth.users u on u.id = hu.user_id
             where u.email = 'host.live@nexgapp.com'));

-- The same 16% as 22_the_ledger, whatever the seed says.
delete from settings.version where key = 'tax.vat_pct';
insert into settings.version (key, scope_kind, value, status, effective_from, activated_at)
values ('tax.vat_pct', 'global', '16'::jsonb, 'active', now(), now());

-- ═══════════════════════════════════════════ 1. nobody calls these directly

select ok(
  not has_function_privilege('authenticated', 'ledger.reverse(uuid, text, text, public.actor_type, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'ledger.reverse(uuid, text, text, public.actor_type, uuid)', 'EXECUTE'),
  'No account can reverse a ledger transaction');

select ok(
  (select bool_and(not has_function_privilege('authenticated', f::regprocedure, 'EXECUTE')
               and not has_function_privilege('anon', f::regprocedure, 'EXECUTE'))
     from unnest(array['ledger.fn_post_host_invoice(uuid)',
                       'ledger.fn_post_host_invoice_paid(uuid)',
                       'ledger.fn_post_host_referral_reward(uuid)']) as f),
  'nor post a host''s invoice, its payment or a referral reward');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '99e00000-0000-4000-8000-0000000000b1', 'authenticated',
        'authenticated', 'ledger.customer@test.local', '', now(), now(), now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99e00000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);

select throws_ok(
  $$select ledger.reverse('00000000-0000-4000-8000-0000000000ff', 'correction', 'because I can')$$,
  '42501', 'permission denied for function reverse',
  'A signed-in customer calling reverse directly is refused');

reset role;

-- ═════════════════════════════════════ 2. a host invoice can be marked paid

insert into public.host_invoice (id, host_id, period, lines, subtotal, total, status, due_at)
values ('99e00000-0000-4000-8000-0000000000c1', (select v::uuid from t where k = 'host'),
        date '2025-12-01', '[]'::jsonb, 450000, 450000, 'sent', date '2025-12-15');

/* As service_role, which cannot call the ledger itself: the definer trigger
   still posts the payment as its owner. */
set local role service_role;

select lives_ok(
  $$update public.host_invoice
       set paid_at = timestamptz '2025-12-10 10:00+03', status = 'paid', provider_ref = 'TAPHOSTPAID1'
     where id = '99e00000-0000-4000-8000-0000000000c1'$$,
  'A host invoice can be marked paid');

reset role;

select is(
  (select e.debit from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key = 'host_invoice_paid:99e00000-0000-4000-8000-0000000000c1'
      and e.account_code = 'cash.mpesa_paybill')::bigint,
  450000::bigint,
  'and the payment lands on the M-Pesa paybill');

select is(
  (select sum(e.debit - e.credit) from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key in ('host_invoice:99e00000-0000-4000-8000-0000000000c1',
                                'host_invoice_paid:99e00000-0000-4000-8000-0000000000c1')
      and e.account_code like 'receivable.host:%')::bigint,
  0::bigint,
  'clearing what the host owed on it');

-- ═════════════════════════ 3. a weather surcharge can be charged, and balances

select ok(
  not exists (select 1 from pg_constraint
               where conrelid = 'public."order"'::regclass and conname = 'order_total_is_the_sum')
  and exists (select 1 from pg_constraint
               where conrelid = 'public."order"'::regclass and conname = 'order_total_adds_up'),
  'The order total is checked once, weather surcharge included');

insert into public.guest (id, phone, name)
values ('99e00000-0000-4000-8000-0000000000d1', '+254700009977', '[Guest]')
on conflict (id) do nothing;

/* KES 1,000 of items, KES 140 commission, KES 155 delivery and a KES 58
   weather surcharge: KES 1,213, paid by bank transfer. */
select lives_ok(
  $$insert into public.order
      (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label,
       stage, payment_method, payment_status, subtotal_cents, delivery_fee_cents,
       weather_fee_cents, total_cents, commission_cents, currency, placed_at, delivered_at)
    select '99e00000-0000-4000-8000-0000000000e1', 'LEDGER-FIX-1',
      '99e00000-0000-4000-8000-0000000000d1', m.id, b.id, m.city_id, 'web', '[Somewhere]',
      'confirmed', 'bank_transfer', 'pending', 100000, 15500, 5800, 121300, 14000, 'KES',
      timestamptz '2026-03-10 12:00+03', timestamptz '2026-03-10 13:00+03'
    from public.merchant m
    join public.merchant_branch b on b.merchant_id = m.id
    where m.city_id is not null
    order by m.id, b.id
    limit 1$$,
  'An order can carry a weather surcharge');

select lives_ok(
  $$update public.order set payment_status = 'paid'
     where id = '99e00000-0000-4000-8000-0000000000e1'$$,
  'and be paid');

select is(
  (select sum(e.debit) - sum(e.credit) from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.order_id = '99e00000-0000-4000-8000-0000000000e1'
      and x.kind = 'order_sale_recognised')::bigint,
  0::bigint,
  'Its sale balances');

select is(
  (select sum(e.credit) from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.order_id = '99e00000-0000-4000-8000-0000000000e1'
      and x.kind = 'order_sale_recognised'
      and e.account_code = 'revenue.weather_surcharge')::bigint,
  5000::bigint,
  'The KES 58 surcharge is KES 50 of revenue');

/* 16% inside KES 140 is 19.31, inside KES 155 is 21.38, inside KES 58 is 8. */
select is(
  (select sum(e.credit) from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.order_id = '99e00000-0000-4000-8000-0000000000e1'
      and x.kind = 'order_sale_recognised'
      and e.account_code = 'tax.vat_output')::bigint,
  4869::bigint,
  'and KES 8 of VAT, on the VAT line with the commission''s and the delivery fee''s');

select is(
  (select jsonb_build_object(
      'bank', coalesce(sum(e.debit) filter (where e.account_code = 'cash.bank'), 0),
      'mpesa', coalesce(sum(e.debit) filter (where e.account_code = 'cash.mpesa_paybill'), 0))
     from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.order_id = '99e00000-0000-4000-8000-0000000000e1'
      and x.kind = 'order_sale_recognised'),
  '{"bank": 121300, "mpesa": 0}'::jsonb,
  'A bank transfer lands on the bank account, not the M-Pesa paybill');

-- ═════════════════════════════════════════ 4. shillings are not cents

insert into public.merchant_statement
  (id, merchant_id, period_start, period_end, gross_kes, commission_kes, tax_withheld_kes, net_kes)
select '99e00000-0000-4000-8000-0000000000f1', m.id, date '2025-11-03', date '2025-11-09',
       2000, 250, 40, 1710
from public.merchant m order by m.id limit 1;

insert into public.featured_booking (id, merchant_id, placement_kind, quoted_price)
select '99e00000-0000-4000-8000-0000000000f2', m.id, 'homepage', 1500
from public.merchant m order by m.id limit 1;

insert into public.featured_fee_line
  (booking_id, merchant_id, week_start, placement_label, fee_ex_vat, vat, fee_total, days_live)
select b.id, b.merchant_id, date '2025-11-03', 'Homepage', 1500, 240, 1740, 7
from public.featured_booking b where b.id = '99e00000-0000-4000-8000-0000000000f2';

select is(
  (select total_cents from public.fin_invoice_v where id = '99e00000-0000-4000-8000-0000000000f1'),
  171000::bigint,
  'A merchant statement of KES 1,710 is 171,000 cents in the invoice list');

select is(
  (select jsonb_build_object('base', base_cents, 'tax', tax_cents)
     from public.fin_tax_position_v where sort = 2),
  (select jsonb_build_object('base', sum(gross_kes) * 100, 'tax', sum(tax_withheld_kes) * 100)
     from public.merchant_statement),
  'Merchant statements'' gross and withholding are cents in the tax position');

select is(
  (select jsonb_build_object('base', base_cents, 'tax', tax_cents)
     from public.fin_tax_position_v where sort = 1),
  (select jsonb_build_object('base', sum(fee_ex_vat) * 100, 'tax', coalesce(sum(vat), 0) * 100)
     from public.featured_fee_line),
  'and so are featured fees, which are priced in shillings');

-- ════════════════════════════════════ 5. a host owed money has a name

update public.host_referral set reward_status = 'credited', reward_amount_kes = 3000
 where id = (select id from public.host_referral
              where referrer_host_id = (select v::uuid from t where k = 'host')
                and reward_status = 'pending' limit 1);

do $$ begin perform public.fn_fin_build_party_owed(); end $$;

select is(
  (select label from public.fin_party_owed
    where party_type = 'host' and party_id = (select v::uuid from t where k = 'host')),
  (select nullif(trim(display_name), '') from public.host where id = (select v::uuid from t where k = 'host')),
  'A host owed a referral reward is named on the payout list');

-- ═══════════════════════════════════ 6. the calendar finds the run it dates

set local timezone = 'UTC';

/* Last week's run, bounded the way rpc_settlement_build bounds it: Monday
   00:00 in Nairobi, which is Sunday 21:00 in UTC. */
insert into public.fin_settlement_run (id, reference, period_start, period_end, cutoff_at, pay_date)
select '99e00000-0000-4000-8000-0000000000a9', 'TAP-RUN-CAL', w.e - interval '7 days', w.e, w.e,
       (w.e at time zone 'Africa/Nairobi')::date + 4
from (select (date_trunc('week', now() at time zone 'Africa/Nairobi') - interval '7 days')
               at time zone 'Africa/Nairobi' as e) w;

do $$ begin perform public.fn_fin_build_calendar(); end $$;

select is(
  (select c.state || ' · ' || c.detail from public.fin_calendar_entry c
    where c.id = 'settlement:' || ((select r.period_end from public.fin_settlement_run r
                                     where r.reference = 'TAP-RUN-CAL') at time zone 'Africa/Nairobi')::date),
  'in_progress · TAP-RUN-CAL · draft',
  'A built settlement week is on the calendar under its Monday');

select * from finish();
rollback;
