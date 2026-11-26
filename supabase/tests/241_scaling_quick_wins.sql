-- Scaling quick wins (20270325000100): the dispatch tick runs on its own every
-- ten seconds, the run log keeps a week, the policies read auth.uid() once,
-- and the new indexes exist.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is(
  (select schedule from cron.job where jobname = 'dispatch-advance'),
  '10 seconds', 'Dispatch ticks every ten seconds.');

select is(
  (select command from cron.job where jobname = 'dispatch-advance'),
  'select dispatch.cron_advance_tick()', 'Each tick is its own short call.');

select ok(
  (select command from cron.job where jobname = 'cron-run-log-trim') like '%7 days%',
  'The scheduler run log keeps seven days.');

select ok(
  not has_function_privilege('anon', 'dispatch.cron_advance_tick()', 'execute')
  and not has_function_privilege('authenticated', 'dispatch.cron_advance_tick()', 'execute'),
  'Only the scheduler and the service role can run a tick.');

select lives_ok(
  $$ select dispatch.cron_advance_tick() $$,
  'A tick runs on an idle database.');

select ok(
  (select qual from pg_policies
    where tablename = 'booking' and policyname = 'booking_guest_read') like '%SELECT auth.uid()%',
  'The guest booking policy reads auth.uid() once per query.');

select is(
  (select count(*)::int from pg_policies
    where tablename = 'customer_engine_booking'
      and replace(coalesce(qual, '') || coalesce(with_check, ''), 'SELECT auth.uid()', '')
          like '%auth.uid()%'),
  0, 'No customer booking policy calls auth.uid() per row.');

select ok(
  to_regclass('public.property_qr_code_idx') is null and to_regclass('public.order_reference_idx') is null,
  'The duplicate indexes are gone.');

select is(
  (select count(*)::int from pg_class where relkind = 'i' and relname in (
    'order_branch_idx', 'order_zone_idx', 'order_item_catalogue_item_idx',
    'order_adjustment_order_idx', 'order_rating_rider_idx', 'payment_merchant_idx',
    'payment_guest_idx', 'customer_saved_merchant_idx', 'customer_saved_item_idx',
    'customer_engine_booking_merchant_idx', 'review_user_idx', 'stay_property_idx',
    'msg_message_author_idx', 'notification_outbox_log_idx')),
  14, 'The fourteen foreign-key indexes exist.');

select * from finish();
rollback;
