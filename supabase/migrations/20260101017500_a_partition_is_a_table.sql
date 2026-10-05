-- A partition is a table.
--
-- `qr_scan` is partitioned by month and has row-level security
-- on the parent, which reads as protected and is not. RLS on a
-- parent governs rows reached *through* the parent. A partition
-- is a table in its own right, with its own RLS flag and its own
-- grants, and PostgREST publishes it under its own name.
--
-- So `GET /rest/v1/qr_scan_2026_10` with the anonymous key —
-- the key printed in the page source — returned every scan in
-- that month: property, unit, device hash, timestamp. The parent
-- was locked and the door beside it was not.
--
-- And `fn_qr_scan_partition` creates next month's the same way,
-- so this repaired itself back into existence every month. The
-- generator is the actual fix; the six existing partitions are
-- the cleanup.

-- ═══════════════════════════════ the six that already exist

do $existing$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_inherits i on i.inhrelid = c.oid
      join pg_class parent on parent.oid = i.inhparent
     where parent.relname = 'qr_scan'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    /*
     * And no direct grant. Everything legitimate reads
     * `qr_scan` or `qr_attribution_v`; nothing has a reason to
     * name a month. With RLS on and no policy of its own, a
     * direct read returns nothing even if a grant reappears.
     */
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
  end loop;
end
$existing$;

-- ════════════════════════════════ and every one from now on

create or replace function fn_qr_scan_partition(p_month date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_name text := 'qr_scan_' || to_char(v_start, 'YYYY_MM');
begin
  if to_regclass('public.' || v_name) is not null then
    return v_name;
  end if;

  execute format(
    'create table public.%I partition of public.qr_scan for values from (%L) to (%L)',
    v_name, v_start, (v_start + interval '1 month')::date);

  /*
   * The three lines that were missing.
   *
   * A new partition arrives with RLS off and the default
   * grants, so every month this function quietly published a
   * fresh copy of the scan log. The protection has to be
   * applied here, at creation, because there is no later moment
   * anybody is watching.
   */
  execute format('alter table public.%I enable row level security', v_name);
  execute format('revoke all on public.%I from anon, authenticated', v_name);

  return v_name;
end;
$$;

comment on function fn_qr_scan_partition is
  'Creates next month''s partition *and* locks it. A partition inherits neither the parent''s RLS flag nor its grants, so omitting these published the scan log monthly.';

-- ═══════════════════════════ the check learns to ask this

/*
 * The rule that found it only looked at `pg_tables`, which
 * lists partitions, so it happened to catch these. This makes
 * the question explicit rather than incidental: a partition
 * whose parent has RLS and which does not is always wrong,
 * whatever the grants say today.
 */
create or replace function fn_wiring_check()
returns table (
  rule text,
  severity text,
  finding text,
  detail text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'rls_enabled', 'critical',
    'Row-level security is off on public.' || t.tablename,
    'Policies on this table are not consulted. Enable RLS, then decide the policy.'
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where t.schemaname = 'public' and not c.relrowsecurity

  union all

  select
    'partition_rls', 'critical',
    'public.' || child.relname || ' is a partition of a protected table and is not protected',
    'RLS on a parent governs rows reached through the parent. A partition is published under its own name.'
  from pg_inherits i
  join pg_class child on child.oid = i.inhrelid
  join pg_class parent on parent.oid = i.inhparent
  join pg_namespace n on n.oid = child.relnamespace and n.nspname = 'public'
  where parent.relrowsecurity and not child.relrowsecurity

  union all

  select
    'anon_execute', 'critical',
    'anon may execute public.' || p.proname,
    'It is security definer and it writes. Either revoke it from anon, or add it to wiring_anon_allow with a reason.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and p.prosrc ~* '(insert into|update |delete from)'
    and p.proname not like 'tg\_%'
    and not exists (
      select 1 from public.wiring_anon_allow a where a.function_name = p.proname)

  union all

  select
    'anon_table_read', 'critical',
    'anon may read public.' || t.tablename || ' directly',
    'With RLS off this returns every row to the key printed in the page source.'
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where t.schemaname = 'public'
    and not c.relrowsecurity
    /* By oid, not by a name built with format(). A text
       argument is resolved against the search path when the row
       is evaluated, which is both slower and — with
       `search_path = ''` — how this first run died on a name
       that resolves in another schema. The oid is already in
       hand. */
    and has_table_privilege('anon', c.oid, 'select')

  union all

  select
    'audit_log', 'warning',
    'public.' || p.proname || ' changes state without calling audit.log',
    'An action nobody can be shown to have taken. Add audit.log in the same transaction.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname like 'rpc\_%'
    and p.prosrc ~* '(insert into|update |delete from)'
    and p.prosrc !~* 'audit\.log'
    and p.proname not in ('rpc_note_locale', 'rpc_translations_put', 'rpc_location_event')

  union all

  select
    'money_float', 'critical',
    c.table_name || '.' || c.column_name || ' holds money as ' || c.data_type,
    'Money is integer minor units everywhere. A float here will not reconcile.'
  from information_schema.columns c
  where c.table_schema = 'public'
    and (c.column_name like '%\_cents' or c.column_name like '%\_kes'
         or c.column_name like '%amount%' or c.column_name like '%price%')
    and c.data_type in ('double precision', 'real')

  union all

  select
    'definer_search_path', 'critical',
    'public.' || p.proname || ' is security definer with no fixed search_path',
    'Qualify everything and add: set search_path = ''''.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
       where cfg like 'search_path=%')
$$;

revoke execute on function fn_wiring_check() from public, anon;
grant execute on function fn_wiring_check() to authenticated;
