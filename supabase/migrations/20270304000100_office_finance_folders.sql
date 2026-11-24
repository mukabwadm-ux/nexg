-- Office Finance: five folders for the office's own money papers.
--
-- Finance → Office Finance gains a Files tab. It shows five Company folders,
-- each holding the folders its papers are filed in:
--
--   Income & Receivables      Company revenue, Other income, Invoices issued,
--                             Unpaid customer or partner balances
--   Payroll & Staff Payments  Salaries, Allowances, Bonuses, Reimbursements,
--                             Payroll deductions
--   Petty Cash & Advances     Office cash, Staff advances, Field expenses,
--                             Cash reconciliation
--   Suppliers & Payables      Supplier invoices, Bills, Payment requests,
--                             Outstanding balances
--   Bank & Cash Accounts      Company bank accounts, M-PESA accounts,
--                             Cash balances, Transfers
--
-- They are ordinary Company folders (same files, rights and storage), so they
-- also show in Company → Files, after the twelve.
--
--   1. company_folder.area marks a top-level folder that another screen also
--      shows; 'office_finance' is the Files tab. Null for every other folder.
--      A column rather than the names, because every name stays editable.
--   2. company_folder_v gains area (new column at the end).
--   3. The five folders and their folders are created where missing, matched
--      by name, so running this twice changes nothing. A top-level folder of
--      the same name that already exists is used and marked.
--
-- Rollback (in this order):
--   delete the folders this file created (empty ones only);
--   re-run company_folder_v from 20270106010100;
--   alter table public.company_folder drop column area.

-- ═══════════════════════════════════════════════════════════ the column

alter table public.company_folder
  add column if not exists area text;

alter table public.company_folder
  drop constraint if exists company_folder_area_check,
  add constraint company_folder_area_check
    check (area is null or (area = 'office_finance' and parent_id is null));

comment on column public.company_folder.area is
  'Another screen that also shows this top-level folder: office_finance = Finance → Office Finance → Files. Null otherwise.';

-- ═════════════════════════════════════════════════════════════ the view

/* As in 20270106010100, with area at the end. */
create or replace view public.company_folder_v
with (security_invoker = true) as
select
  f.id,
  f.name,
  f.color,
  f.created_by,
  f.created_at,
  f.updated_at,
  coalesce(c.files, 0) as file_count,
  coalesce(c.bytes, 0) as bytes,
  c.last_change,
  f.parent_id,
  f.sort,
  (select count(*) from public.company_folder s where s.parent_id = f.id) as sub_count,
  coalesce(t.files, 0) as all_file_count,
  coalesce(t.bytes, 0) as all_bytes,
  t.last_change as all_last_change,
  f.area
from public.company_folder f
left join lateral (
  select count(*) as files, sum(x.size_bytes)::bigint as bytes, max(x.updated_at) as last_change
  from public.company_file x
  where x.folder_id = f.id and x.deleted_at is null
) c on true
left join lateral (
  select count(*) as files, sum(x.size_bytes)::bigint as bytes, max(x.updated_at) as last_change
  from public.company_file x
  where x.deleted_at is null
    and (x.folder_id = f.id
         or x.folder_id in (select s.id from public.company_folder s where s.parent_id = f.id))
) t on true;

revoke all on public.company_folder_v from anon;
revoke insert, update, delete, truncate, references, trigger on public.company_folder_v from authenticated;
grant select on public.company_folder_v to authenticated;

-- ══════════════════════════════════════════════════════ the five folders

do $$
declare
  v_tree jsonb := $tree$[
    {"name": "Income & Receivables",
     "subs": ["Company revenue", "Other income", "Invoices issued", "Unpaid customer or partner balances"]},
    {"name": "Payroll & Staff Payments",
     "subs": ["Salaries", "Allowances", "Bonuses", "Reimbursements", "Payroll deductions"]},
    {"name": "Petty Cash & Advances",
     "subs": ["Office cash", "Staff advances", "Field expenses", "Cash reconciliation"]},
    {"name": "Suppliers & Payables",
     "subs": ["Supplier invoices", "Bills", "Payment requests", "Outstanding balances"]},
    {"name": "Bank & Cash Accounts",
     "subs": ["Company bank accounts", "M-PESA accounts", "Cash balances", "Transfers"]}
  ]$tree$;
  v_folder jsonb;
  v_sub text;
  v_parent uuid;
  v_i integer := 0;
  v_j integer;
begin
  for v_folder in select value from jsonb_array_elements(v_tree) loop
    v_i := v_i + 1;

    select f.id into v_parent
      from public.company_folder f
     where f.parent_id is null and lower(btrim(f.name)) = lower(v_folder ->> 'name');

    if v_parent is null then
      /* After the twelve (sorted 10–120). */
      insert into public.company_folder (name, color, sort, area)
      values (v_folder ->> 'name', 'green', 200 + v_i * 10, 'office_finance')
      returning id into v_parent;
    else
      update public.company_folder set area = 'office_finance'
       where id = v_parent and area is distinct from 'office_finance';
    end if;

    v_j := 0;
    for v_sub in select value #>> '{}' from jsonb_array_elements(v_folder -> 'subs') loop
      v_j := v_j + 1;
      insert into public.company_folder (name, color, parent_id, sort)
      select v_sub, 'green', v_parent, v_j * 10
       where not exists (select 1 from public.company_folder f
                          where f.parent_id = v_parent and lower(btrim(f.name)) = lower(v_sub));
    end loop;
  end loop;
end
$$;
