-- Editing and removing a host's own money records (owner, 24 Nov 2026). Until now a payment or expense, once saved,
-- could only be added to: `rpc_host_manual_finance_record` refuses any change to an existing id.
--
-- `host_manual_finance` is the host's own notebook of money received, returned and spent outside NexG. It is not on
-- the NexG ledger (NexG invoices and money movement stay in `ledger.*`), so nothing here posts or reverses a ledger
-- line. The rules follow what the record means:
--   * A recorded payment, refund, deposit or deposit return is money already in or out. It stays as it is. To adjust
--     one, the host records a refund or a deposit return, the correcting entry the table already supports. It can't
--     be removed either.
--   * A pending or failed payment record is a note of money that hasn't counted yet. Its type, amount, date,
--     reference and status can change (pending to recorded or failed, failed to pending or recorded). It stays with
--     its reservation. It can be removed.
--   * An expense (recorded or due) is the host's own cost note and never moves a guest balance. Its unit,
--     description, category, amount, date and status can change, and it can be removed.
-- Every change and removal goes to audit.log with the values before and after, so the history is kept there.
-- Refund caps are checked as on create. Because a recorded receipt or deposit can't change or go, an edit can never
-- leave an existing refund above what was received.

create or replace function public.rpc_host_manual_finance_update(p_host_id uuid, p_id uuid, p_entry jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old public.host_manual_finance;
  v_new public.host_manual_finance;
  v_balance bigint;
begin
  select * into v_old from public.host_manual_finance where id = p_id and host_id = p_host_id for update;
  if not found or not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = v_actor
      and member.role in ('owner', 'manager')
      and (member.units is null or v_old.unit_id = any(member.units))
  ) then
    raise exception 'This record is outside your workspace access.' using errcode = '42501';
  end if;

  v_new := v_old;
  v_new.amount_minor := (p_entry ->> 'amount_minor')::bigint;
  v_new.recorded_on := (p_entry ->> 'recorded_on')::date;
  v_new.status := p_entry ->> 'status';
  if v_old.kind = 'Expense' then
    v_new.unit_id := (p_entry ->> 'unit_id')::uuid;
    v_new.description := coalesce(trim(p_entry ->> 'description'), '');
    v_new.category := coalesce(trim(p_entry ->> 'category'), '');
  else
    v_new.kind := p_entry ->> 'kind';
    v_new.reference := coalesce(trim(p_entry ->> 'reference'), '');
  end if;

  -- A retry of a change that already went through (the phone's offline queue resends) is a success.
  if (v_new.unit_id, v_new.kind, v_new.amount_minor, v_new.recorded_on, v_new.status, v_new.description,
      v_new.category, v_new.reference)
    is not distinct from
     (v_old.unit_id, v_old.kind, v_old.amount_minor, v_old.recorded_on, v_old.status, v_old.description,
      v_old.category, v_old.reference) then
    return p_id;
  end if;

  if v_old.kind = 'Expense' then
    if v_new.unit_id is null or not exists (
      select 1 from public.host_user member
      join public.unit unit on unit.host_id = member.host_id
      where member.host_id = p_host_id and member.user_id = v_actor and unit.id = v_new.unit_id
        and member.role in ('owner', 'manager')
        and (member.units is null or v_new.unit_id = any(member.units))
    ) then
      raise exception 'Choose a unit in your workspace.' using errcode = '42501';
    end if;
  else
    if v_old.status = 'Recorded' then
      raise exception 'Recorded payments can''t be changed. Record a refund to adjust one.' using errcode = '22023';
    end if;
    if v_new.kind is null or v_new.kind not in ('Receipt','Refund','Deposit','Deposit refund') then
      raise exception 'Choose a receipt, refund, deposit or deposit return.' using errcode = '22023';
    end if;
    if v_new.status is distinct from v_old.status and not (
      (v_old.status = 'Pending' and v_new.status in ('Recorded','Failed'))
      or (v_old.status = 'Failed' and v_new.status in ('Pending','Recorded'))
    ) then
      raise exception 'A % record can''t become %.', lower(v_old.status), lower(coalesce(v_new.status, 'blank'))
        using errcode = '22023';
    end if;

    -- The same lock and cap as recording a new refund.
    perform 1 from public.stay where id = v_old.stay_id and host_id = p_host_id for update;
    if v_new.status = 'Recorded' and v_new.kind in ('Refund','Deposit refund') then
      select coalesce(sum(
        case
          when kind = (case v_new.kind when 'Refund' then 'Receipt' else 'Deposit' end) then amount_minor
          when kind = v_new.kind then -amount_minor
          else 0
        end
      ), 0) into v_balance from public.host_manual_finance
      where host_id = p_host_id and stay_id = v_old.stay_id and status = 'Recorded' and id <> p_id;
      if v_new.amount_minor > v_balance then
        raise exception 'The refund exceeds the recorded balance for this stay.' using errcode = '22023';
      end if;
    end if;
  end if;

  update public.host_manual_finance set
    unit_id = v_new.unit_id,
    kind = v_new.kind,
    amount_minor = v_new.amount_minor,
    recorded_on = v_new.recorded_on,
    status = v_new.status,
    description = v_new.description,
    category = v_new.category,
    reference = v_new.reference
  where id = p_id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.manual_finance_changed',
    p_target_type => 'host_manual_finance', p_target_id => p_id,
    p_before => jsonb_build_object('kind', v_old.kind, 'unit_id', v_old.unit_id, 'amount_minor', v_old.amount_minor,
      'recorded_on', v_old.recorded_on, 'status', v_old.status, 'reference', v_old.reference,
      'category', v_old.category, 'description', v_old.description),
    p_after => jsonb_build_object('kind', v_new.kind, 'unit_id', v_new.unit_id, 'amount_minor', v_new.amount_minor,
      'recorded_on', v_new.recorded_on, 'status', v_new.status, 'reference', v_new.reference,
      'category', v_new.category, 'description', v_new.description));
  return p_id;
exception
  when unique_violation then
    raise exception 'That payment reference is already recorded.' using errcode = '23505';
  when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format
    or numeric_value_out_of_range then
    raise exception 'Check the amount, date, type and reference for this entry.' using errcode = '22023';
end;
$$;

revoke execute on function public.rpc_host_manual_finance_update(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rpc_host_manual_finance_update(uuid, uuid, jsonb) to authenticated;

create or replace function public.rpc_host_manual_finance_remove(p_host_id uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old public.host_manual_finance;
begin
  select * into v_old from public.host_manual_finance where id = p_id and host_id = p_host_id for update;
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = v_actor
      and member.role in ('owner', 'manager')
      and (member.units is null or v_old.id is null or v_old.unit_id = any(member.units))
  ) then
    raise exception 'This record is outside your workspace access.' using errcode = '42501';
  end if;
  -- Already gone (a retry from the phone's offline queue): nothing left to do.
  if v_old.id is null then
    return null;
  end if;
  if v_old.kind <> 'Expense' and v_old.status = 'Recorded' then
    raise exception 'Recorded payments can''t be removed. Record a refund to adjust one.' using errcode = '22023';
  end if;

  delete from public.host_manual_finance where id = p_id;
  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.manual_finance_removed',
    p_target_type => 'host_manual_finance', p_target_id => p_id,
    p_before => jsonb_build_object('kind', v_old.kind, 'unit_id', v_old.unit_id, 'stay_id', v_old.stay_id,
      'amount_minor', v_old.amount_minor, 'recorded_on', v_old.recorded_on, 'status', v_old.status,
      'reference', v_old.reference, 'category', v_old.category, 'description', v_old.description));
  return p_id;
end;
$$;

revoke execute on function public.rpc_host_manual_finance_remove(uuid, uuid) from public, anon;
grant execute on function public.rpc_host_manual_finance_remove(uuid, uuid) to authenticated;

-- Register the host money actions, so audit.log doesn't treat them as unknown and raise unregistered_action.
-- 'host.manual_finance_recorded' (20261113000200) predates the registry and was never added; it's added here too.
insert into audit.action_registry (action, module, default_severity, money, description) values
  ('host.manual_finance_recorded', 'hotels', 'info', true, 'Host recorded a payment, refund, deposit or expense by hand'),
  ('host.manual_finance_changed', 'hotels', 'info', true, 'Host changed a hand-entered money record'),
  ('host.manual_finance_removed', 'hotels', 'info', true, 'Host removed a hand-entered money record that never counted')
on conflict (action) do nothing;
