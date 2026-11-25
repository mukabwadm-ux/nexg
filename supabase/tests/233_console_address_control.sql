-- The staff console lives at control.nexgapp.com (20270318000200).
-- admin.nexgapp.com only redirects. Earlier migrations still carry the old
-- host in their function bodies, so a later migration that copies one of
-- them would bring it back; this catches that.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is_empty(
  $$ select n.nspname || '.' || p.oid::regprocedure::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog', 'information_schema')
       and n.nspname not like 'pg\_%'
       and p.prosrc like '%admin.nexgapp.com%' $$,
  'no function links to admin.nexgapp.com'
);

select ok(
  (select bool_and(p.prosrc like '%https://control.nexgapp.com%')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fn_form_alert', 'tg_bell_becomes_email', 'rpc_staff_make_super_admin')),
  'staff email and alert functions link to control.nexgapp.com'
);

select * from finish();
rollback;
