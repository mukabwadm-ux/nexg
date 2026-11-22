-- Display exchange rates for the customer website's currency picker.
--
-- Prices are stored and charged in whole KES. These rates only turn a KES
-- price into an approximate amount in the visitor's chosen currency; no
-- order, payment or ledger row ever reads them.
--
-- A pg_cron job (every 15 minutes) does two things:
--   1. collects the answer to the last request it sent, and stores it if it
--      is a good one;
--   2. sends a new request to open.er-api.com (free, no key, KES base) when
--      the stored rates are six hours old and no request is in flight.
-- A failed or garbled answer changes nothing: the site keeps the last good
-- rates, and the website falls back further on its own (apps/web/lib/currency).
--
-- Read by anyone through public.fn_fx_rates().
--
-- To undo:
--   select cron.unschedule('fx-rates');
--   drop function public.cron_fx_rates(); drop function public.fn_fx_rates();
--   drop table public.fx_rate_fetch; drop table public.fx_rate;

create table if not exists public.fx_rate (
  currency   text primary key check (currency ~ '^[A-Z]{3}$'),
  -- Units of this currency per one Kenyan shilling.
  per_kes    numeric(24, 12) not null check (per_kes > 0),
  -- When the provider published it.
  updated_at timestamptz not null,
  stored_at  timestamptz not null default now()
);

comment on table public.fx_rate is
  'Display-only exchange rates per 1 KES, refreshed by cron_fx_rates(). Never used for charging.';

create table if not exists public.fx_rate_fetch (
  id           bigint generated always as identity primary key,
  request_id   bigint not null,
  requested_at timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  detail       text
);

alter table public.fx_rate enable row level security;
alter table public.fx_rate_fetch enable row level security;
-- No policies: the tables are read through fn_fx_rates() and written by the job.
revoke all on public.fx_rate, public.fx_rate_fetch from anon, authenticated;

-- ─────────────────────────────────────────────────────────── the reader

create or replace function public.fn_fx_rates()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 0 then null else
    jsonb_build_object(
      'base', 'KES',
      'rates', jsonb_object_agg(currency, per_kes) || jsonb_build_object('KES', 1),
      'updated_at', min(updated_at)
    ) end
  from public.fx_rate;
$$;

revoke all on function public.fn_fx_rates() from public;
grant execute on function public.fn_fx_rates() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────── the job

create or replace function public.cron_fx_rates()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The currencies the website offers (apps/web/lib/currency/money.ts).
  v_wanted constant text[] := array['USD','EUR','GBP','UGX','TZS','RWF','ZAR','NGN',
                                     'AED','SAR','CNY','INR','JPY','CAD','AUD','CHF'];
  f public.fx_rate_fetch;
  r record;
  v_body jsonb;
  v_when timestamptz;
  v_code text;
  v_rate numeric;
  v_stored int := 0;
  v_latest timestamptz;
begin
  -- 1. Collect the answer to any request still open.
  for f in select * from public.fx_rate_fetch where finished_at is null order by id loop
    select status_code, content, error_msg, timed_out into r
      from net._http_response where id = f.request_id;

    if not found then
      if f.requested_at < now() - interval '5 minutes' then
        update public.fx_rate_fetch set finished_at = now(), ok = false,
               detail = 'No answer within 5 minutes.' where id = f.id;
      end if;
      continue;
    end if;

    begin
      if r.error_msg is not null or coalesce(r.timed_out, false) or r.status_code <> 200 then
        raise exception 'HTTP %: %', r.status_code, left(coalesce(r.error_msg, r.content, ''), 200);
      end if;
      v_body := r.content::jsonb;
      if v_body->>'result' <> 'success' or v_body->>'base_code' <> 'KES' then
        raise exception 'Not a KES rates answer: %', left(r.content, 200);
      end if;
      if jsonb_typeof(v_body->'rates'->'USD') <> 'number' then
        raise exception 'No USD rate in the answer.';
      end if;
      v_when := coalesce(to_timestamp((v_body->>'time_last_update_unix')::bigint), now());

      v_stored := 0;
      foreach v_code in array v_wanted loop
        if jsonb_typeof(v_body->'rates'->v_code) = 'number' then
          v_rate := (v_body->'rates'->>v_code)::numeric;
          if v_rate > 0 then
            insert into public.fx_rate (currency, per_kes, updated_at, stored_at)
            values (v_code, v_rate, v_when, now())
            on conflict (currency) do update
              set per_kes = excluded.per_kes, updated_at = excluded.updated_at, stored_at = now();
            v_stored := v_stored + 1;
          end if;
        end if;
      end loop;

      update public.fx_rate_fetch set finished_at = now(), ok = true,
             detail = format('%s rates published %s', v_stored, v_when) where id = f.id;
    exception when others then
      update public.fx_rate_fetch set finished_at = now(), ok = false,
             detail = left(sqlerrm, 300) where id = f.id;
    end;
  end loop;

  -- 2. Ask again when the stored rates were fetched six hours ago or more.
  select max(stored_at) into v_latest from public.fx_rate;
  if (v_latest is null or v_latest < now() - interval '6 hours')
     and not exists (select 1 from public.fx_rate_fetch where finished_at is null) then
    insert into public.fx_rate_fetch (request_id)
    values (net.http_get(url := 'https://open.er-api.com/v6/latest/KES',
                         timeout_milliseconds := 15000));
    return 'requested';
  end if;

  -- Keep a month of attempts.
  delete from public.fx_rate_fetch where requested_at < now() - interval '30 days';
  return 'fresh';
end;
$$;

revoke all on function public.cron_fx_rates() from public, anon, authenticated;
grant execute on function public.cron_fx_rates() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron or pg_net is not installed here; the rates are not scheduled.';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'fx-rates') then
    perform cron.unschedule('fx-rates');
  end if;
  perform cron.schedule('fx-rates', '*/15 * * * *', $sched$select public.cron_fx_rates()$sched$);
end
$cron$;
