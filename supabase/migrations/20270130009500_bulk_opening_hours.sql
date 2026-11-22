-- R39 (Explore H1): opening hours for many shops on a chosen date, in one call.
--
-- fn_merchant_effective_hours answers one shop, one branch and one date per
-- call. A day plan for tomorrow or a trip needs the hours of every stop on
-- that date, so the Discovery engine and the apps would make dozens of calls.
--
-- rpc_merchant_hours_on(shop ids, date) answers for up to 200 listed shops
-- (merchant_public) on one date, at each shop's primary branch, with the same
-- rules the store page and checkout use (overrides, holidays, chain hours):
--   [{merchant_id, date, opens, closes, closed, source}]
-- opens and closes are null when the shop has no hours on file for that day
-- (closed false: shown as open, as the store page does). The date may be from
-- yesterday up to 90 days ahead. Anyone may call it, as for the single form.
--
-- Rollback: drop function public.rpc_merchant_hours_on(uuid[], date) and
-- delete its wiring_anon_allow row.

create or replace function public.rpc_merchant_hours_on(
  p_merchant_ids uuid[],
  p_date date default ((now() at time zone 'Africa/Nairobi')::date)
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if p_merchant_ids is null or cardinality(p_merchant_ids) = 0 then
    return '[]'::jsonb;
  end if;
  if cardinality(p_merchant_ids) > 200 then
    raise exception 'Ask for at most 200 shops at a time.' using errcode = '22023';
  end if;
  if p_date is null or p_date < v_today - 1 or p_date > v_today + 90 then
    raise exception 'Choose a date from yesterday up to 90 days ahead.' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'merchant_id', mp.id,
             'date', p_date,
             'opens', h.opens,
             'closes', h.closes,
             'closed', coalesce(h.closed, false),
             'source', h.source) order by mp.id)
      from public.merchant_public mp
      left join public.merchant_branch b on b.merchant_id = mp.id and b.is_primary
      left join lateral public.fn_merchant_effective_hours(mp.id, b.id, p_date) h on true
     where mp.id = any (p_merchant_ids)), '[]'::jsonb);
end;
$$;
revoke execute on function public.rpc_merchant_hours_on(uuid[], date) from public;
grant execute on function public.rpc_merchant_hours_on(uuid[], date) to anon, authenticated;
comment on function public.rpc_merchant_hours_on(uuid[], date) is
  'Opening hours of up to 200 listed shops on one date (yesterday to 90 days ahead), by the store page''s rules.';

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_merchant_hours_on', 'Day plans in Discovery and the apps show when each listed shop is open, signed in or not.',
   'Read-only; listed shops (merchant_public) only; at most 200 shops and one date from yesterday to 90 days ahead; the same answer the public store page gives.')
on conflict do nothing;
