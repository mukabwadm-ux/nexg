-- A customer deletes their own account from the app: what stops it, what goes,
-- what stays, and that nobody else is touched.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  -- an account, a guest, an account with an order on its way, a rider, a bystander
  ('00000000-0000-0000-0000-000000000000', 'c1110000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'amina111@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1110000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1110000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'busy111@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1110000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'rider111@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1110000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'other111@example.test', now(), false, now(), now());

insert into public.guest (id, user_id, phone, name) values
  ('c1110000-0000-4000-8000-000000000011', 'c1110000-0000-4000-8000-000000000001', '+254700011101', '[Amina]'),
  ('c1110000-0000-4000-8000-000000000012', 'c1110000-0000-4000-8000-000000000002', '+254700011102', '[Guest]'),
  ('c1110000-0000-4000-8000-000000000013', 'c1110000-0000-4000-8000-000000000003', '+254700011103', '[Busy]'),
  ('c1110000-0000-4000-8000-000000000015', 'c1110000-0000-4000-8000-000000000005', '+254700011105', '[Other]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, went_live_at)
values ('c1110000-0000-4000-8000-00000000000a', '[Legal 111] Ltd', '[Shop 111]', 'restaurant',
        '[Contact]', '+254700011100', 'shop111@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', now() - interval '30 days');

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no, status, activated_at)
values ('c1110000-0000-4000-8000-000000000031', 'c1110000-0000-4000-8000-000000000004',
        '[Rider]', '[111]', '+254700011104', (select id from public.city where slug = 'nairobi'),
        'motorbike', '[PLATE111]', 'active', now());

create function pg_temp.add_order(p_id text, p_guest text, p_stage text, p_paid text) returns void
language sql as $$
  insert into public.order (id, reference, guest_id, merchant_id, city_id, channel, dropoff_label,
    dropoff_point, dropoff_note, stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency, delivered_at, handed_to)
  values (p_id::uuid, 'DEL-111-' || right(p_id, 2), p_guest::uuid, 'c1110000-0000-4000-8000-00000000000a',
    (select id from public.city where slug = 'nairobi'), 'web', '[Home, Kilimani]',
    extensions.st_setsrid(extensions.st_makepoint(36.78, -1.29), 4326)::extensions.geography,
    '[Blue gate]', p_stage::public.order_stage, 'card', p_paid::public.order_payment_status,
    50000, 10000, 2500, 62500, 'KES', case when p_stage = 'delivered' then now() end,
    case when p_stage = 'delivered' then 'guest'::public.handoff_target end)
$$;
-- Amina: one delivered and paid, one never paid for.
select pg_temp.add_order('c1110000-0000-4000-8000-0000000000f1', 'c1110000-0000-4000-8000-000000000011', 'delivered', 'paid');
select pg_temp.add_order('c1110000-0000-4000-8000-0000000000f2', 'c1110000-0000-4000-8000-000000000011', 'placed', 'pending');
-- Busy: a paid order on its way.
select pg_temp.add_order('c1110000-0000-4000-8000-0000000000f3', 'c1110000-0000-4000-8000-000000000013', 'picked_up', 'paid');
-- Other: an unpaid order of their own, which must not be touched.
select pg_temp.add_order('c1110000-0000-4000-8000-0000000000f5', 'c1110000-0000-4000-8000-000000000015', 'placed', 'pending');

insert into public.guest_place (guest_id, label, point, source)
select 'c1110000-0000-4000-8000-000000000011', '[Home]',
       extensions.st_setsrid(extensions.st_makepoint(36.78, -1.29), 4326)::extensions.geography, 'manual';
select is((select count(*)::int from public.guest_place where guest_id = 'c1110000-0000-4000-8000-000000000011'),
  1, 'Amina has a saved place to begin with.');

-- ── signed out

set local role anon;
select throws_ok($$select public.rpc_my_account_deletion()$$, '42501', null,
  'Signed out, there is nothing to read.');
reset role;
select ok(not has_function_privilege('anon', 'public.rpc_my_account_deletion_request()', 'EXECUTE'),
  'Nor can anyone signed out delete anything.');

-- ── what stops it

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1110000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((public.rpc_my_account_deletion() ->> 'eligible')::boolean, false,
  'An order on its way stops it.');
select ok(public.rpc_my_account_deletion() -> 'blockers' ? 'active_order', 'And says why.');
select throws_ok($$select public.rpc_my_account_deletion_request()$$, '23514', null,
  'Asking anyway is refused.');

select set_config('request.jwt.claims',
  '{"sub":"c1110000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select ok(public.rpc_my_account_deletion() -> 'blockers' ? 'business_account',
  'A rider is sent to support.');

-- ── the preview

select set_config('request.jwt.claims',
  '{"sub":"c1110000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((public.rpc_my_account_deletion() ->> 'eligible')::boolean, true,
  'An order never paid for does not stop it.');
select ok(jsonb_array_length(public.rpc_my_account_deletion() -> 'deleted') > 0
          and jsonb_array_length(public.rpc_my_account_deletion() -> 'kept') > 0,
  'The customer is told what goes and what stays.');

-- ── deleting

select is(public.rpc_my_account_deletion_request() ->> 'status', 'fulfilled', 'Amina deletes her account.');
reset role;

select is((select count(*)::int from auth.users where id = 'c1110000-0000-4000-8000-000000000001'),
  0, 'Her sign-in is gone.');
select ok((select anonymised_at is not null and user_id is null and phone is null and name not like '%Amina%'
             from public.guest where id = 'c1110000-0000-4000-8000-000000000011'),
  'Her customer record keeps no name, phone or link.');
select is((select stage::text || '/' || cancel_reason_code from public.order
            where id = 'c1110000-0000-4000-8000-0000000000f2'),
  'cancelled/account_deleted', 'Her unpaid order is cancelled.');
select is((select stage::text from public.order where id = 'c1110000-0000-4000-8000-0000000000f1'),
  'delivered', 'Her paid order stays, for the books.');
select ok((select dropoff_point is null and dropoff_note is null
                  and dropoff_label = 'Removed at the customer''s request'
             from public.order where id = 'c1110000-0000-4000-8000-0000000000f1'),
  'Without her address or her notes.');
select is((select count(*)::int from public.guest_place where guest_id = 'c1110000-0000-4000-8000-000000000011'),
  0, 'Her saved places are gone.');
select is((select status::text || '/' || identity_method from public.data_request
            where guest_id = 'c1110000-0000-4000-8000-000000000011' and kind = 'erasure'),
  'fulfilled/signed_in', 'The request is recorded as done from inside her account.');

-- ── a guest, and the bystander

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1110000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_my_account_deletion_request() ->> 'status', 'fulfilled',
  'A guest can delete what NexG holds about them too.');
reset role;
select is((select count(*)::int from auth.users where id = 'c1110000-0000-4000-8000-000000000002'),
  0, 'And the temporary sign-in is gone.');

select is((select stage::text from public.order where id = 'c1110000-0000-4000-8000-0000000000f5'),
  'placed', 'Somebody else''s unpaid order is untouched.');
select is((select name from public.guest where id = 'c1110000-0000-4000-8000-000000000015'),
  '[Other]', 'And so is their record.');

select * from finish();
rollback;
