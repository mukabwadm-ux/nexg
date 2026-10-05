-- The clock behind the live screen.
--
-- Without these nothing errors; the screen just quietly stops being
-- live, which is the worst failure a live screen has:
--
--   · `dispatch.cron_advance` is the cascade's minute hand. Without
--     it an offer stays pending forever, the countdown sits at zero
--     and the job never escalates — so the one order that most
--     needs a person is the one that never reaches the desk.
--   · `dispatch.cron_zone_health` is what turns the zones table
--     red. Unrun, every zone reads "ok" while riders run out.
--   · `dispatch.cron_zone_unpause` ends timed pauses. A pause that
--     outlives its reason is a part of the city quietly not
--     earning.
--   · `dispatch.cron_replay_capture` is the only chance to record
--     where riders were. Nothing afterwards can reconstruct it.
--
-- `cron_advance` runs every ten seconds, which pg_cron cannot
-- express in a cron expression — so it is scheduled once a minute
-- and loops inside, which is the same thing without a second
-- scheduler to keep alive.

create or replace function dispatch.cron_advance_minute()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total jsonb := jsonb_build_object('expired', 0, 'rounds_started', 0, 'escalated', 0);
  r jsonb;
  i integer;
begin
  for i in 1..6 loop
    r := dispatch.cron_advance();
    v_total := jsonb_build_object(
      'expired', (v_total ->> 'expired')::int + (r ->> 'expired')::int,
      'rounds_started', (v_total ->> 'rounds_started')::int + (r ->> 'rounds_started')::int,
      'escalated', (v_total ->> 'escalated')::int + (r ->> 'escalated')::int);

    /* Capture while the cascade is actually moving, which is the
       only time positions are worth keeping. */
    perform dispatch.cron_replay_capture();

    if i < 6 then perform pg_sleep(10); end if;
  end loop;

  return v_total || jsonb_build_object('ok', true);
end;
$$;

comment on function dispatch.cron_advance_minute is
  'Ten-second ticks inside a one-minute job, because pg_cron cannot express ten seconds and a second scheduler is one more thing to keep alive.';

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; live operations is not scheduled. The functions can be run by hand.';
    return;
  end if;

  /* The cascade's minute hand. */
  perform cron.schedule(
    'dispatch-advance', '* * * * *',
    $cron$select dispatch.cron_advance_minute()$cron$);

  /* Zone pressure. A minute old is fine; five is not — a zone goes
     short faster than that on a wet Friday. */
  perform cron.schedule(
    'dispatch-zone-health', '* * * * *',
    $cron$select dispatch.cron_zone_health()$cron$);

  /* Timed pauses end themselves. */
  perform cron.schedule(
    'dispatch-zone-unpause', '*/5 * * * *',
    $cron$select dispatch.cron_zone_unpause()$cron$);
end
$$;

grant execute on function dispatch.cron_advance_minute() to service_role;
