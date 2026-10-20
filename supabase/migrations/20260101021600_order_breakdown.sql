-- The money split on every order, from one placeholder plan.
--
-- The rates below are DUMMY values so the breakdown screens have something
-- to show. They are replaced with the agreed pricing plan when it is shared;
-- until then every breakdown says so (`plan_is_placeholder`).

create table if not exists public.payout_plan (
  key text primary key,
  value numeric not null,
  note text,
  placeholder boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.payout_plan (key, value, note) values
  ('merchant_commission_pct', 15, 'Share of the basket NexG keeps. Used when the order carries no commission of its own.'),
  ('rider_delivery_share_pct', 80, 'Share of delivery fee and night surcharge paid to the rider.'),
  ('rider_tip_share_pct', 100, 'Share of the tip paid to the rider.'),
  ('processor_fee_pct', 1.5, 'What the payment provider takes on card and M-Pesa. Not charged on cash.')
on conflict (key) do nothing;

alter table public.payout_plan enable row level security;

drop policy if exists payout_plan_read_staff on public.payout_plan;
create policy payout_plan_read_staff on public.payout_plan
  for select to authenticated using (authz.is_super_admin());

drop policy if exists payout_plan_write_admin on public.payout_plan;
create policy payout_plan_write_admin on public.payout_plan
  for all to authenticated
  using (authz.is_super_admin()) with check (authz.is_super_admin());

-- ════════════════════════════════════════ who may see an order's money

create or replace function public.fn_order_money_scope(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when authz.is_super_admin()
      or authz.can_manage_merchants(o.city_id)
      or authz.works_live_ops(o.city_id) then 'staff'
    when authz.is_merchant_member(o.merchant_id) then 'merchant'
    else null
  end
  from public."order" o
  where o.id = p_order_id
$$;

revoke execute on function public.fn_order_money_scope(uuid) from public, anon;
grant execute on function public.fn_order_money_scope(uuid) to authenticated;

-- ════════════════════════════════════════ the split

create or replace function public.fn_order_split(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public."order";
  v_comm_pct numeric;
  v_rider_pct numeric;
  v_tip_pct numeric;
  v_proc_pct numeric;
  v_placeholder boolean;
  v_commission bigint;
  v_merchant_net bigint;
  v_rider_delivery bigint;
  v_rider_tip bigint;
  v_rider_total bigint;
  v_processor bigint;
  v_platform_gross bigint;
begin
  select * into o from public."order" where id = p_order_id;
  if not found then
    return null;
  end if;

  select coalesce(max(value) filter (where key = 'merchant_commission_pct'), 15),
         coalesce(max(value) filter (where key = 'rider_delivery_share_pct'), 80),
         coalesce(max(value) filter (where key = 'rider_tip_share_pct'), 100),
         coalesce(max(value) filter (where key = 'processor_fee_pct'), 1.5),
         coalesce(bool_or(placeholder), true)
    into v_comm_pct, v_rider_pct, v_tip_pct, v_proc_pct, v_placeholder
    from public.payout_plan;

  v_comm_pct := coalesce(o.commission_pct, v_comm_pct);
  v_commission := coalesce(o.commission_cents, round(o.subtotal_cents * v_comm_pct / 100)::bigint);
  v_merchant_net := o.subtotal_cents - v_commission;

  v_rider_delivery := round((o.delivery_fee_cents + o.night_surcharge_cents) * v_rider_pct / 100)::bigint;
  v_rider_tip := round(o.tip_cents * v_tip_pct / 100)::bigint;
  v_rider_total := v_rider_delivery + v_rider_tip;

  v_processor := case
    when o.payment_method::text in ('card', 'mpesa_stk') then round(o.total_cents * v_proc_pct / 100)::bigint
    else 0 end;

  v_platform_gross := o.total_cents - v_merchant_net - v_rider_total;

  return jsonb_build_object(
    'guest_paid_cents', o.total_cents,
    'merchant_gross_cents', o.subtotal_cents,
    'commission_pct', v_comm_pct,
    'commission_cents', v_commission,
    'merchant_net_cents', v_merchant_net,
    'rider_delivery_pct', v_rider_pct,
    'rider_delivery_cents', v_rider_delivery,
    'rider_tip_cents', v_rider_tip,
    'rider_total_cents', v_rider_total,
    'platform_gross_cents', v_platform_gross,
    'processor_fee_pct', v_proc_pct,
    'processor_fee_cents', v_processor,
    'platform_net_cents', v_platform_gross - v_processor,
    'collected_by', case when o.payment_method::text = 'cash_on_delivery' then 'rider (cash)' else 'NexG (online)' end,
    'settlement', case
      when o.payment_status::text in ('paid', 'collected') then 'ready to settle'
      when o.payment_method::text = 'cash_on_delivery' then 'cash with rider'
      else 'awaiting payment' end,
    'plan_is_placeholder', v_placeholder
  );
end;
$$;

revoke execute on function public.fn_order_split(uuid) from public, anon, authenticated;
grant execute on function public.fn_order_split(uuid) to service_role;

-- ════════════════════════════════════════ one order, in full

create or replace function public.rpc_order_breakdown(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text := public.fn_order_money_scope(p_order_id);
  o public."order";
  v_split jsonb;
begin
  if v_scope is null then
    raise exception 'Not allowed: you cannot see this order''s money.' using errcode = '42501';
  end if;

  select * into o from public."order" where id = p_order_id;
  v_split := public.fn_order_split(p_order_id);

  if v_scope = 'merchant' then
    -- A merchant sees what is theirs: their basket, our commission, their net.
    v_split := jsonb_build_object(
      'merchant_gross_cents', v_split -> 'merchant_gross_cents',
      'commission_pct', v_split -> 'commission_pct',
      'commission_cents', v_split -> 'commission_cents',
      'merchant_net_cents', v_split -> 'merchant_net_cents',
      'settlement', v_split -> 'settlement',
      'plan_is_placeholder', v_split -> 'plan_is_placeholder');
  end if;

  return jsonb_build_object(
    'scope', v_scope,
    'order', jsonb_build_object(
      'id', o.id,
      'reference', o.reference,
      'stage', o.stage::text,
      'channel', o.channel::text,
      'payment_method', o.payment_method::text,
      'payment_status', o.payment_status::text,
      'placed_at', o.placed_at,
      'confirmed_at', o.confirmed_at,
      'picked_up_at', o.picked_up_at,
      'delivered_at', o.delivered_at,
      'cancelled_at', o.cancelled_at,
      'dropoff_label', case when v_scope = 'staff' then o.dropoff_label else null end,
      'merchant_id', o.merchant_id,
      'merchant_name', (select m.trading_name from public.merchant m where m.id = o.merchant_id),
      'guest_name', case when v_scope = 'staff'
        then (select g.name from public.guest g where g.id = o.guest_id) end,
      'guest_phone', case when v_scope = 'staff'
        then (select g.phone from public.guest g where g.id = o.guest_id) end,
      'has_rider', o.rider_id is not null,
      'currency', o.currency),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', i.name, 'quantity', i.quantity,
        'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents)
        order by i.created_at)
      from public.order_item i
      where i.order_id = o.id and i.removed_at is null), '[]'::jsonb),
    'charges', case when v_scope = 'staff' then jsonb_build_object(
      'subtotal_cents', o.subtotal_cents,
      'delivery_fee_cents', o.delivery_fee_cents,
      'service_fee_cents', o.service_fee_cents,
      'small_basket_fee_cents', o.small_basket_fee_cents,
      'night_surcharge_cents', o.night_surcharge_cents,
      'concierge_fee_cents', o.concierge_fee_cents,
      'cash_handling_cents', o.cash_handling_cents,
      'tip_cents', o.tip_cents,
      'total_cents', o.total_cents)
    else jsonb_build_object('subtotal_cents', o.subtotal_cents) end,
    'split', v_split,
    'payments', case when v_scope = 'staff' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', p.reference, 'state', p.state::text, 'provider', p.provider,
        'provider_ref', p.provider_ref, 'channel', p.channel,
        'amount_cents', p.amount_cents, 'paid_at', p.paid_at,
        'failure_reason', p.failure_reason, 'created_at', p.created_at)
        order by p.created_at)
      from public.payment p where p.order_id = o.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'amount_cents', r.amount_cents, 'method', r.method, 'status', r.status,
        'reason', r.reason_text, 'requested_at', r.requested_at, 'issued_at', r.issued_at)
        order by r.requested_at)
      from public.refund r where r.order_id = o.id), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', e.at, 'title', e.title, 'detail', e.detail, 'actor', e.actor_label)
        order by e.at)
      from public.order_event e where e.order_id = o.id), '[]'::jsonb));
end;
$$;

revoke execute on function public.rpc_order_breakdown(uuid) from public, anon;
grant execute on function public.rpc_order_breakdown(uuid) to authenticated;

-- ════════════════════════════════════════ the list, for both sides

create or replace function public.rpc_transactions_list(
  p_merchant_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean := authz.is_super_admin()
    or authz.can_manage_merchants(null) or authz.works_live_ops(null);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if p_merchant_id is null and not v_staff then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_merchant_id is not null and not v_staff
     and not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row order by (row ->> 'placed_at') desc)
    from (
      select jsonb_build_object(
        'id', o.id,
        'reference', o.reference,
        'placed_at', o.placed_at,
        'merchant_name', m.trading_name,
        'stage', o.stage::text,
        'payment_method', o.payment_method::text,
        'payment_status', o.payment_status::text,
        'total_cents', o.total_cents,
        'subtotal_cents', o.subtotal_cents,
        'commission_cents', s -> 'commission_cents',
        'merchant_net_cents', s -> 'merchant_net_cents',
        'rider_total_cents', case when v_staff then s -> 'rider_total_cents' end,
        'platform_net_cents', case when v_staff then s -> 'platform_net_cents' end,
        'settlement', s ->> 'settlement') as row
      from public."order" o
      join public.merchant m on m.id = o.merchant_id
      cross join lateral (select public.fn_order_split(o.id) as s) x
      where (p_merchant_id is null or o.merchant_id = p_merchant_id)
        and (v_search is null
             or o.reference ilike '%' || v_search || '%'
             or m.trading_name ilike '%' || v_search || '%')
      order by o.placed_at desc
      limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
    ) t), '[]'::jsonb);
end;
$$;

revoke execute on function public.rpc_transactions_list(uuid, text, integer, integer) from public, anon;
grant execute on function public.rpc_transactions_list(uuid, text, integer, integer) to authenticated;

comment on function public.rpc_order_breakdown is
  'Everything about one order''s money. Staff see the full split; a merchant sees only their basket, our commission and their net.';
