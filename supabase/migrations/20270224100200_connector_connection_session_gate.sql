-- connector_connection gets the merchant application session gate on live too.
--
-- Why this exists: 20261102000100_merchant_application puts a restrictive
-- policy, merchant_application_session_gate, on every public table that has a
-- merchant_id column at that moment. On a database built from main,
-- 20261102000050_connector_runtime_foundation runs just before it, so
-- connector_connection is one of those tables. The live database never ran
-- 20261102000050 until the 23 Nov 2026 rollout, which runs it late with
-- --include-all, after the loop. Without this, connector_connection on live
-- would lack the gate every other merchant table has. The CI rehearsal found it
-- (docs/database/live-rollout-2026-11-23.md).
--
-- The same policy, word for word. On a database that has it (anything built
-- from main), this does nothing.
do $$
begin
  if to_regclass('public.connector_connection') is not null
     and not exists (
       select 1 from pg_policies
        where schemaname = 'public' and tablename = 'connector_connection'
          and policyname = 'merchant_application_session_gate'
     ) then
    create policy merchant_application_session_gate on public.connector_connection as restrictive
      for all to authenticated
      using (authz.merchant_application_record_session_valid(merchant_id))
      with check (authz.merchant_application_record_session_valid(merchant_id));
  end if;
end
$$;
