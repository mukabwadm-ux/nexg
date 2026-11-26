-- Stays management fees, invoiced monthly and taken from the host's payout
-- (owner, 26 Nov 2026).
--
-- The rule is the one Stays Configuration already holds: stays.management_fee_kes
-- (KES 1,000) per approved, listed property per month once its free trial
-- (stays.trial_months from property.listed_at) has ended. Until now it was only
-- worked out on screen ("billable, not collected"). From here:
--
--   * On the 1st of each month at 06:00 Nairobi a cron job raises last month's
--     invoice per host (public.host_invoice, which had no writer before), one
--     line per property that was past its trial for the whole month. Staff can
--     raise a month by hand (rpc_console_stays_fee_raise). One invoice per host
--     per month (host_invoice's unique host_id + period): raising again changes
--     nothing. Hosts with nothing due get no invoice. The host is emailed.
--   * The next weekly payout run takes what is still owed from the host's line:
--     the line keeps its gross (so "Totals equal the ledger" still holds) and
--     carries the fee as an adjustment (fin_settlement_line.adjustments /
--     adjustment_cents, which the run's totals, screens and PDF already show);
--     net = gross less the fee, never below zero. What the payout cannot cover
--     stays on the invoice for the next run or an M-Pesa payment.
--   * When the run is approved by the second person (approved_2, after which a
--     run can no longer be rebuilt or cancelled) the deduction is booked:
--       Dr stay.host_share (host)   Cr receivable.host (host)
--     and the debit is claimed for that line in fin_settled_entry, so no later
--     run counts it again. The invoice is paid once deductions and payments
--     cover it; its receipt is issued then.
--   * Hosts paid by an active Paystack sub-account are split at checkout and
--     have no run line, so nothing can be taken: their invoice stays due, the
--     email tells them to pay by M-Pesa from the invoice in their host
--     workspace, and Finance records the payment (rpc_console_stays_fee_payment:
--     Dr cash.mpesa_paybill  Cr receivable.host). Any host can pay that way.
--
-- This REVERSES, for management fees only, the earlier owner rule in
-- 20270122000100_host_payouts.sql ("Unpaid host invoices are not netted off").
-- Any other host invoice is still not netted.
--
-- Why an adjustment on the line, not a ledger posting at build time: a run
-- only selects entries whose effective_at falls inside its own week
-- (fn_settlement_owed), and a built run is rebuilt from scratch (its lines and
-- claims deleted) or cancelled freely until it is approved. A posting made at
-- build time would have to land inside the week, be reversed on every rebuild
-- and could not follow a cancel. An adjustment row tied to the line
-- (public.stays_fee_settlement, on delete cascade) disappears with a rebuild,
-- is ignored once its run is cancelled, and is booked only once the run can no
-- longer change.
--
-- Revenue lands on a new account, revenue.stays_management_fee, not
-- revenue.packages: ledger.fn_post_host_invoice picks the account by the
-- invoice's lines. The fee is VAT-inclusive (owner, 26 Nov 2026): the posting
-- splits the VAT inside it (stays.commission_vat_pct, 16%) to tax.vat_output and
-- the rest to revenue; the host still owes the invoice total.
--
-- Changes to existing functions (same signatures and grants):
--   rpc_settlement_build            20270310000100: host branch only (the fee
--                                   deduction; a line a fee was taken from does
--                                   not roll for being under the minimum)
--   ledger.fn_post_host_invoice     20260101019600: revenue account by kind
--   ledger.fn_post_host_invoice_paid 20270106060100: posts nothing for a
--                                   management fee invoice (each deduction and
--                                   payment clears its own part)
--   fn_receipt_for_host_invoice     20261125000100: a management fee invoice's
--                                   lines and total are in cents already, and
--                                   the method says how it was paid
--
-- Rollback, in this order:
--   select cron.unschedule('stays-management-fee-invoices');
--   drop trigger if exists stays_fee_on_approval on public.fin_settlement_run;
--   re-run the four functions above from the files named;
--   drop function public.rpc_console_stays_fee_invoices(date, date, uuid),
--     public.rpc_console_stays_fee_payment(uuid, numeric, text, date),
--     public.rpc_console_stays_fee_raise(date), public.cron_stays_fee_invoices(),
--     public.tg_stays_fee_on_approval(), public.fn_stays_fee_apply_run(uuid),
--     public.fn_stays_fee_raise(date, text), public.fn_stays_fee_tell_host(uuid),
--     public.fn_stays_fee_refresh(uuid), public.fn_stays_fee_amounts(uuid),
--     public.fn_stays_fee_can_record(), public.fn_host_invoice_is_management_fee(jsonb);
--   drop table public.stays_fee_settlement;
--   delete from audit.action_registry where action like 'stays.fee\_%';
--   Invoices raised and anything posted to the ledger stay: the ledger is
--   append-only.

-- ═══════════════════════════════════════════════════════════════ 0. audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('stays.fee_invoices_raised', 'hotels', 'notice', true,
   'Stays management fee invoices were raised for a month (by staff or the monthly job)'),
  ('stays.fee_deducted', 'finance', 'notice', true,
   'A stays management fee was taken from a host''s approved payout'),
  ('stays.fee_payment_recorded', 'finance', 'high', true,
   'Finance recorded a host''s M-Pesa payment of a stays management fee invoice')
on conflict (action) do nothing;

-- ════════════════════════════════════════════════════════════ 1. accounts

insert into ledger.account (code, base, name, kind, party_type, party_id, normal_side) values
  ('revenue.stays_management_fee', 'revenue.stays_management_fee',
   'Stays management fees', 'revenue', 'nexg', null, 'C')
on conflict (code) do nothing;

-- ═══════════════════════════════════════════════════ 2. what settled a fee

/* A management fee invoice is one whose lines say so. */
create or replace function public.fn_host_invoice_is_management_fee(p_lines jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_lines, '[]'::jsonb) @> '[{"kind": "management_fee"}]'::jsonb
$$;
revoke all on function public.fn_host_invoice_is_management_fee(jsonb) from public, anon;

create table if not exists public.stays_fee_settlement (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.host_invoice (id) on delete cascade,
  host_id uuid not null references public.host (id) on delete cascade,
  kind text not null check (kind in ('deduction', 'mpesa')),
  amount_cents bigint not null check (amount_cents > 0),
  /* A deduction belongs to one payout line; a rebuild deletes the line and
     with it the deduction. */
  line_id uuid references public.fin_settlement_line (id) on delete cascade,
  run_id uuid references public.fin_settlement_run (id) on delete cascade,
  /* Null while the run can still change; set when it is booked. An M-Pesa
     payment is booked as it is recorded. */
  applied_at timestamptz,
  ledger_tx uuid,
  reference text check (reference is null or length(reference) <= 80),
  paid_on date,
  recorded_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'deduction' or (line_id is not null and run_id is not null)),
  check (kind <> 'mpesa' or (applied_at is not null and reference is not null))
);

comment on table public.stays_fee_settlement is
  'What paid a stays management fee invoice: a deduction from a host payout line (booked when the run is approved) or an M-Pesa payment Finance recorded.';

create index if not exists stays_fee_settlement_invoice_idx on public.stays_fee_settlement (invoice_id);
create index if not exists stays_fee_settlement_run_idx on public.stays_fee_settlement (run_id) where run_id is not null;
create unique index if not exists stays_fee_settlement_mpesa_ref
  on public.stays_fee_settlement (upper(reference)) where kind = 'mpesa';

alter table public.stays_fee_settlement enable row level security;
revoke all on public.stays_fee_settlement from public, anon, authenticated;

/*
 * An invoice's settled parts: booked (deductions and payments), and deductions
 * waiting on a run that is not yet approved (a cancelled run's are ignored).
 */
create or replace function public.fn_stays_fee_amounts(p_invoice_id uuid)
returns table (applied_cents bigint, deducted_cents bigint, mpesa_cents bigint, pending_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(s.amount_cents) filter (where s.applied_at is not null), 0)::bigint,
    coalesce(sum(s.amount_cents) filter (where s.applied_at is not null and s.kind = 'deduction'), 0)::bigint,
    coalesce(sum(s.amount_cents) filter (where s.kind = 'mpesa'), 0)::bigint,
    coalesce(sum(s.amount_cents) filter (where s.applied_at is null and s.kind = 'deduction'
                                           and r.state is distinct from 'cancelled'), 0)::bigint
  from public.stays_fee_settlement s
  left join public.fin_settlement_run r on r.id = s.run_id
  where s.invoice_id = p_invoice_id
$$;
revoke all on function public.fn_stays_fee_amounts(uuid) from public, anon, authenticated;

/* Paid once what is booked covers it. Setting paid_at and status fires the
   ledger and receipt triggers on host_invoice. */
create or replace function public.fn_stays_fee_refresh(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.host_invoice;
  v_applied bigint;
begin
  select * into i from public.host_invoice where id = p_invoice_id for update;
  if i.id is null or not public.fn_host_invoice_is_management_fee(i.lines)
     or i.status in ('paid', 'credited') then
    return;
  end if;
  select a.applied_cents into v_applied from public.fn_stays_fee_amounts(i.id) a;
  if v_applied >= i.total then
    update public.host_invoice
       set status = 'paid', paid_at = now(),
           provider_ref = coalesce((select s.reference from public.stays_fee_settlement s
                                     where s.invoice_id = i.id and s.applied_at is not null
                                     order by s.applied_at desc limit 1), provider_ref)
     where id = i.id;
  end if;
end;
$$;
revoke all on function public.fn_stays_fee_refresh(uuid) from public, anon, authenticated;

-- ═════════════════════════════════════════ 3. the ledger and the receipt

/* As 20260101019600, and a management fee invoice is revenue of its own. */
create or replace function ledger.fn_post_host_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.host_invoice;
  v_city uuid;
  v_fee boolean;
  v_vat bigint := 0;
begin
  select * into v_inv from public.host_invoice where id = p_invoice_id;
  if not found then
    raise exception 'No such invoice.' using errcode = 'no_data_found';
  end if;
  if coalesce(v_inv.total, 0) <= 0 then
    raise exception 'Nothing to post: that invoice totals zero.' using errcode = '22023';
  end if;

  select city_id into v_city from public.host where id = v_inv.host_id;
  v_fee := public.fn_host_invoice_is_management_fee(v_inv.lines);
  /* A management fee is VAT-inclusive: take out the VAT inside it. */
  if v_fee then
    v_vat := round(v_inv.total * coalesce((public.fn_stays_setting('stays.commission_vat_pct') #>> '{}')::numeric, 16)
                   / (100 + coalesce((public.fn_stays_setting('stays.commission_vat_pct') #>> '{}')::numeric, 16)));
  end if;

  return ledger.post(
    p_kind => 'host_invoice_issued',
    p_idempotency_key => 'host_invoice:' || p_invoice_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'receivable.host', 'party_type', 'host',
        'party_id', v_inv.host_id, 'debit', v_inv.total,
        'memo', case when v_fee then 'Management fee ' else 'Invoice ' end
                || to_char(v_inv.period, 'Mon YYYY')),
      jsonb_build_object('account',
        case when v_fee then 'revenue.stays_management_fee' else 'revenue.packages' end,
        'credit', v_inv.total - v_vat))
      || case when v_vat > 0
           then jsonb_build_array(jsonb_build_object('account', 'tax.vat_output', 'credit', v_vat,
                  'memo', 'VAT in management fee ' || to_char(v_inv.period, 'Mon YYYY')))
           else '[]'::jsonb end,
    p_effective_at => v_inv.created_at,
    p_city_id => v_city,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'host_invoice');
end;
$$;

/* As 20270106060100, except a management fee invoice: each deduction and
   M-Pesa payment has already cleared its own part of the receivable. */
create or replace function ledger.fn_post_host_invoice_paid(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.host_invoice;
  v_city uuid;
begin
  select * into v_inv from public.host_invoice where id = p_invoice_id;
  if not found then
    raise exception 'No such invoice.' using errcode = 'no_data_found';
  end if;
  if v_inv.paid_at is null then
    raise exception 'That invoice is not marked paid, so there is nothing to clear.'
      using errcode = '22023';
  end if;
  if public.fn_host_invoice_is_management_fee(v_inv.lines) then
    return null;
  end if;

  select city_id into v_city from public.host where id = v_inv.host_id;

  return ledger.post(
    p_kind => 'host_invoice_paid',
    p_idempotency_key => 'host_invoice_paid:' || p_invoice_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', v_inv.total),
      jsonb_build_object('account', 'receivable.host', 'party_type', 'host',
        'party_id', v_inv.host_id, 'credit', v_inv.total,
        'memo', 'Paid ' || to_char(v_inv.period, 'Mon YYYY'))),
    p_effective_at => v_inv.paid_at,
    p_city_id => v_city,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'host_invoice_paid');
end;
$$;

/* As 20261125000100. A management fee invoice keeps its amounts in cents
   (as the ledger and the host workspace read host_invoice.total) and says how
   it was paid. Other host invoices are as before. */
create or replace function public.fn_receipt_for_host_invoice(p_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.host_invoice;
  a record;
begin
  select * into i from public.host_invoice where id = p_id;
  if i.id is null or i.status <> 'paid' then return; end if;

  if public.fn_host_invoice_is_management_fee(i.lines) then
    select * into a from public.fn_stays_fee_amounts(i.id);
    perform public.fn_receipt_issue('host', i.host_id, 'host_invoice', i.id, 'payment',
      'NexG management fee · ' || to_char(i.period, 'Mon YYYY'),
      coalesce((select jsonb_agg(jsonb_build_object(
                  'label', coalesce(x ->> 'label', 'Property') || ' · management fee',
                  'amount_cents', coalesce((x ->> 'amount_cents')::bigint, 0)))
                  from jsonb_array_elements(i.lines) x), '[]'::jsonb),
      i.total,
      case when a.deducted_cents > 0 and a.mpesa_cents > 0 then 'Payout deduction and M-Pesa'
           when a.deducted_cents > 0 then 'Deducted from your payout'
           else 'M-Pesa' end,
      i.provider_ref, i.paid_at, p_email);
    return;
  end if;

  perform public.fn_receipt_issue('host', i.host_id, 'host_invoice', i.id, 'payment',
    'NexG invoice · ' || to_char(i.period, 'Mon YYYY'),
    coalesce((select jsonb_agg(jsonb_build_object(
                'label', coalesce(x ->> 'label', x ->> 'description', 'NexG services'),
                'amount_cents', coalesce((x ->> 'amount')::numeric, (x ->> 'total')::numeric, 0)::bigint * 100))
                from jsonb_array_elements(i.lines) x),
             jsonb_build_array(jsonb_build_object('label', 'NexG services', 'amount_cents', i.total * 100))),
    i.total * 100, 'Payment', i.provider_ref, i.paid_at, p_email);
end;
$$;

-- ═══════════════════════════════════════════════════ 4. raising the invoices

/* The host is told what they owe and how it will be paid. Never raises. */
create or replace function public.fn_stays_fee_tell_host(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.host_invoice;
  h public.host;
  v_email text;
  v_sub boolean;
  v_amount text;
begin
  begin
    select * into i from public.host_invoice where id = p_invoice_id;
    select * into h from public.host where id = i.host_id;
    if i.id is null or h.id is null then return; end if;
    v_email := coalesce(public.fn_receipt_email('host', h.id), h.email);
    v_sub := (public.fn_host_subaccount(h.id, false)).id is not null;
    v_amount := 'KES ' || to_char(i.total / 100.0, 'FM999,999,990');

    perform public.fn_notify_enqueue(
      p_channel => 'email', p_recipient => v_email, p_template => 'host_management_fee',
      p_subject => 'Your NexG management fee for ' || to_char(i.period, 'FMMonth YYYY'),
      p_body => 'Hi ' || coalesce(nullif(btrim(h.contact_name), ''), h.display_name, 'there') || ',' || E'\n\n'
        || 'Your NexG management fee for ' || to_char(i.period, 'FMMonth YYYY') || ' is ' || v_amount
        || ' (' || jsonb_array_length(i.lines) || ' propert'
        || case when jsonb_array_length(i.lines) = 1 then 'y' else 'ies' end
        || ' past the free trial).' || E'\n\n'
        || case when v_sub
             then 'Your stays are paid to you directly through Paystack, so we cannot take it from a payout. '
               || 'Please pay it by M-Pesa by ' || to_char(i.due_at, 'FMDD Mon YYYY')
               || ': open Billing in your host workspace to see the invoice and how to pay.'
             else 'We will take it from your next stay payout. If that payout is smaller than the fee, '
               || 'the rest stays on the invoice for the payout after, or you can pay it by M-Pesa: '
               || 'open Billing in your host workspace to see the invoice.' end
        || E'\n\n' || '— NexG Stays',
      p_payload => jsonb_build_object('host_id', h.id, 'invoice_id', i.id, 'total_cents', i.total,
                                      'subaccount', v_sub));
  exception when others then
    raise warning 'management fee email not queued for invoice %: %', p_invoice_id, sqlerrm;
  end;
end;
$$;
revoke all on function public.fn_stays_fee_tell_host(uuid) from public, anon, authenticated;

/*
 * Raise a month's invoices. A property is billed for the month when it is
 * approved, listed, not archived or deleted, not a sample or test property,
 * its host is not offboarded, and its free trial ended on or before the 1st
 * (the month the trial ends in is free). Idempotent per host and month.
 */
create or replace function public.fn_stays_fee_raise(p_month date, p_actor text default 'system')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m0 date := date_trunc('month', p_month)::date;
  v_m1 date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_start timestamptz := (date_trunc('month', p_month)::timestamp) at time zone 'Africa/Nairobi';
  v_fee bigint := round(coalesce((public.fn_stays_setting('stays.management_fee_kes') #>> '{}')::numeric, 1000) * 100)::bigint;
  v_trial integer := coalesce((public.fn_stays_setting('stays.trial_months') #>> '{}')::integer, 1);
  h record;
  v_id uuid;
  v_raised integer := 0;
  v_existing integer := 0;
  v_total bigint := 0;
begin
  if p_month is null then
    raise exception 'Pick a month.' using errcode = '22023';
  end if;
  if v_m1 > (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'A month can be invoiced once it has ended.' using errcode = '22023';
  end if;

  if v_fee > 0 then
    for h in
      select p.host_id, count(*)::integer as n,
             jsonb_agg(jsonb_build_object(
               'kind', 'management_fee', 'property_id', p.id, 'label', p.name,
               'months', 1, 'fee_cents', v_fee, 'amount_cents', v_fee,
               'listed_at', p.listed_at,
               'trial_ended_at', p.listed_at + make_interval(months => v_trial)) order by p.name, p.id) as lines
        from public.property p
        join public.host ho on ho.id = p.host_id
       where p.review_status = 'approved' and p.listed and p.listed_at is not null
         and p.archived_at is null and p.deleted_at is null
         and not coalesce(p.is_sample, false) and not coalesce(p.accepts_test_payments, false)
         and ho.status <> 'offboarded'
         and p.listed_at + make_interval(months => v_trial) <= v_start
       group by p.host_id
    loop
      v_id := null;
      insert into public.host_invoice (host_id, period, lines, subtotal, total, status, due_at)
      values (h.host_id, v_m0, h.lines, h.n * v_fee, h.n * v_fee, 'due', v_m1 + 14)
      on conflict (host_id, period) do nothing
      returning id into v_id;
      if v_id is null then
        v_existing := v_existing + 1;
        continue;
      end if;
      v_raised := v_raised + 1;
      v_total := v_total + h.n * v_fee;
      perform public.fn_stays_fee_tell_host(v_id);
    end loop;
  end if;

  perform audit.log(
    p_actor_type => case when p_actor = 'staff' then 'staff' else 'system' end::public.actor_type,
    p_module => 'hotels', p_action => 'stays.fee_invoices_raised',
    p_actor_id => case when p_actor = 'staff' then authz.staff_id() end,
    p_actor_label => case when p_actor = 'staff' then null else '[System] · management fees' end,
    p_target_type => 'month', p_target_label => to_char(v_m0, 'Mon YYYY'),
    p_after => jsonb_build_object('month', v_m0, 'raised', v_raised, 'already_raised', v_existing,
                                  'total_cents', v_total, 'fee_cents', v_fee, 'trial_months', v_trial));

  return jsonb_build_object('ok', true, 'month', v_m0, 'raised', v_raised,
    'already_raised', v_existing, 'total_cents', v_total,
    'message', case
      when v_raised = 0 and v_existing = 0 then 'No host owes a management fee for ' || to_char(v_m0, 'FMMonth YYYY') || '.'
      when v_raised = 0 then 'Every invoice for ' || to_char(v_m0, 'FMMonth YYYY') || ' was already raised.'
      else v_raised || ' invoice' || case when v_raised = 1 then '' else 's' end || ' raised for '
        || to_char(v_m0, 'FMMonth YYYY') || ', KES ' || to_char(v_total / 100.0, 'FM999,999,990')
        || ' in all. The hosts have been emailed.' end);
end;
$$;
revoke all on function public.fn_stays_fee_raise(date, text) from public, anon, authenticated;

/* The monthly job: last month, in Nairobi. */
create or replace function public.cron_stays_fee_invoices()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.fn_stays_fee_raise(((now() at time zone 'Africa/Nairobi')::date - interval '1 month')::date, 'system')
$$;
revoke all on function public.cron_stays_fee_invoices() from public, anon, authenticated;
grant execute on function public.cron_stays_fee_invoices() to service_role;

/* Staff: "Raise invoices for <month>". Finance or hospitality. */
create or replace function public.rpc_console_stays_fee_raise(p_month date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if authz.staff_id() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not (authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()
          or authz.works_hospitality(null)) then
    raise exception 'Raising management fee invoices is for Finance or hospitality staff.'
      using errcode = '42501';
  end if;
  return public.fn_stays_fee_raise(p_month, 'staff');
end;
$$;
revoke all on function public.rpc_console_stays_fee_raise(date) from public, anon;
grant execute on function public.rpc_console_stays_fee_raise(date) to authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; stays-management-fee-invoices is not scheduled.';
    return;
  end if;
  /* 03:00 UTC on the 1st is 06:00 in Nairobi. Same name, so a re-run replaces it. */
  perform cron.schedule('stays-management-fee-invoices', '0 3 1 * *',
    $cron$select public.cron_stays_fee_invoices()$cron$);
end
$$;

-- ═══════════════════════════════════════════ 5. the payout run takes the fee

-- As 20270310000100, and a host line pays the share less any management fee still owed.
-- As 20270225000300, and riders paid automatically are not in the run.
CREATE OR REPLACE FUNCTION public.rpc_settlement_build(p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_city_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := authz.staff_id();
  v_start timestamptz;
  v_end timestamptz;
  v_run uuid;
  r public.fin_settlement_run;
  owed record;
  v_line uuid;
  v_cash bigint;
  v_net bigint;
  v_state public.settlement_line_state;
  v_hold text;
  v_minimum bigint;
  v_party_min bigint;
  v_label text;
  v_rail public.settlement_rail;
  v_dest text;
  v_partner_status public.partner_status;
  v_payout public.experience_partner_payout;
  v_host_status public.host_status;
  v_host_payout public.host_payout;
  v_lines integer := 0;
  v_held integer := 0;
  v_boundary timestamptz;
  v_sub_gross bigint;
  v_sub_ids bigint[];
  v_fee record;
  v_fee_taken bigint;
  v_take bigint;
  v_fee_list jsonb;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()) then
    raise exception 'Building a run is Finance''s.' using errcode = '42501';
  end if;

  /* Monday 00:00 to Sunday 23:59 of the week just finished. */
  v_start := coalesce(p_period_start,
    date_trunc('week', (now() at time zone 'Africa/Nairobi') - interval '7 days')
      at time zone 'Africa/Nairobi');
  v_end := coalesce(p_period_end, v_start + interval '7 days');

  select * into r from public.fin_settlement_run
   where period_start = v_start and period_end = v_end and state <> 'cancelled';

  if r.id is not null then
    if r.state not in ('draft', 'built') then
      raise exception 'That week is already %. A run is frozen once it has been checked.', r.state;
    end if;
    /* A rebuild is a full rebuild: lines released, then
       reselected. A partial one would leave yesterday's answer
       mixed with today's. */
    delete from public.fin_settled_entry where run_id = r.id;
    delete from public.fin_settlement_line where run_id = r.id;
    v_run := r.id;
  else
    insert into public.fin_settlement_run (
      reference, city_id, period_start, period_end, cutoff_at, pay_date, built_by)
    values (
      'RUN-' || to_char(v_start, 'IYYY-"W"IW'), p_city_id, v_start, v_end,
      v_end - interval '1 day',
      (v_end + interval '5 days')::date, v_me)
    returning id into v_run;
  end if;

  v_minimum := ledger.from_kes(settings.fn_num('settlement.minimum_payout', p_city_id));

  for owed in select * from public.fn_settlement_owed(v_start, v_end, p_city_id) loop
    /* A rider paid automatically (Payout rules) is paid there for everything
       from their start day; what is older stays with this run. Test riders'
       real pay stays here, since test payouts only "pay" with test money. */
    if owed.party_type = 'rider' and public.fn_rider_payout_mode(owed.party_id) <> 'run'
       and not exists (select 1 from public.rider rd where rd.id = owed.party_id and rd.accepts_test_payouts) then
      v_boundary := public.fn_rider_payout_boundary(owed.party_id, public.fn_rider_payout_rules(
        (select rd.city_id from public.rider rd where rd.id = owed.party_id)));
      select coalesce(sum(e.credit - e.debit), 0), array_agg(e.id)
        into v_sub_gross, v_sub_ids
        from ledger.entry e
       where e.id = any (owed.entry_ids) and e.effective_at < v_boundary;
      continue when v_sub_ids is null or v_sub_gross = 0;
      owed.gross_cents := v_sub_gross;
      owed.commission_cents := 0;
      owed.entry_ids := v_sub_ids;
    end if;

    v_state := 'ready';
    v_hold := null;
    v_dest := null;
    v_net := owed.gross_cents;
    v_fee_taken := 0;
    v_fee_list := '[]'::jsonb;

    if owed.party_type = 'merchant' then
      select coalesce(m.trading_name, m.legal_name),
             case m.payout_rail when 'bank' then 'bank_eft'::public.settlement_rail
                                else 'mpesa_b2b'::public.settlement_rail end
        into v_label, v_rail
        from public.merchant m where m.id = owed.party_id;

      if exists (select 1 from public.merchant m where m.id = owed.party_id
                   and m.status in ('suspended', 'delisted')) then
        v_state := 'held_suspended';
        v_hold := 'the account is suspended';
      end if;

    elsif owed.party_type = 'rider' then
      select nullif(trim(coalesce(rd.first_name,'') || ' ' || coalesce(rd.last_name,'')), ''),
             'mpesa_b2c'::public.settlement_rail
        into v_label, v_rail
        from public.rider rd where rd.id = owed.party_id;

      /*
       * Cash netting. A rider holding NexG's cash is paid the
       * difference, not the gross — and if they are holding more
       * than they earned, nothing goes out and recovery starts.
       */
      select coalesce(balance, 0) into v_cash from ledger.balance_v
       where code = 'cash.rider_on_hand:' || owed.party_id::text;

      if coalesce(v_cash, 0) > 0 then
        v_net := owed.gross_cents - v_cash;
        v_state := 'cash_netted';
        if v_net < 0 then
          v_state := 'held_suspended';
          v_hold := 'holds more of our cash than they earned · recovery';
          v_net := 0;
        end if;
      end if;

      if exists (select 1 from public.rider rd where rd.id = owed.party_id
                   and rd.status in ('suspended', 'offboarded')) then
        v_state := 'held_suspended';
        v_hold := 'the account is suspended';
      end if;

    elsif owed.party_type = 'experience_partner' then
      /*
       * An experience partner: the venue or operator behind a concierge
       * plan's blocks. Paid only to details Finance has verified; held
       * without them, and held while the partner is paused, suspended or
       * delisted.
       */
      select nullif(trim(p.name), ''), p.status
        into v_label, v_partner_status
        from public.experience_partner p where p.id = owed.party_id;

      select * into v_payout from public.experience_partner_payout x
       where x.partner_id = owed.party_id;

      v_rail := case v_payout.rail
                  when 'mpesa_phone' then 'mpesa_b2c'::public.settlement_rail
                  when 'bank' then 'bank_eft'::public.settlement_rail
                  else 'mpesa_b2b'::public.settlement_rail end;

      if v_payout.partner_id is null then
        v_state := 'held_kyc';
        v_hold := 'no payout details on file';
      elsif v_payout.verified_version is distinct from v_payout.version then
        v_state := 'held_kyc';
        v_hold := 'payout details not yet verified by Finance';
      else
        v_dest := public.fn_experience_partner_payout_masked(v_payout.rail, v_payout.account);
      end if;

      if v_partner_status in ('paused', 'suspended', 'delisted') then
        v_state := 'held_suspended';
        v_hold := 'the partner is ' || v_partner_status::text;
      end if;

    elsif owed.party_type = 'host' then
      /*
       * A host: their stay shares and referral rewards, paid together to
       * details Finance has verified (owner, 19 Nov 2026). Held without
       * them, and held while the host is paused or offboarded. Unpaid host
       * invoices are not netted off, except management fees (below).
       */
      select nullif(trim(h.display_name), ''), h.status
        into v_label, v_host_status
        from public.host h where h.id = owed.party_id;

      select * into v_host_payout from public.host_payout x
       where x.host_id = owed.party_id;

      v_rail := case v_host_payout.rail
                  when 'mpesa_phone' then 'mpesa_b2c'::public.settlement_rail
                  when 'bank' then 'bank_eft'::public.settlement_rail
                  else 'mpesa_b2b'::public.settlement_rail end;

      if v_host_payout.host_id is null then
        v_state := 'held_kyc';
        v_hold := 'no payout details on file';
      elsif v_host_payout.verified_version is distinct from v_host_payout.version then
        v_state := 'held_kyc';
        v_hold := 'payout details not yet verified by Finance';
      else
        v_dest := public.fn_experience_partner_payout_masked(v_host_payout.rail, v_host_payout.account);
      end if;

      if v_host_status in ('paused', 'offboarded') then
        v_state := 'held_suspended';
        v_hold := 'the host is ' || v_host_status::text;
      end if;

      /*
       * Management fees (owner, 26 Nov 2026; 20270332000600): what is still
       * owed on the host's fee invoices, oldest first, comes off this line,
       * never below zero. The line keeps its gross (it still re-sums to the
       * entries it claims); the fee is an adjustment. Deductions already
       * waiting in another run that is not cancelled are not taken twice. A
       * held line is netted too: the share is still NexG's to hold.
       */
      if v_net > 0 then
        for v_fee in
          select i.id, i.period, i.total - a.applied_cents - a.pending_cents as left_cents
            from public.host_invoice i
            cross join lateral public.fn_stays_fee_amounts(i.id) a
           where i.host_id = owed.party_id
             and public.fn_host_invoice_is_management_fee(i.lines)
             and i.status in ('sent', 'due', 'overdue')
           order by i.period, i.created_at, i.id
        loop
          exit when v_net - v_fee_taken <= 0;
          continue when v_fee.left_cents <= 0;
          v_take := least(v_fee.left_cents, v_net - v_fee_taken);
          v_fee_taken := v_fee_taken + v_take;
          v_fee_list := v_fee_list || jsonb_build_array(jsonb_build_object(
            'kind', 'management_fee', 'invoice_id', v_fee.id,
            'label', 'Management fee · ' || to_char(v_fee.period, 'Mon YYYY'),
            'amount_cents', -v_take));
        end loop;
        v_net := v_net - v_fee_taken;
      end if;

    else
      v_label := '[' || owed.party_type::text || ']';
      v_rail := 'credit_note';
    end if;

    /* Below the minimum, it rolls. A KES 12 payout costs more in
       provider fees than it is worth, and the rider would rather
       have it next week than not at all. */
    /* Each group has its own minimum on the Payout rules screen (riders
       first); without one, the shared settlement minimum applies. */
    v_party_min := coalesce(
      case owed.party_type::text
        when 'rider' then ledger.from_kes(settings.fn_num('payouts.rider.minimum_kes',
          coalesce(p_city_id, (select rd.city_id from public.rider rd where rd.id = owed.party_id))))
      end,
      v_minimum);
    /* A line a management fee was taken from does not roll: the fee would
       roll with it and be taken again. */
    if v_state = 'ready' and v_party_min is not null and v_net < v_party_min and v_net > 0
       and v_fee_taken = 0 then
      v_state := 'below_minimum_rolled';
      v_hold := 'under the minimum payout · rolls to next week';
    end if;

    insert into public.fin_settlement_line (
      run_id, party_type, party_id, party_label, rail, destination_masked,
      gross_cents, commission_cents, adjustments, adjustment_cents, net_cents, state, hold_reason,
      ledger_entry_ids)
    values (
      v_run, owed.party_type, owed.party_id, coalesce(v_label, '[—]'), v_rail, v_dest,
      owed.gross_cents, owed.commission_cents, v_fee_list, -v_fee_taken, greatest(v_net, 0),
      v_state, v_hold, owed.entry_ids)
    returning id into v_line;

    /*
     * Claim the entries. A line that rolls forward does not
     * claim them — that is what lets the money appear in next
     * week's run instead of vanishing.
     */
    if v_state <> 'below_minimum_rolled' then
      insert into public.fin_settled_entry (entry_id, line_id, run_id)
      select unnest(owed.entry_ids), v_line, v_run;
    else
      delete from public.fin_settlement_line where id = v_line;
      continue;
    end if;

    /* The fees taken, waiting on the run's approval (fn_stays_fee_apply_run). */
    insert into public.stays_fee_settlement (invoice_id, host_id, kind, amount_cents, line_id, run_id)
    select (x ->> 'invoice_id')::uuid, owed.party_id, 'deduction', -(x ->> 'amount_cents')::bigint,
           v_line, v_run
      from jsonb_array_elements(v_fee_list) x;

    v_lines := v_lines + 1;
    if v_state::text like 'held%' then v_held := v_held + 1; end if;
  end loop;

  perform public.fn_settlement_recompute(v_run);

  if r.state is null or r.state = 'draft' then
    perform public.fn_settlement_transition(v_run, 'built');
  end if;

  select * into r from public.fin_settlement_run where id = v_run;

  perform audit.log('staff'::public.actor_type, 'finance', 'settlement.built',
    p_target_type => 'settlement_run', p_target_id => v_run,
    p_severity => 'notice');

  return jsonb_build_object('ok', true, 'run_id', v_run, 'reference', r.reference,
    'lines', v_lines, 'held', v_held, 'totals', r.totals, 'hash', r.hash,
    'message', v_lines || ' line' || case when v_lines = 1 then '' else 's' end
      || ' built for ' || to_char(v_start, 'DD Mon') || '–' || to_char(v_end - interval '1 day', 'DD Mon')
      || '. Nothing is approved and nothing has been sent.');
end;
$function$;

revoke execute on function public.rpc_settlement_build(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_settlement_build(timestamptz, timestamptz, uuid) to authenticated;

-- ═════════════════════════════════════ 6. booked when the run is approved

/*
 * A run's fee deductions, booked once it has both signatures (approved_2: it
 * can no longer be rebuilt or cancelled). The host share given up is claimed
 * for the line it came off, so no later run counts it again.
 */
create or replace function public.fn_stays_fee_apply_run(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  v_tx uuid;
  v_n integer := 0;
begin
  for s in
    select x.*, i.period, h.city_id, r.reference as run_reference
      from public.stays_fee_settlement x
      join public.host_invoice i on i.id = x.invoice_id
      join public.host h on h.id = x.host_id
      join public.fin_settlement_run r on r.id = x.run_id
     where x.run_id = p_run_id and x.kind = 'deduction' and x.applied_at is null
     order by x.created_at, x.id
     for update of x
  loop
    v_tx := ledger.post(
      p_kind => 'host_fee_deducted',
      p_idempotency_key => 'stays_fee_deduction:' || s.id::text,
      p_entries => jsonb_build_array(
        jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
          'party_id', s.host_id, 'debit', s.amount_cents,
          'memo', 'Management fee ' || to_char(s.period, 'Mon YYYY') || ' · taken from ' || s.run_reference),
        jsonb_build_object('account', 'receivable.host', 'party_type', 'host',
          'party_id', s.host_id, 'credit', s.amount_cents,
          'memo', 'Management fee ' || to_char(s.period, 'Mon YYYY') || ' · from payout')),
      p_effective_at => now(),
      p_city_id => s.city_id,
      p_actor_kind => 'system',
      p_actor_label => '[System] · management fees',
      p_reason_code => 'stays_management_fee',
      p_related => jsonb_build_object('invoice_id', s.invoice_id, 'run_id', s.run_id,
                                      'line_id', s.line_id, 'host_id', s.host_id));

    insert into public.fin_settled_entry (entry_id, line_id, run_id)
    select e.id, s.line_id, s.run_id
      from ledger.entry e
     where e.transaction_id = v_tx and e.debit > 0
    on conflict (entry_id) do nothing;

    update public.stays_fee_settlement
       set applied_at = now(), ledger_tx = v_tx, reference = coalesce(reference, s.run_reference)
     where id = s.id;

    perform public.fn_stays_fee_refresh(s.invoice_id);

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'finance',
      p_action => 'stays.fee_deducted', p_actor_label => '[System] · management fees',
      p_target_type => 'host', p_target_id => s.host_id,
      p_city_id => s.city_id,
      p_after => jsonb_build_object('invoice_id', s.invoice_id, 'run', s.run_reference,
                                    'line_id', s.line_id, 'amount_cents', s.amount_cents));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.fn_stays_fee_apply_run(uuid) from public, anon, authenticated;

create or replace function public.tg_stays_fee_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_stays_fee_apply_run(new.id);
  return null;
end;
$$;
revoke all on function public.tg_stays_fee_on_approval() from public, anon, authenticated;

drop trigger if exists stays_fee_on_approval on public.fin_settlement_run;
create trigger stays_fee_on_approval after update of state on public.fin_settlement_run
  for each row when (new.state = 'approved_2' and old.state is distinct from new.state)
  execute function public.tg_stays_fee_on_approval();

-- ══════════════════════════════════════ 7. Finance records an M-Pesa payment

create or replace function public.fn_stays_fee_can_record()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()
$$;
revoke all on function public.fn_stays_fee_can_record() from public, anon;

create or replace function public.rpc_console_stays_fee_payment(
  p_invoice_id uuid, p_amount_kes numeric, p_reference text, p_paid_on date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  i public.host_invoice;
  a record;
  v_cents bigint;
  v_left bigint;
  v_ref text := upper(btrim(coalesce(p_reference, '')));
  v_on date := coalesce(p_paid_on, (now() at time zone 'Africa/Nairobi')::date);
  v_id uuid;
  v_tx uuid;
  v_city uuid;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.fn_stays_fee_can_record() then
    raise exception 'Recording a payment is Finance''s.' using errcode = '42501';
  end if;

  select * into i from public.host_invoice where id = p_invoice_id for update;
  if i.id is null or not public.fn_host_invoice_is_management_fee(i.lines) then
    raise exception 'That management fee invoice is not there.' using errcode = 'no_data_found';
  end if;
  if i.status in ('paid', 'credited') then
    raise exception 'That invoice is already %.', i.status using errcode = '22023';
  end if;
  if p_amount_kes is null or p_amount_kes <= 0 then
    raise exception 'Enter the amount the host paid.' using errcode = '22023';
  end if;
  v_cents := round(p_amount_kes * 100)::bigint;
  if v_ref !~ '^[A-Z0-9]{6,20}$' then
    raise exception 'Enter the M-Pesa transaction code (letters and numbers, as on the message).'
      using errcode = '22023';
  end if;
  if v_on > (now() at time zone 'Africa/Nairobi')::date or v_on < i.period then
    raise exception 'The payment date must be between the invoice month and today.' using errcode = '22023';
  end if;
  if exists (select 1 from public.stays_fee_settlement s where s.kind = 'mpesa' and upper(s.reference) = v_ref) then
    raise exception 'M-Pesa code % is already recorded.', v_ref using errcode = '23505';
  end if;

  select * into a from public.fn_stays_fee_amounts(i.id);
  v_left := i.total - a.applied_cents - a.pending_cents;
  if v_cents > v_left then
    raise exception 'At most KES % is outstanding on this invoice%.',
      to_char(greatest(v_left, 0) / 100.0, 'FM999,999,990.00'),
      case when a.pending_cents > 0 then ' (KES ' || to_char(a.pending_cents / 100.0, 'FM999,999,990.00')
        || ' is already being taken in a payout run that is not yet approved)' else '' end
      using errcode = '22023';
  end if;

  insert into public.stays_fee_settlement
    (invoice_id, host_id, kind, amount_cents, applied_at, reference, paid_on, recorded_by)
  values (i.id, i.host_id, 'mpesa', v_cents, now(), v_ref, v_on, v_me)
  returning id into v_id;

  select city_id into v_city from public.host where id = i.host_id;
  v_tx := ledger.post(
    p_kind => 'host_invoice_paid',
    p_idempotency_key => 'stays_fee_mpesa:' || v_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', v_cents, 'memo', v_ref),
      jsonb_build_object('account', 'receivable.host', 'party_type', 'host',
        'party_id', i.host_id, 'credit', v_cents,
        'memo', 'Management fee ' || to_char(i.period, 'Mon YYYY') || ' · M-Pesa ' || v_ref)),
    p_effective_at => least(now(), ((v_on::timestamp + time '12:00') at time zone 'Africa/Nairobi')),
    p_city_id => v_city,
    p_actor_kind => 'staff',
    p_actor_id => v_me,
    p_reason_code => 'stays_management_fee',
    p_related => jsonb_build_object('invoice_id', i.id, 'host_id', i.host_id, 'reference', v_ref));
  update public.stays_fee_settlement set ledger_tx = v_tx where id = v_id;

  perform public.fn_stays_fee_refresh(i.id);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'finance',
    p_action => 'stays.fee_payment_recorded', p_actor_id => v_me,
    p_target_type => 'host', p_target_id => i.host_id, p_city_id => v_city,
    p_after => jsonb_build_object('invoice_id', i.id, 'amount_cents', v_cents,
                                  'reference', v_ref, 'paid_on', v_on));

  select * into i from public.host_invoice where id = i.id;
  select * into a from public.fn_stays_fee_amounts(i.id);
  return jsonb_build_object('ok', true, 'status', i.status,
    'outstanding_kes', (i.total - a.applied_cents) / 100.0,
    'message', case when i.status = 'paid' then 'Payment recorded. The invoice is paid and the host has a receipt.'
      else 'Payment recorded. KES ' || to_char((i.total - a.applied_cents) / 100.0, 'FM999,999,990')
        || ' is still outstanding.' end);
end;
$$;
revoke all on function public.rpc_console_stays_fee_payment(uuid, numeric, text, date) from public, anon;
grant execute on function public.rpc_console_stays_fee_payment(uuid, numeric, text, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════ 8. reader

/*
 * Stays › Finance › Management Fees and the Payouts screens: the fee invoices
 * for the months in the period (amounts in KES), what was invoiced and
 * collected, and each host's fees taken in payout runs for weeks starting in
 * the period. Hospitality or Finance staff.
 */
create or replace function public.rpc_console_stays_fee_invoices(
  p_from date, p_to date, p_city uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_result jsonb;
begin
  if not (authz.reaches_module('hotels') or authz.reaches_module('finance')) then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  perform public.fn_stays_check_period(p_from, p_to);

  with inv as (
    select i.id, i.host_id, i.period, i.total, i.status, i.due_at, i.paid_at, i.provider_ref,
           i.created_at, i.lines, h.display_name as host_name, h.city_id,
           (public.fn_host_subaccount(h.id, false)).id is not null as subaccount,
           a.applied_cents, a.deducted_cents, a.mpesa_cents, a.pending_cents
      from public.host_invoice i
      join public.host h on h.id = i.host_id
      cross join lateral public.fn_stays_fee_amounts(i.id) a
     where public.fn_host_invoice_is_management_fee(i.lines)
       and i.period >= date_trunc('month', p_from)::date and i.period <= p_to
       and (p_city is null or h.city_id = p_city)
  ),
  ded as (
    select x.host_id,
           sum(x.amount_cents) filter (where x.applied_at is not null) as booked,
           sum(x.amount_cents) filter (where x.applied_at is null) as pending
      from public.stays_fee_settlement x
      join public.fin_settlement_run r on r.id = x.run_id
     where x.kind = 'deduction' and r.state <> 'cancelled'
       and r.period_start >= (p_from::timestamp) at time zone 'Africa/Nairobi'
       and r.period_start < ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi'
     group by x.host_id
  )
  select jsonb_build_object(
    'rules', jsonb_build_object(
      'management_fee_kes', coalesce((public.fn_stays_setting('stays.management_fee_kes') #>> '{}')::numeric, 1000),
      'trial_months', coalesce((public.fn_stays_setting('stays.trial_months') #>> '{}')::integer, 1)),
    'can_raise', authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()
                 or authz.works_hospitality(null),
    'can_record', public.fn_stays_fee_can_record(),
    /* The last six months that have ended, newest first. */
    'months', (select jsonb_agg(to_char(m, 'YYYY-MM-DD') order by m desc)
                 from generate_series(date_trunc('month', v_today) - interval '6 months',
                                      date_trunc('month', v_today) - interval '1 month',
                                      interval '1 month') m),
    'kpis', (select jsonb_build_object(
        'invoices', count(*),
        'invoiced_kes', coalesce(sum(total), 0) / 100.0,
        'collected_kes', coalesce(sum(applied_cents), 0) / 100.0,
        'deducted_kes', coalesce(sum(deducted_cents), 0) / 100.0,
        'mpesa_kes', coalesce(sum(mpesa_cents), 0) / 100.0,
        'pending_kes', coalesce(sum(pending_cents), 0) / 100.0,
        'outstanding_kes', coalesce(sum(greatest(total - applied_cents, 0))
                                    filter (where status not in ('paid', 'credited')), 0) / 100.0,
        'paid', count(*) filter (where status = 'paid'),
        'properties', coalesce(sum(jsonb_array_length(lines)), 0))
      from inv),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id,
        'number', 'HI-' || to_char(v.period, 'YYYYMM') || '-' || upper(left(v.id::text, 4)),
        'host_id', v.host_id, 'host_name', v.host_name, 'period', v.period,
        'properties', jsonb_array_length(v.lines),
        'lines', (select jsonb_agg(jsonb_build_object('label', x ->> 'label',
                    'amount_kes', (x ->> 'amount_cents')::bigint / 100.0)) from jsonb_array_elements(v.lines) x),
        'total_kes', v.total / 100.0,
        'deducted_kes', v.deducted_cents / 100.0,
        'mpesa_kes', v.mpesa_cents / 100.0,
        'pending_kes', v.pending_cents / 100.0,
        'outstanding_kes', greatest(v.total - v.applied_cents, 0) / 100.0,
        'status', case when v.status in ('due', 'sent') and v.due_at < v_today then 'overdue'
                       else v.status::text end,
        'due_at', v.due_at, 'paid_at', v.paid_at, 'reference', v.provider_ref,
        'subaccount', v.subaccount)
        order by v.period desc, v.host_name, v.id), '[]'::jsonb) from inv v),
    'deductions', (select coalesce(jsonb_object_agg(d.host_id, jsonb_build_object(
        'booked_kes', coalesce(d.booked, 0) / 100.0, 'pending_kes', coalesce(d.pending, 0) / 100.0)),
        '{}'::jsonb) from ded d)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.rpc_console_stays_fee_invoices(date, date, uuid) from public, anon;
grant execute on function public.rpc_console_stays_fee_invoices(date, date, uuid) to authenticated;
