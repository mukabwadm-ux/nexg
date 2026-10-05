-- Dispatch rings a bell the browser can actually hear.
--
-- Realtime only serves the `public` schema. A subscription to
-- `dispatch.job` is refused with "unable to subscribe to changes
-- with given parameters" — and the console, which had asked for
-- four tables in one channel, lost all four and sat on
-- "reconnecting" while looking otherwise fine.
--
-- The obvious fix is to ask Supabase to serve another schema. The
-- better one is not to need it. This project has been bitten three
-- times by behaviour that depends on a setting in a dashboard
-- nobody can see from the code — the PostgREST exposed-schemas
-- list, twice — and each time the failure was silence rather than
-- an error. So: one table in `public`, which Realtime serves
-- everywhere without anybody configuring anything.
--
-- It also turns out to be the better shape on its own merits. A
-- cascade round writes eight offer rows in one transaction; eight
-- broadcasts for one event is eight times the work for the same
-- screen. One bell per city per change coalesces that into a
-- single message, and the console re-reads through the same
-- queries and the same row policies it already uses.
--
-- What crosses the wire is a city id and a timestamp. Not the
-- offer, not the rider, not the order — nothing worth intercepting
-- and nothing that has to be kept in step with a policy.

create table if not exists public.live_pulse (
  city_id uuid primary key references public.city (id) on delete cascade,
  at timestamptz not null default now(),
  reason text
);

comment on table public.live_pulse is
  'A bell, not a message. Dispatch bumps a city''s row; the console hears it and re-reads through its own queries. Nothing sensitive crosses the wire because nothing but a city id and a clock is here.';

alter table public.live_pulse enable row level security;

drop policy if exists live_pulse_read on public.live_pulse;
create policy live_pulse_read on public.live_pulse
  for select to authenticated
  using (authz.works_live_ops(city_id) or authz.can_manage_merchants(city_id));

grant select on public.live_pulse to authenticated;

/* A row per live city, so the first change has something to update
   rather than racing to insert. */
insert into public.live_pulse (city_id, reason)
select id, 'seeded' from public.city
on conflict (city_id) do nothing;

create or replace function public.tg_live_pulse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_city uuid;
begin
  /*
   * Through jsonb, not through field references.
   *
   * plpgsql resolves every branch of a CASE against the actual
   * record type, not only the branch it takes — so `new.city_id`
   * is checked even when this fires on `zone_health`, which has
   * no such column, and the trigger raises. One function for
   * three tables has to reach fields the type system cannot see
   * all of at once, and jsonb is how.
   */
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  v_city := case tg_table_name
    when 'job' then (v_row ->> 'city_id')::uuid
    when 'offer' then (select j.city_id from dispatch.job j
                        where j.id = (v_row ->> 'job_id')::uuid)
    when 'zone_health' then (select z.city_id from public.zone z
                              where z.id = (v_row ->> 'zone_id')::uuid)
  end;

  if v_city is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  insert into public.live_pulse (city_id, at, reason)
  values (v_city, clock_timestamp(), tg_table_name)
  on conflict (city_id) do update
    set at = clock_timestamp(), reason = excluded.reason;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

/*
 * Statement-level, not row-level. A round that writes eight offers
 * should ring the bell once — and a per-row trigger would also
 * deadlock two cascades updating the same city's pulse row from
 * inside one statement.
 *
 * `new` and `old` are not available to a statement trigger, so
 * each one is a row trigger that only fires on the first row of
 * the statement... which Postgres cannot express either. So: row
 * triggers, and the upsert makes the repetition harmless — eight
 * updates to one row in one transaction produce one WAL record
 * that matters and one broadcast.
 */
drop trigger if exists job_rings_the_bell on dispatch.job;
create trigger job_rings_the_bell
  after insert or update or delete on dispatch.job
  for each row execute function public.tg_live_pulse();

drop trigger if exists offer_rings_the_bell on dispatch.offer;
create trigger offer_rings_the_bell
  after insert or update or delete on dispatch.offer
  for each row execute function public.tg_live_pulse();

drop trigger if exists zone_health_rings_the_bell on dispatch.zone_health;
create trigger zone_health_rings_the_bell
  after insert or update on dispatch.zone_health
  for each row execute function public.tg_live_pulse();

/*
 * The dispatch tables come back out of the publication. Realtime
 * cannot serve them and leaving them in is a standing invitation
 * for somebody to try again and lose an afternoon to the same
 * silence.
 */
do $$
declare t text;
begin
  foreach t in array array['dispatch.job', 'dispatch.offer', 'dispatch.zone_health'] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime'
                  and schemaname || '.' || tablename = t) then
      execute format('alter publication supabase_realtime drop table %s', t);
    end if;
  end loop;

  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname || '.' || tablename = 'public.live_pulse') then
    alter publication supabase_realtime add table public.live_pulse;
  end if;
end
$$;

alter table public.live_pulse replica identity full;
