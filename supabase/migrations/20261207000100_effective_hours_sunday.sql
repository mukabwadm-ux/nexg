-- Sunday hours are found again for weeks written without a weekday convention.
--
-- fn_merchant_effective_hours reads merchant_hours rows tagged `monday_zero`
-- as Monday = 0. It reads untagged rows as Sunday = 0: the table's documented
-- numbering ("0 = Sunday, matching Postgres dow and JavaScript getDay"),
-- which onboarding (rpc_merchant_save_step), the demo data and the guest
-- merchant page all use. It compared untagged rows with `isodow`, though,
-- which runs from 1 (Monday) to 7 (Sunday). Monday to Saturday lined up;
-- Sunday was 7 against a row numbered 0, so it never matched. On Sundays
-- those merchants had no hours, and fn_booking_open_at, which treats no hours
-- as closed, refused app bookings.
--
-- Untagged rows are now matched on `dow`, in all three places the week is
-- looked up (city exception, chain parent, the merchant's own week). Monday to
-- Saturday give exactly what they gave before, and tagged rows are untouched.
-- Same signature, volatility, security definer and search_path;
-- `create or replace` keeps the owner, the grants and the comment.
--
-- Not fixed here: the /merchant/hours board numbers days Monday = 0 and can
-- write untagged rows (rpc_hours_set tags a new row only when its scope
-- already holds tagged rows and no untagged ones). Those rows were misread on
-- the other six days already, and are on Sundays now too. Settling one
-- numbering for untagged rows is separate work.

create or replace function public.fn_merchant_effective_hours(p_merchant_id uuid,p_branch_id uuid default null,p_date date default current_date)
returns table (opens time, closes time, closed boolean, source text)
language plpgsql stable security definer set search_path = '' as $$
declare v_merchant public.merchant; v_row record; v_dow integer := extract(isodow from p_date);
  /* Untagged rows number the week like Postgres dow: Sunday = 0. */
  v_sunday_zero integer := extract(dow from p_date);
begin
  select * into v_merchant from public.merchant where id=p_merchant_id;
  if v_merchant.id is null then return; end if;
  if p_branch_id is not null then
    select o.opens,o.closes,o.closed into v_row from public.merchant_hours_override o
      where o.merchant_id=p_merchant_id and o.branch_id=p_branch_id and o.date=p_date;
    if found then return query select v_row.opens,v_row.closes,v_row.closed,'branch override'::text; return; end if;
  end if;
  select o.opens,o.closes,o.closed into v_row from public.merchant_hours_override o
    where o.merchant_id=p_merchant_id and o.branch_id is null and o.date=p_date;
  if found then return query select v_row.opens,v_row.closes,v_row.closed,'merchant override'::text; return; end if;
  select e.default_close into v_row from public.city_hours_exception e
    where e.city_id=v_merchant.city_id and e.date=p_date and e.enabled
      and (e.applies_to_categories is null or v_merchant.category::text=any(e.applies_to_categories)) limit 1;
  if found and v_row.default_close is not null then
    return query select h.opens,least(h.closes,v_row.default_close),h.closed,'city exception'::text
      from public.merchant_hours h where h.merchant_id=p_merchant_id and
      ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
       (h.weekday_convention is null and h.day_of_week=v_sunday_zero)) limit 1;
    if found then return; end if;
  end if;
  if v_merchant.parent_merchant_id is not null then
    perform 1 from public.merchant_chain_setting where parent_id=v_merchant.parent_merchant_id and shared_hours;
    if found then
      return query select h.opens,h.closes,h.closed,'chain parent'::text from public.merchant_hours h
        where h.merchant_id=v_merchant.parent_merchant_id and
        ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
         (h.weekday_convention is null and h.day_of_week=v_sunday_zero)) limit 1;
      if found then return; end if;
    end if;
  end if;
  return query select h.opens,h.closes,h.closed,'weekly'::text from public.merchant_hours h
    where h.merchant_id=p_merchant_id and
    ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
     (h.weekday_convention is null and h.day_of_week=v_sunday_zero)) limit 1;
end;
$$;
