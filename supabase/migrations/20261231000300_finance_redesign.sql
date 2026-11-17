-- Finance, redesigned. Two parts:
--
--   1. Office finance (tables, bucket, rpc_office_*): what NexG spends on
--      running itself.
--   2. Read-only lists for the other Finance screens (end of file): every
--      movement of money and every invoice, for anyone who reaches
--      Finance. They read; they write nothing.
--
-- Office finance. Rent, utilities, salaries, supplies, travel, IT: every office expense is
-- recorded with who was paid and why, approved by a second person, then
-- marked paid with the M-Pesa or bank reference. Each category can carry a
-- monthly budget, so the console shows spend against plan.
--
-- This is a register of company spending, kept apart from the platform
-- ledger (orders, merchants, riders), which it does not post to.
--
-- Rules, all enforced here:
--   * Anyone who reaches the Finance module reads expenses and budgets.
--     Recording, approving, paying and budgeting need full Finance
--     (authz.has_full_finance): finance and super admins.
--   * Two people: whoever recorded an expense cannot approve it. A super
--     admin can, and that approval is logged for review.
--   * Nothing is paid before it is approved, and a paid expense is final.
--   * Receipts live in the private office-receipts bucket and are read
--     through short signed links by people who reach Finance.
--   * Every change goes through an rpc_office_* function that writes
--     audit.log; the tables have no write policies.
--
-- Rollback:
--   drop function public.rpc_office_expense_save(date, text, text, bigint, text, uuid, uuid, text, text, uuid),
--     public.rpc_office_expense_decide(uuid, boolean, text),
--     public.rpc_office_expense_pay(uuid, text, text, date),
--     public.rpc_office_expense_cancel(uuid, text),
--     public.rpc_office_budget_set(date, text, bigint),
--     authz.finance_reads();
--   drop table public.fin_office_budget, public.fin_office_expense;
--   drop sequence public.fin_office_expense_seq;
--   empty office-receipts through the Storage API, then
--     delete from storage.buckets where id = 'office-receipts';
--   delete from audit.action_registry where action like 'finance.office\_%';
--   drop function public.rpc_finance_invoices(date, date),
--     public.rpc_finance_transaction_summary(date, date),
--     public.rpc_finance_transactions(date, date, text, integer),
--     public.fn_finance_period_check(date, date),
--     public.fn_finance_movements(date, date);
--   (drop these five before authz.finance_reads, which they call)

-- ═══════════════════════════════════════════════════════════ who reads

create or replace function authz.finance_reads()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin() or authz.reaches_module('finance')
$$;

comment on function authz.finance_reads() is
  'True for staff who reach the Finance module at any level: they read office expenses, budgets and receipts.';

revoke execute on function authz.finance_reads() from public, anon;
grant execute on function authz.finance_reads() to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════ the register

create sequence public.fin_office_expense_seq;

create table public.fin_office_expense (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (
    'EXP-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY') || '-'
    || lpad(nextval('public.fin_office_expense_seq')::text, 4, '0')),
  spent_on date not null,
  description text not null check (length(btrim(description)) between 3 and 200),
  category text not null check (category in (
    'rent_utilities', 'salaries_wages', 'office_supplies', 'transport_travel', 'it_systems',
    'marketing', 'professional_fees', 'repairs_maintenance', 'insurance', 'bank_charges',
    'other')),
  payee text not null check (length(btrim(payee)) between 2 and 120),
  vendor_id uuid references public.company_vendor (id) on delete set null,
  location_id uuid references public.company_location (id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'paid', 'rejected', 'cancelled')),
  submitted_by uuid references public.staff_user (id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  payment_method text check (
    payment_method is null
    or payment_method in ('mpesa', 'bank_transfer', 'cash', 'card', 'cheque', 'other')),
  payment_reference text check (payment_reference is null or length(payment_reference) <= 80),
  paid_on date,
  paid_by uuid references public.staff_user (id) on delete set null,
  receipt_path text check (receipt_path is null or length(receipt_path) <= 300),
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /* A paid expense says how and when. */
  constraint fin_office_expense_paid_has_method check (
    status <> 'paid' or (payment_method is not null and paid_on is not null))
);

create index fin_office_expense_spent_idx on public.fin_office_expense (spent_on desc);
create index fin_office_expense_status_idx on public.fin_office_expense (status, spent_on desc);
create index fin_office_expense_category_idx on public.fin_office_expense (category, spent_on);
create index fin_office_expense_vendor_idx on public.fin_office_expense (vendor_id);
create index fin_office_expense_location_idx on public.fin_office_expense (location_id);
create index fin_office_expense_submitted_by_idx on public.fin_office_expense (submitted_by);

comment on table public.fin_office_expense is
  'Office expenses: what NexG spends on running itself, approved by a second person and marked paid with its reference. Not posted to the platform ledger.';

/* A budget per category per month. */
create table public.fin_office_budget (
  month date not null check (extract(day from month) = 1),
  category text not null check (category in (
    'rent_utilities', 'salaries_wages', 'office_supplies', 'transport_travel', 'it_systems',
    'marketing', 'professional_fees', 'repairs_maintenance', 'insurance', 'bank_charges',
    'other')),
  amount_cents bigint not null check (amount_cents >= 0),
  set_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (month, category)
);

alter table public.fin_office_expense enable row level security;
alter table public.fin_office_budget enable row level security;

create policy fin_office_expense_read on public.fin_office_expense
  for select to authenticated using ((select authz.finance_reads()));
create policy fin_office_budget_read on public.fin_office_budget
  for select to authenticated using ((select authz.finance_reads()));

revoke all on table public.fin_office_expense from anon;
revoke all on table public.fin_office_budget from anon;
revoke insert, update, delete, truncate, references, trigger on table public.fin_office_expense
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.fin_office_budget
  from authenticated;
grant select on table public.fin_office_expense to authenticated;
grant select on table public.fin_office_budget to authenticated;
revoke all on sequence public.fin_office_expense_seq from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ receipts

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('office-receipts', 'office-receipts', false, 10 * 1024 * 1024,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/* Uploaded into the uploader's own folder by people who record expenses,
   read by everyone who reaches Finance. Nothing is ever deleted: a receipt
   is part of the record. */
create policy office_receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'office-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select authz.has_full_finance()));

create policy office_receipts_read on storage.objects
  for select to authenticated
  using (bucket_id = 'office-receipts' and (select authz.finance_reads()));

-- ═══════════════════════════════════════════════════════ audit registry

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('finance.office_expense_recorded', 'finance', 'info', false, false, true, '{}', 'An office expense was recorded for approval'),
  ('finance.office_expense_updated', 'finance', 'info', false, false, true, '{}', 'An office expense waiting for approval was changed'),
  ('finance.office_expense_approved', 'finance', 'notice', false, true, true, '{}', 'An office expense was approved by someone other than whoever recorded it'),
  ('finance.office_expense_self_approved', 'finance', 'high', true, false, true, '{}', 'A super admin approved an office expense they recorded themselves'),
  ('finance.office_expense_rejected', 'finance', 'notice', false, false, true, '{}', 'An office expense was turned down, with a reason'),
  ('finance.office_expense_paid', 'finance', 'notice', false, false, true, '{}', 'An approved office expense was marked paid with its reference'),
  ('finance.office_expense_cancelled', 'finance', 'info', false, false, true, '{}', 'An unpaid office expense was cancelled'),
  ('finance.office_budget_set', 'finance', 'notice', false, false, true, '{}', 'A monthly office budget for a category was set or changed')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ guard

/* The caller's staff id when they may record, approve and pay. */
create or replace function authz.office_finance_require()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
begin
  if v_staff is null or not authz.has_full_finance() then
    raise exception 'Only people with full Finance access can do this.' using errcode = '42501';
  end if;
  return v_staff;
end;
$$;

revoke execute on function authz.office_finance_require() from public, anon, authenticated;
grant execute on function authz.office_finance_require() to service_role;

-- ═══════════════════════════════════════════════════════════ expenses

/*
 * Records an office expense for approval, or changes one that is still
 * waiting (or was turned down, which sends it back for approval).
 */
create or replace function public.rpc_office_expense_save(
  p_spent_on date,
  p_description text,
  p_category text,
  p_amount_cents bigint,
  p_payee text,
  p_vendor_id uuid default null,
  p_location_id uuid default null,
  p_notes text default null,
  p_receipt_path text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_old public.fin_office_expense;
  v_new public.fin_office_expense;
begin
  if p_spent_on is null or p_spent_on > (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'Enter the day it was spent, today or earlier.' using errcode = '22023';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'Enter an amount above zero.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 3 then
    raise exception 'Say what it was for.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_payee, ''))) < 2 then
    raise exception 'Say who was paid.' using errcode = '22023';
  end if;
  if p_receipt_path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'office-receipts' and o.name = p_receipt_path) then
    raise exception 'The receipt did not arrive. Try again.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.fin_office_expense (
      spent_on, description, category, payee, vendor_id, location_id, amount_cents,
      notes, receipt_path, submitted_by)
    values (
      p_spent_on, btrim(p_description), p_category, btrim(p_payee), p_vendor_id, p_location_id,
      p_amount_cents, nullif(btrim(p_notes), ''), p_receipt_path, v_staff)
    returning * into v_new;
  else
    select * into v_old from public.fin_office_expense where id = p_id for update;
    if v_old.id is null then
      raise exception 'That expense no longer exists.' using errcode = 'P0002';
    end if;
    if v_old.status not in ('submitted', 'rejected') then
      raise exception 'Only an expense waiting for approval or turned down can be changed.'
        using errcode = '23514';
    end if;
    update public.fin_office_expense
    set spent_on = p_spent_on,
        description = btrim(p_description),
        category = p_category,
        payee = btrim(p_payee),
        vendor_id = p_vendor_id,
        location_id = p_location_id,
        amount_cents = p_amount_cents,
        notes = nullif(btrim(p_notes), ''),
        receipt_path = coalesce(p_receipt_path, receipt_path),
        status = 'submitted',
        submitted_at = case when status = 'rejected' then now() else submitted_at end,
        decided_by = null,
        decided_at = null,
        decision_note = null,
        updated_at = now()
    where id = p_id
    returning * into v_new;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance',
    p_action => case when p_id is null then 'finance.office_expense_recorded'
                     else 'finance.office_expense_updated' end,
    p_actor_id => v_staff,
    p_target_type => 'fin_office_expense', p_target_id => v_new.id,
    p_target_label => v_new.number || ' · ' || v_new.description,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new));

  return v_new.id;
end;
$$;

/* Approve or turn down. Two people: whoever recorded it cannot decide,
   except a super admin, which is logged for review. */
create or replace function public.rpc_office_expense_decide(
  p_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_old public.fin_office_expense;
  v_new public.fin_office_expense;
  v_self boolean;
begin
  select * into v_old from public.fin_office_expense where id = p_id for update;
  if v_old.id is null then
    raise exception 'That expense no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status <> 'submitted' then
    raise exception 'This expense is not waiting for a decision.' using errcode = '23514';
  end if;
  v_self := v_old.submitted_by = v_staff;
  if v_self and not authz.is_super_admin() then
    raise exception 'Someone other than whoever recorded it has to approve this expense.'
      using errcode = '42501';
  end if;
  if not p_approve and nullif(btrim(p_note), '') is null then
    raise exception 'Say why it is turned down.' using errcode = '22023';
  end if;

  update public.fin_office_expense
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = v_staff,
      decided_at = now(),
      decision_note = nullif(btrim(p_note), ''),
      updated_at = now()
  where id = p_id
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance',
    p_action => case
      when not p_approve then 'finance.office_expense_rejected'
      when v_self then 'finance.office_expense_self_approved'
      else 'finance.office_expense_approved' end,
    p_actor_id => v_staff,
    p_target_type => 'fin_office_expense', p_target_id => p_id,
    p_target_label => v_new.number || ' · ' || v_new.description,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', v_new.status, 'amount_cents', v_new.amount_cents),
    p_reason => nullif(btrim(p_note), ''));
end;
$$;

/* Marks an approved expense paid, with how and the reference. */
create or replace function public.rpc_office_expense_pay(
  p_id uuid,
  p_method text,
  p_reference text default null,
  p_paid_on date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_old public.fin_office_expense;
  v_new public.fin_office_expense;
  v_paid_on date := coalesce(p_paid_on, (now() at time zone 'Africa/Nairobi')::date);
begin
  if p_method not in ('mpesa', 'bank_transfer', 'cash', 'card', 'cheque', 'other') then
    raise exception 'Choose how it was paid.' using errcode = '22023';
  end if;
  if p_method in ('mpesa', 'bank_transfer') and nullif(btrim(p_reference), '') is null then
    raise exception 'Enter the M-Pesa or bank reference.' using errcode = '22023';
  end if;
  select * into v_old from public.fin_office_expense where id = p_id for update;
  if v_old.id is null then
    raise exception 'That expense no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status <> 'approved' then
    raise exception 'Only an approved expense can be marked paid.' using errcode = '23514';
  end if;
  if v_paid_on > (now() at time zone 'Africa/Nairobi')::date or v_paid_on < v_old.spent_on - 366 then
    raise exception 'Enter the day it was paid.' using errcode = '22023';
  end if;

  update public.fin_office_expense
  set status = 'paid',
      payment_method = p_method,
      payment_reference = nullif(btrim(p_reference), ''),
      paid_on = v_paid_on,
      paid_by = v_staff,
      updated_at = now()
  where id = p_id
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.office_expense_paid',
    p_actor_id => v_staff,
    p_target_type => 'fin_office_expense', p_target_id => p_id,
    p_target_label => v_new.number || ' · ' || v_new.description,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', v_new.status, 'amount_cents', v_new.amount_cents,
                                  'payment_method', v_new.payment_method,
                                  'payment_reference', v_new.payment_reference,
                                  'paid_on', v_new.paid_on));
end;
$$;

create or replace function public.rpc_office_expense_cancel(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_old public.fin_office_expense;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Say why it is cancelled.' using errcode = '22023';
  end if;
  select * into v_old from public.fin_office_expense where id = p_id for update;
  if v_old.id is null then
    raise exception 'That expense no longer exists.' using errcode = 'P0002';
  end if;
  if v_old.status in ('paid', 'cancelled') then
    raise exception 'A paid or cancelled expense stays as it is.' using errcode = '23514';
  end if;

  update public.fin_office_expense
  set status = 'cancelled', decision_note = btrim(p_reason), updated_at = now()
  where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.office_expense_cancelled',
    p_actor_id => v_staff,
    p_target_type => 'fin_office_expense', p_target_id => p_id,
    p_target_label => v_old.number || ' · ' || v_old.description,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', 'cancelled'),
    p_reason => btrim(p_reason));
end;
$$;

-- ═════════════════════════════════════════════════════════════ budgets

/* Sets one category's budget for one month (the first of the month). */
create or replace function public.rpc_office_budget_set(
  p_month date,
  p_category text,
  p_amount_cents bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_month date := date_trunc('month', p_month)::date;
  v_old bigint;
begin
  if p_month is null or p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'Enter a month and an amount (zero or more).' using errcode = '22023';
  end if;
  select b.amount_cents into v_old from public.fin_office_budget b
  where b.month = v_month and b.category = p_category;

  insert into public.fin_office_budget (month, category, amount_cents, set_by)
  values (v_month, p_category, p_amount_cents, v_staff)
  on conflict (month, category) do update
  set amount_cents = excluded.amount_cents, set_by = excluded.set_by, updated_at = now();

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'finance.office_budget_set',
    p_actor_id => v_staff,
    p_target_type => 'fin_office_budget', p_target_id => null,
    p_target_label => p_category || ' · ' || to_char(v_month, 'Mon YYYY'),
    p_before => case when v_old is null then null
                     else jsonb_build_object('amount_cents', v_old) end,
    p_after => jsonb_build_object('month', v_month, 'category', p_category,
                                  'amount_cents', p_amount_cents));
end;
$$;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'rpc\_office\_%')
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;


-- ═══════════════════════════════════════════ every movement of money, in one shape

/*
 * Transactions, Settlements, Reconciliations and Reports read the same
 * rows, built here from the tables that record money moving:
 *
 *   payment   money in: orders and stays (customers), featured slots
 *             (merchants), float top-ups (riders)
 *   refund    money back to customers
 *   b2c       M-Pesa B2C payouts with no refund row behind them
 *             (excess returned)
 *   payout    settlement lines to merchants, hosts, hotels and riders,
 *             once their run is built
 *   expense   office expenses, approved or paid
 *
 * status is successful, pending, failed, refunded or void. Void rows
 * moved no money (a refund turned down, a line rolled to next week) and
 * the screens leave them out of totals.
 *
 * It reads tables the Finance role cannot read row by row (orders,
 * merchants, riders), so it is security definer and only the
 * rpc_finance_* readers below may call it, after checking Finance
 * access. Customers appear by the last digits of the paying phone, never
 * by name.
 */
create or replace function public.fn_finance_movements(p_from date, p_to date)
returns table (
  source text,
  id uuid,
  reference text,
  happened_at timestamptz,
  kind text,
  category text,
  description text,
  party text,
  channel text,
  direction text,
  amount_cents bigint,
  status text,
  state text,
  provider_ref text,
  note text,
  href text
)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select (p_from::timestamp at time zone 'Africa/Nairobi') as lo,
           ((p_to + 1)::timestamp at time zone 'Africa/Nairobi') as hi
  )
  select
    'payment'::text,
    p.id,
    p.reference,
    coalesce(p.paid_at, p.created_at),
    case p.intent when 'featured_slot' then 'merchant' when 'rider_float' then 'rider'
                  else 'customer' end,
    case p.intent when 'order' then coalesce(m.category_key, m.category::text, 'orders')
                  when 'stay' then 'stays'
                  else p.intent::text end,
    case p.intent
      when 'order' then 'Order ' || coalesce(o.reference, '') || coalesce(' · ' || m.trading_name, '')
      when 'stay' then 'Stay booking'
      when 'featured_slot' then 'Featured placement'
      else 'Float top-up' end,
    case p.intent
      when 'featured_slot' then coalesce(m.trading_name, 'Merchant')
      when 'rider_float' then 'Rider'
      else 'Customer' || coalesce(' ···' || nullif(right(regexp_replace(p.payer_phone, '\D', '', 'g'), 3), ''), '')
    end,
    lower(coalesce(nullif(btrim(p.channel), ''), p.provider, 'unknown')),
    'in'::text,
    p.amount_cents,
    case p.state when 'paid' then 'successful' when 'failed' then 'failed'
                 when 'abandoned' then 'failed' when 'reversed' then 'refunded'
                 else 'pending' end,
    p.state::text,
    coalesce(p.provider_receipt, p.provider_ref),
    p.failure_reason,
    null::text
  from b
  join public.payment p on coalesce(p.paid_at, p.created_at) >= b.lo
                       and coalesce(p.paid_at, p.created_at) < b.hi
  left join public."order" o on o.id = p.order_id
  left join public.merchant m on m.id = coalesce(p.merchant_id, o.merchant_id)

  union all
  select
    'refund',
    rf.id,
    coalesce(rf.provider_ref, 'RF-' || upper(left(rf.id::text, 8))),
    coalesce(rf.issued_at, rf.requested_at),
    'refund',
    'refund',
    'Refund · order ' || coalesce(o.reference, '')
      || coalesce(' · ' || replace(rf.reason_code, '_', ' '), ''),
    'Customer' || coalesce(' ···' || nullif(right(regexp_replace(g.phone, '\D', '', 'g'), 3), ''), ''),
    case rf.method when 'mpesa_b2c' then 'mpesa' when 'wallet_credit' then 'wallet'
                   else 'original' end,
    'out',
    rf.amount_cents,
    case rf.status when 'issued' then 'refunded' when 'failed' then 'failed'
                   when 'rejected' then 'void' else 'pending' end,
    rf.status,
    rf.provider_ref,
    coalesce(rf.rejected_reason, rf.reason_text),
    null
  from b
  join public.refund rf on coalesce(rf.issued_at, rf.requested_at) >= b.lo
                       and coalesce(rf.issued_at, rf.requested_at) < b.hi
  left join public."order" o on o.id = rf.order_id
  left join public.guest g on g.id = o.guest_id

  union all
  select
    'b2c',
    mp.id,
    coalesce(mp.receipt, mp.originator_id),
    coalesce(mp.finished_at, mp.requested_at, mp.created_at),
    'refund',
    mp.purpose,
    case mp.purpose when 'return_excess' then 'Excess returned' else 'M-Pesa payout' end
      || coalesce(' · order ' || o.reference, ''),
    'Customer' || coalesce(' ···' || nullif(right(regexp_replace(mp.phone, '\D', '', 'g'), 3), ''), ''),
    'mpesa',
    'out',
    mp.amount_cents,
    case mp.state when 'sent' then 'refunded' when 'failed' then 'failed'
                  when 'cancelled' then 'void' else 'pending' end,
    mp.state,
    mp.receipt,
    coalesce(mp.result_desc, mp.reason),
    null
  from b
  join public.mpesa_payout mp on coalesce(mp.finished_at, mp.requested_at, mp.created_at) >= b.lo
                             and coalesce(mp.finished_at, mp.requested_at, mp.created_at) < b.hi
  left join public."order" o on o.id = mp.order_id
  where mp.refund_id is null

  union all
  select
    'payout',
    l.id,
    coalesce(l.provider_ref, r.reference),
    coalesce(l.paid_at, (r.pay_date::timestamp + time '09:00') at time zone 'Africa/Nairobi'),
    case l.party_type when 'rider' then 'rider' else 'merchant' end,
    l.party_type::text,
    'Weekly payout · ' || r.reference,
    l.party_label,
    case when l.state = 'cash_netted' then 'cash'
         when l.rail = 'bank_eft' then 'bank'
         when l.rail in ('credit_note', 'invoice_credit') then 'credit'
         else 'mpesa' end,
    case when l.net_cents < 0 then 'in' else 'out' end,
    abs(l.net_cents),
    case when l.state in ('paid', 'cash_netted') then 'successful'
         when l.state = 'failed' then 'failed'
         when l.state in ('rolled_forward', 'below_minimum_rolled') then 'void'
         else 'pending' end,
    l.state::text,
    l.provider_ref,
    coalesce(l.failure_reason, l.hold_reason),
    '/finance/settlements?tab=batches&run=' || r.id::text
  from b
  cross join public.fin_settlement_line l
  join public.fin_settlement_run r on r.id = l.run_id
  where r.state not in ('draft', 'cancelled')
    and coalesce(l.paid_at, (r.pay_date::timestamp + time '09:00') at time zone 'Africa/Nairobi') >= b.lo
    and coalesce(l.paid_at, (r.pay_date::timestamp + time '09:00') at time zone 'Africa/Nairobi') < b.hi

  union all
  select
    'expense',
    e.id,
    e.number,
    (coalesce(e.paid_on, e.spent_on)::timestamp + time '12:00') at time zone 'Africa/Nairobi',
    'expense',
    e.category,
    e.description,
    coalesce(v.name, e.payee),
    case when e.payment_method is null then 'not_paid'
         when e.payment_method = 'bank_transfer' then 'bank'
         else e.payment_method end,
    'out',
    e.amount_cents,
    case e.status when 'paid' then 'successful' else 'pending' end,
    e.status,
    e.payment_reference,
    e.notes,
    '/finance/office'
  from b
  join public.fin_office_expense e
    on (coalesce(e.paid_on, e.spent_on)::timestamp + time '12:00') at time zone 'Africa/Nairobi' >= b.lo
   and (coalesce(e.paid_on, e.spent_on)::timestamp + time '12:00') at time zone 'Africa/Nairobi' < b.hi
  left join public.company_vendor v on v.id = e.vendor_id
  where e.status in ('approved', 'paid')
$$;

comment on function public.fn_finance_movements(date, date) is
  'Every movement of money in a Nairobi-day period, in one shape. Internal: call rpc_finance_transactions or rpc_finance_transaction_summary.';

revoke execute on function public.fn_finance_movements(date, date) from public, anon, authenticated;

/* The checks every Finance reader makes first. */
create or replace function public.fn_finance_period_check(p_from date, p_to date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.finance_reads() then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a period: a first day and a last day on or after it.'
      using errcode = '22023';
  end if;
  if p_to - p_from > 800 then
    raise exception 'Choose a period of two years or less.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.fn_finance_period_check(date, date) from public, anon, authenticated;

/*
 * The newest movements in a period, optionally of one kind (customer,
 * merchant, rider, expense, refund), newest first. JSON rather than rows
 * so the list is not cut at the API's row limit; capped at 5,000.
 */
create or replace function public.rpc_finance_transactions(
  p_from date,
  p_to date,
  p_kind text default null,
  p_limit integer default 2000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_finance_period_check(p_from, p_to);
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.happened_at desc, x.id)
    from (
      select m.*
      from public.fn_finance_movements(p_from, p_to) m
      where p_kind is null or m.kind = p_kind
      order by m.happened_at desc, m.id
      limit greatest(1, least(coalesce(p_limit, 2000), 5000))
    ) x), '[]'::jsonb);
end;
$$;

comment on function public.rpc_finance_transactions(date, date, text, integer) is
  'Finance: the newest movements of money in a period, as JSON. Reads only.';

/*
 * Totals for a period by Nairobi day, source, kind, category, channel,
 * direction and status: what the KPI cards, trends and breakdowns are
 * summed from, whatever the length of the list.
 */
create or replace function public.rpc_finance_transaction_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_finance_period_check(p_from, p_to);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'day', g.day, 'source', g.source, 'kind', g.kind, 'category', g.category,
             'channel', g.channel, 'direction', g.direction, 'status', g.status,
             'n', g.n, 'cents', g.cents) order by g.day)
    from (
      select (m.happened_at at time zone 'Africa/Nairobi')::date as day,
             m.source, m.kind, m.category, m.channel, m.direction, m.status,
             count(*) as n, sum(m.amount_cents) as cents
      from public.fn_finance_movements(p_from, p_to) m
      group by 1, 2, 3, 4, 5, 6, 7
    ) g), '[]'::jsonb);
end;
$$;

comment on function public.rpc_finance_transaction_summary(date, date) is
  'Finance: movement totals per day, source, kind, category, channel, direction and status, as JSON. Reads only.';

-- ═══════════════════════════════════════════════════════════════ invoices

/*
 * Host invoices, hotel statements and merchant statements in one list,
 * issued in the period, plus any still unpaid past their due date
 * whenever they were issued. Amounts in cents: merchant statements keep
 * shillings (net_kes), so they are multiplied here, where fin_invoice_v
 * does not.
 *
 * Security definer because the Finance role cannot read host invoices,
 * merchant statements or the names on them row by row.
 */
create or replace function public.rpc_finance_invoices(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lo timestamptz := p_from::timestamp at time zone 'Africa/Nairobi';
  v_hi timestamptz := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  perform public.fn_finance_period_check(p_from, p_to);
  return coalesce((
    select jsonb_agg(to_jsonb(i) order by i.issued_at desc, i.id)
    from (
      select 'host'::text as party_kind, hi.id,
             'HI-' || to_char(hi.period, 'YYYYMM') || '-' || upper(left(hi.id::text, 4)) as number,
             hi.host_id as party_id, h.display_name as party_name,
             to_char(hi.period, 'Mon YYYY') as period,
             hi.total::bigint as total_cents, hi.status::text as status,
             hi.created_at as issued_at, hi.due_at, hi.paid_at, hi.provider_ref
      from public.host_invoice hi
      left join public.host h on h.id = hi.host_id
      union all
      select 'hotel', hs.id,
             'HS-' || to_char(hs.period, 'YYYYMM') || '-' || upper(left(hs.id::text, 4)),
             hs.hotel_id, ht.name, to_char(hs.period, 'Mon YYYY'),
             hs.net_invoiced::bigint, hs.status::text, hs.created_at, hs.due_at, hs.paid_at,
             hs.provider_ref
      from public.hotel_statement hs
      left join public.hotel ht on ht.id = hs.hotel_id
      union all
      select 'merchant', ms.id,
             'MS-' || to_char(ms.period_end, 'YYYYMMDD') || '-' || upper(left(ms.id::text, 4)),
             ms.merchant_id, m.trading_name,
             to_char(ms.period_start, 'DD Mon') || ' – ' || to_char(ms.period_end, 'DD Mon YYYY'),
             ms.net_kes::bigint * 100, ms.status::text, ms.created_at, null::date, ms.paid_at,
             ms.provider_ref
      from public.merchant_statement ms
      left join public.merchant m on m.id = ms.merchant_id
    ) i
    where (i.issued_at >= v_lo and i.issued_at < v_hi)
       or (i.status not in ('paid', 'credited', 'draft') and i.due_at < v_today)), '[]'::jsonb);
end;
$$;

comment on function public.rpc_finance_invoices(date, date) is
  'Finance: host invoices, hotel statements and merchant statements issued in a period or overdue, amounts in cents, as JSON. Reads only.';

revoke execute on function public.rpc_finance_transactions(date, date, text, integer) from public, anon;
revoke execute on function public.rpc_finance_transaction_summary(date, date) from public, anon;
revoke execute on function public.rpc_finance_invoices(date, date) from public, anon;
grant execute on function public.rpc_finance_transactions(date, date, text, integer)
  to authenticated, service_role;
grant execute on function public.rpc_finance_transaction_summary(date, date)
  to authenticated, service_role;
grant execute on function public.rpc_finance_invoices(date, date) to authenticated, service_role;

notify pgrst, 'reload schema';
