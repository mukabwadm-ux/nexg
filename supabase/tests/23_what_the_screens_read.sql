-- The Finance projections, tested against the ways a screen lies.
--
-- A projection fails differently from a query. A query that
-- breaks throws, and somebody sees it. A projection that breaks
-- keeps serving the last good numbers, looking exactly like a
-- quiet week — and the longer it is broken the more plausible it
-- gets. So most of what follows is about the failures that
-- present as calm:
--
--   * a rebuild that has stopped, with the screen none the wiser
--   * a row the key will not allow, taking the whole build down
--   * one projection failing and silencing the others
--   * tiles that disagree with the chart underneath them
--   * a zero that is really an absence
--   * Verify saying "fine" because it asked the wrong question

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create temp table t (k text primary key, v text);
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

insert into t (k, v) values
  ('today', ((now() at time zone 'Africa/Nairobi')::date)::text),
  ('staff', (select su.user_id::text from public.staff_user su
               join public.role_grant g on g.staff_user_id = su.id
               join public.role r on r.id = g.role_id
              where r.key = 'super_admin' limit 1));

-- The monitors run first, as the cron does. On a database where
-- they have never run every one of them is unanswered, which is
-- a real state with real consequences — tested further down.
select public.fn_run_invariants() \g /dev/null

-- ════════════════════════════════════ 1. everything builds, or says why

select is(
  (public.fn_fin_rebuild() ->> 'ok')::boolean,
  true,
  'Every projection rebuilds.');

select is(
  (select count(*)::int from public.fin_projection where last_error is not null),
  0,
  'And none of them recorded an error.');

select is(
  (select count(*)::int from public.fin_projection where as_of is null),
  0,
  'Each one knows when it last ran — a projection with no as_of cannot be called stale.');

-- ═══════════════════════════ 2. the row the key would not allow
--
-- The regression. `fin_kpi_daily` was first written with a
-- primary key over (day, city_id), which makes city_id NOT NULL
-- and so makes the unattributed bucket impossible. The result
-- was not a missing bucket. It was the entire KPI rebuild
-- failing on the first transaction without a city, while the
-- Overview went on showing the last good day as though nothing
-- had happened.

select ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'fin_kpi_daily'
       and column_name = 'city_id' and is_nullable = 'NO'),
  'fin_kpi_daily.city_id is nullable, because unattributed money has to land somewhere.');

/* Measured as a delta, not an absolute. This database is
   whatever the last person left behind; what the test is about
   is that five thousand shillings with no city attached arrive
   in the unattributed bucket, not what was already in it. */
insert into t (k, v) select 'unattributed_before',
  coalesce((select revenue_cents from public.fin_kpi_daily
             where day = (select v::date from t where k='today') and city_id is null), 0)::text;

select lives_ok(
  $$select ledger.post('payment_captured', 'tap:nocity',
      jsonb_build_array(
        jsonb_build_object('account','cash.mpesa_paybill','debit',500000),
        jsonb_build_object('account','revenue.commission','credit',500000)))$$,
  'Money can be posted without a city — the ledger does not require one.');

select is(
  (public.fn_fin_rebuild() ->> 'ok')::boolean,
  true,
  'And the rebuild survives it.');

select is(
  (select revenue_cents from public.fin_kpi_daily
    where day = (select v::date from t where k='today') and city_id is null)
    - (select v::bigint from t where k='unattributed_before'),
  500000::bigint,
  'The unattributed shillings are shown as unattributed, not spread across the cities.');

select is(
  (select count(*)::int from public.fin_kpi_daily
    where day = (select v::date from t where k='today') and city_id is null),
  1,
  'And they stay one row across rebuilds rather than one per run.');

-- ════════════════════════════════════ 3. the tiles and the chart agree
--
-- Everything on the Overview is rolled up from fin_kpi_daily, so
-- a disagreement between a tile and the breakdown below it means
-- two different derivations got in. These assert they did not.

select is(
  (select sum(gross_cents) from public.fin_kpi_daily where city_id is not null),
  (select sum(merchant_cost_cents + revenue_cents) from public.fin_kpi_daily where city_id is not null),
  'Gross is exactly the merchant share plus ours — the tile cannot drift from its parts.');

select is(
  (select coalesce(sum(amount_cents), 0) from public.fin_revenue_line),
  (select coalesce(sum(revenue_cents), 0) from public.fin_kpi_daily
    where day >= date_trunc('month', (select v::date from t where k='today'))),
  'The revenue lines add up to the revenue tile.');

select is(
  (select coalesce(sum(owed_cents), 0) from public.fin_party_owed where party_type = 'merchant'),
  (select coalesce(sum(merchant_cost_cents), 0) from public.fin_kpi_daily),
  'And what we owe merchants is what we booked as owed to them.');

select is(
  (select coalesce(sum(amount_cents), 0) from public.fin_money_flow where direction = 'in'),
  (select coalesce(sum(gross_cents), 0) from public.fin_kpi_daily
    where day >= date_trunc('month', (select v::date from t where k='today'))),
  'Money in for the month equals what guests were charged for it.');

-- ═════════════════════════════════ 4. a zero is not an absence

select is(
  (select count(*)::int from public.fin_kpi_daily
    where orders = 0 and gross_cents = 0 and cash_collected_cents = 0),
  0,
  'A day where nothing happened has no row — an invented zero reads like a fact.');

-- ══════════════════════════════════════════ 5. Verify, both ways

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='staff'), 'role', 'authenticated')::text, true);

select ok(
  (public.rpc_fin_verify((select v::date from t where k='today'),
                         (select v::date from t where k='today')) ->> 'matches')::boolean,
  'Verify agrees with freshly built figures.');

reset role;
select lives_ok(
  $$select ledger.post('payment_captured', 'tap:drift',
      jsonb_build_array(
        jsonb_build_object('account','cash.mpesa_paybill','debit',700000),
        jsonb_build_object('account','revenue.commission','credit',700000)))$$,
  'More money arrives.');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t where k='staff'), 'role', 'authenticated')::text, true);

select ok(
  not (public.rpc_fin_verify((select v::date from t where k='today'),
                             (select v::date from t where k='today')) ->> 'matches')::boolean,
  'And Verify stops agreeing — the screen is now behind and says so.');

select matches(
  public.rpc_fin_verify((select v::date from t where k='today'),
                        (select v::date from t where k='today')) ->> 'message',
  'behind by',
  'It distinguishes being behind from being wrong, because those need different responses.');

/* The range is capped so that the one request-time computation
   in Finance cannot be turned into a slow one. */
select throws_matching(
  $$select public.rpc_fin_verify(current_date - 400, current_date)$$,
  'at most 92 days',
  'And it refuses a range large enough to be used as a denial of service.');

-- ══════════════════════════════ 6. who may see any of this

/*
 * Two locks again, and the stronger one is first. An anonymous
 * request is refused the table outright rather than being shown
 * an empty result — which matters, because an empty result is
 * indistinguishable from a quiet month and would let a mistake
 * in the grants go unnoticed.
 */
reset role;
set local role anon;
select throws_matching(
  $$select count(*) from public.fin_kpi_daily$$,
  'permission denied',
  'An anonymous request is refused the Finance figures, not handed an empty set.');

select throws_matching(
  $$select count(*) from public.fin_decision$$,
  'permission denied',
  'Nor the list of what is going wrong, which is the more sensitive of the two.');

reset role;
set local role authenticated;
select throws_matching(
  $$select public.fn_fin_rebuild()$$,
  'permission denied',
  'And nobody signed in can trigger a rebuild by hand — it is the cron that owns it.');

reset role;

-- ════════════════════════ 7. a broken projection is loud, not quiet
--
-- The decisions list is where a stopped rebuild becomes visible.
-- If a stale projection produced no decision, the only sign that
-- Finance had gone blind would be Finance noticing.

update public.fin_projection
   set as_of = now() - interval '3 days'
 where name = 'party_owed';

select is(
  (select public.fn_fin_build_decisions() > 0),
  true,
  'A projection that has stopped rebuilding puts itself on the decisions list.');

select ok(
  exists (select 1 from public.fin_decision
           where id = 'stale:party_owed' and consequence like '%older than it looks%'),
  'Saying what it costs — every figure drawn from it is older than it looks.');

/*
 * One projection failing must not take the others with it.
 *
 * `not valid` leaves the rows already there alone and refuses
 * every new one, which breaks the rebuild of this one table and
 * nothing else — a sharper instrument than breaking its key,
 * which would depend on what happens to be in it.
 */
alter table public.fin_party_owed
  add constraint tap_breaks_this_build check (owed_cents < 0) not valid;

select public.fn_fin_rebuild() \g /dev/null

select ok(
  (select last_error is not null from public.fin_projection where name = 'party_owed'),
  'A projection that cannot build records its error rather than throwing.');

select ok(
  (select row_count > 0 from public.fin_projection where name = 'kpi_daily')
  and (select last_error is null from public.fin_projection where name = 'kpi_daily'),
  'And the others still build — one broken table does not blind the whole of Finance.');

select * from finish();
rollback;
