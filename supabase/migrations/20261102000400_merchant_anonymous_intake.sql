-- Let a visitor submit the existing short merchant form before creating an
-- account. Anonymous Auth owns only its own application and restricted setup
-- Home; payout, staff review and operational access still require a real user.

create or replace function authz.merchant_application_session()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_sid uuid;
  v_session jsonb;
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
  v_absolute numeric;
  v_idle numeric;
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
  select (value #>> '{}')::numeric into v_idle from public.setting
    where key='merchant_session_idle_hours' and scope='global' and effective_from<=now();
  if v_absolute is null or v_idle is null or v_absolute<=0 or v_idle<=0
    or v_absolute>24 or v_idle>8 then
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
  v_idle_end := v_last + make_interval(secs => (v_idle*3600)::double precision);
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
$$;

create function authz.require_merchant_application_intake_session()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((authz.merchant_application_session()->>'valid')::boolean,false) then
    raise exception 'A current registration session is required.' using errcode='42501';
  end if;
end;
$$;
revoke all on function authz.require_merchant_application_intake_session() from public,anon,authenticated;
alter function authz.require_merchant_application_intake_session() set statement_timeout='5s';
alter function authz.require_merchant_application_intake_session() set lock_timeout='2s';

create or replace function authz.require_merchant_application_session()
returns void language plpgsql stable security definer set search_path = '' as $$
declare s jsonb;
begin
  s:=authz.merchant_application_session();
  if not coalesce((s->>'valid')::boolean,false) or coalesce((s->>'anonymous')::boolean,true) then
    raise exception 'A current signed-in account session is required.' using errcode='42501';
  end if;
end;
$$;

create or replace function public.rpc_merchant_application_start(
  p_operation_id uuid,p_payload jsonb,p_merchant_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_request jsonb; v_replay jsonb; v_id uuid; m public.merchant; b jsonb;
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
  perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
    p_action=>'merchant.application_started',p_target_type=>'merchant',p_target_id=>v_id,
    p_after=>jsonb_build_object('revision',1,'registry_revision',v_payload->>'registryRevision'));
  return public.fn_merchant_application_operation_finish(p_operation_id,'start',v_request,v_id,
    public.fn_merchant_application_result(v_id,p_operation_id));
end;
$$;

create or replace function public.rpc_merchant_application_save(
  p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid,p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.merchant_application; v_payload jsonb; v_request jsonb; v_replay jsonb;
begin
  perform authz.require_merchant_application_intake_session();
  if not authz.merchant_application_owner(p_merchant_id)
    or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean,false) then
    raise exception 'Application setup access is required.' using errcode='42501'; end if;
  v_payload:=public.fn_merchant_application_validate(p_payload);
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'expected_revision',p_expected_revision,'payload',v_payload);
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'save',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('save');
  select * into a from public.merchant_application where merchant_id=p_merchant_id for update;
  if a.merchant_id is null then raise exception 'Application not found.' using errcode='P0002'; end if;
  if p_expected_revision is distinct from a.revision then raise exception 'Application revision changed.' using errcode='40001'; end if;
  if a.payload is distinct from v_payload then
    update public.merchant_application set payload=v_payload,revision=revision+1,updated_at=now(),
      review_state=case when submitted_revision is null then 'draft' else 'pending' end
    where merchant_id=p_merchant_id;
    perform public.fn_merchant_application_mirror(p_merchant_id,v_payload);
    perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
      p_action=>'merchant.application_saved',p_target_type=>'merchant',p_target_id=>p_merchant_id,
      p_after=>jsonb_build_object('revision',a.revision+1));
  end if;
  return public.fn_merchant_application_operation_finish(p_operation_id,'save',v_request,p_merchant_id,
    public.fn_merchant_application_result(p_merchant_id,p_operation_id));
end;
$$;

create or replace function public.rpc_merchant_application_submit(
  p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.merchant_application; v_request jsonb; v_replay jsonb;
begin
  perform authz.require_merchant_application_intake_session();
  if not authz.merchant_application_owner(p_merchant_id)
    or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean,false) then
    raise exception 'Application setup access is required.' using errcode='42501'; end if;
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'expected_revision',p_expected_revision);
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'submit',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('submit');
  select * into a from public.merchant_application where merchant_id=p_merchant_id for update;
  if a.merchant_id is null then raise exception 'Application not found.' using errcode='P0002'; end if;
  if p_expected_revision is distinct from a.revision then raise exception 'Application revision changed.' using errcode='40001'; end if;
  perform public.fn_merchant_application_validate(a.payload,true);
  if a.submitted_revision is distinct from a.revision then
    insert into public.merchant_application_submission(merchant_id,revision,payload,submitted_by)
      values(p_merchant_id,a.revision,a.payload,(select auth.uid()));
    update public.merchant_application set submitted_revision=revision,submitted_at=now(),review_state='pending',
      review_reason=null,updated_at=now() where merchant_id=p_merchant_id;
    perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
      p_action=>'merchant.application_submitted',p_target_type=>'merchant',p_target_id=>p_merchant_id,
      p_after=>jsonb_build_object('revision',a.revision));
  end if;
  return public.fn_merchant_application_operation_finish(p_operation_id,'submit',v_request,p_merchant_id,
    public.fn_merchant_application_result(p_merchant_id,p_operation_id));
end;
$$;

create or replace function public.rpc_merchant_application_read(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_merchant_application_intake_session();
  if not (authz.merchant_application_owner(p_merchant_id) or authz.merchant_application_staff(p_merchant_id)) then
    raise exception 'Not your application.' using errcode='42501'; end if;
  if not exists(select 1 from public.merchant_application where merchant_id=p_merchant_id) then
    raise exception 'Application not found.' using errcode='P0002'; end if;
  return public.fn_merchant_application_result(p_merchant_id);
end;
$$;

create or replace function public.rpc_merchant_application_operation_read(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.merchant_application_operation; v_access jsonb;
begin
  perform authz.require_merchant_application_intake_session();
  if p_operation_id is null then raise exception 'An operation ID is required.' using errcode='22023'; end if;
  select * into o from public.merchant_application_operation
    where actor_id=(select auth.uid()) and operation_id=p_operation_id;
  if o.operation_id is null then return null; end if;
  if not (authz.merchant_application_owner(o.merchant_id) or authz.merchant_application_staff(o.merchant_id)) then return null; end if;
  v_access:=authz.merchant_application_access(o.merchant_id);
  if not (coalesce((v_access->>'setup')::boolean,false) or coalesce((v_access->>'operations')::boolean,false)
    or authz.merchant_application_staff(o.merchant_id)) then return null; end if;
  return o.result;
end;
$$;

create or replace function authz.merchant_application_access(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.merchant_application; m public.merchant; s jsonb; v_stale boolean;
begin
  select * into m from public.merchant where id=p_merchant_id;
  if m.id is null or not (exists(select 1 from public.merchant_user mu
      where mu.merchant_id=m.id and mu.user_id=(select auth.uid()) and mu.role in ('owner','manager'))
    or authz.merchant_application_staff(m.id)) then
    return jsonb_build_object('state','blocked','setup',false,'operations',false,'reason','membership_invalid');
  end if;
  select * into a from public.merchant_application where merchant_id=m.id;
  if a.merchant_id is null then
    return jsonb_build_object('state','legacy','setup',true,'operations',true,
      'review_state',null,'revision',null,'needs_resubmission',false);
  end if;
  s := authz.merchant_application_session();
  if not coalesce((s->>'valid')::boolean,false) then
    return (s-'valid') || jsonb_build_object('state','blocked','setup',false,'operations',false,
      'review_state',a.review_state,'revision',a.revision,'needs_resubmission',a.submitted_revision is distinct from a.revision);
  end if;
  v_stale := a.submitted_revision is not null and a.submitted_revision<>a.revision;
  return (s-'valid'-'reason') || jsonb_build_object(
    'state',case when m.status in ('paused','delisted') then 'blocked'
      when a.review_state='approved' and (a.approved_revision<>a.revision or v_stale) then 'pending'
      when a.review_state='draft' then 'pending' else a.review_state end,
    'setup',m.status not in ('paused','delisted') and a.review_state<>'rejected'
      and authz.merchant_application_owner(m.id),
    'operations',not coalesce((s->>'anonymous')::boolean,true)
      and m.status::text not in ('paused','delisted','suspended') and a.review_state='approved'
      and a.approved_revision=a.revision and a.submitted_revision=a.revision,
    'review_state',a.review_state,'revision',a.revision,'needs_resubmission',v_stale);
end;
$$;

create or replace function authz.merchant_application_operational_read_allowed(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.merchant_application where merchant_id=p_merchant_id)
    or exists(select 1 from public.merchant_application a join public.merchant m on m.id=a.merchant_id
      where a.merchant_id=p_merchant_id and a.review_state='approved' and a.approved_revision=a.revision
        and a.submitted_revision=a.revision and m.status::text not in ('paused','delisted','suspended')
        and coalesce((authz.merchant_application_session()->>'valid')::boolean,false)
        and not coalesce((authz.merchant_application_session()->>'anonymous')::boolean,true));
$$;

alter function authz.merchant_application_session() set statement_timeout='5s';
alter function authz.merchant_application_session() set lock_timeout='2s';
alter function authz.require_merchant_application_session() set statement_timeout='5s';
alter function authz.merchant_application_access(uuid) set statement_timeout='5s';
alter function authz.merchant_application_operational_read_allowed(uuid) set statement_timeout='5s';
alter function public.rpc_merchant_application_start(uuid,jsonb,uuid) set statement_timeout='5s';
alter function public.rpc_merchant_application_save(uuid,bigint,uuid,jsonb) set statement_timeout='5s';
alter function public.rpc_merchant_application_submit(uuid,bigint,uuid) set statement_timeout='5s';
alter function public.rpc_merchant_application_read(uuid) set statement_timeout='5s';
alter function public.rpc_merchant_application_operation_read(uuid) set statement_timeout='5s';

grant execute on function authz.merchant_application_session(),authz.merchant_application_access(uuid),
  authz.merchant_application_operational_read_allowed(uuid),public.rpc_merchant_application_start(uuid,jsonb,uuid),
  public.rpc_merchant_application_save(uuid,bigint,uuid,jsonb),public.rpc_merchant_application_submit(uuid,bigint,uuid),
  public.rpc_merchant_application_read(uuid),public.rpc_merchant_application_operation_read(uuid)
to authenticated;
