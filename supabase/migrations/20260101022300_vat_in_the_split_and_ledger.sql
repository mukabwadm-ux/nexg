-- VAT in the order split and in the ledger, on the agreed rates.
--
-- Fees and commission are stored VAT-inclusive (commission_cents is already
-- sale x pct, which is commission plus VAT). The VAT part of an inclusive
-- amount is amount x vat / (100 + vat). A KES 6,000 sale at 14% gives
-- 840.00 = 724.14 commission + 115.86 VAT.

update public.payout_plan set value = 14, placeholder = false,
  note = 'Standard commission when the order carries none of its own.'
  where key = 'merchant_commission_pct';
update public.payout_plan set value = 70, placeholder = false,
  note = 'Share of the delivery fee paid to the rider.'
  where key = 'rider_delivery_share_pct';
update public.payout_plan set placeholder = false where key = 'rider_tip_share_pct';

insert into public.payout_plan (key, value, note, placeholder) values
  ('vat_pct', 16, 'VAT on NexG commission and fees.', false),
  ('host_commission_share_pct', 20, 'Share of NexG commission (after VAT) credited to the host whose guest ordered.', false)
on conflict (key) do update
  set value = excluded.value, note = excluded.note, placeholder = false;

create or replace function ledger.fn_vat_part(p_amount bigint, p_vat numeric default 16)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_amount, 0) - round(coalesce(p_amount, 0) * 100 / (100 + p_vat))::bigint
$$;

create or replace function ledger.fn_sale_entries(o public.order, p_cash_account text default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with v as (
    select coalesce(settings.fn_num('tax.vat_pct', o.city_id), 16) as pct
  ), l as (
    select
      ledger.fn_vat_part(coalesce(o.commission_cents, 0), v.pct) as commission,
      ledger.fn_vat_part(o.delivery_fee_cents, v.pct) as delivery,
      ledger.fn_vat_part(o.service_fee_cents, v.pct) as service,
      ledger.fn_vat_part(o.small_basket_fee_cents, v.pct) as small,
      ledger.fn_vat_part(o.night_surcharge_cents, v.pct) as night,
      ledger.fn_vat_part(o.concierge_fee_cents, v.pct) as concierge,
      ledger.fn_vat_part(o.cash_handling_cents, v.pct) as cash
    from v
  )
  select jsonb_build_array(
    jsonb_build_object(
      'account', coalesce(p_cash_account, case o.payment_method
        when 'card' then 'cash.card_processor_receivable'
        when 'mpesa_stk' then 'cash.mpesa_paybill'
        when 'charge_to_room' then 'receivable.hotel'
        when 'on_account' then 'receivable.guest_on_account'
        else 'cash.mpesa_paybill' end),
      'debit', o.total_cents,
      'memo', o.reference),

    jsonb_build_object('account', 'payable.merchant', 'party_type', 'merchant',
      'party_id', o.merchant_id,
      'credit', o.subtotal_cents - coalesce(o.commission_cents, 0),
      'memo', 'items less commission'),

    jsonb_build_object('account', 'revenue.commission', 'credit', coalesce(o.commission_cents, 0) - l.commission),
    jsonb_build_object('account', 'revenue.delivery_fee', 'credit', o.delivery_fee_cents - l.delivery),
    jsonb_build_object('account', 'revenue.service_fee', 'credit', o.service_fee_cents - l.service),
    jsonb_build_object('account', 'revenue.small_basket', 'credit', o.small_basket_fee_cents - l.small),
    jsonb_build_object('account', 'revenue.night_surcharge', 'credit', o.night_surcharge_cents - l.night),
    jsonb_build_object('account', 'revenue.concierge_fee', 'credit', o.concierge_fee_cents - l.concierge),
    jsonb_build_object('account', 'revenue.cash_handling', 'credit', o.cash_handling_cents - l.cash),
    jsonb_build_object('account', 'tax.vat_output',
      'credit', l.commission + l.delivery + l.service + l.small + l.night + l.concierge + l.cash,
      'memo', 'VAT on NexG commission and fees'),

    jsonb_build_object('account', 'payable.rider', 'party_type', 'rider',
      'party_id', o.rider_id, 'credit',
      case when o.rider_id is null then 0 else o.tip_cents end,
      'memo', 'tip'))
  from l
$$;

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
  v_vat_pct numeric;
  v_host_pct numeric;
  v_placeholder boolean;
  v_commission bigint;
  v_commission_vat bigint;
  v_merchant_net bigint;
  v_rider_delivery bigint;
  v_rider_tip bigint;
  v_rider_total bigint;
  v_processor bigint;
  v_platform_gross bigint;
  v_vat_total bigint;
  v_host_share bigint;
begin
  select * into o from public."order" where id = p_order_id;
  if not found then
    return null;
  end if;

  select coalesce(max(value) filter (where key = 'merchant_commission_pct'), 14),
         coalesce(max(value) filter (where key = 'rider_delivery_share_pct'), 70),
         coalesce(max(value) filter (where key = 'rider_tip_share_pct'), 100),
         coalesce(max(value) filter (where key = 'processor_fee_pct'), 1.5),
         coalesce(max(value) filter (where key = 'vat_pct'), 16),
         coalesce(max(value) filter (where key = 'host_commission_share_pct'), 20),
         coalesce(bool_or(placeholder) filter (where key <> 'processor_fee_pct'), false)
    into v_comm_pct, v_rider_pct, v_tip_pct, v_proc_pct, v_vat_pct, v_host_pct, v_placeholder
    from public.payout_plan;

  v_vat_pct := coalesce(settings.fn_num('tax.vat_pct', o.city_id), v_vat_pct);
  v_comm_pct := coalesce(o.commission_pct, v_comm_pct);
  v_commission := coalesce(o.commission_cents, round(o.subtotal_cents * v_comm_pct / 100)::bigint);
  v_commission_vat := ledger.fn_vat_part(v_commission, v_vat_pct);
  v_merchant_net := o.subtotal_cents - v_commission;

  v_rider_delivery := round((o.delivery_fee_cents + o.night_surcharge_cents) * v_rider_pct / 100)::bigint;
  v_rider_tip := round(o.tip_cents * v_tip_pct / 100)::bigint;
  v_rider_total := v_rider_delivery + v_rider_tip;

  v_processor := case
    when o.payment_method::text in ('card', 'mpesa_stk') then round(o.total_cents * v_proc_pct / 100)::bigint
    else 0 end;

  v_vat_total := ledger.fn_vat_part(v_commission, v_vat_pct)
    + ledger.fn_vat_part(o.delivery_fee_cents, v_vat_pct)
    + ledger.fn_vat_part(o.service_fee_cents, v_vat_pct)
    + ledger.fn_vat_part(o.small_basket_fee_cents, v_vat_pct)
    + ledger.fn_vat_part(o.night_surcharge_cents, v_vat_pct)
    + ledger.fn_vat_part(o.concierge_fee_cents, v_vat_pct)
    + ledger.fn_vat_part(o.cash_handling_cents, v_vat_pct);

  v_host_share := case when o.property_qr_id is not null
    then round((v_commission - v_commission_vat) * v_host_pct / 100)::bigint else 0 end;

  v_platform_gross := o.total_cents - v_merchant_net - v_rider_total;

  return jsonb_build_object(
    'guest_paid_cents', o.total_cents,
    'merchant_gross_cents', o.subtotal_cents,
    'commission_pct', v_comm_pct,
    'commission_cents', v_commission,
    'commission_ex_vat_cents', v_commission - v_commission_vat,
    'commission_vat_cents', v_commission_vat,
    'merchant_net_cents', v_merchant_net,
    'rider_delivery_pct', v_rider_pct,
    'rider_delivery_cents', v_rider_delivery,
    'rider_tip_cents', v_rider_tip,
    'rider_total_cents', v_rider_total,
    'platform_gross_cents', v_platform_gross,
    'vat_pct', v_vat_pct,
    'vat_total_cents', v_vat_total,
    'host_share_pct', v_host_pct,
    'host_share_cents', v_host_share,
    'processor_fee_pct', v_proc_pct,
    'processor_fee_cents', v_processor,
    'platform_net_cents', v_platform_gross - v_vat_total - v_host_share - v_processor,
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

-- The merchant sees their commission split into commission and VAT.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.rpc_order_breakdown(uuid)'::regprocedure);
  v_new := replace(v_def,
    '''commission_cents'', v_split -> ''commission_cents'',',
    '''commission_cents'', v_split -> ''commission_cents'', ''commission_ex_vat_cents'', v_split -> ''commission_ex_vat_cents'', ''commission_vat_cents'', v_split -> ''commission_vat_cents'', ''vat_pct'', v_split -> ''vat_pct'',');
  if v_new = v_def then raise exception 'breakdown merchant block not found'; end if;
  execute v_new;
end $$;
