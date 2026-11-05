-- rpc_staff_reset_credentials exists on the live database (it was applied from
-- the fix/ask-page-vercel-build branch) but was created without revoking the
-- default PUBLIC execute grant, so the anonymous key could call it. Its body
-- refuses anyone who is not a super admin; this removes the grant as well, so
-- the wiring check has nothing to report. A no-op where the function is absent.
do $$
begin
  if to_regprocedure('public.rpc_staff_reset_credentials(uuid)') is not null then
    revoke execute on function public.rpc_staff_reset_credentials(uuid) from public, anon;
    grant execute on function public.rpc_staff_reset_credentials(uuid) to authenticated;
  end if;
end;
$$;
