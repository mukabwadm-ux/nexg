-- Signed-in customers manage their own account: a guest record, support tickets, saved places,
-- notification choices, a data export and deleting the account.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0610000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'amina@customer.example', '', now(),
   '{"first_name":"Amina","last_name":"Otieno"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0610000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'brian@customer.example', '', now(),
   '{}'::jsonb, now(), now());

-- Signed out: none of it.
set local role anon;
select throws_ok($$ select public.rpc_my_account_deletion() $$, '42501', null, 'signed-out visitors cannot read deletion status');
select throws_ok($$ select public.rpc_guest_ensure() $$, '42501', null, 'or create a guest record');

-- Amina, signed in.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0610000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((public.rpc_guest_ensure() ->> 'created')::boolean, true, 'the first sign-in creates a guest record');
select is((public.rpc_guest_ensure() ->> 'created')::boolean, false, 'and a second call reuses it');
select ok(authz.guest_id() is not null, 'so addresses can be saved before a first order');

select is((public.rpc_my_account_deletion() ->> 'eligible')::boolean, true, 'with nothing open, the account can be deleted');

select ok(public.rpc_my_support_ticket_create('My rider could not find the gate.', 'order_problem') ->> 'reference' like 'NX-T-%',
  'a signed-in customer raises a ticket without retyping their email');
select is(jsonb_array_length(public.rpc_my_support_tickets()), 1, 'and sees it in their own list');
select throws_ok($$ select public.rpc_my_support_ticket_create('Partner with you', 'partner_merchant') $$, '23514', null,
  'partner enquiries stay on the website forms');
select throws_ok($$ select public.rpc_my_support_ticket_create('Where is it?', 'order_problem', 'NX-NOT-MINE') $$, '23514', null,
  'an order reference must be on the customer''s own account');

select throws_ok($$ select public.rpc_saved_add('c0610000-0000-4000-8000-0000000000ff') $$, 'P0002', null,
  'only a public place can be saved');

select is(public.rpc_notification_pref_set('delivery_updates', 'sms', false) #>> '{choices,delivery_updates,sms}', 'false',
  'a notification choice is kept on the account');

select ok((public.rpc_my_data_export_request() ->> 'id') = (public.rpc_my_data_export_request() ->> 'id'),
  'asking twice for an export keeps one open request');

-- Brian sees none of Amina's.
select set_config('request.jwt.claims', '{"sub":"c0610000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(jsonb_array_length(public.rpc_my_support_tickets()), 0, 'another customer sees no tickets of hers');
select is((select count(*)::int from public.customer_notification_pref), 0, 'or her notification choices');

-- Amina deletes her account.
select set_config('request.jwt.claims', '{"sub":"c0610000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_my_account_deletion_request() ->> 'status', 'fulfilled', 'deleting the account completes at once');

reset role;
select is((select count(*)::int from auth.users where id = 'c0610000-0000-4000-8000-000000000001'), 0, 'the sign-in is gone');
select ok((select g.anonymised_at is not null and g.user_id is null and g.phone is null
             from public.guest g join public.data_request dr on dr.guest_id = g.id
            where dr.kind = 'erasure' and dr.channel = 'app' limit 1),
  'and the guest record is anonymised, not left with her details');

select * from finish();
rollback;
