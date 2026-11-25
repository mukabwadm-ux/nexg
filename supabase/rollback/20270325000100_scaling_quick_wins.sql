-- Manual rollback for 20270325000100_scaling_quick_wins.sql.
--
-- This file lives outside supabase/migrations because it must never be
-- applied automatically. It deletes no data: it puts the minute-long
-- dispatch job and the 30-day run log back, restores the five policies and
-- the two dropped indexes, and drops the new indexes.

begin;

select cron.schedule('dispatch-advance', '* * * * *',
  $cron$select dispatch.cron_advance_minute()$cron$);
select cron.schedule('cron-run-log-trim', '40 0 * * *',
  $cron$select public.cron_trim_run_log()$cron$);

alter policy booking_guest_read on public.booking using (guest_user_id = auth.uid());
alter policy customer_engine_booking_own_read on public.customer_engine_booking
  using (user_id = auth.uid());
alter policy customer_engine_booking_own_insert on public.customer_engine_booking
  with check (user_id = auth.uid());
alter policy customer_engine_booking_own_update on public.customer_engine_booking
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter policy customer_engine_booking_own_delete on public.customer_engine_booking
  using (user_id = auth.uid());

create unique index if not exists property_qr_code_idx on public.property_qr (code);
create index if not exists order_reference_idx on public.order (reference);

drop index if exists public.order_branch_idx;
drop index if exists public.order_zone_idx;
drop index if exists public.order_item_catalogue_item_idx;
drop index if exists public.order_adjustment_order_idx;
drop index if exists public.order_rating_rider_idx;
drop index if exists public.payment_merchant_idx;
drop index if exists public.payment_guest_idx;
drop index if exists public.customer_saved_merchant_idx;
drop index if exists public.customer_saved_item_idx;
drop index if exists public.customer_engine_booking_merchant_idx;
drop index if exists public.review_user_idx;
drop index if exists public.stay_property_idx;
drop index if exists public.msg_message_author_idx;
drop index if exists public.notification_outbox_log_idx;

drop function if exists dispatch.cron_advance_tick();

delete from supabase_migrations.schema_migrations where version = '20270325000100';

commit;
