-- "Close early today" works again.
--
-- The Hours board's Close early button calls rpc_merchant_hours_override with
-- a closing time and no opening time: closed = false, opens = null. The
-- table's check `hours_override_is_coherent` (closed, or both times set)
-- refused that row with 23514, so every close-early failed.
--
-- When an override keeps the business open and gives no opening time, the
-- function now takes it from the hours that day as they stand before the
-- override (fn_merchant_effective_hours), so the row says "open as usual,
-- close at X". It refuses, with a reason, when there is nothing to close
-- early from, and when the closing time would read as something else:
-- equal to opening (open all day) or before opening on a day that does not
-- run past midnight (closing the next morning).
--
-- An explicit opening time, or closed = true, behave as before. Same
-- signature, security definer, search_path and audit call; `create or
-- replace` keeps the owner and the grants. No messages contain a colon:
-- the merchant actions strip everything up to the first one.

create or replace function public.rpc_merchant_hours_override(
  p_merchant_id uuid,
  p_date date,
  p_opens time default null,
  p_closes time default null,
  p_closed boolean default false,
  p_branch_id uuid default null,
  p_reason text default null,
  p_source public.merchant_control_source default 'staff'
)
returns public.merchant_hours_override
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_override public.merchant_hours_override;
  v_is_merchant boolean;
  v_day record;
begin
  v_is_merchant := exists (
    select 1 from public.merchant_user mu
    where mu.merchant_id = p_merchant_id and mu.user_id = (select auth.uid())
  );
  if not v_is_merchant and not authz.works_merchant(p_merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;

  /* Open with a new closing time and no opening time: close early. */
  if not p_closed and p_opens is null then
    if p_closes is null then
      raise exception 'Pick a closing time.' using errcode = '22023';
    end if;
    select h.opens, h.closes, h.closed into v_day
    from public.fn_merchant_effective_hours(p_merchant_id, p_branch_id, p_date) h
    limit 1;
    if not found or v_day.closed or v_day.opens is null or v_day.closes is null then
      raise exception 'There are no opening hours that day to close early from.'
        using errcode = '22023';
    end if;
    if p_closes = v_day.opens
       or (v_day.closes > v_day.opens and p_closes < v_day.opens)
       or (v_day.closes < v_day.opens and p_closes > v_day.closes and p_closes < v_day.opens) then
      raise exception 'Pick a closing time after you open that day.' using errcode = '22023';
    end if;
    p_opens := v_day.opens;
  end if;

  insert into public.merchant_hours_override
    (merchant_id, branch_id, date, opens, closes, closed, reason, source, created_by)
  values (p_merchant_id, p_branch_id, p_date, p_opens, p_closes, p_closed,
          p_reason, p_source, authz.staff_id())
  on conflict (merchant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), date)
  do update set opens = excluded.opens, closes = excluded.closes,
                closed = excluded.closed, reason = excluded.reason, source = excluded.source
  returning * into v_override;

  perform audit.log(
    case when v_is_merchant then 'merchant_user' else 'staff' end::public.actor_type,
    'merchants', 'merchant.hours_override_set',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => to_jsonb(v_override));

  return v_override;
end;
$$;
