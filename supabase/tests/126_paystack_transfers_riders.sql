-- Paystack transfers for riders' early payouts: only Finance sends one, once;
-- test money only to a test rider; only Paystack's signed transfer.success
-- marks it paid; a failure gives the money back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create function pg_temp.ps_sign(p_body text, p_key text default 'sk_test_ci_only_0123456789abcdef') returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_key, 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.transfer_event(p_event text, p_reference text, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', p_event,
    'data', jsonb_build_object('reference', p_reference, 'amount', p_amount, 'currency', 'KES',
      'transfer_code', 'TRF_ci126', 'status', split_part(p_event, '.', 2)))::text
$$;
create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1260000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'testrider126@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1260000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'rider126@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1260000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'finance126@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1260000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'approver126@test.local', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c1260000-0000-4000-8000-0000000000b1', 'c1260000-0000-4000-8000-000000000006', 'finance126@test.local', 'Finance 126'),
  ('c1260000-0000-4000-8000-0000000000b2', 'c1260000-0000-4000-8000-000000000007', 'approver126@test.local', 'Approver 126');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c1260000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c1260000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'finance';

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at, payout_msisdn, accepts_test_payouts)
values
  ('c1260000-0000-4000-8000-000000000031', 'c1260000-0000-4000-8000-000000000003',
   '[Test]', '[Rider 126]', '+254700012601', (select id from public.city where slug = 'nairobi'),
   'motorbike', '[PLATE126A]', 'active', 'offline', now(), '+254700012601', true),
  ('c1260000-0000-4000-8000-000000000032', 'c1260000-0000-4000-8000-000000000004',
   '[Real]', '[Rider 126]', '+254700012602', (select id from public.city where slug = 'nairobi'),
   'motorbike', '[PLATE126B]', 'active', 'offline', now(), '+254700012602', false);

insert into public.rider_earning (rider_id, order_reference, base_kes, total_kes, earned_at)
values ('c1260000-0000-4000-8000-000000000031', '[XFER-126-1]', 900, 900, now()),
       ('c1260000-0000-4000-8000-000000000032', '[XFER-126-2]', 900, 900, now());

-- Each rider asks for 500; Finance approves both.
set local role authenticated;
select pg_temp.as_user('c1260000-0000-4000-8000-000000000003');
select public.rpc_rider_payout_request(500);
select pg_temp.as_user('c1260000-0000-4000-8000-000000000004');
select public.rpc_rider_payout_request(500);
select pg_temp.as_user('c1260000-0000-4000-8000-000000000006');
select public.rpc_finance_rider_payout_decide(id, 'approve')
  from public.rider_payout_request_queue_v where amount_kes = 500 and status = 'pending'
   and rider_id in ('c1260000-0000-4000-8000-000000000031', 'c1260000-0000-4000-8000-000000000032');
reset role;

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated;
grant select on t to anon;
insert into t select 'test_request', id::text from public.rider_payout_request
 where rider_id = 'c1260000-0000-4000-8000-000000000031';
insert into t select 'real_request', id::text from public.rider_payout_request
 where rider_id = 'c1260000-0000-4000-8000-000000000032';

-- ── test mode

set local role authenticated;
select pg_temp.as_user('c1260000-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.rpc_paystack_transfer_open('rider_early', (select v::uuid from t where k = 'test_request'),
      'sk_test_ci_only_0123456789abcdef')$$,
  '42501', null, 'A rider cannot send a payout.');

select pg_temp.as_user('c1260000-0000-4000-8000-000000000006');
select throws_ok(
  $$select public.rpc_paystack_transfer_open('rider_early', (select v::uuid from t where k = 'real_request'),
      'sk_test_ci_only_0123456789abcdef')$$,
  '22023', null, 'Test mode never "pays" a real rider.');

insert into t select 'ref', public.rpc_paystack_transfer_open('rider_early',
  (select v::uuid from t where k = 'test_request'), 'sk_test_ci_only_0123456789abcdef') ->> 'reference';
select ok((select v from t where k = 'ref') like 'NXT-%', 'Finance opens a payout to the test rider under NexG''s own reference.');
select is(public.rpc_paystack_transfer_open('rider_early', (select v::uuid from t where k = 'test_request'),
            'sk_test_ci_only_0123456789abcdef') ->> 'reference',
  (select v from t where k = 'ref'), 'Pressing again answers the same payout, so nothing is paid twice.');

select is(public.rpc_paystack_transfer_answered((select v from t where k = 'ref'), 'recipient',
            '{"status": true, "data": {"recipient_code": "RCP_ci126abc"}}', 'sk_test_ci_only_0123456789abcdef')
            ->> 'recipient_code',
  'RCP_ci126abc', 'Paystack''s recipient for the M-Pesa number is kept for next time.');
select is(public.rpc_paystack_transfer_answered((select v from t where k = 'ref'), 'transfer',
            format('{"status": true, "data": {"status": "pending", "transfer_code": "TRF_ci126", "reference": %s}}',
                   to_json((select v from t where k = 'ref'))),
            'sk_test_ci_only_0123456789abcdef') ->> 'state',
  'pending', 'Paystack''s first answer is recorded, not as paid.');
reset role;

select is((select status from public.rider_payout_request where id = (select v::uuid from t where k = 'test_request')),
  'approved', 'A pending payout is not marked paid.');

-- Paystack's signed word.
insert into t select 'body', pg_temp.transfer_event('transfer.success', (select v from t where k = 'ref'), 50000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_payment_paystack_webhook((select v from t where k = 'body'),
            pg_temp.ps_sign((select v from t where k = 'body'), 'sk_live_ci_only_0123456789abcdef')) ->> 'reason',
  'mode_mismatch', 'A live-signed message cannot settle a test payout.');
select is(public.rpc_payment_paystack_webhook((select v from t where k = 'body'),
            pg_temp.ps_sign((select v from t where k = 'body'))) ->> 'state',
  'success', 'Paystack''s signed transfer.success pays it.');
select is(public.rpc_payment_paystack_webhook((select v from t where k = 'body'),
            pg_temp.ps_sign((select v from t where k = 'body'))) ->> 'duplicate',
  'true', 'The same message again changes nothing.');
reset role;

select is((select status || ' · ' || provider_ref from public.rider_payout_request
            where id = (select v::uuid from t where k = 'test_request')),
  'paid · TRF_ci126', 'The request is paid, with Paystack''s transfer code.');
select is((select count(*)::int from ledger.transaction where idempotency_key like 'payout_%'),
  0, 'Test money posts nothing to the ledger.');

-- ── live mode, and a failure

set local role authenticated;
select pg_temp.as_user('c1260000-0000-4000-8000-000000000006');
insert into t select 'live_ref', public.rpc_paystack_transfer_open('rider_early',
  (select v::uuid from t where k = 'real_request'), 'sk_live_ci_only_0123456789abcdef') ->> 'reference';
reset role;
insert into t select 'fail', pg_temp.transfer_event('transfer.failed', (select v from t where k = 'live_ref'), 50000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'fail'),
  pg_temp.ps_sign((select v from t where k = 'fail'), 'sk_live_ci_only_0123456789abcdef'));
reset role;

select is((select array_agg(kind order by kind) from ledger.transaction
            where idempotency_key in ('payout_sent:' || (select v from t where k = 'live_ref'),
                                      'payout_returned:' || (select v from t where k = 'live_ref'))),
  array['payout_returned', 'payout_sent'],
  'Live money leaves the rider''s balance when sent and comes back when Paystack fails it.');
select is((select status from public.rider_payout_request where id = (select v::uuid from t where k = 'real_request')),
  'approved', 'and the request is back with Finance to try again.');

select * from finish();
rollback;
