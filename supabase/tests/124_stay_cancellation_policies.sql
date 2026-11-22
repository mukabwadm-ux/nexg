-- Stay cancellation policies: a host's policy, checked and copied onto each
-- stay when it is made; when NexG cancels a paid stay the policy decides the
-- refund, the fee stays with the host, and the ledger takes back only the
-- refund. Staff can still refund in full.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d1250000-0000-4000-8000-000000000001',
   'authenticated','authenticated','guest125@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d1250000-0000-4000-8000-0000000000aa',
   'authenticated','authenticated','partners125@nexgapp.com',now(),false,now(),now());
insert into public.staff_user (id, user_id, email, display_name)
values ('d12500aa-0000-4000-8000-00000000000a','d1250000-0000-4000-8000-0000000000aa',
        'partners125@nexgapp.com','Partnerships 125');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key = 'partnerships'),
       (select id from public.city where slug = 'nairobi'), s.id
from public.staff_user s where s.email = 'partners125@nexgapp.com';

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d1251000-0000-4000-8000-00000000000a','multi_unit','[Host 125]','+254700012500',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, cancellation_policy)
values ('d1252000-0000-4000-8000-00000000000a','d1251000-0000-4000-8000-00000000000a',
        'block-125','[Block 125]','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now(),
        public.fn_cancellation_policy('{"preset":"strict"}'));
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d1253000-0000-4000-8000-00000000000a','d1251000-0000-4000-8000-00000000000a',
        'd1252000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 5000);

create function pg_temp.settle(p_reference text) returns jsonb
language sql as $$
  select public.rpc_payment_webhook(
    p_event => 'test.settled', p_reference => p_reference,
    p_dedupe_key => 'test:' || p_reference, p_signature_ok => true,
    p_payload => '{}'::jsonb, p_paid => true, p_provider_ref => 'TEST-' || p_reference,
    p_amount_cents => (select amount_cents from public.payment where reference = p_reference),
    p_channel => 'card')
$$;

-- ── the policy itself

select is(public.fn_cancellation_policy('{"preset":"moderate"}') #>> '{tiers,1,refund_pct}', '50',
  'moderate: half back from 1 day before');
select throws_ok(
  $$select public.fn_cancellation_policy('{"preset":"custom","tiers":[{"days_before":7,"refund_pct":50},{"days_before":1,"refund_pct":100}]}')$$,
  '22023', null, 'a policy never gives more back for cancelling later');
select throws_ok($$select public.fn_cancellation_policy('{"preset":"generous"}')$$, '22023', null,
  'only the presets or the host''s own steps');
select is(public.fn_stay_refund_pct(public.fn_cancellation_policy('{"preset":"moderate"}'), now() + interval '10 days', now()),
  100, 'moderate, ten days before: everything back');
select is(public.fn_stay_refund_pct(public.fn_cancellation_policy('{"preset":"moderate"}'), now() + interval '3 days', now()),
  50, 'moderate, three days before: half back');
select is(public.fn_stay_refund_pct(public.fn_cancellation_policy('{"preset":"moderate"}'), now(), now()),
  0, 'moderate, on the day: nothing back');
select is(public.fn_cancellation_policy_text(public.fn_cancellation_policy('{"preset":"moderate"}')),
  'a full refund if you cancel 5 or more days before check-in; 50% back if you cancel 1 or more days before check-in; no refund after that.',
  'the policy in plain words');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_stay_cancellation_policy('d1253000-0000-4000-8000-00000000000a') #>> '{policy,preset}',
  'strict', 'a guest can read the policy before paying');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1250000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_host_set_cancellation_policy('d1252000-0000-4000-8000-00000000000a', null, '{"preset":"flexible"}')$$,
  '42501', null, 'only the host''s people set the policy');

-- ── a stay ten days out, held under the strict policy, then paid
select set_config('t.stay', public.rpc_stay_hold('d1253000-0000-4000-8000-00000000000a',
  current_date + 10, current_date + 12, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id', true);
select set_config('t.pay', public.rpc_payment_begin_stay(current_setting('t.stay')::uuid) ->> 'reference', true);
select set_config('t.stay2', public.rpc_stay_hold('d1253000-0000-4000-8000-00000000000a',
  current_date + 20, current_date + 22, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id', true);
select set_config('t.pay2', public.rpc_payment_begin_stay(current_setting('t.stay2')::uuid) ->> 'reference', true);
reset role;

select is((select cancellation_policy ->> 'preset' from public.stay where id = current_setting('t.stay')::uuid),
  'strict', 'the policy in force is copied onto the stay');
select pg_temp.settle(current_setting('t.pay'));
select pg_temp.settle(current_setting('t.pay2'));
select is((select status::text from public.stay where id = current_setting('t.stay')::uuid), 'booked',
  'the stay is paid and booked');

-- The host changes the policy later; the stay keeps the one it was made under.
update public.property set cancellation_policy = public.fn_cancellation_policy('{"preset":"flexible"}')
 where id = 'd1252000-0000-4000-8000-00000000000a';
select is((select cancellation_policy ->> 'preset' from public.stay where id = current_setting('t.stay')::uuid),
  'strict', 'a later change does not touch a stay already made');

-- ── NexG cancels: strict, ten days before, half back
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1250000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select public.rpc_stay_cancel(current_setting('t.stay')::uuid, 'The guest cannot travel');
select public.rpc_stay_cancel(current_setting('t.stay2')::uuid, 'The host double-booked it', true);
select is((select refund_kes || ' ' || cancellation_fee_kes from public.rpc_stay_refunds('due')
            where stay_id = current_setting('t.stay')::uuid),
  (select (paid_kes / 2) || ' ' || (paid_kes - paid_kes / 2) from public.stay where id = current_setting('t.stay')::uuid),
  'the refund queue shows half to send back and the fee the policy keeps');
reset role;

select ok((select refund_amount_kes = paid_kes / 2 and refund_due_at is not null
             from public.stay where id = current_setting('t.stay')::uuid),
  'the refund is the policy''s share of what was paid');
select is((select sum(e.credit)::bigint from ledger.entry e
             join ledger.transaction x on x.id = e.transaction_id
            where x.idempotency_key = 'stay_refund_due:' || (select id from public.payment where reference = current_setting('t.pay'))::text
              and e.account_code = 'refunds_pending'),
  (select ledger.from_kes(refund_amount_kes) from public.stay where id = current_setting('t.stay')::uuid),
  'the ledger takes back only the refund, so the host keeps their share of the fee');
select is((select sum(e.debit)::bigint from ledger.entry e
             join ledger.transaction x on x.id = e.transaction_id
            where x.idempotency_key = 'stay_refund_due:' || (select id from public.payment where reference = current_setting('t.pay'))::text),
  (select ledger.from_kes(refund_amount_kes) from public.stay where id = current_setting('t.stay')::uuid),
  'and the posting balances');
select ok((select refund_amount_kes = paid_kes and cancellation_fee_kes = 0
             from public.stay where id = current_setting('t.stay2')::uuid),
  'staff can still refund in full, for example when the host caused it');

select * from finish();
rollback;
