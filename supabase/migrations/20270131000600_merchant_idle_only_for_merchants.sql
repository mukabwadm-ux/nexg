-- The merchant workspace's session limits are for the merchant workspace.
--
-- authz.merchant_application_session() decides whether the caller's
-- sign-in is still current: 7 minutes idle (20270130009800) and 24 hours
-- in all. "Idle" is measured from merchant_application_session_activity,
-- which only the merchant workspace writes. Everybody else's last
-- activity therefore is the moment they signed in.
--
-- The function is not only asked by the workspace. Two restrictive RLS
-- policies on every merchant-owned table (merchant_application_session_gate
-- and merchant_application_operational_gate) and the admin review RPCs ask
-- it too, for every signed-in caller. So 7 minutes after signing in:
--   - staff got "Review access unavailable" on every merchant page, and
--     lost every row of a merchant that came through the new application
--     form (its catalogue, orders, payments) from RLS-read admin screens;
--   - a signed-in customer or rider lost the same rows: menus, their own
--     orders with those merchants.
-- Before 20270130009800 the same thing happened after 8 hours, which is
-- why nobody noticed.
--
-- The limits now apply to merchant workspace users only: an anonymous
-- intake session, or a member of a merchant who is not also active staff.
-- Staff have the console's own idle sign-out; customers and riders have
-- theirs. Everything the function returns is unchanged — the expiry
-- times are still computed and returned, so the workspace arms its own
-- sign-out exactly as before — only `valid` stops being false for callers
-- the rule was never meant for.
--
-- The body is 20270130009800's, with v_exempt added.

create or replace function authz.merchant_application_session()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
set statement_timeout to '5s'
set lock_timeout to '2s'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_sid uuid;
  v_session jsonb;
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
  v_absolute numeric;
  v_idle_minutes numeric;
  v_created timestamptz;
  v_last timestamptz;
  v_absolute_end timestamptz;
  v_idle_end timestamptz;
  v_exempt boolean;
begin
  if v_uid is null or not exists (
    select 1 from auth.users u
    where u.id=v_uid and coalesce(u.is_anonymous,false)=v_anonymous
  ) then
    return jsonb_build_object('valid',false,'anonymous',v_anonymous,'reason','session_invalid');
  end if;
  begin
    v_sid := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('valid',false,'anonymous',v_anonymous,'reason','session_invalid');
  end;
  select to_jsonb(s) into v_session from auth.sessions s where s.id=v_sid and s.user_id=v_uid;
  if v_session is null then
    return jsonb_build_object('valid',false,'anonymous',v_anonymous,'reason','session_invalid');
  end if;

  /* Not a merchant workspace user: active staff, or a signed-in account
     that belongs to no merchant. The workspace limits do not apply. */
  v_exempt := not v_anonymous and (
    exists (select 1 from public.staff_user su where su.user_id=v_uid and su.status='active')
    or not exists (select 1 from public.merchant_user mu where mu.user_id=v_uid));

  select (value #>> '{}')::numeric into v_absolute from public.setting
    where key='merchant_session_absolute_hours' and scope='global' and effective_from<=now();
  select (value #>> '{}')::numeric into v_idle_minutes from public.setting
    where key='merchant_session_idle_minutes' and scope='global' and effective_from<=now();
  if v_idle_minutes is null then
    select (value #>> '{}')::numeric * 60 into v_idle_minutes from public.setting
      where key='merchant_session_idle_hours' and scope='global' and effective_from<=now();
  end if;
  if v_absolute is null or v_idle_minutes is null or v_absolute<=0 or v_idle_minutes<=0
    or v_absolute>24 or v_idle_minutes>480 then
    return jsonb_build_object('valid',v_exempt,'anonymous',v_anonymous,
      'reason',case when not v_exempt then 'session_policy_invalid' end);
  end if;
  v_created := (v_session->>'created_at')::timestamptz;
  select last_activity_at into v_last from public.merchant_application_session_activity
    where session_id=v_sid and user_id=v_uid;
  v_last := coalesce(v_last,v_created);
  v_absolute_end := v_created + make_interval(secs => (v_absolute*3600)::double precision);
  if nullif(v_session->>'not_after','') is not null then
    v_absolute_end := least(v_absolute_end,(v_session->>'not_after')::timestamptz);
  end if;
  v_idle_end := v_last + make_interval(secs => (v_idle_minutes*60)::double precision);
  return jsonb_build_object(
    'valid',v_exempt or now()<least(v_absolute_end,v_idle_end),
    'anonymous',v_anonymous,
    'reason',case when not v_exempt and now()>=least(v_absolute_end,v_idle_end)
                  then 'session_expired' end,
    'absolute_expires_at',v_absolute_end,
    'idle_expires_at',v_idle_end,
    'expires_at',least(v_absolute_end,v_idle_end)
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('valid',false,'anonymous',v_anonymous,'reason','session_policy_invalid');
end;
$function$;

comment on function authz.merchant_application_session() is
  'Whether the caller''s sign-in is current under the merchant workspace limits (idle minutes, absolute hours). The limits bind merchant workspace users only: anonymous intake sessions and merchant members who are not active staff. Expiry times are returned for everyone.';
