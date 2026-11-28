-- A new merchant application must not be signed out the moment it starts.
--
-- authz.merchant_application_session() measures the merchant workspace
-- limits (7 minutes idle, 24 hours in all) from the sign-in's created_at
-- when the sign-in has no workspace activity row. Seen in production on
-- 2026-11-28 06:14 UTC: an account signed in long before pressed "Start" on
-- /merchants/register. rpc_merchant_application_start succeeded (the
-- account then belonged to no merchant, so it was exempt) and made it the
-- owner of the new merchant. One second later every read, save and activity
-- ping was refused with "A current registration session is required." The
-- person had to sign in again. All four applications started in the last
-- ten days are still unsubmitted.
--
-- The same rule also timed out brand-new applicants. The form signs a new
-- visitor in anonymously, anonymous accounts were never exempt, and nothing
-- recorded activity for them. So 7 minutes after the form opened, the start
-- and every save were refused. An older anonymous sign-in (a guest
-- checkout) could not start at all.
--
-- Changes:
--   1. merchant_application_session_activity.merchant_started_at: when this
--      sign-in started its first merchant application. The limits now run
--      from the later of the sign-in's created_at and this moment.
--   2. authz.merchant_application_session(): an account that belongs to no
--      merchant yet is exempt whether or not it is anonymous (before, only
--      signed-in accounts were). Body otherwise 20270131000600's.
--   3. rpc_merchant_application_start records that moment and the activity.
--      Body otherwise 20261102000400's.
--   4. rpc_merchant_session_activity accepts the anonymous applicant's
--      sign-in too, so typing in the form keeps a draft's session current
--      before the account is secured. Body otherwise 20261102000100's.
-- Grants are unchanged (create or replace keeps them); the SET options are
-- restored at the end.

alter table public.merchant_application_session_activity
  add column if not exists merchant_started_at timestamptz;

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
  v_started timestamptz;
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

  /* Not a merchant workspace user: active staff, or an account (signed in
     or anonymous) that belongs to no merchant yet. The workspace limits
     do not apply. */
  v_exempt := (not v_anonymous and
      exists (select 1 from public.staff_user su where su.user_id=v_uid and su.status='active'))
    or not exists (select 1 from public.merchant_user mu where mu.user_id=v_uid);

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
  select last_activity_at, merchant_started_at into v_last, v_started
    from public.merchant_application_session_activity
    where session_id=v_sid and user_id=v_uid;
  /* The limits run from when this sign-in became a merchant one (its first
     application start), not from when the account signed in. */
  v_created := greatest(v_created, coalesce(v_started, v_created));
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
  'Whether the caller''s sign-in is current under the merchant workspace limits (idle minutes, absolute hours), counted from the later of sign-in and that sign-in''s first merchant application start. The limits bind merchant workspace users only: members of a merchant (anonymous or not) who are not active staff. Expiry times are returned for everyone.';

create or replace function public.rpc_merchant_application_start(
  p_operation_id uuid,p_payload jsonb,p_merchant_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_request jsonb; v_replay jsonb; v_id uuid; m public.merchant; b jsonb;
  v_first boolean;
begin
  perform authz.require_merchant_application_intake_session();
  v_payload:=public.fn_merchant_application_validate(p_payload);
  if v_payload#>>'{business,phone}'='' then
    raise exception 'A contact phone is required to start a registration.' using errcode='22023'; end if;
  if p_merchant_id is not null and not authz.merchant_application_owner(p_merchant_id) then
    raise exception 'Not your business.' using errcode='42501'; end if;
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'payload',v_payload);
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'start',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('start');
  v_first:=not exists(select 1 from public.merchant_user where user_id=(select auth.uid()));
  b:=v_payload->'business';
  if p_merchant_id is not null then
    select * into m from public.merchant where id=p_merchant_id for update;
    if m.id is null or m.status::text not in ('applied','documents_pending','under_review') or m.submitted_at is not null then
      raise exception 'Only an existing owned registration draft can use this entry.' using errcode='22023'; end if;
    if exists(select 1 from public.merchant_application where merchant_id=m.id) then
      raise exception 'Read and resume the existing application.' using errcode='23505'; end if;
    update public.merchant set resume_token_hash=null,resume_token_expires_at=null where id=m.id;
    v_id:=m.id;
  else
    insert into public.merchant(trading_name,contact_name,contact_phone,contact_email,status,onboarding_step)
    values(b->>'name',trim((b->>'firstName')||' '||(b->>'lastName')),b->>'phone',nullif(b->>'email',''),'applied',2)
    returning id into v_id;
    insert into public.merchant_user(merchant_id,user_id,role) values(v_id,(select auth.uid()),'owner');
  end if;
  insert into public.merchant_application(merchant_id,payload) values(v_id,v_payload);
  perform public.fn_merchant_application_mirror(v_id,v_payload);
  /* Starting is activity. A sign-in that belonged to no merchant until now
     becomes a merchant one here, so its workspace limits start now. */
  insert into public.merchant_application_session_activity
      (session_id,user_id,last_activity_at,merchant_started_at)
    values ((auth.jwt()->>'session_id')::uuid,(select auth.uid()),now(),
            case when v_first then now() end)
    on conflict(session_id) do update set
      last_activity_at=excluded.last_activity_at,
      merchant_started_at=coalesce(public.merchant_application_session_activity.merchant_started_at,
                                   excluded.merchant_started_at);
  perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
    p_action=>'merchant.application_started',p_target_type=>'merchant',p_target_id=>v_id,
    p_after=>jsonb_build_object('revision',1,'registry_revision',v_payload->>'registryRevision'));
  return public.fn_merchant_application_operation_finish(p_operation_id,'start',v_request,v_id,
    public.fn_merchant_application_result(v_id,p_operation_id));
end;
$$;

create or replace function public.rpc_merchant_session_activity(p_merchant_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb;
begin
  perform authz.require_merchant_application_intake_session();
  if not (authz.is_merchant_member(p_merchant_id) or authz.merchant_application_staff(p_merchant_id)) then
    raise exception 'Not your business.' using errcode='42501';
  end if;
  perform authz.spend_merchant_application_command('activity');
  insert into public.merchant_application_session_activity(session_id,user_id,last_activity_at)
    values ((auth.jwt()->>'session_id')::uuid,(select auth.uid()),now())
    on conflict(session_id) do update set last_activity_at=excluded.last_activity_at;
  s:=authz.merchant_application_session();
  return s-'valid'-'reason';
end;
$$;

-- create or replace resets a function's SET options; restore the ones the
-- earlier migrations gave these two (20261102000400, 20261102000100).
alter function public.rpc_merchant_application_start(uuid,jsonb,uuid) set statement_timeout='5s';
alter function public.rpc_merchant_session_activity(uuid) set statement_timeout='5s';
alter function public.rpc_merchant_session_activity(uuid) set lock_timeout='2s';
