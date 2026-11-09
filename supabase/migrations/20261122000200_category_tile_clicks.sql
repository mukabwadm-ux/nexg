-- Popular categories, ordered by what visitors actually tap.
--
-- One counter per homepage tile per day: the date, which tile, how many taps.
-- Nothing about the visitor is stored (no user, no IP, no device), so this is
-- a tally rather than tracking. The site sends at most one tap per tile per
-- browser per day, and the homepage orders its tiles by the last 30 days.

create table if not exists public.category_tile_click (
  day date not null default (now() at time zone 'Africa/Nairobi')::date,
  tile text not null check (tile ~ '^[a-z][a-z_-]{1,39}$'),
  clicks integer not null default 0 check (clicks >= 0),
  primary key (day, tile)
);

comment on table public.category_tile_click is
  'Taps on the homepage category tiles, counted per tile per day. No visitor data.';

alter table public.category_tile_click enable row level security;
revoke all on public.category_tile_click from anon, authenticated;

/* Count one tap. Anyone may call it, so all it can do is add one to a known-shaped tile's daily count. */
create or replace function public.rpc_category_tile_click(p_tile text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tile is null or p_tile !~ '^[a-z][a-z_-]{1,39}$' then
    return;
  end if;
  insert into public.category_tile_click as c (day, tile, clicks)
  values ((now() at time zone 'Africa/Nairobi')::date, p_tile, 1)
  on conflict (day, tile) do update
    set clicks = least(c.clicks + 1, 1000000);
end;
$$;

/* Taps per tile over the last p_days days, most first. */
create or replace function public.rpc_category_tile_popularity(p_days integer default 30)
returns table (tile text, clicks bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.tile, sum(c.clicks)::bigint
    from public.category_tile_click c
   where c.day > (now() at time zone 'Africa/Nairobi')::date - least(greatest(coalesce(p_days, 30), 1), 365)
   group by c.tile
   order by 2 desc, 1;
$$;

revoke execute on function public.rpc_category_tile_click(text),
  public.rpc_category_tile_popularity(integer) from public;
grant execute on function public.rpc_category_tile_click(text),
  public.rpc_category_tile_popularity(integer) to anon, authenticated;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_category_tile_click', 'Visitors tapping a homepage category tile have no session.',
   'It only adds one to a daily per-tile counter for a validated tile name; it stores nothing about the visitor and cannot read or change anything else.')
on conflict (function_name) do nothing;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_category_tile_click', 'An anonymous tap counter, not an action by anybody',
   'category_tile_click, a daily count per tile')
on conflict (function_name) do nothing;
