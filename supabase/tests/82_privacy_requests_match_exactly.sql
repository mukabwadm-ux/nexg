-- A privacy request names the right person, or nobody until staff know who is asking.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0660000-0000-4000-8000-000000000021', 'authenticated',
   'authenticated', 'dr.one66@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0660000-0000-4000-8000-000000000023', 'authenticated',
   'authenticated', 'dr.three66@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0660000-0000-4000-8000-000000000031', 'authenticated',
   'authenticated', 'dr.dpo66@nexgapp.com', '', now(), now(), now());
-- The help form runs on a temporary (anonymous) session; the anon key itself
-- lost this function in 20260101017400.
insert into auth.users (instance_id, id, aud, role, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c0660000-0000-4000-8000-000000000029', 'authenticated',
        'authenticated', true, now(), now());

insert into public.guest (id, phone, name, user_id) values
  ('c0660000-0000-4000-8000-000000000001', '+254700006601', '[Guest one]', 'c0660000-0000-4000-8000-000000000021'),
  ('c0660000-0000-4000-8000-000000000002', '+254700006602', '[Guest two, from a phone order]', null),
  ('c0660000-0000-4000-8000-000000000003', '+254700006603', '[Guest three]', 'c0660000-0000-4000-8000-000000000023');

insert into public.staff_user (id, user_id, email, display_name)
values ('c0660000-0000-4000-8000-000000000041', 'c0660000-0000-4000-8000-000000000031',
        'dr.dpo66@nexgapp.com', 'DPO 66');
insert into public.role_grant (staff_user_id, role_id, granted_by)
values ('c0660000-0000-4000-8000-000000000041', (select id from public.role where key = 'dpo'),
        'c0660000-0000-4000-8000-000000000041');

-- ── anyone, from the help form

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0660000-0000-4000-8000-000000000029","role":"authenticated","is_anonymous":true}', true);
select set_config('t.by_email',
  (public.rpc_data_request_create('access', null, 'Dr.Three66@Example.test')).id::text, true);
select set_config('t.by_phone',
  (public.rpc_data_request_create('erasure', '+254 700 006 602')).id::text, true);
select set_config('t.nobody',
  (public.rpc_data_request_create('erasure', '+254700006699', 'nobody66@example.test')).id::text, true);
reset role;

select is((select guest_id from public.data_request where id = current_setting('t.by_email')::uuid),
  null, 'An email typed into the form no longer matches every guest: the request waits unlinked.');
select is((select guest_id from public.data_request where id = current_setting('t.by_phone')::uuid),
  null, 'Typing somebody''s phone number does not file the request against them.');

-- ── a signed-in customer

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0660000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select is((public.rpc_data_request_create('access', '+254700006601')).guest_id,
  'c0660000-0000-4000-8000-000000000001'::uuid,
  'A signed-in customer asking with their own number is linked to their own record.');
select is((public.rpc_data_request_create('erasure', '+254700006602')).guest_id,
  null, 'A signed-in customer naming another person''s number is not linked to anybody.');
select is((public.rpc_data_request_create('access', '+254700006601', 'dr.three66@example.test')).guest_id,
  null, 'Their own number with another account''s email is not linked either.');
reset role;

-- ── staff verify who is asking

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0660000-0000-4000-8000-000000000031","role":"authenticated"}', true);

select throws_ok(
  format($$select public.rpc_data_request_anonymise(%L)$$, current_setting('t.nobody')),
  'Cannot anonymise yet: Identity has not been verified yet.',
  'Nothing is erased before staff know who is asking.');

select is((public.rpc_data_request_verify_identity(current_setting('t.by_phone')::uuid, 'otp')).guest_id,
  'c0660000-0000-4000-8000-000000000002'::uuid,
  'Once the phone is verified, the request is linked to the record with exactly that number.');
select is((public.rpc_data_request_verify_identity(current_setting('t.by_email')::uuid, 'document')).guest_id,
  'c0660000-0000-4000-8000-000000000003'::uuid,
  'Once identity is verified, an email links to the record of the account with exactly that email.');
select is((public.rpc_data_request_verify_identity(current_setting('t.nobody')::uuid, 'document')).guest_id,
  null, 'Details that match nobody leave the request unlinked.');
select throws_ok(
  format($$select public.rpc_data_request_anonymise(%L)$$, current_setting('t.nobody')),
  'This request is not linked to a guest record.',
  'An unlinked request erases nothing.');
reset role;

select * from finish();
rollback;
