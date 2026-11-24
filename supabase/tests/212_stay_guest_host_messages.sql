-- A stay's guest and its host can message each other, and nobody else can read it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2110000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner211@example.test', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2110000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'cleaner211@example.test', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2110000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'guest211@example.test', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2110000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'stranger211@example.test', now(), now(), now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c2110000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 211]', '+254700211000',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('c2110000-0000-4000-8000-0000000000b1', 'c2110000-0000-4000-8000-00000000000a',
        'block-211', '[Block 211]', 'apartment_block', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());

insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values
  ('c2110000-0000-4000-8000-0000000000c1', 'c2110000-0000-4000-8000-00000000000a',
   'c2110000-0000-4000-8000-0000000000b1', 'A', 'A', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 2, 7000),
  ('c2110000-0000-4000-8000-0000000000c2', 'c2110000-0000-4000-8000-00000000000a',
   'c2110000-0000-4000-8000-0000000000b1', 'B', 'B', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 2, 4, 11000);

-- The owner, and a member of staff limited to unit A.
insert into public.host_user (host_id, user_id, role, units, accepted_at) values
  ('c2110000-0000-4000-8000-00000000000a', 'c2110000-0000-4000-8000-000000000001', 'owner', null, now()),
  ('c2110000-0000-4000-8000-00000000000a', 'c2110000-0000-4000-8000-000000000002', 'manager',
   array['c2110000-0000-4000-8000-0000000000c1'::uuid], now());

-- d1: booked through NexG in unit B. d2: ended 40 days ago. d3: a hold. d4: entered by the host, no NexG guest.
-- d5: a hold that lapsed unpaid (cancelled, never confirmed).
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, guest_user_id,
                         check_in, check_out, source, status, hold_expires_at)
values
  ('c2110000-0000-4000-8000-0000000000d1', 'c2110000-0000-4000-8000-00000000000a',
   'c2110000-0000-4000-8000-0000000000b1', 'c2110000-0000-4000-8000-0000000000c2', 'Amina',
   'c2110000-0000-4000-8000-000000000003', now() + interval '10 days', now() + interval '12 days',
   'nexg', 'booked', null),
  ('c2110000-0000-4000-8000-0000000000d2', 'c2110000-0000-4000-8000-00000000000a',
   'c2110000-0000-4000-8000-0000000000b1', 'c2110000-0000-4000-8000-0000000000c2', 'Amina',
   'c2110000-0000-4000-8000-000000000003', now() - interval '45 days', now() - interval '40 days',
   'nexg', 'departed', null),
  ('c2110000-0000-4000-8000-0000000000d3', 'c2110000-0000-4000-8000-00000000000a',
   'c2110000-0000-4000-8000-0000000000b1', 'c2110000-0000-4000-8000-0000000000c2', 'Amina',
   'c2110000-0000-4000-8000-000000000003', now() + interval '20 days', now() + interval '22 days',
   'nexg', 'held', now() + interval '15 minutes'),
  ('c2110000-0000-4000-8000-0000000000d4', 'c2110000-0000-4000-8000-00000000000a',
   'c2110000-0000-4000-8000-0000000000b1', 'c2110000-0000-4000-8000-0000000000c1', 'Walk-in',
   null, now() + interval '30 days', now() + interval '32 days', 'entered', 'booked', null),
  ('c2110000-0000-4000-8000-0000000000d5', 'c2110000-0000-4000-8000-00000000000a',
   'c2110000-0000-4000-8000-0000000000b1', 'c2110000-0000-4000-8000-0000000000c2', 'Amina',
   'c2110000-0000-4000-8000-000000000003', now() + interval '40 days', now() + interval '42 days',
   'nexg', 'cancelled', now() - interval '1 hour');

set local role authenticated;

-- ── the guest

select set_config('request.jwt.claims',
  '{"sub":"c2110000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select set_config('t.thread',
  public.rpc_stay_chat_guest_open('c2110000-0000-4000-8000-0000000000d1') ->> 'thread_id', true);
select isnt(nullif(current_setting('t.thread'), ''), null, 'The guest opens the chat for the stay they booked.');
select is(public.rpc_stay_chat_guest_open('c2110000-0000-4000-8000-0000000000d1') ->> 'thread_id',
  current_setting('t.thread'), 'Opening it again gets the same chat.');

select is(public.rpc_stay_chat_guest_send(current_setting('t.thread')::uuid, ' Is there parking? ', 'k-1') ->> 'repeat',
  'false', 'The guest sends a message.');
select is(public.rpc_stay_chat_guest_send(current_setting('t.thread')::uuid, 'Is there parking?', 'k-1') ->> 'repeat',
  'true', 'The same key twice stores it once.');
select is((public.rpc_stay_chat_guest_messages(current_setting('t.thread')::uuid) -> 'messages' -> 0 ->> 'body'),
  'Is there parking?', 'The message is stored trimmed.');
select is(jsonb_array_length(public.rpc_stay_chat_guest_messages(current_setting('t.thread')::uuid) -> 'messages'),
  1, 'Only one copy.');
select throws_ok(
  $$select public.rpc_stay_chat_guest_send(current_setting('t.thread')::uuid, '   ', 'k-2')$$,
  '22023', 'Write a message first.', 'An empty message is refused.');
select throws_ok(
  $$select public.rpc_stay_chat_guest_open('c2110000-0000-4000-8000-0000000000d2')$$,
  '55000', null, 'A stay that ended more than 30 days ago has no new chat.');
select throws_ok(
  $$select public.rpc_stay_chat_guest_open('c2110000-0000-4000-8000-0000000000d3')$$,
  '22023', 'The chat opens once the stay is booked.', 'A hold has no chat.');
select throws_ok(
  $$select public.rpc_stay_chat_guest_open('c2110000-0000-4000-8000-0000000000d5')$$,
  '22023', 'The chat opens once the stay is booked.', 'Nor does a hold that lapsed unpaid.');

-- ── somebody else

select set_config('request.jwt.claims',
  '{"sub":"c2110000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_stay_chat_guest_open('c2110000-0000-4000-8000-0000000000d1')$$,
  '42501', null, 'A stranger cannot open the guest''s chat.');
select throws_ok(
  $$select public.rpc_stay_chat_guest_messages(current_setting('t.thread')::uuid)$$,
  '42501', null, 'Nor read it as a guest.');
select throws_ok(
  $$select public.rpc_stay_chat_host_messages(current_setting('t.thread')::uuid)$$,
  '42501', null, 'Nor as a host.');
select is((select count(*)::int from public.msg_message where conversation_id = current_setting('t.thread')::uuid),
  0, 'Nor through the table.');
select is(jsonb_array_length(public.rpc_stay_chat_guest_threads() -> 'threads'), 0, 'Their own list is empty.');

-- ── staff limited to unit A

select set_config('request.jwt.claims',
  '{"sub":"c2110000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_stay_chat_host_send(current_setting('t.thread')::uuid, 'Hello', 'h-0')$$,
  '42501', null, 'A member who cannot see unit B cannot write to its guest.');
select is(jsonb_array_length(public.rpc_stay_chat_host_threads('c2110000-0000-4000-8000-00000000000a') -> 'threads'),
  0, 'And does not see the chat in their list.');

-- ── the owner

select set_config('request.jwt.claims',
  '{"sub":"c2110000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((public.rpc_stay_chat_host_threads('c2110000-0000-4000-8000-00000000000a') -> 'threads' -> 0 ->> 'unread')::int,
  1, 'The owner sees the chat with one unread message.');
select is(public.rpc_stay_chat_host_send(current_setting('t.thread')::uuid, 'Yes, bay 4.', 'h-1') ->> 'repeat',
  'false', 'The owner replies.');
select throws_ok(
  $$select public.rpc_stay_chat_host_open('c2110000-0000-4000-8000-0000000000d4')$$,
  '22023', null, 'A stay with no NexG guest has no chat.');
select is((select count(*)::int from public.host_conversation_v where id = current_setting('t.thread')::uuid),
  0, 'The chat is not in the host''s support inbox.');

-- ── the guest again

select set_config('request.jwt.claims',
  '{"sub":"c2110000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is((public.rpc_stay_chat_guest_threads() -> 'threads' -> 0 ->> 'unread')::int, 1,
  'The guest has one unread reply.');
select is((public.rpc_stay_chat_guest_threads() -> 'threads' -> 0 ->> 'host_name'), '[Host 211]',
  'Signed with the host''s name.');
select lives_ok($$select public.rpc_stay_chat_guest_read(current_setting('t.thread')::uuid)$$, 'The guest reads it.');
select is((public.rpc_stay_chat_guest_threads() -> 'threads' -> 0 ->> 'unread')::int, 0, 'Nothing is unread now.');

reset role;

select * from finish();
rollback;
