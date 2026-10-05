-- Messaging, tested at the boundary that matters.
--
-- Almost everything in this module is recoverable. One thing is
-- not: showing a guest something written about them. An agent
-- types "this one is a chancer, third refund this month" into
-- what they believe is an internal note, and if the visibility
-- rule has drifted the guest reads it. There is no undoing that
-- — not with a redaction, not with an apology.
--
-- So most of what follows is that one question asked from
-- several directions: as the guest, as a staff member who is
-- not in the thread, as an escalated team who is, and through
-- the view the console actually reads.

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create temp table t (k text primary key, v text);
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

-- ─────────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-0000000000d1',
   'authenticated','authenticated','desk.a@test.local','',now(),now(),now(),'','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-0000000000d2',
   'authenticated','authenticated','dispatch.a@test.local','',now(),now(),now(),'','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-0000000000d3',
   'authenticated','authenticated','guest.a@test.local','',now(),now(),now(),'','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-0000000000d4',
   'authenticated','authenticated','nosy@test.local','',now(),now(),now(),'','','','','','','','')
on conflict (id) do nothing;

insert into public.staff_user (id, user_id, email, display_name) values
  ('e2000000-0000-4000-8000-0000000000d1','e1000000-0000-4000-8000-0000000000d1','desk.a@test.local','[Desk]'),
  ('e2000000-0000-4000-8000-0000000000d2','e1000000-0000-4000-8000-0000000000d2','dispatch.a@test.local','[Dispatch]'),
  ('e2000000-0000-4000-8000-0000000000d4','e1000000-0000-4000-8000-0000000000d4','nosy@test.local','[Merchant ops]')
on conflict (id) do nothing;

insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'e2000000-0000-4000-8000-0000000000d1', r.id,
  'e2000000-0000-4000-8000-0000000000d2','e2000000-0000-4000-8000-0000000000d4'
from public.role r where r.key = 'concierge_agent' on conflict do nothing;

insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'e2000000-0000-4000-8000-0000000000d4', r.id,
  'e2000000-0000-4000-8000-0000000000d1','e2000000-0000-4000-8000-0000000000d2'
from public.role r where r.key = 'merchant_ops' on conflict do nothing;

insert into public.guest (id, user_id, phone, name)
values ('e3000000-0000-4000-8000-0000000000d3','e1000000-0000-4000-8000-0000000000d3',
        '+254700000961','[Guest] Test')
on conflict (id) do nothing;

insert into public.msg_presence (staff_user_id, state, capacity, active_count)
values ('e2000000-0000-4000-8000-0000000000d1','online',4,0)
on conflict (staff_user_id) do update set state='online', active_count=0, capacity=4;

-- ═══════════════════════════════════════ 1. routing, before anyone types

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

insert into t (k, v) select 'conv',
  public.rpc_msg_start('external', '[Guest] Test · My order', 'my_order', 'web',
    (select id from public.city where slug = 'nairobi'),
    'e3000000-0000-4000-8000-0000000000d3',
    'order', (select id from public.order limit 1), 'NX-TEST') ->> 'conversation_id';

select is(
  (select priority::text from public.msg_conversation where id = (select v::uuid from t where k='conv')),
  'urgent',
  'A chat about a live order is urgent before anybody reads it.');

select is(
  (select owner_team from public.msg_conversation where id = (select v::uuid from t where k='conv')),
  'dispatch',
  'And it is routed to the people who can actually move a rider.');

select ok(
  (select first_response_due_at < now() + interval '70 seconds'
     from public.msg_conversation where id = (select v::uuid from t where k='conv')),
  'With a 60-second clock on it, not the default two minutes.');

insert into t (k, v) select 'plain',
  public.rpc_msg_start('external', 'Someone asking about nothing in particular',
    'something_else', 'web') ->> 'conversation_id';

select is(
  (select owner_team || '/' || priority::text from public.msg_conversation
    where id = (select v::uuid from t where k='plain')),
  'concierge/normal',
  'Anything unmatched still reaches the desk rather than falling on the floor.');

-- ══════════════════════════════════════════════ 2. taking it

select is(
  public.rpc_msg_take((select v::uuid from t where k='conv')) ->> 'ok',
  'true',
  'A desk agent can take an unassigned conversation.');

select lives_ok(
  format($$select public.rpc_msg_send(%L, 'Your rider is six minutes away.', 'external', 'tap-1')$$,
         (select v from t where k='conv')),
  'And reply to the guest.');

select lives_ok(
  format($$select public.rpc_msg_send(%L, 'Security is holding him at the gate.', 'internal', 'tap-2')$$,
         (select v from t where k='conv')),
  'And write an internal note beside it.');

/* The retry. Same key, same conversation, one message. */
select is(
  (public.rpc_msg_send((select v::uuid from t where k='conv'),
    'Your rider is six minutes away.', 'external', 'tap-1') ->> 'repeat')::boolean,
  true,
  'Pressing send twice on a bad connection sends once.');

select is(
  (select count(*)::int from public.msg_message
    where conversation_id = (select v::uuid from t where k='conv')
      and idempotency_key = 'tap-1'),
  1,
  'There is one of it, not two.');

/*
 * The same key in a different conversation is a different
 * message. This was global at first, so a client numbering its
 * retries per thread would have had a send answered by a
 * message already sitting in another conversation — ok:true, a
 * message id, and nothing delivered.
 */
select lives_ok(
  format($$select public.rpc_msg_send(%L, 'A different thread entirely.', 'external', 'tap-1')$$,
         (select v from t where k='plain')),
  'The same key in another conversation is another message.');

-- ═══════════════════════════ 3. escalation does not hand over the guest

insert into t (k, v) select 'thread',
  public.rpc_msg_escalate((select v::uuid from t where k='conv'), null,
    'e2000000-0000-4000-8000-0000000000d2', 'Security hold', false) ->> 'thread_id';

select isnt((select v from t where k='thread'), null, 'Escalating opens an internal thread.');

select is(
  public.rpc_msg_escalate((select v::uuid from t where k='conv'), null,
    'e2000000-0000-4000-8000-0000000000d2', 'again', false) ->> 'thread_id',
  (select v from t where k='thread'),
  'Escalating twice reuses it — three people escalating one stuck order land in one room.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);

select ok(
  (select count(*) from public.msg_message_v
    where conversation_id = (select v::uuid from t where k='conv')) >= 3,
  'The escalated person can read the guest conversation, internal notes included.');

select throws_matching(
  format($$select public.rpc_msg_send(%L, 'Hi, dispatch here', 'external', 'tap-3')$$,
         (select v from t where k='conv')),
  'not to answer the guest',
  'But cannot reply to the guest — the desk agent stays the one voice they hear.');

select lives_ok(
  format($$select public.rpc_msg_send(%L, 'Called the desk, he is released.', 'internal', 'tap-4')$$,
         (select v from t where k='thread')),
  'They answer inside the thread instead.');

-- ═══════════════════════════════ 4. what the guest can see
--
-- Asked through `msg_message_v`, which is the view the product
-- reads, rather than the table — so this tests the thing that
-- is actually rendered.

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.msg_message_v
    where conversation_id = (select v::uuid from t where k='conv')
      and visibility = 'internal'),
  0,
  'A guest sees no internal message in their own conversation. Ever.');

select ok(
  (select count(*) from public.msg_message_v
    where conversation_id = (select v::uuid from t where k='conv')
      and visibility = 'external') >= 2,
  'They do see the conversation they are having.');

select is(
  (select count(*)::int from public.msg_message_v
    where conversation_id = (select v::uuid from t where k='thread')),
  0,
  'And nothing at all of the internal thread about them.');

select is(
  (select count(*)::int from public.msg_conversation
    where id = (select v::uuid from t where k='plain')),
  0,
  'Nor any sight of somebody else’s conversation.');

/*
 * Zero rows rather than a refusal, and that is the most this
 * can be. A guest and a desk agent are both `authenticated`, so
 * a table grant cannot tell them apart — RLS is the only
 * mechanism, and RLS filters rather than refuses.
 *
 * Elsewhere (guest_place) the grant was revoked from `anon`
 * outright, because there an empty set is indistinguishable
 * from "nothing saved". Here it is not ambiguous: a guest has
 * no reason to expect presence data at all, so an empty set
 * carries no false meaning.
 */
select is(
  (select count(*)::int from public.msg_presence),
  0,
  'Nor which agents are online — a support tool is not a staff tracker.');

-- ═════════════════ 5. staff who are not in the thread see no notes
--
-- The quieter half of the same rule. A concierge agent must be
-- able to pick up any unassigned chat, so they can read the
-- queue — but reading the queue is not reading the notes.

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.msg_message_v
    where conversation_id = (select v::uuid from t where k='conv')
      and visibility = 'internal'),
  0,
  'A staff member who is not in the conversation reads none of its internal notes.');

-- ══════════════════════════════════ 6. resolving, and the tag

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

select throws_matching(
  format($$select public.rpc_msg_resolve(%L, null, null, null)$$,
         (select v from t where k='conv')),
  'Tag it before resolving',
  'Resolving without a topic is refused — the tag is the only signal this module produces.');

select is(
  public.rpc_msg_resolve((select v::uuid from t where k='conv'),
    'my_order', 'hotel access · security hold', 'Rider held at the gate') ->> 'ok',
  'true',
  'With one, it resolves.');

select is(
  (select subtopic from public.msg_topic_tag
    where conversation_id = (select v::uuid from t where k='conv')),
  'hotel access · security hold',
  'And the subtopic is kept, which is the part Insights can act on.');

-- ════════════════════════════════ 7. nothing is deleted or rewritten

reset role;

select throws_matching(
  format($$delete from public.msg_message where conversation_id = %L$$,
         (select v from t where k='conv')),
  'append-only',
  'A message cannot be deleted, even by the owner.');

select throws_matching(
  format($$update public.msg_message set body = 'something else'
            where conversation_id = %L and seq = 2$$,
         (select v from t where k='conv')),
  'cannot be edited',
  'Nor edited — a transcript quoted in a dispute has to stay quotable.');

select throws_matching(
  format($$update public.msg_message set visibility = 'external'
            where conversation_id = %L and visibility = 'internal'$$,
         (select v from t where k='conv')),
  'cannot change conversation, position or visibility',
  'And an internal note can never be turned into an external one after the fact.');

select * from finish();
rollback;
