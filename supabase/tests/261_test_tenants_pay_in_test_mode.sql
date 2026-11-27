-- Test tenants pay in Paystack test mode (20270339000100): the website is told
-- when the caller's own payment is at a test tenant, and no live try is
-- recorded there; a real shop is as before.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated;

create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
create function pg_temp.k(p_key text) returns text language sql as $$
  select v from t where k = p_key
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd2610000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'guest261a@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2610000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', 'guest261b@example.test', '', now(), false, now(), now());
insert into public.guest (id, phone, name, user_id)
values ('d2617000-0000-4000-8000-000000000001', '+254700026101', '[Guest 261]',
        'd2610000-0000-4000-8000-000000000001');

/* Two orders at two shops: the first shop becomes a test tenant. */
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select ('d2617000-0000-4000-8000-00000000001' || x.n)::uuid, 'PS261-' || x.n,
       'd2617000-0000-4000-8000-000000000001', x.merchant_id, x.branch_id, x.city_id, 'web',
       '[Fixture address]', 'confirmed', 'mpesa_stk', 'pending', 150000, 0, 0, 150000, 'KES'
  from (
    select row_number() over (order by m.id) as n, m.id as merchant_id, b.id as branch_id, m.city_id
      from public.merchant m
      join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
     where m.city_id is not null
     order by m.id limit 2) x;
update public.merchant set accepts_test_payments = (id = (select merchant_id from public.order where reference = 'PS261-1'))
 where id in (select merchant_id from public.order where reference in ('PS261-1', 'PS261-2'));

set local role authenticated;
select pg_temp.as_user('d2610000-0000-4000-8000-000000000001');
insert into t select 'test', public.rpc_payment_begin_order('d2617000-0000-4000-8000-000000000011') ->> 'reference';
insert into t select 'real', public.rpc_payment_begin_order('d2617000-0000-4000-8000-000000000012') ->> 'reference';

select is(public.rpc_payment_at_test_tenant(pg_temp.k('test')), true,
  'A payment at a test tenant is said to be one.');
select is(public.rpc_payment_at_test_tenant(pg_temp.k('real')), false, 'A real shop''s is not.');
select throws_ok(
  format($$select public.rpc_payment_paystack_attempt(%L, 'card', null, 'sk_live_ci_only_0123456789abcdef')$$,
         pg_temp.k('test')),
  '22023', 'This place takes test payments only. Nothing was charged.',
  'No live try is recorded at a test tenant.');
select is(
  public.rpc_payment_paystack_attempt(pg_temp.k('test'), 'card', null, 'sk_test_ci_only_0123456789abcdef') ->> 'is_test',
  'true', 'A test try is.');
select is(
  public.rpc_payment_paystack_attempt(pg_temp.k('real'), 'card', null, 'sk_live_ci_only_0123456789abcdef') ->> 'is_test',
  'false', 'A real shop takes a live try, as before.');

select pg_temp.as_user('d2610000-0000-4000-8000-000000000002');
select is(public.rpc_payment_at_test_tenant(pg_temp.k('test')), false, 'Nobody else is told.');

reset role;
select ok(
  not has_function_privilege('anon', 'public.rpc_payment_at_test_tenant(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_payment_at_test_tenant(uuid)', 'EXECUTE'),
  'The public key reaches none of it, and no account reads the helper.');
select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
