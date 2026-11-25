-- Scaling quick wins (docs/scaling-plan.md). Nothing here changes what any
-- screen shows; it changes how much the database works to show it.
--
-- 1. Dispatch ticks every ten seconds for real.
--
--    `dispatch.cron_advance_minute` ran six ticks ten seconds apart inside
--    one function call, so inside one transaction. Two consequences, both
--    seen on production (pg_stat_statements, 24 Nov 2026: 72,826 runs at
--    50.1 s each):
--      · `now()` is the transaction's start time, so ticks two to six saw the
--        same clock as tick one and found nothing new to expire or escalate.
--        Offers really moved once a minute.
--      · nothing a tick did (an offer expired, a new round started, a job
--        escalated) was visible to riders or the desk until the whole
--        50-second call committed, and every row it touched stayed locked
--        that long. It also kept one of the plan's 60 connections busy
--        round the clock.
--    pg_cron 1.5+ schedules in seconds (production has 1.6.4, and
--    `native-push-dispatch` already runs every 5 seconds), so the job now runs
--    one tick every ten seconds, each in its own short transaction.
--    `cron_advance_minute` stays defined so the old schedule can be restored
--    by hand; nothing calls it any more.
--
-- 2. The scheduler's run log keeps 7 days instead of 30.
--
--    The ten-second tick writes 8,640 log rows a day instead of 1,440. At 30
--    days the log (already 98 MB of a 210 MB database, on a Free plan capped
--    at 500 MB) would grow by about 90 MB. Nothing reads runs older than a
--    day; the function's 30-day default is unchanged for manual use.
--
-- 3. Row-level security checks the signed-in user once per query, not once
--    per row (Supabase advisor `auth_rls_initplan`): `auth.uid()` becomes
--    `(select auth.uid())`. Same rule, same rows.
--
-- 4. Two indexes that duplicate a unique constraint on the same column are
--    dropped (advisor `duplicate_index`, plus the same pattern on "order"):
--    every insert paid for both, and reads use the constraint's index.
--
-- 5. Indexes for foreign keys on tables that grow with customers, orders and
--    stays (advisor `unindexed_foreign_keys`, 484 in all; the rest are on
--    small staff-only or audit columns and are left). Without them a lookup
--    by that column, or deleting the row it points at, reads the whole table.
--    The tables are small today, so building them inside the migration's
--    transaction locks each one for well under a second.
--
-- Rollback: supabase/rollback/20270325000100_scaling_quick_wins.sql.

-- 1. Dispatch tick --------------------------------------------------------

create or replace function dispatch.cron_advance_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  r := dispatch.cron_advance();
  /* Capture while the cascade is actually moving, which is the only time
     positions are worth keeping. */
  perform dispatch.cron_replay_capture();
  return r || jsonb_build_object('ok', true);
end;
$$;

comment on function dispatch.cron_advance_tick() is
  'One dispatch tick (advance the cascade, capture rider positions). Scheduled every 10 seconds as cron job dispatch-advance; replaces cron_advance_minute, which looped six ticks inside one transaction.';

revoke execute on function dispatch.cron_advance_tick() from public, anon, authenticated;
grant execute on function dispatch.cron_advance_tick() to service_role;

comment on function dispatch.cron_advance_minute() is
  'Retired 2027-03-25 (scaling quick wins): six ticks inside one transaction saw one frozen now() and held their locks for 50 s. Kept only so the old schedule can be restored by hand; dispatch-advance now runs cron_advance_tick every 10 seconds.';

-- 2. Run-log retention, and the new schedule ------------------------------

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; dispatch-advance and cron-run-log-trim are not scheduled.';
    return;
  end if;

  /* Same job name, so cron.schedule replaces the minute schedule in place. */
  perform cron.schedule(
    'dispatch-advance', '10 seconds',
    $cron$select dispatch.cron_advance_tick()$cron$);

  perform cron.schedule(
    'cron-run-log-trim', '40 0 * * *',
    $cron$select public.cron_trim_run_log(interval '7 days')$cron$);
end
$$;

-- 3. auth.uid() once per query ---------------------------------------------

alter policy booking_guest_read on public.booking
  using (guest_user_id = (select auth.uid()));

alter policy customer_engine_booking_own_read on public.customer_engine_booking
  using (user_id = (select auth.uid()));

alter policy customer_engine_booking_own_insert on public.customer_engine_booking
  with check (user_id = (select auth.uid()));

alter policy customer_engine_booking_own_update on public.customer_engine_booking
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy customer_engine_booking_own_delete on public.customer_engine_booking
  using (user_id = (select auth.uid()));

-- 4. Duplicate indexes -----------------------------------------------------

-- property_qr.code is already unique through the constraint unit_qr_code_key.
drop index if exists public.property_qr_code_idx;
-- "order".reference is already unique through the constraint order_reference_key.
drop index if exists public.order_reference_idx;

-- 5. Foreign keys that grow with traffic -----------------------------------

-- A branch's own orders (merchant screens), and orders by delivery zone.
create index if not exists order_branch_idx on public.order (branch_id, placed_at desc)
  where branch_id is not null;
create index if not exists order_zone_idx on public.order (zone_id)
  where zone_id is not null;

-- Best sellers count sales per catalogue item; editing or removing an item
-- checks this table.
create index if not exists order_item_catalogue_item_idx on public.order_item (catalogue_item_id)
  where catalogue_item_id is not null;
create index if not exists order_adjustment_order_idx on public.order_adjustment (order_id);
create index if not exists order_rating_rider_idx on public.order_rating (rider_id)
  where rider_id is not null;

create index if not exists payment_merchant_idx on public.payment (merchant_id)
  where merchant_id is not null;
create index if not exists payment_guest_idx on public.payment (guest_id)
  where guest_id is not null;

create index if not exists customer_saved_merchant_idx on public.customer_saved (merchant_id)
  where merchant_id is not null;
create index if not exists customer_saved_item_idx on public.customer_saved (item_id)
  where item_id is not null;
create index if not exists customer_engine_booking_merchant_idx
  on public.customer_engine_booking (merchant_id) where merchant_id is not null;

create index if not exists review_user_idx on public.review (user_id)
  where user_id is not null;
create index if not exists stay_property_idx on public.stay (property_id)
  where property_id is not null;
create index if not exists msg_message_author_idx on public.msg_message (author_participant_id)
  where author_participant_id is not null;
create index if not exists notification_outbox_log_idx on public.notification_outbox (notification_log_id)
  where notification_log_id is not null;
