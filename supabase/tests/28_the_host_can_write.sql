-- The host portal's write path.
--
-- A read that returns nothing looks like a quiet day. A write
-- that silently succeeds for the wrong person is worse, so
-- these ask the questions in that order:
--
--   * can a host write their own things
--   * can a host write somebody else's — the one that matters
--   * do the refusals that exist for a reason actually refuse:
--     a package inside its lead time, a property with bookings
--     still to come, an accent colour nobody can read
--   * is a host's money the same number Finance sees
--
-- The last one is why host money went onto the ledger at all.
-- Two figures derived independently from the same events drift,
-- and the first anybody hears of it is a host saying they were
-- charged twice.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create temp table t (k text primary key, v text);
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

insert into t (k, v) values
  ('user_a', (select u.id::text from auth.users u where u.email = 'host.live@nexgapp.com')),
  ('host_a', (select hu.host_id::text from public.host_user hu
               join auth.users u on u.id = hu.user_id
              where u.email = 'host.live@nexgapp.com')),
  ('host_b', (select h.id::text from public.host h
              where h.display_name = '[Riverine Collection]')),
  ('merch_user', (select mu.user_id::text from public.merchant_user mu limit 1));

insert into t (k, v) select 'unit_a',
  (select id::text from public.unit
    where host_id = (select v::uuid from t where k = 'host_a')
      and archived_at is null limit 1);

select isnt((select v from t where k = 'host_a'), null, 'The live seed host exists.');
select isnt((select v from t where k = 'unit_a'), null, 'And has a unit to write against.');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k = 'user_a'),
                    'role', 'authenticated')::text, true);

-- ══════════════════ 1. a host writes their own

select is(
  (public.rpc_property_upsert((select v::uuid from t where k = 'host_a'),
    '{"name":"Test Block","kind":"apartment_block","area":"Lavington"}'::jsonb)).name,
  'Test Block',
  'A host can add a property. The portal read for a week before it could do this, which is a '
  'report rather than a portal.');

select isnt(
  (public.rpc_host_referral_link((select v::uuid from t where k = 'host_a')) ->> 'code'),
  null,
  'A host can issue their referral code.');

select is(
  (public.rpc_host_referral_link((select v::uuid from t where k = 'host_a')) ->> 'code'),
  (public.rpc_host_referral_link((select v::uuid from t where k = 'host_a')) ->> 'code'),
  'Twice, and it is the same code. One that changed on a second press would break the link '
  'somebody had already sent to three people.');

select is(
  (public.rpc_host_request_create((select v::uuid from t where k = 'host_a'),
    '{"title":"Lift out of service","priority":"high","type":"access"}'::jsonb)).priority,
  'high',
  'A host can raise their own request. Until now one could only arrive from a guest or NexG, '
  'which left a host with a broken lift and nowhere to put it.');

select ok(
  (public.rpc_host_request_create((select v::uuid from t where k = 'host_a'),
    '{"title":"Towels","priority":"medium","type":"amenities"}'::jsonb)).due_at
    between now() + interval '110 minutes' and now() + interval '130 minutes',
  'The clock comes from the priority rules, not from the caller. A client that set its own '
  'due time could promise itself fifteen minutes on a recommendation.');

select is(
  (public.rpc_stay_upsert((select v::uuid from t where k = 'host_a'),
    jsonb_build_object('unit_id', (select v from t where k = 'unit_a'),
      'guest_first_name', 'Test',
      'check_in', (now() + interval '40 days')::text,
      'check_out', (now() + interval '43 days')::text))).guest_first_name,
  'Test',
  'A host can enter a booking by hand, which is how a direct guest gets a QR link at all.');

select is(
  (public.rpc_host_package_upsert((select v::uuid from t where k = 'host_a'),
    '{"name":"My basket","price":"2500","lead_hours":"12"}'::jsonb)).host_id,
  (select v::uuid from t where k = 'host_a'),
  'A host can create their own package, and it is theirs rather than the city catalogue''s.');

-- ══════════════════ 2. a host cannot write anybody else's

select throws_ok(
  format($$ select public.rpc_property_upsert(%L::uuid, '{"name":"Not mine"}'::jsonb) $$,
         (select v from t where k = 'host_b')),
  '42501',
  null,
  'A host cannot add a property to another host''s account. The RPC checks membership rather '
  'than trusting the id it was handed — a server action is still just an HTTP endpoint.');

select throws_ok(
  format($$ select public.rpc_host_request_create(%L::uuid, '{"title":"x"}'::jsonb) $$,
         (select v from t where k = 'host_b')),
  '42501', null,
  'Nor raise a request against one.');

select throws_ok(
  format($$ select public.rpc_host_referral_link(%L::uuid) $$,
         (select v from t where k = 'host_b')),
  '42501', null,
  'Nor mint their referral code, which would reroute their rewards.');

select throws_ok(
  format($$ select public.rpc_host_settings_update(%L::uuid, '{"display_name":"x"}'::jsonb) $$,
         (select v from t where k = 'host_b')),
  '42501', null,
  'Nor rename their business.');

-- ══════════════════ 3. the refusals that exist for a reason

select throws_ok(
  format($$ select public.rpc_package_schedule(%L::uuid, %L::uuid,
             (select id from public.welcome_package where lead_hours > 2 limit 1),
             now() + interval '30 minutes') $$,
         (select v from t where k = 'host_a'), (select v from t where k = 'unit_a')),
  '22023', null,
  'A package cannot be scheduled inside its lead time. Refusing now is the point; the '
  'alternative is telling a guest at check-in.');

select throws_ok(
  $$ select public.rpc_user_theme_set('{"theme":"custom","accent":"#FFE08A"}'::jsonb) $$,
  '22023', null,
  'An accent too light for white text is refused. That is a readability floor, not a '
  'preference, so it lives in the database rather than in one of the clients.');

select is(
  (public.rpc_user_theme_set('{"theme":"custom","accent":"#1F3A5F"}'::jsonb)).accent,
  '#1F3A5F',
  'A dark enough one is accepted.');

select throws_ok(
  $$ select public.rpc_stay_upsert(
       (select v::uuid from t where k = 'host_a'),
       jsonb_build_object('unit_id', (select v from t where k = 'unit_a'),
         'check_in', (now() + interval '3 days')::text,
         'check_out', (now() + interval '1 day')::text)) $$,
  '22023', null,
  'Check-out before check-in is refused rather than stored as a negative stay.');

select throws_ok(
  format($$ select public.rpc_calendar_connect(%L::uuid,
             '{"provider":"airbnb","url":"http://airbnb.com/x.ics"}'::jsonb) $$,
         (select v from t where k = 'host_a')),
  '22023', null,
  'An http iCal feed is refused: it would send the host''s booking dates in the clear.');

select is(
  (public.rpc_calendar_connect((select v::uuid from t where k = 'host_a'),
    '{"provider":"airbnb","url":"https://airbnb.com/x.ics"}'::jsonb)).status,
  'pending',
  'A new calendar saves as pending, never as ok. A green tick before anything had read the '
  'feed would have a host stop entering bookings by hand for nothing.');

select is(
  (public.rpc_calendar_connect((select v::uuid from t where k = 'host_a'),
    '{"provider":"airbnb","url":"https://airbnb.com/y.ics"}'::jsonb)).url,
  null,
  'And the feed URL is never returned. Anyone holding it can read the booking dates.');

-- ══════════════════ 4. an overlap is flagged, not refused

select ok(
  (public.rpc_stay_upsert((select v::uuid from t where k = 'host_a'),
    jsonb_build_object('unit_id', (select v from t where k = 'unit_a'),
      'guest_first_name', 'Clash',
      'check_in', (now() + interval '41 days')::text,
      'check_out', (now() + interval '42 days')::text))).conflict_flagged,
  'Two bookings in one unit saves and flags. A host who knows a guest is extending needs to '
  'be able to write it down; what they must not get is silence.');

-- ══════════════════ 5. a merchant can write none of it

select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k = 'merch_user'),
                    'role', 'authenticated')::text, true);

select throws_ok(
  format($$ select public.rpc_property_upsert(%L::uuid, '{"name":"x"}'::jsonb) $$,
         (select v from t where k = 'host_a')),
  '42501', null,
  'A merchant holds an `authenticated` token like a host does, and can write none of this.');

-- ══════════════════ 6. the money agrees with Finance

reset role;

insert into public.host_invoice (host_id, period, lines, subtotal, total, status, due_at)
values ((select v::uuid from t where k = 'host_a'), date_trunc('month', now())::date,
        '[]'::jsonb, 450000, 450000, 'sent', now() + interval '14 days');

update public.host_referral set reward_status = 'credited', reward_amount_kes = 3000
 where id = (select id from public.host_referral
              where referrer_host_id = (select v::uuid from t where k = 'host_a')
                and reward_status = 'pending' limit 1);

select is(
  (select receivable_cents from public.finance_host_v
    where host_id = (select v::uuid from t where k = 'host_a')),
  450000::numeric,
  'Issuing an invoice posts a receivable the Finance console can see. It could not see a host '
  'at all before: `host_invoice` was a standalone table nothing in Finance read.');

select is(
  (select credit_payable_cents from public.finance_host_v
    where host_id = (select v::uuid from t where k = 'host_a')),
  300000::numeric,
  'A credited referral posts a payable, in cents. The reward is held in whole shillings, and '
  'the conversion happens once — rider pay once added shillings to cents and put every rider '
  'a hundred times over their cash cap.');

select is(
  (select count(*)::int from public.host_money_reconciliation_v where disagrees),
  0,
  'And no host''s ledger disagrees with the tables it was built from. This is the assertion '
  'the whole exercise exists for: one source, checked, rather than two that drift until '
  'somebody is billed twice and we find out from them.');

select * from finish();
rollback;
