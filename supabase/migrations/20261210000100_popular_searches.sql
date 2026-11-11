-- Popular searches in the homepage hero, ordered by what visitors search for.
--
-- A search typed in the hero is matched to one of a short list of topics on
-- the site (airport pickup, hotel stays, massage & spa, …), and that topic's
-- count for the day goes up by one. The words typed are never sent or stored,
-- and nothing about the visitor is either: no user, no IP, no device. The site
-- counts a topic at most once per browser per day, and the hero shows the four
-- most searched over the last 30 days.

create table if not exists public.popular_search_count (
  day date not null default (now() at time zone 'Africa/Nairobi')::date,
  topic text not null check (topic ~ '^[a-z][a-z_-]{1,39}$'),
  searches integer not null default 0 check (searches >= 0),
  primary key (day, topic)
);

comment on table public.popular_search_count is
  'Hero searches, counted per topic per day. Neither the words typed nor anything about the visitor is stored.';

alter table public.popular_search_count enable row level security;
revoke all on public.popular_search_count from anon, authenticated;

/* Count one search. Anyone may call it, so all it can do is add one to a known-shaped topic's daily count. */
create or replace function public.rpc_popular_search_hit(p_topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^[a-z][a-z_-]{1,39}$' then
    return;
  end if;
  insert into public.popular_search_count as c (day, topic, searches)
  values ((now() at time zone 'Africa/Nairobi')::date, p_topic, 1)
  on conflict (day, topic) do update
    set searches = least(c.searches + 1, 1000000);
end;
$$;

/* Searches per topic over the last p_days days, most first. */
create or replace function public.rpc_popular_search_ranking(p_days integer default 30)
returns table (topic text, searches bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.topic, sum(c.searches)::bigint
    from public.popular_search_count c
   where c.day > (now() at time zone 'Africa/Nairobi')::date - least(greatest(coalesce(p_days, 30), 1), 365)
   group by c.topic
   order by 2 desc, 1;
$$;

revoke execute on function public.rpc_popular_search_hit(text),
  public.rpc_popular_search_ranking(integer) from public;
grant execute on function public.rpc_popular_search_hit(text),
  public.rpc_popular_search_ranking(integer) to anon, authenticated;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_popular_search_hit', 'Visitors searching from the homepage hero have no session.',
   'It only adds one to a daily per-topic counter for a validated topic name; it stores neither the search words nor anything about the visitor, and cannot read or change anything else.')
on conflict (function_name) do nothing;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_popular_search_hit', 'An anonymous search counter, not an action by anybody',
   'popular_search_count, a daily count per topic')
on conflict (function_name) do nothing;
