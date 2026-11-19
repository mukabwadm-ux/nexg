-- Signed-in customers manage their own account: a guest record, support tickets,
-- notification choices and a data export. From PR #132's test 61; its deletion
-- checks are in 111 and saved places are on main (20261220000300).

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0610000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'amina@customer.example', '', now(),
   '{"first_name":"Amina","last_name":"Otieno"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0610000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'brian@customer.example', '', now(),
   '{}'::jsonb, now(), now());

-- Signed out: none of it.
set local role anon;
select throws_ok($$ select public.rpc_guest_ensure() $$, '42501', null, 'or create a guest record');

-- Amina, signed in.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0610000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((public.rpc_guest_ensure() ->> 'created')::boolean, true, 'the first sign-in creates a guest record');
select is((public.rpc_guest_ensure() ->> 'created')::boolean, false, 'and a second call reuses it');
select ok(authz.guest_id() is not null, 'so addresses can be saved before a first order');


select ok(public.rpc_my_support_ticket_create('My rider could not find the gate.', 'order_problem') ->> 'reference' like 'NX-T-%',
  'a signed-in customer raises a ticket without retyping their email');
select is(jsonb_array_length(public.rpc_my_support_tickets()), 1, 'and sees it in their own list');
select throws_ok($$ select public.rpc_my_support_ticket_create('Partner with you', 'partner_merchant') $$, '23514', null,
  'partner enquiries stay on the website forms');
select throws_ok($$ select public.rpc_my_support_ticket_create('Where is it?', 'order_problem', 'NX-NOT-MINE') $$, '23514', null,
  'an order reference must be on the customer''s own account');


select is(public.rpc_notification_pref_set('delivery_updates', 'sms', false) #>> '{choices,delivery_updates,sms}', 'false',
  'a notification choice is kept on the account');

select ok((public.rpc_my_data_export_request() ->> 'id') = (public.rpc_my_data_export_request() ->> 'id'),
  'asking twice for an export keeps one open request');

-- Brian sees none of Amina's.
select set_config('request.jwt.claims', '{"sub":"c0610000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(jsonb_array_length(public.rpc_my_support_tickets()), 0, 'another customer sees no tickets of hers');
select is((select count(*)::int from public.customer_notification_pref), 0, 'or her notification choices');

-- Her account goes, and the choices with it (deletion itself is test 111).
reset role;
delete from auth.users where id = 'c0610000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.customer_notification_pref
            where user_id = 'c0610000-0000-4000-8000-000000000001'), 0,
  'deleting the account removes its notification choices');
select is((select count(*)::int from public.support_ticket where user_id = 'c0610000-0000-4000-8000-000000000001'), 0,
  'and unlinks its tickets');

select * from finish();
rollback;
