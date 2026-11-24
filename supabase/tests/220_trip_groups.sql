-- Trip groups: only members read them, a link grants only what it should, a removed member loses access at once.

begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000', 'c2130000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'amina213@example.test', now(), now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', 'c2130000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'brian213@example.test', now(), now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', 'c2130000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'carol213@example.test', now(), now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', 'c2130000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dan213@example.test', now(), now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', 'c2130000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', null, null, now(), now(), true);

set local role authenticated;

-- ── Amina starts the group

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);

select set_config('t.created', public.rpc_trip_group_create('Diani trip', 'Amina')::text, true);
select set_config('t.group', current_setting('t.created')::jsonb ->> 'group_id', true);
select set_config('t.token', current_setting('t.created')::jsonb ->> 'invite_token', true);
select isnt(nullif(current_setting('t.group'), ''), null, 'A signed-in person starts a group.');
select throws_ok($$select public.rpc_trip_group_create('   ', 'Amina')$$, '22023', null, 'A group needs a name.');
select is(jsonb_array_length(public.rpc_trip_group_list() -> 'groups'), 1, 'Their list has the group.');
select is((public.rpc_trip_group_list() -> 'groups' -> 0 ->> 'is_admin')::boolean, true, 'Amina is the organiser.');
select is(public.rpc_trip_group_send(current_setting('t.group')::uuid, ' Hello Diani ', 'k-1') ->> 'repeat', 'false', 'She sends a message.');
select is(public.rpc_trip_group_send(current_setting('t.group')::uuid, 'Hello Diani', 'k-1') ->> 'repeat', 'true', 'The same key twice stores it once.');
select throws_ok($$select public.rpc_trip_group_send(current_setting('t.group')::uuid, '   ', 'k-2')$$, '22023', 'Write a message first.', 'An empty message is refused.');
select public.rpc_trip_group_share(current_setting('t.group')::uuid, 'stay', 'prop-1', 'Beach house', 'Sleeps 6', 'What about this?');
select is((public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages' -> 1 ->> 'kind'), 'link', 'A shared stay is a link card.');
select is((public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages' -> 1 -> 'links' -> 0 ->> 'title'), 'Beach house', 'The card carries its title.');
select throws_ok($$select public.rpc_trip_group_share(current_setting('t.group')::uuid, 'flight', 'x', 'x')$$, '22023', null, 'Only a stay, experience or plan can be shared.');
select throws_ok($$select public.rpc_trip_group_share(current_setting('t.group')::uuid, 'stay', 'x', 'x', null, null, '{"a":1}'::jsonb)$$, '22023', null, 'Only a plan carries its text.');
select lives_ok($$select public.rpc_trip_group_share(current_setting('t.group')::uuid, 'plan', 'plan-1', 'Day by day', null, null, '{"days":["Beach"]}'::jsonb)$$, 'A plan can carry its text.');

-- ── Brian joins by the link

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}', true);

select is(public.rpc_trip_group_preview(current_setting('t.token')) ->> 'name', 'Diani trip', 'The link shows the group''s name.');
select throws_ok($$select public.rpc_trip_group_preview('nope')$$, '22023', 'This invite link no longer works.', 'A wrong link shows nothing.');
select is(public.rpc_trip_group_join(current_setting('t.token'), 'Brian') ->> 'joined', 'true', 'Brian joins.');
select is(public.rpc_trip_group_join(current_setting('t.token'), 'Brian') ->> 'joined', 'false', 'Joining twice changes nothing.');
select is((select count(*)::int from public.msg_message where conversation_id = current_setting('t.group')::uuid), 4, 'Members can read through the table.');
select is(jsonb_array_length(public.rpc_trip_group_messages(current_setting('t.group')::uuid) -> 'messages'), 4, 'He sees the conversation so far.');
select throws_ok($$select public.rpc_trip_group_invite(current_setting('t.group')::uuid)$$, '42501', null, 'A member cannot make a link.');
select throws_ok($$select public.rpc_trip_group_remove(current_setting('t.group')::uuid, 'c2130000-0000-4000-8000-000000000001')$$, '42501', null, 'A member cannot remove anyone.');
select is(public.rpc_trip_group_mute(current_setting('t.group')::uuid, true) ->> 'muted', 'true', 'He can mute the group.');
select is(jsonb_array_length(public.rpc_trip_group_members(current_setting('t.group')::uuid) -> 'members'), 2, 'Two people are in it.');
select is((public.rpc_trip_group_list() -> 'groups' -> 0 ->> 'unread')::int, 3, 'Unread is what Amina wrote.');
select public.rpc_trip_group_read(current_setting('t.group')::uuid);
select is((public.rpc_trip_group_list() -> 'groups' -> 0 ->> 'unread')::int, 0, 'Reading clears it.');

-- ── Dan, who is not in it

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":false}', true);

select throws_ok($$select public.rpc_trip_group_messages(current_setting('t.group')::uuid)$$, '42501', null, 'A stranger cannot read the group.');
select throws_ok($$select public.rpc_trip_group_send(current_setting('t.group')::uuid, 'hi', null)$$, '42501', null, 'Nor write to it.');
select throws_ok($$select public.rpc_trip_group_members(current_setting('t.group')::uuid)$$, '42501', null, 'Nor see who is in it.');
select is((select count(*)::int from public.msg_message where conversation_id = current_setting('t.group')::uuid), 0, 'Nor read it through the table.');
select is((select count(*)::int from public.msg_participant where conversation_id = current_setting('t.group')::uuid), 0, 'Nor see its members through the table.');
select is(jsonb_array_length(public.rpc_trip_group_list() -> 'groups'), 0, 'Their list is empty.');
select throws_ok($$select public.rpc_trip_group_join('not-a-link', 'Dan')$$, '22023', null, 'A made-up link grants nothing.');

-- ── a temporary session is not an account

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000005","role":"authenticated","is_anonymous":true}', true);

select throws_ok($$select public.rpc_trip_group_create('Mine', 'Guest')$$, '42501', null, 'A temporary session cannot start a group.');
select throws_ok($$select public.rpc_trip_group_join(current_setting('t.token'), 'Guest')$$, '42501', null, 'Nor join one.');

-- ── Carol joins, then is removed

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}', true);
select is(public.rpc_trip_group_join(current_setting('t.token'), 'Carol') ->> 'joined', 'true', 'Carol joins.');

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select is(public.rpc_trip_group_remove(current_setting('t.group')::uuid, 'c2130000-0000-4000-8000-000000000003') ->> 'ok', 'true', 'The organiser removes her.');
select throws_ok($$select public.rpc_trip_group_remove(current_setting('t.group')::uuid, 'c2130000-0000-4000-8000-000000000001')$$, '22023', null, 'The organiser cannot remove themselves.');

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.rpc_trip_group_messages(current_setting('t.group')::uuid)$$, '42501', null, 'A removed member loses access at once.');
select is((select count(*)::int from public.msg_message where conversation_id = current_setting('t.group')::uuid), 0, 'Also through the table.');
select is(jsonb_array_length(public.rpc_trip_group_list() -> 'groups'), 0, 'The group leaves their list.');
select throws_ok($$select public.rpc_trip_group_join(current_setting('t.token'), 'Carol')$$, '42501', null, 'The link will not let a removed member back.');

-- ── links: replaced, turned off, expired

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select set_config('t.token2', public.rpc_trip_group_invite(current_setting('t.group')::uuid) ->> 'invite_token', true);
select isnt(current_setting('t.token2'), current_setting('t.token'), 'A new link is made.');

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.rpc_trip_group_join(current_setting('t.token'), 'Dan')$$, '22023', 'This invite link no longer works.', 'The old link stops working when a new one is made.');

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select public.rpc_trip_group_invite_revoke(current_setting('t.group')::uuid);
select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.rpc_trip_group_join(current_setting('t.token2'), 'Dan')$$, '22023', null, 'A turned-off link grants nothing.');

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select set_config('t.token3', public.rpc_trip_group_invite(current_setting('t.group')::uuid) ->> 'invite_token', true);
reset role;
update public.trip_group set invite_expires_at = now() - interval '1 minute' where id = current_setting('t.group')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.rpc_trip_group_join(current_setting('t.token3'), 'Dan')$$, '22023', null, 'An expired link grants nothing.');

-- ── leaving, rejoining

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.rpc_trip_group_leave(current_setting('t.group')::uuid)$$, '22023', null, 'The organiser cannot leave.');
select set_config('t.token4', public.rpc_trip_group_invite(current_setting('t.group')::uuid) ->> 'invite_token', true);

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}', true);
select is(public.rpc_trip_group_leave(current_setting('t.group')::uuid) ->> 'ok', 'true', 'A member leaves.');
select throws_ok($$select public.rpc_trip_group_messages(current_setting('t.group')::uuid)$$, '42501', null, 'After leaving they read nothing.');
select is(public.rpc_trip_group_join(current_setting('t.token4'), 'Brian') ->> 'joined', 'true', 'They can rejoin with a working link.');
select is(jsonb_array_length(public.rpc_trip_group_list() -> 'groups'), 1, 'The group is back on their list.');

-- ── closing

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select is(public.rpc_trip_group_close(current_setting('t.group')::uuid) ->> 'ok', 'true', 'The organiser closes the group.');
select throws_ok($$select public.rpc_trip_group_send(current_setting('t.group')::uuid, 'still here?', null)$$, '55000', 'This group is closed.', 'Nobody can write to a closed group.');
select lives_ok($$select public.rpc_trip_group_messages(current_setting('t.group')::uuid)$$, 'Members can still read it.');

select set_config('request.jwt.claims', '{"sub":"c2130000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.rpc_trip_group_join(current_setting('t.token4'), 'Dan')$$, '22023', null, 'A closed group''s link grants nothing.');

select * from finish();
rollback;
