-- Report and block in trip groups and stay chats, who reads and resolves reports, and account deletion for a trip
-- group organiser, a stay guest and a host.

begin;
create extension if not exists pgtap with schema extensions;
select plan(93);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, is_anonymous)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(), now(),
       u.email is null
from (values
  ('c2430000-0000-4000-8000-000000000001'::uuid, 'amina243@example.test'),   -- organiser
  ('c2430000-0000-4000-8000-000000000002'::uuid, 'brian243@example.test'),   -- member
  ('c2430000-0000-4000-8000-000000000003'::uuid, 'carol243@example.test'),   -- member
  ('c2430000-0000-4000-8000-000000000004'::uuid, 'dan243@example.test'),     -- not in Amina's group
  ('c2430000-0000-4000-8000-000000000005'::uuid, null),                      -- temporary session
  ('c2430000-0000-4000-8000-000000000006'::uuid, 'host243@example.test'),    -- host owner
  ('c2430000-0000-4000-8000-000000000007'::uuid, 'gita243@example.test'),    -- stay guest
  ('c2430000-0000-4000-8000-0000000000a1'::uuid, 'concierge243@test.local'),
  ('c2430000-0000-4000-8000-0000000000a3'::uuid, 'partnerships243@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2430000-0000-4000-8000-0000000000b1', 'c2430000-0000-4000-8000-0000000000a1', 'concierge243@test.local', 'Wanjiru Desk'),
  ('c2430000-0000-4000-8000-0000000000b3', 'c2430000-0000-4000-8000-0000000000a3', 'partnerships243@test.local', 'Pat Partner');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from (values
  ('c2430000-0000-4000-8000-0000000000b1'::uuid, 'concierge_agent'),
  ('c2430000-0000-4000-8000-0000000000b3'::uuid, 'partnerships')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c2430000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 243]', '+254700243000',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('c2430000-0000-4000-8000-0000000000e1', 'c2430000-0000-4000-8000-00000000000a',
        'block-243', '[Block 243]', 'apartment_block', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('c2430000-0000-4000-8000-0000000000c1', 'c2430000-0000-4000-8000-00000000000a',
        'c2430000-0000-4000-8000-0000000000e1', 'A', 'A', '[Address]', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 2, 7000);
insert into public.host_user (host_id, user_id, role, units, accepted_at)
values ('c2430000-0000-4000-8000-00000000000a', 'c2430000-0000-4000-8000-000000000006', 'owner', null, now());
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, guest_user_id,
                         check_in, check_out, source, status)
values ('c2430000-0000-4000-8000-0000000000d1', 'c2430000-0000-4000-8000-00000000000a',
        'c2430000-0000-4000-8000-0000000000e1', 'c2430000-0000-4000-8000-0000000000c1', 'Gita',
        'c2430000-0000-4000-8000-000000000007', now() + interval '10 days', now() + interval '12 days',
        'nexg', 'booked');

/* Carol's phone, to see whose messages ring it. */
insert into native_push.installation (id, owner_id, proof_hash, app, platform, environment, token, locale, alerts)
values ('c2430000-0000-4000-8000-0000000000f3', 'c2430000-0000-4000-8000-000000000003', '\x00', 'stays', 'ios',
        'sandbox', 'token-243-carol', 'en', true);

-- ── who may call what

select ok(
  not has_function_privilege('anon', 'public.rpc_chat_report(uuid, text, uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_chat_block(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_chat_unblock(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_chat_blocked()', 'execute')
  and not has_function_privilege('anon', 'public.rpc_chat_reports(text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_chat_report_resolve(uuid, text, text, boolean, boolean)', 'execute'),
  'None of the report and block functions is anonymous.');
select ok(not has_function_privilege('authenticated', 'authz.account_deletion_leave_chats(uuid)', 'execute'),
  'Apps cannot take another person out of their chats.');
select ok(
  not has_table_privilege('authenticated', 'public.chat_report', 'select')
  and not has_table_privilege('authenticated', 'public.chat_report', 'insert')
  and not has_table_privilege('authenticated', 'public.user_block', 'select')
  and not has_table_privilege('anon', 'public.chat_report', 'select'),
  'Neither table is open to apps.');

set local role anon;
select throws_ok($$select public.rpc_chat_report(gen_random_uuid(), 'spam')$$, '42501', null,
  'Signed out, nothing can be reported.');
select throws_ok($$select public.rpc_chat_blocked()$$, '42501', null, 'Nor a block list read.');
reset role;
set local role authenticated;

-- ── a group with three people talking

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('t.created', public.rpc_trip_group_create('Diani trip', 'Amina')::text, true);
select set_config('t.group', current_setting('t.created')::jsonb ->> 'group_id', true);
select set_config('t.token', current_setting('t.created')::jsonb ->> 'invite_token', true);
select set_config('t.m_amina', public.rpc_trip_group_send(current_setting('t.group')::uuid, 'Hello all', 'a-1') ->> 'message_id', true);

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.rpc_trip_group_join(current_setting('t.token'), 'Carol');
select public.rpc_trip_group_read(current_setting('t.group')::uuid);

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.rpc_trip_group_join(current_setting('t.token'), 'Brian');
select set_config('t.m_brian', public.rpc_trip_group_send(current_setting('t.group')::uuid, 'Rude words', 'b-1') ->> 'message_id', true);
select public.rpc_trip_group_share(current_setting('t.group')::uuid, 'stay', 'prop-1', 'Cheap rooms', 'Pay me first');

reset role;
select is((select count(*)::int from native_push.delivery
            where installation_id = 'c2430000-0000-4000-8000-0000000000f3'), 2,
  'Before any block, both of Brian''s messages ring Carol.');
set local role authenticated;

-- ── reporting in a group

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('t.r1', public.rpc_chat_report(current_setting('t.group')::uuid, 'harassment',
  current_setting('t.m_brian')::uuid, null, ' This is abuse ')::text, true);
select is(current_setting('t.r1')::jsonb ->> 'repeat', 'false', 'A member reports a message.');
select is(public.rpc_chat_report(current_setting('t.group')::uuid, 'harassment', current_setting('t.m_brian')::uuid)
  ->> 'report_id', current_setting('t.r1')::jsonb ->> 'report_id', 'The same report again is stored once.');
select set_config('t.r2', public.rpc_chat_report(current_setting('t.group')::uuid, 'scam', null,
  'c2430000-0000-4000-8000-000000000002') ->> 'report_id', true);
select isnt(current_setting('t.r2'), current_setting('t.r1')::jsonb ->> 'report_id', 'A member reports a person.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'rude', current_setting('t.m_brian')::uuid)$$,
  '22023', 'Choose a reason.', 'The reason comes from the list.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'other', null, null)$$,
  '22023', 'Choose a message or a person to report.', 'A group report names a message or a person.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'other', null,
  'c2430000-0000-4000-8000-000000000003')$$, '22023', 'You can''t report yourself.', 'Not themselves.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'other', null,
  'c2430000-0000-4000-8000-000000000004')$$, '22023', null, 'Nor someone who is not in the group.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'other', gen_random_uuid())$$,
  '22023', 'That message can''t be reported.', 'Nor a message that is not in it.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'other',
  current_setting('t.m_brian')::uuid, 'c2430000-0000-4000-8000-000000000001')$$,
  '22023', null, 'A message and a different person do not go together.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'other',
  current_setting('t.m_brian')::uuid, null, repeat('x', 1001))$$, '22023', null, 'The note has a limit.');
select throws_ok($$select * from public.chat_report$$, '42501', null, 'A reporter cannot read reports, not even their own.');
select throws_ok($$select public.rpc_chat_reports()$$, '42501', null, 'Nor list them.');
select throws_ok($$select public.rpc_chat_report_resolve((current_setting('t.r1')::jsonb ->> 'report_id')::uuid, 'dismissed')$$,
  '42501', null, 'Nor resolve one.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'other', current_setting('t.m_brian')::uuid)$$,
  '22023', 'You can''t report your own message.', 'Nobody reports their own message.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'spam', current_setting('t.m_brian')::uuid)$$,
  '42501', null, 'A non-member cannot report in a group.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000005","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'spam', current_setting('t.m_brian')::uuid)$$,
  '42501', null, 'Nor can a temporary session that is not in it.');

-- ── blocking

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.rpc_chat_block(current_setting('t.group')::uuid, 'c2430000-0000-4000-8000-000000000002')$$,
  '42501', null, 'A non-member cannot block through a group.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.rpc_chat_block(current_setting('t.group')::uuid, 'c2430000-0000-4000-8000-000000000003')$$,
  '22023', null, 'Nobody blocks themselves.');
select throws_ok($$select public.rpc_chat_block(current_setting('t.group')::uuid, 'c2430000-0000-4000-8000-000000000004')$$,
  '22023', null, 'Only someone from the group can be blocked.');
select is((public.rpc_trip_group_list() -> 'groups' -> 0 ->> 'unread')::int, 2, 'Brian''s two messages are unread for Carol.');
select is(public.rpc_chat_block(current_setting('t.group')::uuid, 'c2430000-0000-4000-8000-000000000002') ->> 'already',
  'false', 'Carol blocks Brian.');
select is(public.rpc_chat_block(current_setting('t.group')::uuid, 'c2430000-0000-4000-8000-000000000002') ->> 'already',
  'true', 'Blocking again changes nothing.');
select is((select count(*)::int from jsonb_array_elements(
             public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages') m
            where m ->> 'author_id' = 'c2430000-0000-4000-8000-000000000002'), 0,
  'Carol no longer gets his messages or cards.');
select is((select count(*)::int from jsonb_array_elements(
             public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages') m
            where m ->> 'author_id' = 'c2430000-0000-4000-8000-000000000001'), 1,
  'Everyone else''s are still there, with who wrote them.');
select is((public.rpc_trip_group_list() -> 'groups' -> 0 ->> 'unread')::int, 0, 'Nor do his count as unread.');
select is(public.rpc_trip_group_list() -> 'groups' -> 0 -> 'last_message' ->> 'body', 'Hello all',
  'The list shows the last message from somebody she has not blocked.');
select is((select m ->> 'blocked' from jsonb_array_elements(
             public.rpc_trip_group_members(current_setting('t.group')::uuid) -> 'members') m
            where m ->> 'name' = 'Brian'), 'true', 'The member list marks him as blocked.');
select is(public.rpc_chat_blocked() -> 'blocked' -> 0 ->> 'name', 'Brian', 'He is on her block list.');
select throws_ok($$select * from public.user_block$$, '42501', null, 'The table itself is closed.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from jsonb_array_elements(
             public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages') m
            where m ->> 'author_id' = 'c2430000-0000-4000-8000-000000000002'), 2,
  'Someone who has not blocked him still sees them.');
select is(jsonb_array_length(public.rpc_chat_blocked() -> 'blocked'), 0, 'A block list is the caller''s own.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.rpc_trip_group_send(current_setting('t.group')::uuid, 'Still here', 'b-2');
reset role;
select is((select count(*)::int from native_push.delivery
            where installation_id = 'c2430000-0000-4000-8000-0000000000f3'), 2,
  'A blocked sender does not ring her phone.');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.rpc_chat_unblock('c2430000-0000-4000-8000-000000000002') ->> 'already', 'false', 'Carol unblocks him.');
select is(public.rpc_chat_unblock('c2430000-0000-4000-8000-000000000002') ->> 'already', 'true',
  'Unblocking again changes nothing.');
select is((select count(*)::int from jsonb_array_elements(
             public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages') m
            where m ->> 'author_id' = 'c2430000-0000-4000-8000-000000000002'), 3, 'His messages are back.');
select public.rpc_chat_block(current_setting('t.group')::uuid, 'c2430000-0000-4000-8000-000000000001');

-- ── a stay chat: report, no block

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select set_config('t.thread', public.rpc_stay_chat_guest_open('c2430000-0000-4000-8000-0000000000d1') ->> 'thread_id', true);
select set_config('t.m_gita', public.rpc_stay_chat_guest_send(current_setting('t.thread')::uuid, 'When can I arrive?', 'g-1')
  ->> 'message_id', true);
select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select set_config('t.m_host', public.rpc_stay_chat_host_send(current_setting('t.thread')::uuid, 'Pay me outside the app.', 'h-1')
  ->> 'message_id', true);

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select set_config('t.r3', public.rpc_chat_report(current_setting('t.thread')::uuid, 'scam', current_setting('t.m_host')::uuid)
  ->> 'report_id', true);
select isnt(nullif(current_setting('t.r3'), ''), null, 'The guest reports the host''s message.');
select set_config('t.r4', public.rpc_chat_report(current_setting('t.thread')::uuid, 'other') ->> 'report_id', true);
select isnt(current_setting('t.r4'), current_setting('t.r3'), 'The guest reports the host.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.thread')::uuid, 'other', current_setting('t.m_gita')::uuid)$$,
  '22023', null, 'Not their own message.');
select throws_ok($$select public.rpc_chat_report(current_setting('t.thread')::uuid, 'other', null,
  'c2430000-0000-4000-8000-000000000006')$$, '22023', null, 'A stay chat report takes no user id.');
select throws_ok($$select public.rpc_chat_block(current_setting('t.thread')::uuid, 'c2430000-0000-4000-8000-000000000006')$$,
  '42501', null, 'There is no block in a stay chat.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select set_config('t.r5', public.rpc_chat_report(current_setting('t.thread')::uuid, 'other') ->> 'report_id', true);
select isnt(nullif(current_setting('t.r5'), ''), null, 'The host reports the guest.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.rpc_chat_report(current_setting('t.thread')::uuid, 'spam')$$, '42501', null,
  'A stranger cannot report in a stay chat.');

-- ── staff

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select throws_ok($$select public.rpc_chat_reports()$$, '42501', null, 'Partnerships cannot read reports.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('t.list', public.rpc_chat_reports('open', 200)::text, true);
select is((select count(*)::int from jsonb_array_elements(current_setting('t.list')::jsonb -> 'reports') r
            where r ->> 'conversation_id' in (current_setting('t.group'), current_setting('t.thread'))), 5,
  'The desk sees the five open reports.');
select is(
  (select jsonb_build_object('by', r ->> 'reporter_name', 'about', r ->> 'reported_name', 'note', r ->> 'note',
            'words', r -> 'snapshot' -> 0 ->> 'body', 'remove_message', r -> 'can_remove_message',
            'remove_member', r -> 'can_remove_member')
     from jsonb_array_elements(current_setting('t.list')::jsonb -> 'reports') r
    where r ->> 'id' = current_setting('t.r1')::jsonb ->> 'report_id'),
  '{"by":"Carol","about":"Brian","note":"This is abuse","words":"Rude words","remove_message":true,"remove_member":true}'::jsonb,
  'With who, about whom, the note and the words as they were.');
select is(
  (select jsonb_array_length(r -> 'snapshot') from jsonb_array_elements(current_setting('t.list')::jsonb -> 'reports') r
    where r ->> 'id' = current_setting('t.r2')), 2, 'A report about a person carries their messages.');
select is(
  (select r ->> 'reported_side' || ' ' || (r -> 'snapshot' -> 0 ->> 'body')
     from jsonb_array_elements(current_setting('t.list')::jsonb -> 'reports') r
    where r ->> 'id' = current_setting('t.r4')), 'host Pay me outside the app.',
  'A report about the host carries the host side''s messages.');

select throws_ok($$select public.rpc_chat_report_resolve((current_setting('t.r1')::jsonb ->> 'report_id')::uuid,
  'dismissed', null, true)$$, '22023', null, 'A dismissal removes nothing.');
select throws_ok($$select public.rpc_chat_report_resolve((current_setting('t.r1')::jsonb ->> 'report_id')::uuid,
  'actioned')$$, '22023', null, 'Resolving needs an action or a note.');
select throws_ok($$select public.rpc_chat_report_resolve(current_setting('t.r4')::uuid, 'actioned', null, false, true)$$,
  '22023', 'Nobody can be removed from a stay chat.', 'Nobody is removed from a stay chat.');
select throws_ok($$select public.rpc_chat_report_resolve(current_setting('t.r2')::uuid, 'actioned', null, true)$$,
  '22023', null, 'A report about a person has no one message to remove.');
select is(public.rpc_chat_report_resolve((current_setting('t.r1')::jsonb ->> 'report_id')::uuid, 'actioned', null, true)
  ->> 'message_removed', 'true', 'The desk removes the reported message.');
select throws_ok($$select public.rpc_chat_report_resolve((current_setting('t.r1')::jsonb ->> 'report_id')::uuid, 'dismissed')$$,
  '55000', 'This report is already resolved.', 'A report is resolved once.');
select is(public.rpc_chat_report_resolve(current_setting('t.r3')::uuid, 'actioned', 'Warned the host', true) ->> 'status',
  'actioned', 'And a message in a stay chat, with a note.');
select is(public.rpc_chat_report_resolve(current_setting('t.r4')::uuid, 'dismissed') ->> 'status', 'dismissed',
  'Another is dismissed.');
select is(public.rpc_chat_report_resolve(current_setting('t.r2')::uuid, 'actioned', null, false, true) ->> 'member_removed',
  'true', 'The desk removes the reported member.');
select is(
  (select r -> 'snapshot' -> 0 ->> 'body'
     from jsonb_array_elements(public.rpc_chat_reports('resolved', 200) -> 'reports') r
    where r ->> 'id' = current_setting('t.r1')::jsonb ->> 'report_id'),
  'Rude words', 'The report keeps the removed words.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select m ->> 'redacted' || ' ' || coalesce(m ->> 'body', '-')
     from jsonb_array_elements(public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages') m
    where m ->> 'id' = current_setting('t.m_brian')), 'true -', 'The group sees it as removed.');
select is((select body from public.msg_message where id = current_setting('t.m_brian')::uuid), 'Removed by NexG',
  'Also through the table.');
select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select is(
  (select m ->> 'redacted' from jsonb_array_elements(
      public.rpc_stay_chat_guest_messages(current_setting('t.thread')::uuid) -> 'messages') m
    where m ->> 'id' = current_setting('t.m_host')), 'true', 'The stay chat sees it as removed.');

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.rpc_trip_group_messages(current_setting('t.group')::uuid)$$, '42501', null,
  'The removed member loses access.');
select throws_ok($$select public.rpc_trip_group_join(current_setting('t.token'), 'Brian')$$, '42501', null,
  'And the link will not let them back.');

-- ── removing an organiser closes the group

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select set_config('t.created2', public.rpc_trip_group_create('Dan''s group', 'Dan')::text, true);
select set_config('t.group2', current_setting('t.created2')::jsonb ->> 'group_id', true);
select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.rpc_trip_group_join(current_setting('t.created2')::jsonb ->> 'invite_token', 'Carol');
select set_config('t.r6', public.rpc_chat_report(current_setting('t.group2')::uuid, 'violence', null,
  'c2430000-0000-4000-8000-000000000004') ->> 'report_id', true);
select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.rpc_chat_report_resolve(current_setting('t.r6')::uuid, 'actioned', null, false, true) ->> 'group_closed',
  'true', 'Removing the organiser closes the group.');

-- ── the daily limit

reset role;
insert into public.chat_report (reporter_user_id, conversation_id, context, reported_side, reported_name, reason)
select 'c2430000-0000-4000-8000-000000000003', current_setting('t.group')::uuid, 'trip_group', 'member', 'Amina', 'spam'
  from generate_series(1, 20);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.rpc_chat_report(current_setting('t.group')::uuid, 'spam', current_setting('t.m_amina')::uuid)$$,
  '54000', null, 'Twenty reports a day is the limit.');

-- ── a host is sent to support, and told so

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select ok((public.rpc_my_account_deletion() -> 'blockers' ->> 'host_account') like '%derrick@nexgapp.com%'
          and not (public.rpc_my_account_deletion() -> 'blockers' ? 'business_account'),
  'A host is told why, and where to write.');
select throws_ok($$select public.rpc_my_account_deletion_request()$$, '23514', null, 'And nothing is deleted.');

-- ── the organiser deletes their account

/* Amina is reported too, so a report about a deleted person survives them. */
select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('t.m_amina2', public.rpc_trip_group_send(current_setting('t.group')::uuid, 'Bye', 'a-2') ->> 'message_id', true);
select public.rpc_chat_block(current_setting('t.group')::uuid, 'c2430000-0000-4000-8000-000000000003');
select is((public.rpc_my_account_deletion() ->> 'eligible')::boolean, true, 'An organiser may delete their account.');
select is(public.rpc_my_account_deletion_request() ->> 'status', 'fulfilled',
  'And does, where it used to fail on the group''s foreign key.');
reset role;
select is((select count(*)::int from auth.users where id = 'c2430000-0000-4000-8000-000000000001'), 0,
  'The sign-in is gone.');
select ok((select closed_at is not null and created_by is null and invite_revoked_at is not null
             from public.trip_group where id = current_setting('t.group')::uuid),
  'Their group is closed, with no organiser.');
select is((select string_agg(distinct display_name, ',') from public.msg_participant
            where user_id = 'c2430000-0000-4000-8000-000000000001'), 'Former member',
  'Their name is off their messages.');
select is((select count(*)::int from public.user_block
            where 'c2430000-0000-4000-8000-000000000001' in (blocker_user_id, blocked_user_id)), 0,
  'Blocks by them and of them go with the account.');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select jsonb_build_object('closed', t -> 'closed', 'is_admin', t -> 'is_admin')
     from jsonb_array_elements(public.rpc_trip_group_list() -> 'groups') t
    where t ->> 'id' = current_setting('t.group')),
  '{"closed": true, "is_admin": false}'::jsonb, 'A member still sees the closed group.');
select is(
  (select m ->> 'author' from jsonb_array_elements(
      public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages') m
    where m ->> 'id' = current_setting('t.m_amina2')), 'Former member', 'With the messages, unnamed.');
select is((select count(*)::int from jsonb_array_elements(
             public.rpc_trip_group_members(current_setting('t.group')::uuid) -> 'members') m
            where m ->> 'organiser' = 'false' and m ->> 'name' = 'Carol'), 1,
  'Nobody is shown as the organiser.');
select public.rpc_legal_accept('terms', 'v-243');
reset role;
delete from public.chat_report
 where reporter_user_id = 'c2430000-0000-4000-8000-000000000003' and reported_name = 'Amina' and message_id is null;
set local role authenticated;
select is(public.rpc_chat_report(current_setting('t.group')::uuid, 'other', current_setting('t.m_amina2')::uuid)
  ->> 'repeat', 'false', 'A message can still be reported after its writer deleted their account.');
select is(public.rpc_my_account_deletion_request() ->> 'status', 'fulfilled',
  'A member who reported, blocked, was in two groups and had accepted the terms can delete too.');
reset role;
select is((select count(*)::int from public.legal_acceptance where version = 'v-243'), 0,
  'Their own acceptance goes with them.');
set local role authenticated;

-- ── the stay guest, once the stay is over

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select ok(public.rpc_my_account_deletion() -> 'blockers' ? 'upcoming_stay', 'An upcoming stay still comes first.');
reset role;
update public.stay set status = 'departed', check_in = now() - interval '4 days', check_out = now() - interval '2 days'
 where id = 'c2430000-0000-4000-8000-0000000000d1';
set local role authenticated;
select is(public.rpc_my_account_deletion_request() ->> 'status', 'fulfilled', 'A guest who has chatted deletes too.');
select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(
  (select m ->> 'author' from jsonb_array_elements(
      public.rpc_stay_chat_host_messages(current_setting('t.thread')::uuid) -> 'messages') m
    where m ->> 'id' = current_setting('t.m_gita')), 'Former member', 'The host keeps the chat, without the name.');

-- ── a group member who is not the organiser, and someone who closed their group, can go as well

select set_config('request.jwt.claims', '{"sub":"c2430000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(public.rpc_my_account_deletion_request() ->> 'status', 'fulfilled',
  'Someone whose only group is already closed deletes too.');

reset role;

-- ── accounted for

select is((select count(*)::int from public.chat_report
            where id in ((current_setting('t.r1')::jsonb ->> 'report_id')::uuid, current_setting('t.r2')::uuid,
                         current_setting('t.r5')::uuid)), 3,
  'Reports outlive the accounts on them.');
select is(
  (select array_agg(distinct action order by action) from audit.audit_event
    where action like 'chat.%' and actor_id::text like 'c2430000%'),
  array['chat.report_resolved', 'chat.reported', 'chat.user_blocked', 'chat.user_unblocked'],
  'Reporting, resolving, blocking and unblocking are audited.');
select is((select count(*)::int from audit.audit_event
            where action = 'chat.reported' and after::text like '%Rude words%'), 0,
  'The audit never holds the words.');
select is((select count(*)::int from audit.action_registry
            where action in ('chat.reported', 'chat.report_resolved', 'chat.user_blocked', 'chat.user_unblocked')), 4,
  'All four actions are registered.');
select is((select count(*)::int from public.fn_wiring_check() w where w.severity = 'critical'
             and (w.finding like '%rpc\_chat\_%' or w.finding like '%chat\_report%' or w.finding like '%user\_block%')), 0,
  'The wiring check finds nothing in the new functions and tables.');

select * from finish();
rollback;
