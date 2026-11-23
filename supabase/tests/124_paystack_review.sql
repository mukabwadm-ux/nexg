-- Apple review: a review account pays with test keys; a test-paid order never
-- offers a job to a real rider.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c1270000-0000-4000-8000-000000000021', 'authenticated',
        'authenticated', 'review@example.com', '', now(), now(), now());
insert into public.guest (id, phone, name, user_id)
values ('c1270000-0000-4000-8000-000000000001', '+254700012701', '[Reviewer]', 'c1270000-0000-4000-8000-000000000021');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1270000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select is(public.rpc_payment_i_review(), false, 'an account pays with live keys unless it is a review account');
reset role;

insert into public.payment_reviewer (user_id, note)
values ('c1270000-0000-4000-8000-000000000021', 'Apple App Review');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1270000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select is(public.rpc_payment_i_review(), true, 'a review account pays with test keys');
select throws_ok($$select count(*) from public.payment_reviewer$$, '42501', null,
  'the list of review accounts cannot be read by customers');
reset role;

-- A test-paid order at a review shop, marked ready: no rider search.
with shop as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m
    join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
   where m.city_id is not null order by m.id limit 1
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label, stage,
  payment_method, payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select 'c1279000-0000-4000-8000-000000000001', 'PS-REVIEW', 'c1270000-0000-4000-8000-000000000001',
       s.merchant_id, s.branch_id, s.city_id, 'web', '[Fixture address]', 'ready', 'card', 'pending',
       60000, 0, 0, 60000, 'KES'
  from shop s;
insert into public.payment (reference, intent, order_id, city_id, amount_cents, currency, created_via,
  provider, provider_ref, is_test, state, paid_at)
values ('NXP-PS-REVIEW', 'order', 'c1279000-0000-4000-8000-000000000001',
        (select city_id from public.order where id = 'c1279000-0000-4000-8000-000000000001'),
        60000, 'KES', 'guest_checkout', 'paystack', '9901', true, 'paid', now());
update public.order set payment_status = 'paid' where id = 'c1279000-0000-4000-8000-000000000001';

select is(dispatch.fn_job_start('c1279000-0000-4000-8000-000000000001') ->> 'test', 'true',
  'a test-paid order answers "test order"');
select is((select count(*)::int from dispatch.job where order_id = 'c1279000-0000-4000-8000-000000000001'), 0,
  'and no rider is offered it');

select * from finish();
rollback;
