-- Confirming a phone by SMS links the guest record with that number
-- (20270225000100): only from nobody or a temporary session, never from
-- another full account, and never merging two records that both have history.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1430000-0000-4000-8000-0000000000a0',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1430000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'one143@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1430000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'two143@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1430000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'three143@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1430000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'four143@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1430000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'five143@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1430000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'six143@example.test', now(), false, now(), now());

insert into public.guest (id, user_id, phone, name) values
  -- A guest session's record, and one nobody holds (typed with a leading 0).
  ('c1430000-0000-4000-8000-0000000000fa', 'c1430000-0000-4000-8000-0000000000a0', '+254711000143', 'Guest A'),
  ('c1430000-0000-4000-8000-0000000000fb', null, '0711000144', 'Guest B'),
  -- Account 3 has an empty record; the number's record is a guest session's.
  ('c1430000-0000-4000-8000-0000000000f3', 'c1430000-0000-4000-8000-000000000003', null, 'Three'),
  ('c1430000-0000-4000-8000-0000000000fc', 'c1430000-0000-4000-8000-0000000000a0', '+254711000145', 'Guest C'),
  -- Account 4 has a record with history of its own.
  ('c1430000-0000-4000-8000-0000000000f4', 'c1430000-0000-4000-8000-000000000004', null, 'Four'),
  ('c1430000-0000-4000-8000-0000000000fd', null, '+254711000146', 'Guest D'),
  -- A number typed on another full account's record.
  ('c1430000-0000-4000-8000-0000000000fe', 'c1430000-0000-4000-8000-000000000005', '+254711000147', 'Five');
insert into public.guest_consent (guest_id, kind, granted, source)
values ('c1430000-0000-4000-8000-0000000000f4', 'service_sms', true, 'account');

-- ══════════════════════════════════════════════ the number's key

select is(
  array[public.fn_phone_key('0711 000 143'), public.fn_phone_key('+254711000143'),
        public.fn_phone_key('711000143'), public.fn_phone_key('254711000143')],
  array['254711000143', '254711000143', '254711000143', '254711000143'],
  'A Kenyan mobile matches however it was typed.');

-- ══════════════════════════════════════════════ linked

/* Supabase stores the confirmed number without the plus. */
update auth.users set phone = '254711000143', phone_confirmed_at = now()
 where id = 'c1430000-0000-4000-8000-000000000001';
select is((select user_id from public.guest where id = 'c1430000-0000-4000-8000-0000000000fa'),
  'c1430000-0000-4000-8000-000000000001'::uuid,
  'A guest session''s record joins the account that confirms its number.');
select ok(exists (select 1 from audit.audit_event where action = 'customer.phone_linked'
                   and target_id = 'c1430000-0000-4000-8000-0000000000fa'),
  'The link is audited.');

update auth.users set phone = '254711000144', phone_confirmed_at = now()
 where id = 'c1430000-0000-4000-8000-000000000002';
select is((select user_id from public.guest where id = 'c1430000-0000-4000-8000-0000000000fb'),
  'c1430000-0000-4000-8000-000000000002'::uuid,
  'A record nobody holds is linked, though its number was typed 07….');

update auth.users set phone = '254711000145', phone_confirmed_at = now()
 where id = 'c1430000-0000-4000-8000-000000000003';
select is((select user_id from public.guest where id = 'c1430000-0000-4000-8000-0000000000fc'),
  'c1430000-0000-4000-8000-000000000003'::uuid,
  'An account with an empty record takes the number''s record...');
select ok(not exists (select 1 from public.guest where id = 'c1430000-0000-4000-8000-0000000000f3'),
  '...and its empty record is removed, so it keeps one.');
select is((select count(*)::int from public.guest where user_id = 'c1430000-0000-4000-8000-000000000003'),
  1, 'The account has exactly one customer record.');

-- ══════════════════════════════════════════════ left for support

update auth.users set phone = '254711000146', phone_confirmed_at = now()
 where id = 'c1430000-0000-4000-8000-000000000004';
select is((select user_id from public.guest where id = 'c1430000-0000-4000-8000-0000000000fd'), null,
  'An account whose own record has history is not merged automatically.');
select ok(exists (select 1 from public.guest where id = 'c1430000-0000-4000-8000-0000000000f4'),
  'Its own record is kept.');
select is((select reason from audit.audit_event where action = 'customer.phone_link_needs_support'
            and target_id = 'c1430000-0000-4000-8000-0000000000fd'),
  'account_has_history', 'Support is told why.');

update auth.users set phone = '254711000147', phone_confirmed_at = now()
 where id = 'c1430000-0000-4000-8000-000000000006';
select is((select user_id from public.guest where id = 'c1430000-0000-4000-8000-0000000000fe'),
  'c1430000-0000-4000-8000-000000000005'::uuid,
  'A record held by another full account is never taken.');

-- ══════════════════════════════════════════════ not triggered

update auth.users set phone = '254711000199', phone_confirmed_at = null
 where id = 'c1430000-0000-4000-8000-000000000005';
select is((select user_id from public.guest where id = 'c1430000-0000-4000-8000-0000000000fe'),
  'c1430000-0000-4000-8000-000000000005'::uuid, 'An unconfirmed phone links nothing.');

select is(public.fn_link_guest_by_confirmed_phone('c1430000-0000-4000-8000-000000000001', '254711000143') ->> 'outcome',
  'already', 'Confirming the same number again changes nothing.');

set local role authenticated;
select throws_ok($$select public.fn_link_guest_by_confirmed_phone(gen_random_uuid(), '254711000143')$$,
  '42501', null, 'Nobody can call the linking step directly.');
reset role;

select * from finish();
rollback;
