-- The merchant toggle stops being a boolean.
--
-- `rpc_merchant_set_featured` writes `merchant.featured` directly.
-- That worked when the column was the only answer; now the column
-- is derived from live slot weeks and a trigger keeps it so, which
-- means the old RPC writes a value that gets overwritten the next
-- time anything touches a slot. A control that appears to work and
-- silently undoes itself is worse than one that refuses.
--
-- So the toggle now means what the person pressing it thinks it
-- means: turning it off ends the placement, and turning it on asks
-- which slot and at what price — because "featured" is a thing
-- somebody bought, not a flag.

/*
 * Dropped before it is recreated: the old form returns something
 * else, and CREATE OR REPLACE cannot change a return type. Dropping
 * it also removes the overload that would otherwise make every
 * existing two-argument call ambiguous.
 */
drop function if exists public.rpc_merchant_set_featured(uuid, boolean);
drop function if exists public.rpc_merchant_set_featured(uuid, boolean, text);

create or replace function public.rpc_merchant_set_featured(
  p_merchant_id uuid,
  p_featured boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_booking uuid;
  m public.merchant;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if not found then raise exception 'No such merchant.'; end if;

  if not (authz.is_super_admin()
          or authz.reaches_module('featured')
          or authz.can_manage_merchants(m.city_id)) then
    raise exception 'You cannot change featured placement.' using errcode = '42501';
  end if;

  if p_featured then
    /*
     * There is no honest way to turn this on from here. Being
     * featured means holding a slot, in a city, for a week, at a
     * price — none of which a toggle can supply, and inventing them
     * would put a merchant on the homepage with a booking nobody
     * can invoice.
     */
    raise exception 'Pick a slot to feature % in. Being featured means holding a placement for a week at an agreed price, and a toggle cannot say which slot or how much — use Featured slots, or the Feature button on this page.',
      coalesce(m.trading_name, m.legal_name);
  end if;

  if not public.fn_merchant_is_featured(p_merchant_id) then
    return jsonb_build_object('ok', true, 'unchanged', true,
      'message', 'They are not featured.');
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. Somebody paid for the week you are ending.';
  end if;

  /* End every live booking this merchant holds. */
  for v_booking in
    select distinct b.id
    from public.featured_booking b
    join public.featured_slot_week sw on sw.booking_id = b.id
    where b.merchant_id = p_merchant_id
      and sw.status = 'live'
      and sw.week_start <= current_date
      and current_date <= sw.week_start + 6
  loop
    perform public.rpc_featured_end_now(v_booking, p_reason);
  end loop;

  return jsonb_build_object('ok', true,
    'message', coalesce(m.trading_name, m.legal_name)
      || ' is off the homepage. Finance will see the week was cut short.');
end;
$$;

grant execute on function public.rpc_merchant_set_featured(uuid, boolean, text) to authenticated;

comment on function public.rpc_merchant_set_featured is
  'Turning featured off ends the placement. Turning it on is refused and says why: being featured means holding a slot for a week at an agreed price, and a toggle cannot supply any of those.';

-- ═══════════════════════ what the merchant console reads

/*
 * Enough for the merchants list and detail panel to show the real
 * state rather than a flag: which placement, until when, and what
 * they are paying.
 */
/* Dropped first: a replace cannot remove or reorder columns. */
drop view if exists public.merchant_featured_v;
create view public.merchant_featured_v
with (security_invoker = true) as
select
  b.merchant_id,
  b.id as booking_id,
  b.placement_id,
  p.kind as placement_kind,
  p.category as placement_category,
  p."position",
  b.city_id,
  c.name as city_name,
  b.quoted_price as price_per_week,
  b.weeks,
  b.start_date,
  b.end_date,
  sw.week_start,
  sw.week_start + 6 as until,
  b.status as booking_status,
  b.requested_via,
  b.notes,
  exists (select 1 from public.featured_creative cr
          where cr.booking_id = b.id and cr.status = 'approved') as has_creative,
  su.email as booked_by_email
from public.featured_slot_week sw
join public.featured_booking b on b.id = sw.booking_id
join public.featured_placement p on p.id = sw.placement_id
left join public.city c on c.id = b.city_id
left join public.staff_user su on su.id = b.booked_by
where sw.status = 'live'
  and sw.week_start <= current_date
  and current_date <= sw.week_start + 6;

grant select on public.merchant_featured_v to authenticated;

comment on view public.merchant_featured_v is
  'What a merchant''s featured placement actually is, for the console: which slot, until when, at what price, booked by whom. The boolean on the merchant row only says yes or no.';

/* Every open slot somebody could be sold, for the picker. */
drop view if exists public.featured_open_slot_v;
create view public.featured_open_slot_v
with (security_invoker = true) as
select
  p.id as placement_id,
  p.kind,
  p.category,
  p."position",
  p.city_id,
  c.name as city_name,
  w.week_start,
  w.week_start + 6 as week_end,
  coalesce(sw.status::text, 'open') as status,
  sw.booking_id,
  (select coalesce(m.trading_name, m.legal_name) from public.merchant m
    join public.featured_booking b on b.merchant_id = m.id
   where b.id = sw.booking_id) as sold_to,
  /* Null until a rate card is published — the console shows [—]
     and the person selling agrees a number on the call. */
  public.fn_featured_price(p.city_id, p.kind, p.category, w.week_start) as list_price
from public.featured_placement p
cross join lateral (
  select (date_trunc('week', now()) + make_interval(weeks => g))::date as week_start
  from generate_series(0, 7) g
) w
left join public.featured_slot_week sw
  on sw.placement_id = p.id and sw.week_start = w.week_start
left join public.city c on c.id = p.city_id
where p.enabled;

grant select on public.featured_open_slot_v to authenticated;
