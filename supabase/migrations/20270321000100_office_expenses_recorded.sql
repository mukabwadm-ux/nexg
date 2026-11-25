-- Office Finance: its own role, and an expense is recorded, not approved.
--
-- Until now every office expense started as 'submitted' and waited for a
-- second person with full Finance access to approve it before it counted as
-- spend or could be marked paid, and only full Finance could record one. The
-- owner wants Office Finance to be a role of its own: whoever holds it adds
-- expenses, and each one is registered straight away.
--
--   0. The office_finance console module and the office_finance role
--      ("Office Finance"): full on Office Finance only. Every role that
--      reaches Finance keeps the same level on Office Finance, so nobody
--      loses what they had. authz.office_finance_level() gives the caller's
--      level; the office expense and budget functions are guarded by the new
--      authz.office_expense_require() (full Office Finance or full Finance);
--      reading expenses, budgets and receipts and uploading receipts follow
--      the same rule. authz.office_finance_require() is unchanged: statement
--      import, client invoices and payouts still need full Finance. The role needs no second
--      approver (only finance and super_admin do).
--   1. rpc_office_expense_save records a new expense as 'approved' (shown as
--      Recorded), so it counts in the Expenses list, budgets and reports at
--      once. Who recorded it and the finance.office_expense_recorded audit
--      entry stay as they were.
--   2. Editing works on any expense that is not paid or cancelled. A
--      'submitted' or 'rejected' one becomes recorded when saved; the
--      finance.office_expense_updated entry keeps the before and after.
--   3. fin_office_expense.status defaults to 'approved'.
--   4. Every expense still 'submitted' becomes recorded, with a system note in
--      decision_note and one system audit entry each. decided_by stays null, so
--      the expense_self_approved fraud check does not see them.
--   rpc_office_expense_decide stays for older console builds; nothing in the
--   console calls it any more. Paying and cancelling are unchanged.
--
-- Rollback (in this order):
--   re-run rpc_office_expense_pay, rpc_office_expense_cancel and
--   rpc_office_budget_set from 20261231000300; drop function
--   authz.office_expense_require(); re-run the fin_office_expense_read,
--   fin_office_budget_read, office_receipts_insert and office_receipts_read
--   policies from 20261231000300;
--   drop function authz.office_finance_level();
--   delete from public.role_module_access where module_key = 'office_finance';
--   delete from public.role_grant where role_id in (select id from public.role where key = 'office_finance');
--   delete from public.role where key = 'office_finance';
--   delete from public.console_module where key = 'office_finance';
--   alter table public.fin_office_expense alter column status set default 'submitted';
--   re-run rpc_office_expense_save from 20261231000300;
--   the expenses moved in step 4 carry decision_note
--   'Recorded automatically: office expenses no longer need approval.' and can
--   be set back to 'submitted' by that note.

-- ══════════════════════════════════════════════ 0. the module and the role

insert into public.console_module (key, label, section, href, sort, icon)
values ('office_finance', 'Office Finance', 'Money', '/finance/office', 101, 'Receipt')
on conflict (key) do update
set label = excluded.label,
    section = excluded.section,
    href = excluded.href,
    sort = excluded.sort,
    icon = excluded.icon;

insert into public.role (key, label, description)
values
  ('office_finance', 'Office Finance',
   'Office Finance: records, edits, pays and cancels office expenses, sets office budgets and uploads receipts. Each expense is recorded straight away; nobody approves it. Nothing else in Finance.')
on conflict (key) do nothing;

update public.role set landing_module = 'office_finance'
where key = 'office_finance' and landing_module is null;

insert into public.role_module_access (role_key, module_key, level, note)
values
  ('super_admin', 'office_finance', 'full', null),
  ('office_finance', 'office_finance', 'full', 'Records office expenses straight away; budgets and receipts')
on conflict (role_key, module_key) do update
set level = excluded.level,
    note = excluded.note;

/* Whoever reaches Finance keeps the same reach on Office Finance. */
insert into public.role_module_access (role_key, module_key, level, note)
select a.role_key, 'office_finance', a.level, 'Same as Finance'
  from public.role_module_access a
 where a.module_key = 'finance'
   and a.level is not null and a.level <> 'none'
   and a.role_key not in ('super_admin', 'office_finance')
on conflict (role_key, module_key) do nothing;

/* The best level the caller's live grants give on Office Finance, Finance
   counting too: 'full', 'view' (any lesser level), or null. */
create or replace function authz.office_finance_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when authz.is_super_admin() or authz.has_full_finance() then 'full'
    else (
      select case
        when bool_or(a.level = 'full' and a.module_key = 'office_finance') then 'full'
        when bool_or(a.level is not null and a.level <> 'none') then 'view'
      end
      from public.staff_user su
      join public.role_grant rg on rg.staff_user_id = su.id
      join public.role r on r.id = rg.role_id
      join public.role_module_access a
        on a.role_key = r.key and a.module_key in ('office_finance', 'finance')
      where su.id = authz.staff_id()
        and su.status = 'active'
        and rg.revoked_at is null
        and (rg.expires_at is null or rg.expires_at > now())
    )
  end
$$;

comment on function authz.office_finance_level() is
  'The caller''s level on Office Finance: full (super admin, full Finance or full Office Finance), view (any other reach of either), or null.';

revoke all on function authz.office_finance_level() from public, anon;
grant execute on function authz.office_finance_level() to authenticated, service_role;

/* The caller's staff id when they may record, change, pay and cancel office
   expenses and set office budgets. authz.office_finance_require() stays as
   it is: statement import, client invoices and payouts use it, and those
   still need full Finance. */
create or replace function authz.office_expense_require()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
begin
  if v_staff is null or authz.office_finance_level() is distinct from 'full' then
    raise exception 'Only people with Office Finance or full Finance access can do this.'
      using errcode = '42501';
  end if;
  return v_staff;
end;
$$;

revoke execute on function authz.office_expense_require() from public, anon, authenticated;
grant execute on function authz.office_expense_require() to service_role;

drop policy if exists fin_office_expense_read on public.fin_office_expense;
create policy fin_office_expense_read on public.fin_office_expense
  for select to authenticated using ((select authz.office_finance_level()) is not null);

drop policy if exists fin_office_budget_read on public.fin_office_budget;
create policy fin_office_budget_read on public.fin_office_budget
  for select to authenticated using ((select authz.office_finance_level()) is not null);

drop policy if exists office_receipts_insert on storage.objects;
create policy office_receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'office-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select authz.office_finance_level()) = 'full');

drop policy if exists office_receipts_read on storage.objects;
create policy office_receipts_read on storage.objects
  for select to authenticated
  using (bucket_id = 'office-receipts' and (select authz.office_finance_level()) is not null);

-- ═══════════════════════════════════════════════════════════ the default

alter table public.fin_office_expense alter column status set default 'approved';

comment on table public.fin_office_expense is
  'Office expenses: what NexG spends on running itself, recorded straight away (status approved, shown as Recorded) and marked paid with its reference. Not posted to the platform ledger.';

-- ════════════════════════════════════════════════════════════ recording

/*
 * Records an office expense, or changes one that is not paid or cancelled.
 * A recorded expense counts as spend at once; nobody approves it.
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
  v_staff uuid := authz.office_expense_require();
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
      notes, receipt_path, submitted_by, status)
    values (
      p_spent_on, btrim(p_description), p_category, btrim(p_payee), p_vendor_id, p_location_id,
      p_amount_cents, nullif(btrim(p_notes), ''), p_receipt_path, v_staff, 'approved')
    returning * into v_new;
  else
    select * into v_old from public.fin_office_expense where id = p_id for update;
    if v_old.id is null then
      raise exception 'That expense no longer exists.' using errcode = 'P0002';
    end if;
    if v_old.status in ('paid', 'cancelled') then
      raise exception 'A paid or cancelled expense stays as it is.' using errcode = '23514';
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
        status = 'approved',
        decision_note = case when status = 'approved' then decision_note end,
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

-- ═════════════════════════════════ paying, cancelling and budgets: same, new guard

/* As in 20261231000300, guarded by authz.office_expense_require(). */
/* Marks a recorded expense paid, with how and the reference. */
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
  v_staff uuid := authz.office_expense_require();
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
    raise exception 'Only a recorded expense can be marked paid.' using errcode = '23514';
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
  v_staff uuid := authz.office_expense_require();
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
  v_staff uuid := authz.office_expense_require();
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

revoke execute on function
  public.rpc_office_expense_save(date, text, text, bigint, text, uuid, uuid, text, text, uuid),
  public.rpc_office_expense_pay(uuid, text, text, date),
  public.rpc_office_expense_cancel(uuid, text),
  public.rpc_office_budget_set(date, text, bigint)
  from public, anon;
grant execute on function
  public.rpc_office_expense_save(date, text, text, bigint, text, uuid, uuid, text, text, uuid),
  public.rpc_office_expense_pay(uuid, text, text, date),
  public.rpc_office_expense_cancel(uuid, text),
  public.rpc_office_budget_set(date, text, bigint)
  to authenticated, service_role;

-- ══════════════════════════════════════════════ the ones still waiting

do $$
declare
  v_row public.fin_office_expense;
begin
  for v_row in
    select * from public.fin_office_expense where status = 'submitted' order by submitted_at for update
  loop
    update public.fin_office_expense
    set status = 'approved',
        decision_note = 'Recorded automatically: office expenses no longer need approval.',
        updated_at = now()
    where id = v_row.id;

    perform audit.log(
      p_actor_type => 'system', p_module => 'finance',
      p_action => 'finance.office_expense_recorded',
      p_target_type => 'fin_office_expense', p_target_id => v_row.id,
      p_target_label => v_row.number || ' · ' || v_row.description,
      p_before => jsonb_build_object('status', 'submitted'),
      p_after => jsonb_build_object('status', 'approved', 'amount_cents', v_row.amount_cents),
      p_reason => 'Office expenses no longer need approval.');
  end loop;
end
$$;
