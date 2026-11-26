-- Manual host records. NexG invoices and money movement stay in their existing ledgers.
create table public.host_manual_finance (
  id uuid primary key,
  host_id uuid not null references public.host(id) on delete cascade,
  unit_id uuid not null references public.unit(id),
  stay_id uuid references public.stay(id),
  kind text not null check (kind in ('Receipt','Refund','Deposit','Deposit refund','Expense')),
  amount_minor bigint not null check (amount_minor between 1 and 10000000000),
  recorded_on date not null,
  description text not null default '',
  category text not null default '',
  reference text not null default '',
  status text not null default 'Recorded' check (status in ('Recorded','Due','Pending','Failed')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (
    (kind = 'Expense' and stay_id is null and length(trim(description)) between 1 and 240
      and category in ('Cleaning','Maintenance','Utilities','Supplies','Other') and status in ('Recorded','Due'))
    or
    (kind <> 'Expense' and stay_id is not null and length(trim(reference)) between 1 and 100
      and status in ('Recorded','Pending','Failed'))
  )
);

create index host_manual_finance_scope on public.host_manual_finance(host_id, unit_id, recorded_on desc);
create index host_manual_finance_stay on public.host_manual_finance(stay_id) where stay_id is not null;
create unique index host_manual_finance_reference on public.host_manual_finance(host_id, kind, lower(reference))
  where stay_id is not null and status <> 'Failed';

alter table public.host_manual_finance enable row level security;
revoke all on public.host_manual_finance from anon, authenticated;
grant select on public.host_manual_finance to authenticated;

create policy host_manual_finance_read on public.host_manual_finance
for select to authenticated
using (
  exists (
    select 1 from public.host_user member
    where member.host_id = host_manual_finance.host_id and member.user_id = (select auth.uid())
      and member.role in ('owner', 'manager')
      and (member.units is null or host_manual_finance.unit_id = any(member.units))
  )
);

create function public.rpc_host_manual_finance_record(p_host_id uuid, p_entry jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid := (p_entry ->> 'id')::uuid;
  v_unit_id uuid := (p_entry ->> 'unit_id')::uuid;
  v_stay_id uuid := (p_entry ->> 'stay_id')::uuid;
  v_kind text := p_entry ->> 'kind';
  v_amount bigint := (p_entry ->> 'amount_minor')::bigint;
  v_date date := (p_entry ->> 'recorded_on')::date;
  v_description text := coalesce(trim(p_entry ->> 'description'), '');
  v_category text := coalesce(trim(p_entry ->> 'category'), '');
  v_reference text := coalesce(trim(p_entry ->> 'reference'), '');
  v_status text := p_entry ->> 'status';
  v_stay public.stay;
  v_existing public.host_manual_finance;
  v_balance bigint;
begin
  if v_stay_id is not null then
    select * into v_stay from public.stay
    where id = v_stay_id and host_id = p_host_id for update;
    v_unit_id := v_stay.unit_id;
  end if;

  if v_unit_id is null or not exists (
    select 1 from public.host_user member
    join public.unit unit on unit.host_id = member.host_id
    where member.host_id = p_host_id and member.user_id = v_actor and unit.id = v_unit_id
      and member.role in ('owner', 'manager')
      and (member.units is null or v_unit_id = any(member.units))
  ) then
    raise exception 'Choose a stay or unit in your workspace.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text, 0));
  select * into v_existing from public.host_manual_finance where id = v_id;
  if found then
    if (v_existing.host_id, v_existing.unit_id, v_existing.stay_id, v_existing.kind,
        v_existing.amount_minor, v_existing.recorded_on, v_existing.reference, v_existing.status,
        v_existing.description, v_existing.category, v_existing.created_by)
      is not distinct from
       (p_host_id, v_unit_id, v_stay_id, v_kind, v_amount, v_date, v_reference, v_status,
        v_description, v_category, v_actor) then
      return v_id;
    end if;
    raise exception 'This entry already has a recorded outcome. Reopen the form to add a new entry.'
      using errcode = '22023';
  end if;

  if v_status = 'Recorded' and v_kind in ('Refund','Deposit refund') then
    select coalesce(sum(
      case
        when kind = (case v_kind when 'Refund' then 'Receipt' else 'Deposit' end) then amount_minor
        when kind = v_kind then -amount_minor
        else 0
      end
    ), 0) into v_balance from public.host_manual_finance
    where host_id = p_host_id and stay_id = v_stay_id and status = 'Recorded';
    if v_amount > v_balance then
      raise exception 'The refund exceeds the recorded balance for this stay.' using errcode = '22023';
    end if;
  end if;

  insert into public.host_manual_finance (
    id, host_id, unit_id, stay_id, kind, amount_minor, recorded_on, description, category, reference,
    status, created_by
  ) values (
    v_id, p_host_id, v_unit_id, v_stay_id, v_kind, v_amount, v_date, v_description, v_category, v_reference,
    v_status, v_actor
  );
  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.manual_finance_recorded',
    p_target_type => 'host_manual_finance', p_target_id => v_id,
    p_after => jsonb_build_object('kind', v_kind, 'amount_minor', v_amount, 'status', v_status));
  return v_id;
exception
  when unique_violation then
    raise exception 'That payment reference is already recorded.' using errcode = '23505';
  when check_violation or not_null_violation then
    raise exception 'Check the amount, date, type and reference for this entry.' using errcode = '22023';
end;
$$;

revoke execute on function public.rpc_host_manual_finance_record(uuid, jsonb) from public, anon;
grant execute on function public.rpc_host_manual_finance_record(uuid, jsonb) to authenticated;
