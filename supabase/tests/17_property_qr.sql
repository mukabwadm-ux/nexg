-- The QR channel, tested against the ways it would quietly lie.
--
-- The numbers this system produces decide which merchants get
-- recruited and which placement a host is told to use. So the tests
-- that matter are not "does a scan insert a row" — they are the ones
-- that stop a number being wrong in a way nobody would notice: a
-- host's own test scan counted as demand, a replayed token claiming
-- somebody else's order, the counter card taking credit for the
-- fridge card's work.

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create temp table t (k text primary key, v text);

/* The suite builds its own cards, so it starts from a board with
   none. The local seed and any hand-made card would otherwise
   collide with the one-card-per-spot rule and the counts below. */
delete from public.qr_scan;
delete from public.qr_miss;
delete from public.property_qr;
delete from public.qr_pack;

-- ─────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-00000000000a'::uuid,
        'authenticated', 'authenticated', 'qr.staff@test.local', '', now(), now(), now())
on conflict (id) do nothing;

insert into public.staff_user (id, user_id, email, display_name)
values ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a'::uuid,
        'qr.staff@test.local', 'QR Staff')
on conflict (id) do nothing;

/* Partnerships reaches hospitality in every city, which is who
   generates cards for a host who has not signed in yet. */
insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'f0000000-0000-4000-8000-000000000001', r.id,
       'f0000000-0000-4000-8000-000000000001',
       (select id from public.staff_user where id <> 'f0000000-0000-4000-8000-000000000001' limit 1)
from public.role r where r.key = 'partnerships'
on conflict do nothing;

/* Act as them for the whole suite: these RPCs are written to refuse
   an anonymous caller, and testing them as the owner would test
   nothing. */
select set_config('request.jwt.claims',
  json_build_object('sub', 'e0000000-0000-4000-8000-00000000000a',
                    'role', 'authenticated')::text, true);

-- ══════════════════════════════════ the code itself

select matches(public.fn_qr_new_code(), '^NXG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$',
  'A generated code is NXG- plus six characters from the no-look-alike alphabet.');

select is(
  (select count(*)::int from (select public.fn_qr_new_code() as c from generate_series(1, 200)) g
   where g.c ~ '[01OILU]'),
  0,
  'Two hundred codes and not one contains a character that reads as another in print.');

select is(
  (select count(distinct c)::int from (select public.fn_qr_new_code() as c from generate_series(1, 200)) g),
  200,
  'Two hundred codes, two hundred distinct.');

-- ═════════════════════════════════════ generating a card

insert into t (k, v) select 'unit', (select id::text from public.unit where status = 'live' order by name limit 1);

insert into t (k, v) select 'counter',
  (public.rpc_qr_generate('unit', (select v::uuid from t where k = 'unit'), 'counter') ->> 'code');

select ok((select v from t where k = 'counter') is not null,
  'A card can be generated for a live unit.');

select is(
  (select label from public.property_qr where code = (select v from t where k = 'counter')),
  (select label_public from public.unit where id = (select v::uuid from t where k = 'unit')),
  'The card freezes the label it was printed with.');

select ok(
  (select secret_hash from public.property_qr where code = (select v from t where k = 'counter')) is not null,
  'Every card gets its own signing secret.');

select isnt(
  (select secret_hash from public.property_qr where code = (select v from t where k = 'counter')),
  (select secret_hash from public.property_qr
    where code = (public.rpc_qr_generate('unit', (select v::uuid from t where k = 'unit'), 'door') ->> 'code')),
  'Two cards on the same unit do not share a secret.');

select throws_ok(
  format($$ select public.rpc_qr_generate('unit', %L, 'counter') $$,
         (select v from t where k = 'unit')),
  null,
  'A second live card in the same spot is refused — two cards there and neither number means anything.');

insert into t (k, v) select 'fridge',
  (public.rpc_qr_generate('unit', (select v::uuid from t where k = 'unit'), 'fridge') ->> 'code');

select ok((select v from t where k = 'fridge') is not null,
  'But a second card in a different spot is exactly the point.');

-- ══════════════════════════════════════════ resolving

insert into t (k, v) select 'scan1',
  public.rpc_resolve_qr((select v from t where k = 'counter'), null,
    '{"ua_family":"Chrome","is_mobile":true}'::jsonb, 'camera', 'KE')::text;

select is(((select v from t where k = 'scan1')::jsonb ->> 'ok')::boolean, true,
  'A live card resolves.');

select ok(((select v from t where k = 'scan1')::jsonb ->> 'scan_token') is not null,
  'And hands back a signed token.');

select ok(((select v from t where k = 'scan1')::jsonb ->> 'session_id') is not null,
  'And mints a session when the browser had none.');

select is(
  (select outcome::text from public.qr_scan
    where code = (select v from t where k = 'counter') order by id desc limit 1),
  'landed',
  'The scan is recorded at the top of the funnel.');

select is(
  (select scans from public.property_qr where code = (select v from t where k = 'counter')),
  1,
  'And the card counts it.');

-- A code that is not ours is not a property scan and must not land
-- in the table that counts property scans.
select is(
  (public.rpc_resolve_qr('NXG-ZZZZZZ') ->> 'reason'),
  'not_found',
  'A code nobody issued resolves to not_found.');

select is(
  (select count(*)::int from public.qr_scan where code = 'NXG-ZZZZZZ'),
  0,
  'And writes no scan row — a miss has no property, and would skew every count it touched.');

select is(
  (select count(*)::int from public.qr_miss where code_attempted = 'NXG-ZZZZZZ'),
  1,
  'It is recorded where you look for somebody walking the keyspace.');

-- ═══════════════════════════════════════ the funnel

select is(
  (public.rpc_qr_scan_progress((select v from t where k = 'scan1')::jsonb ->> 'scan_token', 'browsed') ->> 'ok')::boolean,
  true,
  'A session can advance to browsed.');

select is(
  (public.rpc_qr_scan_progress((select v from t where k = 'scan1')::jsonb ->> 'scan_token', 'cart') ->> 'ok')::boolean,
  true,
  'And to cart.');

select is(
  (public.rpc_qr_scan_progress((select v from t where k = 'scan1')::jsonb ->> 'scan_token', 'browsed') ->> 'unchanged')::boolean,
  true,
  'The funnel never runs backwards.');

select throws_ok(
  format($$ select public.rpc_qr_scan_progress(%L, 'ordered') $$,
         (select v from t where k = 'scan1')::jsonb ->> 'scan_token'),
  null,
  'A browser cannot declare an order — that is the order service''s to write.');

-- ═══════════════════════════════════════ attribution

/* The same session now scans the fridge card and orders. */
insert into t (k, v) select 'scan2',
  public.rpc_resolve_qr(
    (select v from t where k = 'fridge'),
    (select v from t where k = 'scan1')::jsonb ->> 'session_id',
    '{"ua_family":"Chrome"}'::jsonb, 'camera', 'KE')::text;

insert into t (k, v) select 'attr',
  public.fn_qr_attribute_order('NX-TEST-1',
    (select v from t where k = 'scan2')::jsonb ->> 'scan_token',
    (select v from t where k = 'scan2')::jsonb ->> 'session_id')::text;

select is(((select v from t where k = 'attr')::jsonb ->> 'ok')::boolean, true,
  'An order carrying a valid token is attributed.');

select is(((select v from t where k = 'attr')::jsonb ->> 'source'), 'qr',
  'Inside the window it is a QR order.');

select is(
  ((select v from t where k = 'attr')::jsonb -> 'delivery_context' ->> 'placement'),
  'fridge',
  'The most recent scan wins: the fridge card gets the order, not the counter card it followed.');

select is(
  (select orders from public.property_qr where code = (select v from t where k = 'counter')),
  0,
  'And the counter card is not credited with work it did not do.');

select is(
  (select outcome::text from public.qr_scan
    where code = (select v from t where k = 'fridge') order by id desc limit 1),
  'ordered',
  'The scan row carries the outcome.');

select is(
  (public.fn_qr_attribute_order('NX-TEST-2',
     (select v from t where k = 'scan2')::jsonb ->> 'scan_token',
     'a-different-session') ->> 'reason'),
  'session_mismatch',
  'A token presented by another session is refused — otherwise anyone could claim anyone''s order.');

select is(
  (public.fn_qr_attribute_order('NX-TEST-3', 'not-a-real-token', null) ->> 'reason'),
  'unknown_token',
  'And an invented token buys nothing.');

-- ════════════════════════════════ test scans stay out

select is(
  (public.rpc_qr_test_scan(
     (select id from public.property_qr where code = (select v from t where k = 'counter'))) ->> 'ok')::boolean,
  true,
  'A host can check their own card works.');

select is(
  (select count(*)::int from public.qr_scan
    where code = (select v from t where k = 'counter') and is_test),
  1,
  'The test scan is recorded,');

/* The daily roll-up is where every report reads from, so the filter
   has to hold there rather than in each reader. */
refresh materialized view public.qr_scan_daily_v;

select is(
  (select coalesce(sum(scans), 0)::int from public.qr_scan_daily_v
    where code = (select v from t where k = 'counter')),
  1,
  'but it is filtered out of the numbers the host is checking.');

-- ════════════════════════════════════ replacing a card

insert into t (k, v) select 'replaced',
  public.rpc_qr_replace(
    (select id from public.property_qr where code = (select v from t where k = 'counter')),
    'Host moved the card to the fridge and wants a fresh one.')::text;

select isnt(
  ((select v from t where k = 'replaced')::jsonb ->> 'code'),
  (select v from t where k = 'counter'),
  'Replacing issues a new code.');

select is(
  (public.rpc_resolve_qr((select v from t where k = 'counter')) ->> 'reason'),
  'replaced',
  'The old card still resolves — to an explanation, because it is still on somebody''s counter.');

select is(
  (select outcome::text from public.qr_scan
    where code = (select v from t where k = 'counter') order by id desc limit 1),
  'voided',
  'And that scan is logged, which is how "the old card is still out there" gets noticed.');

select * from finish();
rollback;
