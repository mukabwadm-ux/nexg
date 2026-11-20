-- What a customer can do with their own order on the website.
--
-- The customer test on 20 Nov 2026 found no way, on the website, to cancel an
-- order, rate it, or (for a laundry) say when to collect, and checkout could
-- still be sent cash on delivery although it is no longer offered. Decided with
-- the owner the same day ("Fix all the ones that have ❌", "Remove cash from
-- checkout").
--
-- 1. rpc_order_cancel_mine: the customer (an account or a guest session)
--    cancels their own order while it is still 'placed' and nothing has been
--    paid, the same way an unpaid M-Pesa order lapses after 30 minutes
--    (cron_expire_unpaid_mpesa_orders): the payment is abandoned, any dispatch
--    job is cancelled and an order event says so. A paid or accepted order is
--    not cancelled here: the customer reports it (rpc_my_support_ticket_create,
--    topic order_problem) and support refunds through the existing refund flow.
--    While an M-Pesa prompt is still open the cancel waits, so a payment cannot
--    land on a cancelled order.
-- 2. rpc_order_rate: one rating per delivered order, by its customer, into
--    order_rating (merchant, branch and rider from the order). The merchant's
--    Reviews page and health already read that table.
-- 3. rpc_order_set_pickup_time: a laundry customer says when to collect, right
--    after placing the order and until the laundry accepts it. Written to
--    order.scheduled_for, which the merchant's order screens show.
-- 4. Cash on delivery: a customer order (channel 'web', which the website and
--    the Consumer app both use) may no longer be placed as cash on delivery.
--    Orders staff place for a guest (desk, concierge, manual) are unchanged,
--    and so are cash orders placed before this.
--
-- Rollback: drop the three functions and the trigger, and delete the three
-- audit.action_registry rows added below.

insert into audit.action_registry (action, module, default_severity, description) values
  ('order.customer_cancelled', 'orders', 'notice', 'A customer cancelled their own order before paying'),
  ('order.rated', 'orders', 'info', 'A customer rated a delivered order'),
  ('order.pickup_time_set', 'orders', 'info', 'A customer said when the business should collect')
on conflict (action) do nothing;

/* The calling session's own order, or nothing. */
create or replace function authz.customer_order(p_order_id uuid)
returns public.order
language sql
stable
security definer
set search_path = ''
as $$
  select o.*
  from public.order o
  join public.guest g on g.id = o.guest_id
  where o.id = p_order_id
    and g.user_id = (select auth.uid())
    and (select auth.uid()) is not null
$$;

revoke all on function authz.customer_order(uuid) from public, anon, authenticated;

create or replace function public.rpc_order_cancel_mine(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
  o public.order;
begin
  select * into o from authz.customer_order(p_order_id);
  if o.id is null then
    raise exception 'That order is not on your account.' using errcode = '42501';
  end if;
  perform 1 from public.order where id = o.id for update;
  select * into o from public.order where id = o.id;

  if o.stage = 'cancelled' then
    return jsonb_build_object('ok', true, 'note', 'This order is already cancelled.');
  end if;
  if o.stage <> 'placed' then
    raise exception 'The business has already accepted this order. Report a problem with it instead and we will sort it out.'
      using errcode = 'check_violation';
  end if;
  if o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded')
     or exists (select 1 from public.payment p where p.order_id = o.id and p.state = 'paid') then
    raise exception 'This order is paid. Report a problem with it instead and we will refund you.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.payment_prompt pr
               join public.payment p on p.id = pr.payment_id
              where p.order_id = o.id and pr.resolved_at is null
                and pr.sent_at > now() - interval '2 minutes') then
    raise exception 'Your M-Pesa prompt is still open. Decline it on your phone or wait a minute, then cancel.'
      using errcode = 'check_violation';
  end if;

  update public.payment
     set state = 'abandoned', updated_at = now(),
         failure_reason = coalesce(failure_reason, 'cancelled by the customer')
   where order_id = o.id and state in ('pending', 'authorised', 'failed');

  update public.order
     -- cancelled_by names a staff member; the reason code says it was the customer.
     set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'customer',
         cancel_note = left(coalesce(nullif(trim(p_reason), ''), 'Cancelled by the customer before paying.'), 500)
   where id = o.id;

  update dispatch.job
     set state = 'cancelled', ended_at = now(), end_reason = 'customer_cancelled'
   where order_id = o.id and state not in ('completed', 'cancelled');
  update dispatch.offer set outcome = 'withdrawn', responded_at = now()
   where outcome = 'pending'
     and job_id in (select id from dispatch.job where order_id = o.id);

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
  values (o.id, 'customer_cancelled', 'Cancelled by the customer',
          'The customer cancelled before paying. Nothing was charged.',
          'guest', 'Customer', '{}'::jsonb);

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'order.customer_cancelled',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_reason => nullif(trim(p_reason), ''));

  return jsonb_build_object('ok', true, 'note', 'Cancelled. Nothing was charged.');
end;
$$;

create or replace function public.rpc_order_rate(
  p_order_id uuid,
  p_stars integer,
  p_comment text default null,
  p_about text default 'order'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
  o public.order;
begin
  select * into o from authz.customer_order(p_order_id);
  if o.id is null then
    raise exception 'That order is not on your account.' using errcode = '42501';
  end if;
  if o.stage <> 'delivered' then
    raise exception 'You can rate an order once it is delivered.' using errcode = 'check_violation';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'Choose from 1 to 5 stars.' using errcode = '22023';
  end if;
  if coalesce(p_about, 'order') not in ('order', 'food', 'rider', 'app') then
    raise exception 'Choose what the rating is about.' using errcode = '22023';
  end if;
  if exists (select 1 from public.order_rating r where r.order_id = o.id) then
    raise exception 'You have already rated this order. Thank you.' using errcode = '23505';
  end if;

  insert into public.order_rating (order_id, merchant_id, branch_id, rider_id, stars, comment, about)
  values (o.id, o.merchant_id, o.branch_id, o.rider_id, p_stars,
          nullif(left(trim(coalesce(p_comment, '')), 1000), ''), coalesce(p_about, 'order'));

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type, p_module => 'orders', p_action => 'order.rated',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_after => jsonb_build_object('stars', p_stars));

  return jsonb_build_object('ok', true, 'note', 'Thank you. The business sees your rating.');
end;
$$;

create or replace function public.rpc_order_set_pickup_time(p_order_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
  o public.order;
  v_category text;
begin
  select * into o from authz.customer_order(p_order_id);
  if o.id is null then
    raise exception 'That order is not on your account.' using errcode = '42501';
  end if;
  select coalesce(m.category_key, m.category::text) into v_category
    from public.merchant m where m.id = o.merchant_id;
  if v_category not in ('laundry', 'laundry_cleaning') then
    raise exception 'Only a laundry collects at a time you choose.' using errcode = 'check_violation';
  end if;
  if o.stage <> 'placed' then
    raise exception 'The laundry has already accepted this order. Message them to change the time.'
      using errcode = 'check_violation';
  end if;
  if p_at is null or p_at < now() + interval '30 minutes' or p_at > now() + interval '14 days' then
    raise exception 'Choose a collection time from 30 minutes to 14 days from now.' using errcode = '22023';
  end if;

  update public.order set scheduled_for = p_at, updated_at = now() where id = o.id;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
  values (o.id, 'pickup_time_set', 'Collection time chosen',
          'The customer asked to be collected at ' ||
            to_char(p_at at time zone 'Africa/Nairobi', 'Dy DD Mon, HH24:MI') || '.',
          'guest', 'Customer', jsonb_build_object('scheduled_for', p_at));

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type, p_module => 'orders', p_action => 'order.pickup_time_set',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_after => jsonb_build_object('scheduled_for', p_at));

  return jsonb_build_object('ok', true, 'scheduled_for', p_at);
end;
$$;

/* The customer's own rating of their own order: order_rating is read by the business and staff,
   not by customers, so the order page asks here whether it was rated. */
create or replace function public.rpc_my_order_rating(p_order_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select r.stars::integer
  from public.order_rating r
  where r.order_id = (select o.id from authz.customer_order(p_order_id) o)
$$;

revoke all on function public.rpc_my_order_rating(uuid) from public, anon;
grant execute on function public.rpc_my_order_rating(uuid) to authenticated;

revoke all on function public.rpc_order_cancel_mine(uuid, text) from public, anon;
revoke all on function public.rpc_order_rate(uuid, integer, text, text) from public, anon;
revoke all on function public.rpc_order_set_pickup_time(uuid, timestamptz) from public, anon;
grant execute on function public.rpc_order_cancel_mine(uuid, text) to authenticated;
grant execute on function public.rpc_order_rate(uuid, integer, text, text) to authenticated;
grant execute on function public.rpc_order_set_pickup_time(uuid, timestamptz) to authenticated;

/* Cash on delivery is no longer offered to customers (owner, 20 Nov 2026). */
create or replace function public.tg_order_no_customer_cash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A customer order arrives from a signed-in or guest session (rpc_order_place_web), so the
  -- request runs as the authenticated role, which a security definer function does not change.
  -- Rows written by the database owner (imports, back-office repairs, test fixtures of old cash
  -- orders) are left alone.
  if new.channel = 'web' and new.payment_method = 'cash_on_delivery'
     and current_setting('role', true) in ('authenticated', 'anon') then
    raise exception 'Cash on delivery is not available. Pay with M-Pesa instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_order_no_customer_cash() from public, anon, authenticated;

drop trigger if exists order_no_customer_cash on public.order;
create trigger order_no_customer_cash before insert on public.order
  for each row execute function public.tg_order_no_customer_cash();
