-- Verify what is actually on the screen.
--
-- The first version of this took a single day and a single city.
-- The tiles it sits under show the month to date across every
-- city. So the button answered a different question from the one
-- being asked, and on a fresh month it answered it cheerfully:
-- "Nothing happened on this day, and nothing is shown. Agreed."
-- while the tile beside it read KES 6,395.
--
-- A verify control that checks something other than what it is
-- next to is worse than no verify control. It is a confirmation
-- of a figure nobody checked.
--
-- This version takes the range the tiles are built from and
-- re-derives every city in it, including the unattributed
-- bucket, so the comparison is like for like.

drop function if exists rpc_fin_verify(date, uuid);

create or replace function rpc_fin_verify(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shown record;
  v_fresh record;
begin
  if not authz.reads_ledger() then
    raise exception 'Only Finance can verify a figure against the ledger.';
  end if;

  if p_to < p_from then
    raise exception 'A range ends after it starts.';
  end if;

  /* The range is capped. Re-deriving a year at request time is
     the computation this whole module exists to avoid, and a
     button that can be made slow is a button that will be. */
  if p_to - p_from > 92 then
    raise exception 'Verify covers at most 92 days at a time.';
  end if;

  select
    coalesce(sum(k.orders), 0)::bigint as orders,
    coalesce(sum(k.gross_cents), 0)::bigint as gross_cents,
    coalesce(sum(k.revenue_cents), 0)::bigint as revenue_cents,
    coalesce(sum(k.net_cents), 0)::bigint as net_cents,
    coalesce(max(k.as_of_entry_id), 0)::bigint as through_entry,
    max(k.built_at) as built_at,
    count(*)::integer as rows_shown
    into v_shown
    from public.fin_kpi_daily k
   where k.day between p_from and p_to;

  /*
   * Every city and every day in the range, re-derived now. The
   * null city is unioned in deliberately: money we could not
   * attribute is part of the total, and a verification that
   * silently skipped it would pass while the Overview was
   * short.
   */
  select
    coalesce(sum(f.orders), 0)::bigint as orders,
    coalesce(sum(f.gross_cents), 0)::bigint as gross_cents,
    coalesce(sum(f.revenue_cents), 0)::bigint as revenue_cents,
    coalesce(sum(f.net_cents), 0)::bigint as net_cents,
    coalesce(max(f.as_of_entry_id), 0)::bigint as through_entry
    into v_fresh
    from generate_series(p_from, p_to, interval '1 day') d(day)
   cross join (select id from public.city union all select null::uuid) c
   cross join lateral public.fn_fin_kpi_for(d.day::date, c.id) f;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'matches', v_shown.gross_cents = v_fresh.gross_cents
               and v_shown.revenue_cents = v_fresh.revenue_cents
               and v_shown.net_cents = v_fresh.net_cents
               and v_shown.orders = v_fresh.orders,
    'built_at', v_shown.built_at,
    'shown', jsonb_build_object(
      'orders', v_shown.orders,
      'gross_cents', v_shown.gross_cents,
      'revenue_cents', v_shown.revenue_cents,
      'net_cents', v_shown.net_cents,
      'through_entry', v_shown.through_entry),
    'ledger_now', jsonb_build_object(
      'orders', v_fresh.orders,
      'gross_cents', v_fresh.gross_cents,
      'revenue_cents', v_fresh.revenue_cents,
      'net_cents', v_fresh.net_cents,
      'through_entry', v_fresh.through_entry),
    'message', case
      when v_fresh.gross_cents = 0 and v_shown.rows_shown = 0
        then 'No money moved in this period, and none is shown. Agreed.'
      when v_shown.rows_shown = 0
        then 'The ledger has ' || (v_fresh.gross_cents / 100)::text
             || ' shillings in this period and the screen shows nothing.'
             || ' The rebuild is behind or failing.'
      when v_shown.gross_cents = v_fresh.gross_cents
       and v_shown.revenue_cents = v_fresh.revenue_cents
       and v_shown.net_cents = v_fresh.net_cents
       and v_shown.orders = v_fresh.orders
        then 'Re-derived from the ledger just now across every city: the same, to the shilling.'
      when v_fresh.through_entry > v_shown.through_entry
        then 'Entries have landed since this was built. The screen is behind by '
             || (v_fresh.through_entry - v_shown.through_entry)
             || ' entries, not wrong — it catches up within two minutes.'
      else 'The screen and the ledger disagree and no new entries explain it.'
           || ' Do not act on these figures.'
    end);
end;
$$;

comment on function rpc_fin_verify is
  'Re-derives the Overview tiles from the ledger at request time and returns both figures. Takes the same range the tiles are built from, across every city including unattributed, so the comparison is like for like.';

revoke execute on function rpc_fin_verify(date, date) from public, anon;
grant execute on function rpc_fin_verify(date, date) to authenticated;
