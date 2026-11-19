-- Stay and featured-slot payments on the ledger.
--
--   1. Nobody calls the postings directly.
--   2. A featured slot is revenue when it is paid, in the account it came in on.
--   3. A paid stay: the host is owed 85%, NexG keeps 15% with its VAT
--      separated, the host sees it on their statement and Finance sees the
--      host owed by name.
--   4. Staff cancel it: everything is taken back and the guest is owed it.
--   5. Staff record the refund: what was owed goes back out.
--   6. A stay paid after its nights went to somebody else is owed back.
--   7. A rider-float payment posts nothing, as decided.
--   8. A posting that fails never undoes the payment, and is logged.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create temporary table t (k text primary key, v text) on commit drop;
grant select on t to authenticated;

-- The same 16% as 22_the_ledger, whatever the seed says.
delete from settings.version where key = 'tax.vat_pct';
insert into settings.version (key, scope_kind, value, status, effective_from, activated_at)
values ('tax.vat_pct', 'global', '16'::jsonb, 'active', now(), now());

insert into t (k, v) values
  ('host', (select hu.host_id::text from public.host_user hu
              join auth.users u on u.id = hu.user_id
             where u.email = 'host.live@nexgapp.com')),
  ('host_user', (select u.id::text from auth.users u where u.email = 'host.live@nexgapp.com')),
  ('merchant', (select m.id::text from public.merchant m
                 where m.city_id is not null order by m.id limit 1));

insert into t (k, v)
select 'unit', u.id::text from public.unit u
 where u.host_id = (select v::uuid from t where k = 'host') and u.archived_at is null
 order by u.id limit 1;

-- ═══════════════════════════════════════════ 1. nobody calls these directly

select ok(
  (select bool_and(not has_function_privilege('authenticated', f::regprocedure, 'EXECUTE')
               and not has_function_privilege('anon', f::regprocedure, 'EXECUTE'))
     from unnest(array['ledger.fn_post_featured_paid(uuid)',
                       'ledger.fn_post_stay_paid(uuid)',
                       'ledger.fn_post_stay_refund_due(uuid)',
                       'ledger.fn_post_stay_refunded(uuid)']) as f),
  'No account can post a payment to the ledger directly');

-- ═══════════════════════════════════ 2. a featured slot is revenue when paid

insert into public.featured_booking (id, merchant_id, placement_kind, quoted_price, weeks, status)
select b.id::uuid, (select v::uuid from t where k = 'merchant'), 'homepage', 1500, 2, 'quoted'
from (values ('99f00000-0000-4000-8000-0000000000b1'), ('99f00000-0000-4000-8000-0000000000b2')) b (id);

insert into public.payment (id, reference, intent, booking_id, merchant_id, city_id, amount_cents,
                            provider, channel, state, created_via)
select x.id::uuid, x.ref, 'featured_slot', x.booking::uuid, m.id, m.city_id, 300000,
       x.provider, x.channel, 'pending', 'merchant_dashboard'
from public.merchant m
cross join (values
  ('99f00000-0000-4000-8000-0000000000c1', 'PAY-LEDGER-F1', '99f00000-0000-4000-8000-0000000000b1', 'mpesa', 'mpesa'),
  ('99f00000-0000-4000-8000-0000000000c2', 'PAY-LEDGER-F2', '99f00000-0000-4000-8000-0000000000b2', 'bank_sandbox', 'bank')
) as x (id, ref, booking, provider, channel)
where m.id = (select v::uuid from t where k = 'merchant');

update public.payment set state = 'paid', paid_at = now()
 where id in ('99f00000-0000-4000-8000-0000000000c1', '99f00000-0000-4000-8000-0000000000c2');

select is(
  (select jsonb_build_object(
      'cash', sum(e.debit) filter (where e.account_code = 'cash.mpesa_paybill'),
      'revenue', sum(e.credit) filter (where e.account_code = 'revenue.featured'))
     from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key = 'featured_paid:99f00000-0000-4000-8000-0000000000c1'),
  '{"cash": 300000, "revenue": 300000}'::jsonb,
  'A featured slot paid by M-Pesa is KES 3,000 of featured revenue, in the paybill');

select is(
  (select sum(e.debit) from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key = 'featured_paid:99f00000-0000-4000-8000-0000000000c2'
      and e.account_code = 'cash.bank')::bigint,
  300000::bigint,
  'Paid by bank, it lands in the bank account');

do $$ begin perform ledger.fn_post_featured_paid('99f00000-0000-4000-8000-0000000000c1'); end $$;

select is(
  (select count(*)::int from ledger.transaction
    where related ->> 'payment_id' = '99f00000-0000-4000-8000-0000000000c1'),
  1,
  'Posting it again changes nothing');

-- ════════════════════════════════════════════ 3. a stay, paid and confirmed

insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, check_in, check_out,
                         source, status, hold_expires_at, quote_total_kes)
select '99f00000-0000-4000-8000-0000000000d1', u.host_id, u.property_id, u.id, '[Guest]',
       timestamptz '2027-03-01 14:00+03', timestamptz '2027-03-04 10:00+03',
       'nexg', 'held', now() + interval '15 minutes', 20000
from public.unit u where u.id = (select v::uuid from t where k = 'unit');

insert into public.payment (id, reference, intent, stay_id, city_id, amount_cents, provider, channel,
                            state, created_via)
select '99f00000-0000-4000-8000-0000000000c3', 'PAY-LEDGER-S1', 'stay',
       '99f00000-0000-4000-8000-0000000000d1', u.city_id, 2000000, 'mpesa', 'mpesa', 'pending',
       'guest_checkout'
from public.unit u where u.id = (select v::uuid from t where k = 'unit');

update public.payment set state = 'paid', paid_at = now()
 where id = '99f00000-0000-4000-8000-0000000000c3';

/* KES 20,000: 85% to the host; 16% VAT inside NexG's KES 3,000 is 413.79. */
select is(
  (select jsonb_build_object(
      'cash', sum(e.debit) filter (where e.account_code = 'cash.mpesa_paybill'),
      'host', sum(e.credit) filter (where e.account_code = 'stay.host_share:' || (select v from t where k = 'host')),
      'commission', sum(e.credit) filter (where e.account_code = 'revenue.stay_commission'),
      'vat', sum(e.credit) filter (where e.account_code = 'tax.vat_output'))
     from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key = 'stay_paid:99f00000-0000-4000-8000-0000000000c3'),
  '{"cash": 2000000, "host": 1700000, "commission": 258621, "vat": 41379}'::jsonb,
  'A paid KES 20,000 stay: KES 17,000 owed to the host, KES 2,586.21 commission, KES 413.79 VAT');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k = 'host_user'), 'role', 'authenticated')::text, true);

select is(
  (select sum(amount_cents)::bigint from public.host_statement_v
    where line_kind = 'stay' and host_id = (select v::uuid from t where k = 'host')),
  1700000::bigint,
  'The host sees their KES 17,000 on their statement, as a stay');

reset role;

do $$ begin perform public.fn_fin_build_party_owed(); end $$;

select is(
  (select jsonb_build_object('label', label, 'owed', owed_cents) from public.fin_party_owed
    where party_type = 'host' and party_id = (select v::uuid from t where k = 'host')),
  jsonb_build_object(
    'label', (select nullif(trim(display_name), '') from public.host
               where id = (select v::uuid from t where k = 'host')),
    'owed', 1700000 + coalesce((select sum(e.credit - e.debit) from ledger.entry e
                                 join ledger.account a on a.code = e.account_code
                                where a.base = 'payable.host_credit'
                                  and e.party_id = (select v::uuid from t where k = 'host')
                                  and not exists (select 1 from public.fin_settled_entry s
                                                   where s.entry_id = e.id)), 0)),
  'Finance''s owed list shows the host by name, with the stay''s share');

-- ═══════════════════════════════════════════ 4. staff cancel the paid stay

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_stay_cancel('99f00000-0000-4000-8000-0000000000d1', 'The guest cannot travel')$$,
  'Staff cancel the paid stay');

reset role;

select is(
  (select jsonb_build_object(
      'host', sum(e.credit - e.debit) filter (where e.account_code like 'stay.host_share:%'),
      'commission', sum(e.credit - e.debit) filter (where e.account_code = 'revenue.stay_commission'),
      'vat', sum(e.credit - e.debit) filter (where e.account_code = 'tax.vat_output'),
      'pending', sum(e.credit - e.debit) filter (where e.account_code = 'refunds_pending'))
     from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key in ('stay_paid:99f00000-0000-4000-8000-0000000000c3',
                                'stay_refund_due:99f00000-0000-4000-8000-0000000000c3')),
  '{"host": 0, "commission": 0, "vat": 0, "pending": 2000000}'::jsonb,
  'Cancelling takes back the host''s share, the commission and the VAT, and the guest is owed KES 20,000');

-- ════════════════════════════════════════════ 5. staff record the refund

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_stay_refund_record('99f00000-0000-4000-8000-0000000000d1', 'RFDLEDGER1', 'Reversed')$$,
  'Staff record the refund');

reset role;

select is(
  (select jsonb_build_object(
      'pending', sum(e.credit - e.debit) filter (where e.account_code = 'refunds_pending'),
      'cash', sum(e.debit - e.credit) filter (where e.account_code = 'cash.mpesa_paybill'))
     from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key in ('stay_paid:99f00000-0000-4000-8000-0000000000c3',
                                'stay_refund_due:99f00000-0000-4000-8000-0000000000c3',
                                'stay_refunded:99f00000-0000-4000-8000-0000000000c3')),
  '{"pending": 0, "cash": 0}'::jsonb,
  'The refund clears what was owed, out of the paybill it came into');

-- ═════════════════════════════════ 6. paid after its nights were taken

/* The guest's hold ran out and was released; another booking then took the
   nights. Their payment lands afterwards. */
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, check_in, check_out,
                         source, status, hold_expires_at, quote_total_kes)
select s.id::uuid, u.host_id, u.property_id, u.id, s.guest,
       timestamptz '2027-04-01 14:00+03', timestamptz '2027-04-03 10:00+03',
       s.source, s.status, s.hold_until, s.quote
from public.unit u
cross join (values
  ('99f00000-0000-4000-8000-0000000000d2', '[Late guest]', 'nexg', 'cancelled', now() - interval '1 hour', 10000::bigint),
  ('99f00000-0000-4000-8000-0000000000d3', '[Other guest]', 'entered', 'booked', null::timestamptz, null::bigint)
) as s (id, guest, source, status, hold_until, quote)
where u.id = (select v::uuid from t where k = 'unit');

insert into public.payment (id, reference, intent, stay_id, city_id, amount_cents, provider, channel,
                            state, created_via)
select '99f00000-0000-4000-8000-0000000000c4', 'PAY-LEDGER-S2', 'stay',
       '99f00000-0000-4000-8000-0000000000d2', u.city_id, 1000000, 'mpesa', 'mpesa', 'pending',
       'guest_checkout'
from public.unit u where u.id = (select v::uuid from t where k = 'unit');

update public.payment set state = 'paid', paid_at = now()
 where id = '99f00000-0000-4000-8000-0000000000c4';

select is(
  (select jsonb_build_object(
      'cash', sum(e.debit) filter (where e.account_code = 'cash.mpesa_paybill'),
      'pending', sum(e.credit) filter (where e.account_code = 'refunds_pending'),
      'host', coalesce(sum(e.credit) filter (where e.account_code like 'stay.host_share:%'), 0))
     from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key = 'stay_paid:99f00000-0000-4000-8000-0000000000c4'),
  '{"cash": 1000000, "pending": 1000000, "host": 0}'::jsonb,
  'A stay paid after its nights were taken is owed back to the guest, and nothing to the host');

-- ═══════════════════════════════════════════════ 7. rider floats stay off

insert into public.payment (id, reference, intent, amount_cents, provider, channel, state, created_via)
values ('99f00000-0000-4000-8000-0000000000c5', 'PAY-LEDGER-R1', 'rider_float', 250000, 'mpesa',
        'mpesa', 'pending', 'rider_app');

update public.payment set state = 'paid', paid_at = now()
 where id = '99f00000-0000-4000-8000-0000000000c5';

select is(
  (select count(*)::int from ledger.transaction
    where related ->> 'payment_id' = '99f00000-0000-4000-8000-0000000000c5'
       or idempotency_key like '%99f00000-0000-4000-8000-0000000000c5%'),
  0,
  'A rider-float payment posts nothing');

-- ════════════════════════════ 8. a failed posting never undoes the payment

/* Replaced for this transaction only, so the posting fails. */
create or replace function ledger.fn_post_featured_paid(p_payment_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$ begin raise exception 'the ledger is unavailable'; end $$;

insert into public.featured_booking (id, merchant_id, placement_kind, quoted_price, weeks, status)
values ('99f00000-0000-4000-8000-0000000000b3', (select v::uuid from t where k = 'merchant'),
        'homepage', 1500, 1, 'quoted');

insert into public.payment (id, reference, intent, booking_id, merchant_id, city_id, amount_cents,
                            provider, channel, state, created_via)
select '99f00000-0000-4000-8000-0000000000c6', 'PAY-LEDGER-F3', 'featured_slot',
       '99f00000-0000-4000-8000-0000000000b3', m.id, m.city_id, 150000, 'mpesa', 'mpesa', 'pending',
       'merchant_dashboard'
from public.merchant m where m.id = (select v::uuid from t where k = 'merchant');

select lives_ok(
  $$update public.payment set state = 'paid', paid_at = now()
     where id = '99f00000-0000-4000-8000-0000000000c6'$$,
  'A payment still settles when its posting fails');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'ledger.posting_failed'
      and target_id = '99f00000-0000-4000-8000-0000000000c6'),
  1,
  'and the failure is logged for Finance');

select * from finish();
rollback;
