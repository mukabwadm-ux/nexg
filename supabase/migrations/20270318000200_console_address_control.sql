-- The staff console moved from admin.nexgapp.com to control.nexgapp.com.
-- admin.nexgapp.com keeps working as a 308 redirect, so this only stops
-- new emails and alerts from taking the detour.
--
-- Three live functions carry the old address in their bodies:
-- fn_form_alert, tg_bell_becomes_email and rpc_staff_make_super_admin.
-- Each is re-created from its own current definition with only the host
-- swapped, so nothing else in them changes (owner, grants, security and
-- search_path settings survive CREATE OR REPLACE). Any other function that
-- still carries the old host is caught too. Running it twice is harmless.

do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.prosrc like '%https://admin.nexgapp.com%'
  loop
    execute replace(pg_get_functiondef(f.oid), 'https://admin.nexgapp.com', 'https://control.nexgapp.com');
    n := n + 1;
  end loop;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosrc like '%https://admin.nexgapp.com%'
  ) then
    raise exception 'console address: a function still links to admin.nexgapp.com';
  end if;

  raise notice 'console address: % function(s) now link to control.nexgapp.com', n;
end
$$;
