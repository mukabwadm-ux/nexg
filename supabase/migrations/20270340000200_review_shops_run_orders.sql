-- Review shops run their own orders (owner, 27 Nov 2026).
--
-- A reviewer's order at a review shop (a test tenant, accepts_test_payments)
-- stayed at "confirmed": somebody had to sign in as the shop to start it and
-- mark it ready, and no rider is sent to a review shop (20270222000500,
-- 20270340000100). Now the database moves a paid order at a review shop on
-- by itself, one stage a minute, as a real shop and rider would:
--   delivery: preparing -> ready -> picked up -> arriving -> delivered
--   pickup:   preparing -> ready -> collected (delivered)
-- Each step writes the order's stage, its timestamp and an order_event, so
-- the customer's Activity and bell show it as for any order. Digital orders
-- are left to the shop, who sends their codes. Real shops are untouched.
--
-- Rollback:
--   select cron.unschedule('review-shop-orders');
--   delete from public.order_step_rule where actor = 'system' and step like 'review_%';
--   drop function public.cron_review_shop_orders();

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('order.review_shop_step', 'orders', 'info', false, 'A review shop order moved on by itself')
on conflict (action) do nothing;

insert into public.order_step_rule (actor, step, from_stages, to_stage, fulfilment, call, args, needs) values
  ('system', 'review_start', '{placed,confirmed}', 'preparing', null,
   'cron_review_shop_orders', '{}', 'A paid order at a review shop, a minute on.'),
  ('system', 'review_ready', '{preparing}', 'ready', null,
   'cron_review_shop_orders', '{}', 'A review shop order, a minute on.'),
  ('system', 'review_picked_up', '{ready}', 'picked_up', '{delivery}',
   'cron_review_shop_orders', '{}', 'A review shop delivery, a minute on. No rider is sent.'),
  ('system', 'review_arriving', '{picked_up}', 'arriving', '{delivery}',
   'cron_review_shop_orders', '{}', 'A review shop delivery, a minute on.'),
  ('system', 'review_delivered', '{ready,arriving}', 'delivered', '{delivery,pickup}',
   'cron_review_shop_orders', '{}', 'A review shop order, a minute on.')
on conflict (actor, step) do nothing;

create or replace function public.cron_review_shop_orders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_to public.order_stage;
  v_title text;
  v_moved integer := 0;
begin
  for o in
    select ord.id, ord.reference, ord.city_id, ord.stage,
           coalesce(ord.fulfilment::text, 'delivery') as fulfilment
      from public.order ord
      join public.merchant m on m.id = ord.merchant_id and m.accepts_test_payments
     where ord.stage in ('placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving')
       and ord.payment_status in ('paid', 'collected')
       and coalesce(ord.fulfilment::text, 'delivery') in ('delivery', 'pickup')
       and coalesce((select max(e.at) from public.order_event e where e.order_id = ord.id),
                    ord.placed_at) < now() - interval '1 minute'
     order by ord.placed_at
     limit 200
     for update of ord skip locked
  loop
    begin
      if o.stage in ('placed', 'confirmed') then
        update public.order
           set stage = 'preparing', confirmed_at = coalesce(confirmed_at, now())
         where id = o.id;
        v_to := 'preparing'; v_title := 'Being prepared';
      elsif o.stage = 'preparing' then
        update public.order set stage = 'ready', ready_at = now() where id = o.id;
        v_to := 'ready';
        v_title := case when o.fulfilment = 'pickup' then 'Ready to collect' else 'Ready for the rider' end;
      elsif o.stage = 'ready' and o.fulfilment = 'pickup' then
        update public.order set stage = 'delivered', delivered_at = now() where id = o.id;
        v_to := 'delivered'; v_title := 'Collected';
      elsif o.stage = 'ready' then
        update public.order set stage = 'picked_up', picked_up_at = now() where id = o.id;
        v_to := 'picked_up'; v_title := 'Picked up by your rider';
      elsif o.stage = 'picked_up' then
        update public.order set stage = 'arriving' where id = o.id;
        v_to := 'arriving'; v_title := 'Your rider is nearly there';
      else
        update public.order
           set stage = 'delivered', delivered_at = now(), handed_to = 'guest'
         where id = o.id;
        v_to := 'delivered'; v_title := 'Delivered';
      end if;

      insert into public.order_event (order_id, kind, title, actor_type, actor_label, payload)
      values (o.id, v_to::text, v_title, 'system', '[System] · review shop',
              jsonb_build_object('review_shop', true));

      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'order.review_shop_step', p_actor_label => '[System] · review shop',
        p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
        p_city_id => o.city_id, p_context => jsonb_build_object('to', v_to::text));
      v_moved := v_moved + 1;
    exception when others then
      raise warning 'Review shop order % did not move on: %', o.reference, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'moved', v_moved);
end;
$$;

comment on function public.cron_review_shop_orders() is
  'Moves paid delivery and pickup orders at review shops (test tenants) on by one stage a minute, with no shop or rider (20270340000200).';

revoke execute on function public.cron_review_shop_orders() from public, anon, authenticated;
grant execute on function public.cron_review_shop_orders() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; review shop orders do not move on by themselves.';
    return;
  end if;
  perform cron.schedule('review-shop-orders', '* * * * *',
    $sched$select public.cron_review_shop_orders()$sched$);
end
$cron$;
