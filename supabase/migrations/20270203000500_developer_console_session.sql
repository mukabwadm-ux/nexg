-- The developer console keeps a merchant's sign-in alive while it is used.
--
-- Merchant accounts are signed out after 7 minutes without activity
-- (20270130009800; since 20270131000600 the rule binds merchant workspace
-- users only). Activity is what the workspace reports through
-- rpc_merchant_session_activity. The developer console on api.nexgapp.com
-- has its own sign-in and reported nothing, so a developer who belongs to a
-- merchant was cut off 7 minutes after signing in however busy they were:
-- issuing and revoking keys, webhooks and sandbox bookings failed with "A
-- current signed-in account session is required", and the restrictive
-- session gates hid the developer's own merchants, keys and webhooks, so
-- the console looked as if they had none.
--
-- rpc_developer_session tells the console where the caller's own sign-in
-- stands without needing a merchant (the gates may already hide the
-- merchant rows), and records activity when asked, for a current sign-in
-- only. The console reports clicks and typing at most once a minute, signs
-- the developer out when the 7 minutes run out, and says why. The rule is
-- unchanged: a developer who walks away is signed out, as in the workspace.
--
-- Rollback: drop function public.rpc_developer_session(boolean);
--   delete from public.wiring_audit_exempt where function_name = 'rpc_developer_session';

create or replace function public.rpc_developer_session(p_activity boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
  s jsonb := authz.merchant_application_session();
begin
  if not coalesce((s ->> 'valid')::boolean, false) or coalesce((s ->> 'anonymous')::boolean, true) then
    return jsonb_build_object('valid', false, 'reason', coalesce(s ->> 'reason', 'session_invalid'));
  end if;
  /* The idle limit binds merchant members who are not active staff
     (20270131000600). Nobody else has a deadline to watch, and their
     activity is not recorded. */
  if not exists (select 1 from public.merchant_user mu where mu.user_id = (select auth.uid()))
     or exists (select 1 from public.staff_user su
                where su.user_id = (select auth.uid()) and su.status = 'active') then
    return jsonb_build_object('valid', true, 'expires_at', null);
  end if;
  if p_activity then
    begin
      perform authz.spend_merchant_application_command('activity');
      insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
      values ((auth.jwt() ->> 'session_id')::uuid, (select auth.uid()), now())
      on conflict (session_id) do update set last_activity_at = excluded.last_activity_at;
      s := authz.merchant_application_session();
    exception when sqlstate 'P4290' then
      null;  /* Over the activity budget: the last report still stands. */
    end;
  end if;
  return jsonb_build_object('valid', true, 'expires_at', (s ->> 'expires_at')::timestamptz);
end;
$$;

revoke all on function public.rpc_developer_session(boolean) from public, anon;
grant execute on function public.rpc_developer_session(boolean) to authenticated;

comment on function public.rpc_developer_session(boolean) is
  'The developer console''s view of the caller''s own sign-in: valid, and when it lapses without activity. With p_activity it records activity for a current sign-in, like rpc_merchant_session_activity without needing a merchant.';

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values ('rpc_developer_session',
  'Verified session heartbeat for the developer console; refreshes inactivity timing and its rate budget without granting access.',
  'merchant_application_session_activity.last_activity_at; merchant_application_command_budget')
on conflict (function_name) do nothing;
