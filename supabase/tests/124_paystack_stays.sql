-- Paystack for stays: a held stay is paid in full through Paystack; test keys
-- only at test properties; a test stay is booked but posts nothing to the
-- ledger, so no host is owed test money; M-Pesa only up to KES 150,000.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');

create function pg_temp.ps_sign(p_body text) returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'),
                convert_to('sk_test_ci_only_0123456789abcdef', 'UTF8'), 'sha512'), 'hex')
$$;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d1240000-0000-4000-8000-000000000001',
   'authenticated','authenticated','stayer124@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d1240000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other124@example.test',now(),false,now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d1241000-0000-4000-8000-00000000000a','multi_unit','[Host 124]','+254700012400',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d1242000-0000-4000-8000-00000000000a','d1241000-0000-4000-8000-00000000000a',
        'block-124','[Block 124]','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d1243000-0000-4000-8000-00000000000a','d1241000-0000-4000-8000-00000000000a',
        'd1242000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 3, 7000);

-- The guest quotes and holds two stays.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1240000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('t.quote1', public.rpc_native_stay_quote('d1242000-0000-4000-8000-00000000000a',
  'd1243000-0000-4000-8000-00000000000a', current_date + 30, current_date + 32, 1, 0) ->> 'quoteId', true);
select set_config('t.stay1', public.rpc_native_stay_hold(current_setting('t.quote1')::uuid, 'Amina') ->> 'stayId', true);
select set_config('t.quote2', public.rpc_native_stay_quote('d1242000-0000-4000-8000-00000000000a',
  'd1243000-0000-4000-8000-00000000000a', current_date + 40, current_date + 42, 1, 0) ->> 'quoteId', true);
select set_config('t.stay2', public.rpc_native_stay_hold(current_setting('t.quote2')::uuid, 'Amina') ->> 'stayId', true);

select set_config('t.ref1', public.rpc_payment_begin_stay(current_setting('t.stay1')::uuid) ->> 'reference', true);
select is(public.rpc_stay_payment_state(current_setting('t.stay1')::uuid) ->> 'status', 'unpaid',
  'a held stay with a payment begun is unpaid');
select throws_ok(
  format($$select public.rpc_payment_paystack_attempt(%L, 'card', null, 'sk_test_ci_only_0123456789abcdef')$$,
         current_setting('t.ref1')),
  '22023', null, 'test keys are refused for a real property');
reset role;

update public.property set accepts_test_payments = true where id = 'd1242000-0000-4000-8000-00000000000a';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1240000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref1'), 'mpesa', '+254712345678',
    'sk_test_ci_only_0123456789abcdef') ->> 'attempt_reference',
  current_setting('t.ref1') || '-1', 'a stay payment takes a Paystack try at a test property');
select public.rpc_payment_paystack_opened(current_setting('t.ref1') || '-1', null, null, null,
  'sk_test_ci_only_0123456789abcdef');
select set_config('t.ref2', public.rpc_payment_begin_stay(current_setting('t.stay2')::uuid) ->> 'reference', true);
reset role;

-- A big stay: above M-Pesa's limit, card only.
update public.payment set amount_cents = 20000000 where reference = current_setting('t.ref2');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1240000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_payment_paystack_attempt(%L, 'mpesa', '+254712345678', 'sk_test_ci_only_0123456789abcdef')$$,
         current_setting('t.ref2')),
  '22023', null, 'M-Pesa is refused above KES 150,000');
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref2'), 'card', null,
    'sk_test_ci_only_0123456789abcdef') ->> 'channel',
  'card', 'a card can pay it');
reset role;

-- Paystack's signed word books the stay.
select set_config('t.body', jsonb_build_object('event', 'charge.success',
  'data', jsonb_build_object('id', 9301, 'reference', current_setting('t.ref1') || '-1', 'status', 'success',
    'amount', (select amount_cents from public.payment where reference = current_setting('t.ref1')),
    'currency', 'KES', 'channel', 'mobile_money', 'fees', 2100))::text, true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_payment_paystack_webhook(current_setting('t.body'), pg_temp.ps_sign(current_setting('t.body'))) ->> 'state',
  'paid', 'Paystack''s signed success pays the stay');
reset role;

select is((select status::text from public.stay where id = current_setting('t.stay1')::uuid),
  'booked', 'the stay is booked');
select ok((select is_test from public.payment where reference = current_setting('t.ref1')),
  'the payment is marked as a test payment');
select is((select count(*)::int from ledger.transaction
            where idempotency_key like 'stay%'
              and (idempotency_key like '%' || (select id from public.payment where reference = current_setting('t.ref1'))::text || '%'
                   or idempotency_key like '%' || current_setting('t.stay1') || '%')),
  0, 'a test stay posts nothing to the ledger, so no host is owed test money');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1240000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_stay_payment_state(current_setting('t.stay1')::uuid) ->> 'status', 'paid',
  'the guest sees it paid');
select set_config('request.jwt.claims', '{"sub":"d1240000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.rpc_stay_payment_state(%L)$$, current_setting('t.stay1')),
  '42501', null, 'another customer cannot read the stay''s payment');
reset role;

select * from finish();
rollback;
