-- Close the remaining finance, audit, and callback gaps found in CI.

update audit.action_registry
   set module = 'settings'
 where module in ('api', 'connectors');

create or replace function public.fn_fin_kpi_for(p_day date, p_city_id uuid)
returns table (
  orders integer,
  gross_cents bigint,
  revenue_cents bigint,
  merchant_cost_cents bigint,
  rider_cost_cents bigint,
  leakage_cents bigint,
  refund_cents bigint,
  net_cents bigint,
  cash_collected_cents bigint,
  as_of_entry_id bigint,
  source_hash text
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select e.id, e.debit, e.credit, a.base, t.kind, t.order_id,
           reversed.kind as reversed_kind
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
      join ledger.transaction t on t.id = e.transaction_id
      left join ledger.transaction reversed on reversed.id = t.reversal_of
     where e.effective_at >= (p_day::timestamp at time zone 'Africa/Nairobi')
       and e.effective_at <  ((p_day + 1)::timestamp at time zone 'Africa/Nairobi')
       and t.city_id is not distinct from p_city_id
  ),
  sums as (
    select
      count(distinct case when kind = 'order_sale_recognised' then order_id end)::integer as n_orders,
      coalesce(sum(case when base like 'revenue.%' then credit - debit else 0 end), 0)::bigint as revenue,
      coalesce(sum(case when base = 'payable.merchant' then credit - debit else 0 end), 0)::bigint as merchant_cost,
      coalesce(sum(case when base = 'tax.vat_output'
                             and (kind = 'order_sale_recognised'
                                  or reversed_kind = 'order_sale_recognised')
                        then credit - debit else 0 end), 0)::bigint as vat_output,
      coalesce(sum(case when base in ('expense.rider_pay', 'expense.rider_bonus')
                        then debit - credit else 0 end), 0)::bigint as rider_cost,
      coalesce(sum(case when base in ('expense.compensation_merchant', 'expense.compensation_rider',
                                      'expense.goodwill', 'expense.provider_fees',
                                      'expense.chargeback_loss', 'expense.write_off')
                        then debit - credit else 0 end), 0)::bigint as leakage,
      coalesce(sum(case when base = 'refunds_pending' then credit - debit else 0 end), 0)::bigint as refunds,
      coalesce(sum(case when base in ('cash.mpesa_paybill', 'cash.bank', 'cash.rider_on_hand',
                                      'cash.card_processor_receivable')
                        then debit - credit else 0 end), 0)::bigint as cash_in,
      coalesce(max(id), 0)::bigint as max_entry,
      count(*)::bigint as n_entries,
      coalesce(sum(debit), 0)::bigint as total_debit,
      coalesce(sum(credit), 0)::bigint as total_credit
    from scope
  )
  select
    n_orders,
    (merchant_cost + revenue + vat_output)::bigint,
    revenue,
    merchant_cost,
    rider_cost,
    leakage,
    refunds,
    (revenue - rider_cost - leakage)::bigint,
    cash_in,
    max_entry,
    encode(extensions.digest(
      p_day::text || '|' || coalesce(p_city_id::text, '-') || '|' ||
      n_entries || '|' || max_entry || '|' || total_debit || '|' || total_credit,
      'sha256'), 'hex')
  from sums;
$$;

comment on function public.fn_fin_kpi_for(date, uuid) is
  'Day/city finance arithmetic. Guest gross includes merchant share, platform revenue excluding VAT, and VAT charged on order-sale transactions. Reversals of order sales reverse their VAT contribution.';

create or replace function public.tg_audit_booking_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := authz.staff_id();
  v_actor_type public.actor_type;
  v_city_id uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb := jsonb_build_object(
    'status', new.status::text,
    'starts_at', new.starts_at,
    'ends_at', new.ends_at,
    'quantity', new.quantity,
    'total_cents', new.total_cents
  );
begin
  if tg_op = 'INSERT' then
    v_action := case when new.status = 'blocked' then 'booking.blocked' else 'booking.created' end;
  elsif old.status is distinct from new.status then
    v_action := 'booking.status_changed';
    v_before := jsonb_build_object(
      'status', old.status::text,
      'starts_at', old.starts_at,
      'ends_at', old.ends_at,
      'quantity', old.quantity,
      'total_cents', old.total_cents
    );
  else
    return new;
  end if;

  v_actor_type := case
    when v_staff_id is not null then 'staff'::public.actor_type
    when auth.uid() is null then 'system'::public.actor_type
    when new.source = 'merchant' then 'merchant_user'::public.actor_type
    else 'guest'::public.actor_type
  end;
  select m.city_id into v_city_id from public.merchant m where m.id = new.merchant_id;

  perform audit.log(
    p_actor_type => v_actor_type,
    p_module => 'merchants',
    p_action => v_action,
    p_actor_id => v_staff_id,
    p_target_type => 'booking',
    p_target_id => new.id,
    p_before => v_before,
    p_after => v_after,
    p_severity => 'info'::public.audit_severity,
    p_city_id => v_city_id
  );
  return new;
end;
$$;

create trigger booking_audit_state
  after insert or update on public.booking
  for each row execute function public.tg_audit_booking_state();

create or replace function public.tg_audit_payment_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := authz.staff_id();
  v_actor_type public.actor_type;
begin
  if old.state is not distinct from new.state then
    return new;
  end if;

  v_actor_type := case
    when v_staff_id is not null then 'staff'::public.actor_type
    when auth.uid() is null then 'system'::public.actor_type
    when new.created_via = 'merchant_dashboard' then 'merchant_user'::public.actor_type
    when new.created_via = 'rider_app' then 'rider'::public.actor_type
    else 'guest'::public.actor_type
  end;

  perform audit.log(
    p_actor_type => v_actor_type,
    p_module => 'orders',
    p_action => 'payment.state_changed',
    p_actor_id => v_staff_id,
    p_target_type => 'payment',
    p_target_id => new.id,
    p_before => jsonb_build_object('state', old.state::text),
    p_after => jsonb_build_object(
      'state', new.state::text,
      'provider', new.provider,
      'amount_cents', new.amount_cents
    ),
    p_severity => 'info'::public.audit_severity,
    p_city_id => new.city_id
  );
  return new;
end;
$$;

create trigger payment_audit_state
  after update of state on public.payment
  for each row execute function public.tg_audit_payment_state();

create or replace function public.tg_audit_tax_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := authz.staff_id();
  v_actor_type public.actor_type;
begin
  if old.kra_status is not distinct from new.kra_status then
    return new;
  end if;

  v_actor_type := case
    when v_staff_id is null then 'system'::public.actor_type
    else 'staff'::public.actor_type
  end;

  perform audit.log(
    p_actor_type => v_actor_type,
    p_module => 'finance',
    p_action => 'tax.kra_status_changed',
    p_actor_id => v_staff_id,
    p_target_type => 'tax_invoice',
    p_target_id => new.id,
    p_before => jsonb_build_object('kra_status', old.kra_status),
    p_after => jsonb_build_object('kra_status', new.kra_status),
    p_severity => 'high'::public.audit_severity,
    p_city_id => new.city_id
  );
  return new;
end;
$$;

create trigger tax_invoice_audit_status
  after update of kra_status on public.tax_invoice
  for each row execute function public.tg_audit_tax_invoice_status();

create or replace function public.tg_audit_staff_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := authz.staff_id();
  v_actor_type public.actor_type;
begin
  if old.avatar_path is not distinct from new.avatar_path then
    return new;
  end if;

  v_actor_type := case
    when v_staff_id is null then 'system'::public.actor_type
    else 'staff'::public.actor_type
  end;

  perform audit.log(
    p_actor_type => v_actor_type,
    p_module => 'staff',
    p_action => 'staff.avatar_changed',
    p_actor_id => v_staff_id,
    p_target_type => 'staff_user',
    p_target_id => new.id,
    p_before => jsonb_build_object('has_avatar', old.avatar_path is not null),
    p_after => jsonb_build_object('has_avatar', new.avatar_path is not null),
    p_severity => 'info'::public.audit_severity
  );
  return new;
end;
$$;

create trigger staff_avatar_audit
  after update of avatar_path on public.staff_user
  for each row execute function public.tg_audit_staff_avatar();

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('booking.created', 'merchants', 'info', false, false, false, 'A booking was created'),
  ('booking.blocked', 'merchants', 'info', false, false, false, 'A bookable resource was blocked'),
  ('booking.status_changed', 'merchants', 'info', false, false, false, 'A booking status changed'),
  ('payment.state_changed', 'orders', 'info', false, false, true, 'A payment state changed'),
  ('tax.kra_status_changed', 'finance', 'high', false, false, false, 'A tax document status changed'),
  ('staff.avatar_changed', 'staff', 'info', false, false, false, 'A staff profile photo changed')
on conflict (action) do update
  set module = excluded.module,
      description = excluded.description;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_booking_block', 'Booking inserts and status transitions are written to the audit chain by a table trigger.', 'audit.audit_event via tg_audit_booking_state'),
  ('rpc_booking_create', 'Booking inserts and status transitions are written to the audit chain by a table trigger.', 'audit.audit_event via tg_audit_booking_state'),
  ('rpc_booking_set_status', 'Booking inserts and status transitions are written to the audit chain by a table trigger.', 'audit.audit_event via tg_audit_booking_state'),
  ('rpc_merchant_session_activity', 'A session heartbeat is telemetry, not a decision requiring a separate audit event.', 'merchant_application_session_activity.last_activity_at'),
  ('rpc_order_place_web', 'The order creation is recorded in its append-only order timeline.', 'order_event row created by rpc_order_place_web'),
  ('rpc_payment_mpesa_callback', 'Callback payloads are preserved and payment state transitions are written to the audit chain.', 'payment_event and audit.audit_event via tg_audit_payment_state'),
  ('rpc_payment_mpesa_sent', 'The provider request is preserved and its payment state transition is written to the audit chain.', 'payment_event and audit.audit_event via tg_audit_payment_state'),
  ('rpc_my_staff_avatar_set', 'Avatar changes are written to the audit chain by a staff profile table trigger.', 'audit.audit_event via tg_audit_staff_avatar'),
  ('rpc_tax_set_kra_status', 'Tax invoice status transitions are written to the audit chain by a table trigger.', 'audit.audit_event via tg_audit_tax_invoice_status')
on conflict (function_name) do update
  set reason = excluded.reason,
      recorded_in = excluded.recorded_in;

revoke execute on function public.rpc_payment_mpesa_callback(
  text, integer, text, boolean, jsonb, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.rpc_payment_mpesa_callback(
  text, integer, text, boolean, jsonb, numeric, text, text)
  to service_role;
comment on function public.rpc_payment_mpesa_callback(
  text, integer, text, boolean, jsonb, numeric, text, text) is
  'Service-role only. The server callback route validates the URL secret before calling; browser anon clients cannot forge p_secret_ok.';

revoke execute on function public.fn_tax_issue_order_compliant(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_tax_issue_order_compliant(uuid)
  to service_role;

revoke execute on function public.rpc_staff_reset_credentials(uuid)
  from public, anon;
grant execute on function public.rpc_staff_reset_credentials(uuid)
  to authenticated;
