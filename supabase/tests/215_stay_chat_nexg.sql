-- NexG in stay chats: who at NexG may read and join, what the guest and the host see, and what is audited.

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(), now()
from (values
  ('c2130000-0000-4000-8000-000000000001'::uuid, 'owner213@example.test'),
  ('c2130000-0000-4000-8000-000000000003'::uuid, 'guest213@example.test'),
  ('c2130000-0000-4000-8000-0000000000a1'::uuid, 'concierge213@test.local'),
  ('c2130000-0000-4000-8000-0000000000a2'::uuid, 'ops213@test.local'),
  ('c2130000-0000-4000-8000-0000000000a3'::uuid, 'partnerships213@test.local'),
  ('c2130000-0000-4000-8000-0000000000a4'::uuid, 'merchantops213@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2130000-0000-4000-8000-0000000000b1', 'c2130000-0000-4000-8000-0000000000a1', 'concierge213@test.local', 'Wanjiru Desk'),
  ('c2130000-0000-4000-8000-0000000000b2', 'c2130000-0000-4000-8000-0000000000a2', 'ops213@test.local', 'Otieno Ops'),
  ('c2130000-0000-4000-8000-0000000000b3', 'c2130000-0000-4000-8000-0000000000a3', 'partnerships213@test.local', 'Pat Partner'),
  ('c2130000-0000-4000-8000-0000000000b4', 'c2130000-0000-4000-8000-0000000000a4', 'merchantops213@test.local', 'Mo Merchant');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from (values
  ('c2130000-0000-4000-8000-0000000000b1'::uuid, 'concierge_agent'),
  ('c2130000-0000-4000-8000-0000000000b2'::uuid, 'ops_manager'),
  ('c2130000-0000-4000-8000-0000000000b3'::uuid, 'partnerships'),
  ('c2130000-0000-4000-8000-0000000000b4'::uuid, 'merchant_ops')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c2130000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 213]', '+254700213000',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('c2130000-0000-4000-8000-0000000000e1', 'c2130000-0000-4000-8000-00000000000a',
        'block-213', '[Block 213]', 'apartment_block', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('c2130000-0000-4000-8000-0000000000c1', 'c2130000-0000-4000-8000-00000000000a',
        'c2130000-0000-4000-8000-0000000000e1', 'A', 'A', '[Address]', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 2, 7000);
insert into public.host_user (host_id, user_id, role, units, accepted_at)
values ('c2130000-0000-4000-8000-00000000000a', 'c2130000-0000-4000-8000-000000000001', 'owner', null, now());
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, guest_user_id,
                         check_in, check_out, source, status)
values ('c2130000-0000-4000-8000-0000000000d1', 'c2130000-0000-4000-8000-00000000000a',
        'c2130000-0000-4000-8000-0000000000e1', 'c2130000-0000-4000-8000-0000000000c1', 'Amina',
        'c2130000-0000-4000-8000-000000000003', now() + interval '10 days', now() + interval '12 days',
        'nexg', 'booked');

select ok(
  not has_function_privilege('anon', 'public.rpc_stay_chat_staff_threads(text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_stay_chat_staff_join(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_stay_chat_guest_ask_nexg(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'authz.stay_chat_ask(uuid, text)', 'execute'),
  'The NexG functions are never anonymous, and the shared steps are not callable by apps');

set local role authenticated;

-- ── the guest writes

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('t.thread',
  public.rpc_stay_chat_guest_open('c2130000-0000-4000-8000-0000000000d1') ->> 'thread_id', true);
select is(public.rpc_stay_chat_guest_send(current_setting('t.thread')::uuid, 'The key box is empty.', 'g-1') ->> 'repeat',
  'false', 'The guest writes to the host.');
select is(public.rpc_stay_chat_guest_messages(current_setting('t.thread')::uuid) -> 'thread' -> 'nexg' ->> 'present',
  'false', 'NexG is not in the chat yet, and the thread says so.');

-- ── staff without the role cannot read a stay chat

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select throws_ok($$select public.rpc_stay_chat_staff_threads('all')$$, '42501', null,
  'Partnerships cannot list stay chats.');
select throws_ok($$select public.rpc_stay_chat_staff_messages(current_setting('t.thread')::uuid)$$, '42501', null,
  'Nor read one.');
select throws_ok($$select public.rpc_stay_chat_staff_join(current_setting('t.thread')::uuid)$$, '42501', null,
  'Nor join one.');

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
select throws_ok($$select public.rpc_stay_chat_staff_messages(current_setting('t.thread')::uuid)$$, '42501', null,
  'Nor can any other staff role, such as merchant operations.');
select is((select count(*)::int from public.msg_message where conversation_id = current_setting('t.thread')::uuid),
  0, 'Nor read it through the table.');

-- ── the Concierge desk

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((public.rpc_stay_chat_staff_threads('unanswered') -> 'counts' ->> 'unanswered')::int, 1,
  'The desk sees the chat as waiting on the host.');
select is((public.rpc_stay_chat_staff_threads('needs') -> 'counts' ->> 'needs')::int, 0,
  'Nobody has asked NexG yet.');
select is((select count(*)::int from public.msg_inbox_v where id = current_setting('t.thread')::uuid), 0,
  'Stay chats stay out of the Concierge desk queue.');
select throws_ok(
  $$select public.rpc_stay_chat_staff_send(current_setting('t.thread')::uuid, 'Hello', 's-0')$$,
  '55000', 'Join the chat before writing in it.', 'Staff cannot write without joining.');

-- ── the guest asks NexG

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.rpc_stay_chat_guest_ask_nexg(current_setting('t.thread')::uuid) ->> 'already', 'false',
  'The guest asks NexG to help.');
select is(public.rpc_stay_chat_guest_ask_nexg(current_setting('t.thread')::uuid) ->> 'already', 'true',
  'Asking again before NexG answers changes nothing.');
select is(
  (select m ->> 'side' || ' · ' || (m ->> 'body')
     from jsonb_array_elements(public.rpc_stay_chat_guest_messages(current_setting('t.thread')::uuid) -> 'messages') m
    where m ->> 'side' = 'system'),
  'system · Amina asked NexG to help.', 'Both sides see a line saying the guest asked NexG.');

-- ── the desk joins and answers

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((public.rpc_stay_chat_staff_threads('needs') -> 'counts' ->> 'needs')::int, 1, 'The chat now needs NexG.');
select lives_ok($$select public.rpc_stay_chat_staff_messages(current_setting('t.thread')::uuid)$$,
  'The desk opens the transcript.');
select is(public.rpc_stay_chat_staff_join(current_setting('t.thread')::uuid) ->> 'already', 'false', 'The desk joins.');
select is(public.rpc_stay_chat_staff_send(current_setting('t.thread')::uuid, 'Hi Amina, the host is on the way.', 's-1')
  ->> 'repeat', 'false', 'And writes as NexG.');
select is(
  (select m ->> 'staff_name'
     from jsonb_array_elements(public.rpc_stay_chat_staff_messages(current_setting('t.thread')::uuid) -> 'messages') m
    where m ->> 'side' = 'nexg'),
  'Wanjiru Desk', 'Staff see which colleague wrote it.');
select is((public.rpc_stay_chat_staff_threads('needs') -> 'counts' ->> 'needs')::int, 0,
  'Once NexG has answered, the chat no longer needs NexG.');

-- ── what the guest and the host see

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select jsonb_build_object('author', m ->> 'author', 'staff_name', m -> 'staff_name')
     from jsonb_array_elements(public.rpc_stay_chat_guest_messages(current_setting('t.thread')::uuid) -> 'messages') m
    where m ->> 'side' = 'nexg'),
  '{"author": "NexG", "staff_name": null}'::jsonb, 'The guest sees the message from NexG, not from a named person.');
select is((select count(*)::int from public.msg_participant
            where conversation_id = current_setting('t.thread')::uuid and kind = 'staff'
              and (display_name <> 'NexG' or role_label <> 'NexG')), 0,
  'Not even in the participant rows the guest can read.');
select is((public.rpc_stay_chat_guest_threads() -> 'threads' -> 0 ->> 'unread')::int, 1,
  'NexG''s message is unread for the guest.');
select is(public.rpc_stay_chat_guest_threads() -> 'threads' -> 0 -> 'nexg' ->> 'present', 'true',
  'The guest can see NexG is in the chat.');

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((public.rpc_stay_chat_host_threads('c2130000-0000-4000-8000-00000000000a') -> 'threads' -> 0 ->> 'unread')::int, 2,
  'The host has the guest''s message and NexG''s unread.');
select is(public.rpc_stay_chat_host_threads('c2130000-0000-4000-8000-00000000000a') -> 'threads' -> 0 -> 'nexg' ->> 'present',
  'true', 'The host can see NexG is in the chat too.');

-- ── leaving

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.rpc_stay_chat_staff_leave(current_setting('t.thread')::uuid)$$, 'The desk leaves.');
select is(public.rpc_stay_chat_staff_messages(current_setting('t.thread')::uuid) -> 'thread' -> 'nexg' ->> 'present',
  'false', 'NexG is no longer in the chat.');

-- ── hospitality operations can read too

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select ok((public.rpc_stay_chat_staff_threads('all') -> 'counts' ->> 'all')::int >= 1,
  'An ops manager sees stay chats in their city.');

reset role;

-- ── accounted for

select is(
  (select array_agg(distinct action order by action) from audit.audit_event
    where target_id = 'c2130000-0000-4000-8000-0000000000d1' and action like 'stay.chat\_%'),
  array['stay.chat_nexg_requested', 'stay.chat_staff_joined', 'stay.chat_staff_left', 'stay.chat_staff_message',
        'stay.chat_staff_viewed', 'stay.chat_started'],
  'Asking NexG, opening the transcript, joining, every NexG message and leaving are all audited.');
select is(
  (select after ->> 'length' from audit.audit_event
    where action = 'stay.chat_staff_message' and target_id = 'c2130000-0000-4000-8000-0000000000d1'),
  '33', 'The audit records the message''s length, not its text.');

select * from finish();
rollback;
