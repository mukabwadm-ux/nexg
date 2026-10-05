-- Settings, tested against the ways a number could change quietly.
--
-- The module's whole claim is that nothing in this platform changes
-- a live figure silently. So the tests are not "can I save a value"
-- — they are the five ways that claim could be false: a change that
-- applies without a second person, a price that moves mid-afternoon,
-- a scheduled change that leaks into today, a past order that
-- reprices itself when the fee moves, and a rollback that erases the
-- thing it undid.

begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

create temp table t (k text primary key, v text);

-- ─────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000005a',
   'authenticated','authenticated','fin@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000005b',
   'authenticated','authenticated','ops@test.local','',now(),now(),now())
on conflict (id) do nothing;

insert into public.staff_user (id, user_id, email, display_name)
values
  ('f0000000-0000-4000-8000-00000000005a','e0000000-0000-4000-8000-00000000005a','fin@test.local','Finance One'),
  ('f0000000-0000-4000-8000-00000000005b','e0000000-0000-4000-8000-00000000005b','ops@test.local','Ops Two')
on conflict (id) do nothing;

/* A role grant needs a granter and a different approver — the Staff
   build enforces that, so the fixtures need three people, not two. */
insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'f0000000-0000-4000-8000-00000000005a', r.id,
       (select id from public.staff_user
         where id not in ('f0000000-0000-4000-8000-00000000005a',
                          'f0000000-0000-4000-8000-00000000005b') limit 1),
       'f0000000-0000-4000-8000-00000000005b'
from public.role r where r.key = 'finance' on conflict do nothing;

insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'f0000000-0000-4000-8000-00000000005b', r.id,
       (select id from public.staff_user
         where id not in ('f0000000-0000-4000-8000-00000000005a',
                          'f0000000-0000-4000-8000-00000000005b') limit 1),
       'f0000000-0000-4000-8000-00000000005a'
from public.role r where r.key = 'ops_manager' on conflict do nothing;

insert into t (k, v) select 'city', (select id::text from public.city where name = 'Nairobi');

-- ══════════════════════════════════ the registry is the gate

select ok(
  (select count(*) from settings.definition) > 40,
  'The registry knows about every field on the screens.');

/*
 * The rule is about what somebody is charged, not about what is
 * money-shaped. A delivery fee cannot move mid-afternoon; the
 * threshold at which Finance gets a low-float warning obviously can,
 * and scoping this to the groups that set prices is the difference
 * between a rule and a superstition.
 */
select is(
  (select count(*)::int from settings.definition
   where "group" in ('fees', 'settlement')
     and value_type in ('money', 'pct', 'int')
     and can_be_immediate),
  0,
  'No figure a price is computed from can take effect immediately.');

select ok(
  (select can_be_immediate from settings.definition where key = 'payouts.float_alert'),
  'A warning threshold can — nobody is charged it.');

select ok(
  (select can_be_immediate from settings.definition where key = 'fees.category_note'),
  'And so can the note explaining a commission, which is not the commission.');

select is(
  (settings.fn_get('a.key.nobody.registered') ->> 'unknown_key')::boolean,
  true,
  'An unregistered key says so, rather than resolving to a bare null a reader would price against.');

select is(
  (settings.fn_get('fees.commission', 'city_category',
     (select v::uuid from t where k = 'city'), null, 'food_drinks') ->> 'is_set')::boolean,
  false,
  'A commission nobody has set reports is_set false — the console shows [—] and the order service refuses.');

-- ═══════════════════════════════════════════ inheritance

select is(
  settings.fn_int('dispatch.accept_window_s', (select v::uuid from t where k = 'city')),
  20::bigint,
  'A city with no override inherits the registry default.');

select is(
  (settings.fn_get('fees.featured_eligible', 'city_category',
     (select v::uuid from t where k = 'city'), null, 'pharmacy') ->> 'value')::boolean,
  false,
  'A category-scoped value reaches every city.');

/* And a city override beats it. */
insert into settings.version (key, scope_kind, scope_city_id, scope_category, value, status, effective_from, activated_at)
values ('fees.featured_eligible', 'city_category',
        (select v::uuid from t where k = 'city'), 'pharmacy', 'true'::jsonb, 'active', now(), now());

select is(
  (settings.fn_get('fees.featured_eligible', 'city_category',
     (select v::uuid from t where k = 'city'), null, 'pharmacy') ->> 'value')::boolean,
  true,
  'A city override beats the category default — most specific wins.');

select is(
  (settings.fn_get('fees.featured_eligible', 'city_category',
     (select v::uuid from t where k = 'city'), null, 'pharmacy') ->> 'source'),
  'city_category',
  'And the answer says which scope it came from, because "where does this number come from" is the question.');

-- ════════════════════════════ drafting, as a finance person

select set_config('request.jwt.claims',
  json_build_object('sub', 'e0000000-0000-4000-8000-00000000005a', 'role', 'authenticated')::text, true);

select ok(settings.fn_may_edit('fees'), 'Finance may edit fees.');
select ok(not settings.fn_may_edit('legal'), 'Finance may not publish legal documents.');

insert into t (k, v) select 'cs',
  settings.rpc_change_set_open('fees', (select v::uuid from t where k = 'city')) ->> 'id';

select ok((select v from t where k = 'cs') is not null, 'A draft opens.');

select is(
  (settings.rpc_change_set_put((select v::uuid from t where k = 'cs'), 'fees.commission',
     '18'::jsonb, (select v::uuid from t where k = 'city'), null, 'food_drinks') ->> 'ok')::boolean,
  true,
  'A commission can be staged.');

select throws_ok(
  format($$ select settings.rpc_change_set_put(%L, 'fees.service_pct', '120'::jsonb, %L) $$,
         (select v from t where k = 'cs'), (select v from t where k = 'city')),
  null,
  'A percentage over 100 is refused by the registry, not by the form.');

select throws_ok(
  format($$ select settings.rpc_change_set_put(%L, 'not.a.setting', '1'::jsonb, %L) $$,
         (select v from t where k = 'cs'), (select v from t where k = 'city')),
  null,
  'A key the registry does not know is refused — that is what stops a typo becoming a setting.');

select is(
  (settings.rpc_change_set_put((select v::uuid from t where k = 'cs'), 'fees.cash_handling',
     '0'::jsonb, (select v::uuid from t where k = 'city')) ->> 'unchanged')::boolean,
  true,
  'Staging the value it already has is not a change, so the Unsaved count does not lie.');

-- ════════════════════════════════════════════ submitting

select throws_ok(
  format($$ select settings.rpc_change_set_submit(%L, null, true, 'incident') $$,
         (select v from t where k = 'cs')),
  null,
  'A set containing a price cannot be marked immediate.');

select is(
  (settings.rpc_change_set_submit((select v::uuid from t where k = 'cs')) ->> 'pair'),
  'finance+ops_manager',
  'The strictest key in the set decides who must approve.');

select ok(
  (select effective_from from settings.change_set where id = (select v::uuid from t where k = 'cs'))
    > now(),
  'And it is scheduled, not applied.');

select is(
  settings.fn_num('fees.commission', (select v::uuid from t where k = 'city'), 'food_drinks'),
  null,
  'Nothing has changed yet. Approval has not happened.');

-- ═══════════════════════════ the second person is a person

select throws_ok(
  format($$ select settings.rpc_change_set_approve(%L) $$, (select v from t where k = 'cs')),
  null,
  'The requester cannot approve their own change, whatever roles they hold.');

select set_config('request.jwt.claims',
  json_build_object('sub', 'e0000000-0000-4000-8000-00000000005b', 'role', 'authenticated')::text, true);

select is(
  (settings.rpc_change_set_approve((select v::uuid from t where k = 'cs')) ->> 'ok')::boolean,
  true,
  'Somebody else can.');

select is(
  settings.fn_num('fees.commission', (select v::uuid from t where k = 'city'), 'food_drinks'),
  null,
  'Approved is still not live: it waits for the effective time.');

-- ══════════════════════════════════════════ activation

update settings.version set effective_from = now() - interval '1 minute'
 where change_set_id = (select v::uuid from t where k = 'cs');

select ok(
  (settings.cron_activate() ->> 'activated')::int > 0,
  'The cron activates what is due.');

select is(
  settings.fn_num('fees.commission', (select v::uuid from t where k = 'city'), 'food_drinks'),
  18::numeric,
  'And now it is live.');

select is(
  (select status::text from settings.change_set where id = (select v::uuid from t where k = 'cs')),
  'applied',
  'The change set is closed out.');

/*
 * The property the whole design rests on: a change does not reach
 * backwards. An order priced yesterday must still reprice to
 * yesterday's number, or every statement ever issued becomes
 * unexplainable.
 */
select is(
  settings.fn_get('fees.commission', 'city_category',
    (select v::uuid from t where k = 'city'), null, 'food_drinks',
    now() - interval '1 day') ->> 'value',
  null,
  'Yesterday still resolves to yesterday''s value — a change does not reach backwards.');

select is(
  (select count(*)::int from settings.version
   where key = 'fees.commission' and scope_category = 'food_drinks' and status = 'active'),
  1,
  'Exactly one active version: two would be two answers to what something costs.');

-- ════════════════════════════════════════════ rollback

insert into t (k, v) select 'live_version',
  (select id::text from settings.version
    where key = 'fees.commission' and scope_category = 'food_drinks' and status = 'active');

select is(
  (settings.rpc_rollback((select v::uuid from t where k = 'live_version'),
     'Wrong number went out.') ->> 'ok')::boolean,
  true,
  'One person may roll back — going back to what the pair already agreed is not the same act as going forward.');

select is(
  settings.fn_num('fees.commission', (select v::uuid from t where k = 'city'), 'food_drinks'),
  null,
  'The value is back to unset, because that is what was true before.');

/* The change and the rollback. A staged row is promoted through
   draft → scheduled → active rather than copied, so one change is
   one row. */
select is(
  (select count(*)::int from settings.version
   where key = 'fees.commission' and scope_category = 'food_drinks'),
  2,
  'And nothing was deleted: both the change and the rollback are still there.');

select ok(
  (select rolled_back_from from settings.version
    where key = 'fees.commission' and scope_category = 'food_drinks' and status = 'active')
  is not null,
  'The rollback names what it undid, which is what buys it the one-person exemption.');

-- ════════════════════════════════════ secrets stay secret

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'integration_v' and column_name = 'secret_refs'),
  0,
  'The view the console reads has no secret_refs column at all — absent, not masked.');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'integration' and grantee = 'authenticated'),
  0,
  'And the table behind it is not granted, so there is no way round the view.');

-- ══════════════════════ the old readers still find their keys

select is(
  (select count(*)::int from public.setting where key = 'doc_grace_days'),
  1,
  'The nine migrations that read public.setting by name still resolve through the view.');


-- ════════════════════════ the payment incident switch

/*
 * The one control that may change what a guest sees without waiting
 * for midnight. Everything that makes that acceptable is tested
 * here, because the alternative to these checks is a database
 * console at 19:00 on a Friday.
 */
select set_config('request.jwt.claims',
  json_build_object('sub', 'e0000000-0000-4000-8000-00000000005a', 'role', 'authenticated')::text, true);

/* Independent of whatever state somebody left the console in. */
update public.payment_method
   set enabled = true, status = 'connected', disabled_reason = null
 where key = 'mpesa_stk';

select throws_ok(
  $$ select public.rpc_payment_method_toggle('mpesa_stk', false, '') $$,
  null,
  'A payment method cannot be switched off without a reason.');

select is(
  (public.rpc_payment_method_toggle('mpesa_stk', false,
     'Daraja callbacks failing — provider reports an incident.') ->> 'ok')::boolean,
  true,
  'With one, Finance can switch it off at once — a provider outage does not wait for midnight.');

select is(
  (select enabled from public.payment_method where key = 'mpesa_stk'),
  false,
  'And it is off.');

select is(
  (select disabled_reason from public.payment_method where key = 'mpesa_stk'),
  'Daraja callbacks failing — provider reports an incident.',
  'The reason is on the row, where the next person looks.');

select ok(
  exists (select 1 from audit.audit_event
          where action = 'payment_method.toggled' and severity = 'high'),
  'And it is a high-severity audit event, not a quiet update.');

select throws_ok(
  $$ select public.rpc_payment_method_toggle('airtel_money', true, 'worth a try') $$,
  null,
  'A method with no provider behind it cannot be switched on — a guest would find out after choosing.');

select set_config('request.jwt.claims',
  json_build_object('sub', 'e0000000-0000-4000-8000-00000000005b', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.rpc_payment_method_toggle('mpesa_stk', true, 'looks fine now') $$,
  null,
  'And an ops manager cannot touch payment methods at all.');

-- ═════════════════ the console reaches all of this from public

/*
 * PostgREST serves `public` and whatever a dashboard field lists.
 * Both consoles now live entirely in `public`, so neither depends
 * on somebody remembering that step — and the schemas stay closed.
 */
select is(
  (select count(*)::int from information_schema.views
   where table_schema = 'public' and table_name like 'settings\_%\_v'),
  8,
  'Every settings view the console reads is reachable from public.');

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'rpc_settings%') >= 10,
  'And every settings write.');

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'rpc_audit%') >= 15,
  'The audit console too, which had the same dependency.');

select is(
  has_schema_privilege('anon', 'settings', 'usage'),
  false,
  'And anon still cannot reach the settings schema itself.');

select * from finish();
rollback;
