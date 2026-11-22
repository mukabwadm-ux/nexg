-- Saved cards: kept only when the customer asked and Paystack says the card is
-- reusable; never for a guest; never shown with its authorization; charged
-- only by its owner, in its own mode.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create function pg_temp.ps_sign(p_body text) returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'),
                convert_to('sk_test_ci_only_0123456789abcdef', 'UTF8'), 'sha512'), 'hex')
$$;

-- A paid card charge as Paystack reports it, with a reusable authorization.
create function pg_temp.ps_paid(p_reference text, p_id bigint, p_amount bigint, p_reusable boolean default true)
returns text
language sql as $$
  select jsonb_build_object('event', 'charge.success',
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', 'success',
      'amount', p_amount, 'currency', 'KES', 'channel', 'card', 'fees', 4350,
      'customer', jsonb_build_object('email', 'card.owner@example.com'),
      'authorization', jsonb_build_object('authorization_code', 'AUTH_ci0123456', 'signature', 'SIG_ci_4081',
        'last4', '4081', 'exp_month', '12', 'exp_year', '2030', 'card_type', 'visa ', 'brand', 'visa',
        'bank', 'TEST BANK', 'channel', 'card', 'reusable', p_reusable)))::text
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, is_anonymous)
values ('00000000-0000-0000-0000-000000000000', 'c1240000-0000-4000-8000-000000000021', 'authenticated',
        'authenticated', 'card.owner@example.com', '', now(), now(), now(), false),
       ('00000000-0000-0000-0000-000000000000', 'c1240000-0000-4000-8000-000000000022', 'authenticated',
        'authenticated', null, '', null, now(), now(), true),
       ('00000000-0000-0000-0000-000000000000', 'c1240000-0000-4000-8000-000000000023', 'authenticated',
        'authenticated', 'someone.else@example.com', '', now(), now(), now(), false);
insert into public.guest (id, phone, name, user_id) values
  ('c1240000-0000-4000-8000-000000000001', '+254700012401', '[Card owner]', 'c1240000-0000-4000-8000-000000000021'),
  ('c1240000-0000-4000-8000-000000000002', '+254700012402', '[Guest]', 'c1240000-0000-4000-8000-000000000022'),
  ('c1240000-0000-4000-8000-000000000003', '+254700012403', '[Someone else]', 'c1240000-0000-4000-8000-000000000023');

with shop as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m
    join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
   where m.city_id is not null order by m.id limit 1
), orders(id, reference, guest) as (
  values ('c1240000-0000-4000-8000-000000000011'::uuid, 'PSC-FIRST', 'c1240000-0000-4000-8000-000000000001'::uuid),
         ('c1240000-0000-4000-8000-000000000012'::uuid, 'PSC-AGAIN', 'c1240000-0000-4000-8000-000000000001'::uuid),
         ('c1240000-0000-4000-8000-000000000013'::uuid, 'PSC-GUEST', 'c1240000-0000-4000-8000-000000000002'::uuid),
         ('c1240000-0000-4000-8000-000000000014'::uuid, 'PSC-OTHER', 'c1240000-0000-4000-8000-000000000003'::uuid)
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select o.id, o.reference, o.guest, s.merchant_id, s.branch_id, s.city_id, 'web', '[Fixture address]',
  'confirmed', 'mpesa_stk', 'pending', 120000, 0, 0, 120000, 'KES'
from orders o cross join shop s;
update public.merchant set accepts_test_payments = true
 where id = (select merchant_id from public.order where reference = 'PSC-FIRST');

-- The account holder pays by card and asks to save it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1240000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select set_config('t.ref1', public.rpc_payment_begin_order('c1240000-0000-4000-8000-000000000011') ->> 'reference', true);
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref1'), 'card', null,
    'sk_test_ci_only_0123456789abcdef', true) ->> 'save_card',
  'true', 'an account holder can ask to save the card');
select public.rpc_payment_paystack_opened(current_setting('t.ref1') || '-1', 'acc', 'https://checkout.paystack.com/c1',
  null, 'sk_test_ci_only_0123456789abcdef');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('t.paid1', pg_temp.ps_paid(current_setting('t.ref1') || '-1', 7001, 120000), true);
select is(public.rpc_payment_paystack_webhook(current_setting('t.paid1'), pg_temp.ps_sign(current_setting('t.paid1'))) ->> 'state',
  'paid', 'the card payment settles');
select throws_ok($$select count(*) from public.customer_card$$, '42501', null,
  'saved cards cannot be read with the public key');
reset role;

select is((select count(*)::int from public.customer_card where user_id = 'c1240000-0000-4000-8000-000000000021'),
  1, 'the reusable card is kept');
select is((select brand || ' ' || last4 || ' ' || exp_month || '/' || exp_year from public.customer_card
            where user_id = 'c1240000-0000-4000-8000-000000000021'),
  'visa 4081 12/2030', 'as brand, last four and expiry');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1240000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select set_config('t.card', public.rpc_my_cards() -> 0 ->> 'id', true);
select ok(public.rpc_my_cards() -> 0 ->> 'last4' = '4081'
          and not (public.rpc_my_cards() -> 0 ? 'authorization_code')
          and public.rpc_my_cards()::text !~ 'AUTH_ci0123456',
  'the customer sees the card, never its authorization');

-- Paying again with the saved card.
select set_config('t.ref2', public.rpc_payment_begin_order('c1240000-0000-4000-8000-000000000012') ->> 'reference', true);
select throws_ok(
  format($$select public.rpc_payment_paystack_attempt(%L, 'saved_card', null, 'sk_live_ci_only_0123456789abcdef', false, %L)$$,
         current_setting('t.ref2'), current_setting('t.card')),
  '22023', null, 'a card saved in test mode is not charged with live keys');
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref2'), 'saved_card', null,
    'sk_test_ci_only_0123456789abcdef', false, current_setting('t.card')::uuid) ->> 'authorization_code',
  'AUTH_ci0123456', 'the server gets the authorization to charge');
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref2'), 'saved_card', null,
    'sk_test_ci_only_0123456789abcdef', false, current_setting('t.card')::uuid) ->> 'reused',
  'true', 'a second tap within a minute charges nothing more');
select public.rpc_payment_paystack_opened(current_setting('t.ref2') || '-1', null, null, null,
  'sk_test_ci_only_0123456789abcdef');
select is(
  public.rpc_payment_paystack_verified(current_setting('t.ref2') || '-1',
    jsonb_build_object('status', true,
      'data', pg_temp.ps_paid(current_setting('t.ref2') || '-1', 7002, 120000)::jsonb -> 'data')::text,
    'sk_test_ci_only_0123456789abcdef') ->> 'state',
  'paid', 'the saved card pays the order');
reset role;

select is((select count(*)::int from public.customer_card where user_id = 'c1240000-0000-4000-8000-000000000021'),
  1, 'the same card is not saved twice');
select ok((select last_used_at is not null from public.customer_card where id = current_setting('t.card')::uuid),
  'its last use is noted');

-- Someone else cannot use it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1240000-0000-4000-8000-000000000023","role":"authenticated"}', true);
select set_config('t.ref4', public.rpc_payment_begin_order('c1240000-0000-4000-8000-000000000014') ->> 'reference', true);
select throws_ok(
  format($$select public.rpc_payment_paystack_attempt(%L, 'saved_card', null, 'sk_test_ci_only_0123456789abcdef', false, %L)$$,
         current_setting('t.ref4'), current_setting('t.card')),
  '22023', null, 'another customer cannot pay with someone''s saved card');

-- A guest cannot save one.
select set_config('request.jwt.claims', '{"sub":"c1240000-0000-4000-8000-000000000022","role":"authenticated"}', true);
select set_config('t.ref3', public.rpc_payment_begin_order('c1240000-0000-4000-8000-000000000013') ->> 'reference', true);
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref3'), 'card', null,
    'sk_test_ci_only_0123456789abcdef', true) ->> 'save_card',
  'false', 'a guest''s card is never saved');

-- Removing it.
select set_config('request.jwt.claims', '{"sub":"c1240000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select is(
  public.rpc_my_card_remove(current_setting('t.card')::uuid, 'sk_test_ci_only_0123456789abcdef') ->> 'authorization_code',
  'AUTH_ci0123456', 'removing hands the authorization back once, to switch it off at Paystack');
select is(public.rpc_my_cards(), '[]'::jsonb, 'the removed card is gone from the list');
reset role;

select is((select authorization_code from public.customer_card where id = current_setting('t.card')::uuid),
  'removed_' || replace(current_setting('t.card'), '-', ''), 'and keeps no usable authorization');

select * from finish();
rollback;
