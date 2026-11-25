-- Refunds through Paystack: only staff open one, only for money that came in
-- through Paystack, once; only Paystack's signed refund.processed issues it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create function pg_temp.ps_sign(p_body text, p_key text default 'sk_test_ci_only_0123456789abcdef') returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_key, 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.refund_event(p_event text, p_reference text, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', p_event,
    'data', jsonb_build_object('id', 7701, 'refund_reference', p_reference, 'amount', p_amount,
      'currency', 'KES', 'status', split_part(p_event, '.', 2)))::text
$$;
create function pg_temp.settle(p_reference text) returns jsonb
language sql as $$
  select public.rpc_payment_webhook(
    p_event => 'test.settled', p_reference => p_reference,
    p_dedupe_key => 'test:' || p_reference, p_signature_ok => true,
    p_payload => '{}'::jsonb, p_paid => true, p_provider_ref => '4400' || length(p_reference),
    p_amount_cents => (select amount_cents from public.payment where reference = p_reference),
    p_channel => 'card')
$$;

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d1260000-0000-4000-8000-000000000001',
   'authenticated','authenticated','guest126@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d1260000-0000-4000-8000-0000000000aa',
   'authenticated','authenticated','partners126@nexgapp.com',now(),false,now(),now());
insert into public.staff_user (id, user_id, email, display_name)
values ('d12600aa-0000-4000-8000-00000000000a','d1260000-0000-4000-8000-0000000000aa',
        'partners126@nexgapp.com','Partnerships 126');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key = 'partnerships'),
       (select id from public.city where slug = 'nairobi'), s.id
from public.staff_user s where s.email = 'partners126@nexgapp.com';

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d1261000-0000-4000-8000-00000000000a','multi_unit','[Host 126]','+254700012600',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d1262000-0000-4000-8000-00000000000a','d1261000-0000-4000-8000-00000000000a',
        'block-126','[Block 126]','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d1263000-0000-4000-8000-00000000000a','d1261000-0000-4000-8000-00000000000a',
        'd1262000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 5000);

-- A stay paid through Paystack (test mode), then cancelled by NexG: a full refund is due.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1260000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('t.stay', public.rpc_stay_hold('d1263000-0000-4000-8000-00000000000a',
  current_date + 30, current_date + 32, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id', true);
select set_config('t.pay', public.rpc_payment_begin_stay(current_setting('t.stay')::uuid) ->> 'reference', true);
select throws_ok(
  format($$select public.rpc_paystack_refund_open('stay', %L, 'sk_test_ci_only_0123456789abcdef')$$, current_setting('t.stay')),
  '42501', null, 'a customer cannot open a refund');
reset role;
update public.payment set provider = 'paystack', is_test = true where reference = current_setting('t.pay');
select pg_temp.settle(current_setting('t.pay'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1260000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select public.rpc_stay_cancel(current_setting('t.stay')::uuid, 'The guest cannot travel');
select throws_ok(
  format($$select public.rpc_paystack_refund_open('stay', %L, 'not-a-key')$$, current_setting('t.stay')),
  '42501', null, 'opening a refund needs the console''s Paystack key');
select throws_ok(
  format($$select public.rpc_paystack_refund_open('stay', %L, 'sk_live_ci_only_0123456789abcdef')$$, current_setting('t.stay')),
  '22023', null, 'a test payment is refunded with test keys only');
select set_config('t.ref', public.rpc_paystack_refund_open('stay', current_setting('t.stay')::uuid,
  'sk_test_ci_only_0123456789abcdef') ->> 'reference', true);
select is((public.rpc_paystack_refund_open('stay', current_setting('t.stay')::uuid,
  'sk_test_ci_only_0123456789abcdef') ->> 'reference'), current_setting('t.ref'),
  'a second press answers the same refund, so nothing is refunded twice');
select ok(current_setting('t.ref') like 'NXR-%', 'under NexG''s own reference');
select is(public.rpc_paystack_refund_answered(current_setting('t.ref'),
    jsonb_build_object('status', true, 'data', jsonb_build_object('id', 7701, 'status', 'pending'))::text,
    'sk_test_ci_only_0123456789abcdef') ->> 'state',
  'pending', 'Paystack''s first answer is recorded');
reset role;

select is((select refunded_at from public.stay where id = current_setting('t.stay')::uuid), null,
  'a pending refund is not marked refunded');

-- Paystack's signed word.
select set_config('t.body', pg_temp.refund_event('refund.processed', current_setting('t.ref'),
  (select amount_cents from public.paystack_refund where reference = current_setting('t.ref'))), true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_payment_paystack_webhook(current_setting('t.body'),
            pg_temp.ps_sign(current_setting('t.body'), 'sk_live_ci_only_0123456789abcdef')) ->> 'reason',
  'mode_mismatch', 'a live-signed message cannot settle a test refund');
select is(public.rpc_payment_paystack_webhook(current_setting('t.body'), pg_temp.ps_sign(current_setting('t.body'))) ->> 'state',
  'processed', 'Paystack''s signed refund.processed issues the refund');
select is(public.rpc_payment_paystack_webhook(current_setting('t.body'), pg_temp.ps_sign(current_setting('t.body'))) ->> 'duplicate',
  'true', 'the same message again changes nothing');
reset role;

select ok((select refunded_at is not null and refund_reference = current_setting('t.ref')
             from public.stay where id = current_setting('t.stay')::uuid),
  'the stay is recorded as refunded, with the reference');
select is((select state::text from public.payment where reference = current_setting('t.pay')), 'reversed',
  'and its payment as reversed');

-- An order refund, approved earlier and sent to Paystack; one that fails.
insert into public.guest (id, phone, name, user_id)
values ('d1264000-0000-4000-8000-000000000001', '+254700012601', '[Guest 126]', 'd1260000-0000-4000-8000-000000000001');
with shop as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m
    join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
   where m.city_id is not null order by m.id limit 1
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label, stage,
  payment_method, payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select 'd1269000-0000-4000-8000-000000000001', 'PSR-ORDER', 'd1264000-0000-4000-8000-000000000001', s.merchant_id, s.branch_id, s.city_id, 'web',
       '[Fixture address]', 'confirmed', 'card', 'pending', 80000, 0, 0, 80000, 'KES'
  from shop s;
insert into public.payment (reference, intent, order_id, city_id, amount_cents, currency, created_via, provider, is_test)
values ('NXP-PSR-ORDER', 'order', 'd1269000-0000-4000-8000-000000000001',
        (select city_id from public.order where id = 'd1269000-0000-4000-8000-000000000001'),
        80000, 'KES', 'guest_checkout', 'paystack', true);
select pg_temp.settle('NXP-PSR-ORDER');
insert into public.refund (id, order_id, amount_cents, method, reason_code, reason_text, status)
values ('d1269000-0000-4000-8000-0000000000f1', 'd1269000-0000-4000-8000-000000000001', 30000, 'original',
        'missing_item', 'One item was missing', 'approved'),
       ('d1269000-0000-4000-8000-0000000000f2', 'd1269000-0000-4000-8000-000000000001', 10000, 'original',
        'goodwill', 'Late delivery', 'approved');
insert into public.paystack_refund (kind, refund_id, payment_id, reference, amount_cents, is_test, paystack_refund_id, state)
select 'order', r.id, p.id, 'NXR-' || replace(r.id::text, '-', ''), r.amount_cents, true, '78' || right(r.id::text, 2), 'pending'
  from public.refund r, public.payment p
 where r.order_id = 'd1269000-0000-4000-8000-000000000001' and p.reference = 'NXP-PSR-ORDER';

select set_config('t.done', pg_temp.refund_event('refund.processed',
  'NXR-' || replace('d1269000-0000-4000-8000-0000000000f1', '-', ''), 30000), true);
select set_config('t.failed', pg_temp.refund_event('refund.failed',
  'NXR-' || replace('d1269000-0000-4000-8000-0000000000f2', '-', ''), 10000), true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook(current_setting('t.done'), pg_temp.ps_sign(current_setting('t.done')));
select public.rpc_payment_paystack_webhook(current_setting('t.failed'), pg_temp.ps_sign(current_setting('t.failed')));
reset role;

select is((select status from public.refund where id = 'd1269000-0000-4000-8000-0000000000f1'), 'issued',
  'an order refund processed by Paystack is issued');
select ok((select r.status = 'approved' and x.state = 'failed'
             from public.refund r join public.paystack_refund x on x.refund_id = r.id
            where r.id = 'd1269000-0000-4000-8000-0000000000f2')
          and exists (select 1 from audit.audit_event where action = 'payment.paystack_refund_failed'),
  'a failed one stays approved for Finance, who are told');

select * from finish();
rollback;
