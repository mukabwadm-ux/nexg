-- Merchant workspace: sign out after 7 minutes without activity.
--
-- The idle limit was a whole number of hours (merchant_session_idle_hours,
-- 1 to 8, set to 8), so minutes could not be expressed. It is now
-- merchant_session_idle_minutes (1 to 480), set to 7, and the session check
-- reads it. The hours setting stays only as the fallback for a database
-- where the minutes setting is missing, so nothing breaks mid-deploy.
--
-- The absolute lifetime (merchant_session_absolute_hours, 24) is unchanged.
-- The workspace reports activity at most once a minute, so an active
-- merchant is never signed out; one who walks away is signed out 7 minutes
-- after their last click or keypress.

insert into settings.definition
  (key,"group",scope_kind,value_type,constraints,unit,label,help,sensitive,
   can_be_immediate,approval_pair,reader_modules,default_value,sort)
values
  ('merchant_session_idle_minutes','retention','global','int',
    '{"minimum":1,"maximum":480}'::jsonb,'minutes','Merchant session idle lifetime',
    'Minutes without activity before a merchant portal session is signed out.',false,false,
    'single:ops_manager',array['merchant']::text[],'7'::jsonb,912)
on conflict (key) do nothing;

insert into settings.version
  (key,scope_kind,value,status,effective_from,reason,activated_at)
select d.key,'global','7'::jsonb,'active',now(),
  'Sign merchants out after 7 minutes of inactivity',now()
from settings.definition d
where d.key='merchant_session_idle_minutes'
  and not exists (select 1 from settings.version v where v.key=d.key
    and v.scope_kind='global' and v.status='active');

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
    return jsonb_build_object('valid',false,'anonymous',v_anonymous,'reason','session_policy_invalid');
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
    'valid',now()<least(v_absolute_end,v_idle_end),
    'anonymous',v_anonymous,
    'reason',case when now()>=least(v_absolute_end,v_idle_end) then 'session_expired' end,
    'absolute_expires_at',v_absolute_end,
    'idle_expires_at',v_idle_end,
    'expires_at',least(v_absolute_end,v_idle_end)
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('valid',false,'anonymous',v_anonymous,'reason','session_policy_invalid');
end;
$function$;
