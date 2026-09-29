-- Payout checks, submission, the waitlist and resume links.

/*
 * Whether the M-Pesa line is registered in the rider's own name.
 *
 * This is the one check on this flow that protects the rider rather than us:
 * pay going to somebody else's line is how a rider loses a week's earnings to
 * whoever set up their phone. There is no lookup provider connected, and
 * there is no honest way to fake it — a green "matches your ID" that nothing
 * checked tells a reviewer this was verified. So it records that nobody has
 * checked, and activation stays blocked on it.
 */
create or replace function public.rpc_rider_payout_name_check(p_rider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_provider text;
  v_result jsonb;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);

  select value #>> '{}' into v_provider
  from public.setting where key = 'payout_name_provider' and scope = 'global';

  v_result := jsonb_build_object(
    'checked_at', now(),
    'matched', null,
    'name', null,
    'msisdn', r.payout_msisdn,
    'reason', case when v_provider is null
                   then 'No name-lookup provider is configured; rider ops checks this against the ID at the hub.'
                   else 'Lookup not yet implemented for this provider.' end
  );

  update public.rider set payout_name_lookup = v_result where id = r.id;
  return v_result;
end;
$$;

-- ------------------------------------------------------------------ submit

create or replace function public.rpc_rider_submit(p_rider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_missing text;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);

  if r.submitted_at is not null then
    return jsonb_build_object('already_submitted', true,
                              'reference', 'NX-R-' || left(r.id::text, 6));
  end if;

  if r.vehicle is null then
    raise exception 'Tell us what you ride first.' using errcode = 'check_violation';
  end if;
  if r.city_id is null then
    raise exception 'Choose the city you will ride in.' using errcode = 'check_violation';
  end if;
  if r.phone_verified_at is null then
    raise exception 'Verify your phone number first.' using errcode = 'check_violation';
  end if;

  /* The ID counts only with both sides; everything else with one photo. */
  select string_agg(q.label, ', ') into v_missing
  from public.fn_rider_required_docs(r.id) q
  where q.essential
    and not (
      case when q.kind = 'national_id' then
        (select count(distinct d.side) from public.document d
          where d.owner_type = 'rider' and d.owner_id = r.id
            and d.requirement_id = q.id and d.status in ('uploaded', 'verified')
            and d.side is not null) >= 2
      else
        exists (select 1 from public.document d
          where d.owner_type = 'rider' and d.owner_id = r.id
            and d.requirement_id = q.id and d.status in ('uploaded', 'verified'))
      end
    );

  if v_missing is not null then
    raise exception 'We still need: %', v_missing using errcode = 'check_violation';
  end if;

  update public.rider set submitted_at = now(), onboarding_step = 6 where id = r.id;

  perform public.fn_partner_recompute_status('rider'::public.document_owner_type, r.id);

  insert into public.notification_log (channel, recipient, template, payload, status)
  values ('sms', r.phone, 'rider_ack',
          jsonb_build_object('rider_id', r.id, 'first_name', r.first_name), 'skipped');

  perform audit.log(
    p_actor_type => 'rider'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.submitted',
    p_target_type => 'rider',
    p_target_id => r.id,
    p_city_id => r.city_id
  );

  return jsonb_build_object(
    'reference', 'NX-R-' || left(r.id::text, 6),
    'submitted_at', now(),
    'readiness', public.fn_rider_readiness(r.id)
  );
end;
$$;

-- --------------------------------------------------------- waitlist, resume

/*
 * A rider in a city we have not opened. Nothing about the application
 * changes — being early is not being rejected — and the record of who asked,
 * and from where, is what turns "should we open Nakuru?" into a query.
 */
create or replace function public.rpc_rider_waitlist(p_rider_id uuid, p_city_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  c public.city;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);
  select * into c from public.city where id = p_city_id;

  if c.id is null then
    raise exception 'That city is not one we know.' using errcode = 'no_data_found';
  end if;

  insert into public.waitlist_signup (source, city_id, email, payload)
  values ('rider_waitlist_city', p_city_id, null,
          jsonb_build_object('rider_id', r.id, 'first_name', r.first_name,
                             'phone', r.phone, 'city', c.name));

  update public.rider set waitlisted_at = now(), city_id = p_city_id where id = r.id;

  insert into public.notification_log (channel, recipient, template, payload, status)
  values ('sms', r.phone, 'rider_waitlist_ack',
          jsonb_build_object('rider_id', r.id, 'city', c.name), 'skipped');

  perform audit.log(
    p_actor_type => 'rider'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.waitlisted',
    p_target_type => 'rider',
    p_target_id => r.id,
    p_after => jsonb_build_object('city', c.name)
  );

  return jsonb_build_object('city', c.name);
end;
$$;

alter table public.waitlist_signup drop constraint if exists waitlist_signup_source_check;
alter table public.waitlist_signup
  add constraint waitlist_signup_source_check check (
    source in ('homepage_app', 'homepage_city', 'homepage_request',
               'merchant_outside_zone', 'rider_waitlist_city')
  );

create or replace function public.rpc_rider_resume_token(p_rider_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_token text;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.rider
  set resume_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
      resume_token_expires_at = now() + interval '7 days'
  where id = r.id;

  perform audit.log(
    p_actor_type => 'rider'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.resume_link_sent',
    p_target_type => 'rider',
    p_target_id => r.id
  );

  return v_token;
end;
$$;

/*
 * Opening a resume link. Whoever holds it becomes the rider — the same
 * bargain a magic link makes — so it is hashed, single use and seven days.
 */
create or replace function public.rpc_rider_resume_claim(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then
    raise exception 'Start a session first.' using errcode = 'insufficient_privilege';
  end if;

  select * into r from public.rider
  where resume_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if r.id is null or r.resume_token_expires_at < now() then
    raise exception 'That link has expired. Ask for a new one.' using errcode = 'no_data_found';
  end if;

  update public.rider
  set resume_token_hash = null,
      resume_token_expires_at = null,
      user_id = v_caller
  where id = r.id;

  perform audit.log(
    p_actor_type => 'rider'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.resumed',
    p_target_type => 'rider',
    p_target_id => r.id
  );

  return jsonb_build_object('rider_id', r.id, 'step', r.onboarding_step);
end;
$$;

-- ------------------------------------------------------------------ grants

grant execute on function public.fn_rider_draft_for_write(uuid) to authenticated;
grant execute on function public.rpc_rider_start(text, text, uuid, text) to authenticated;
grant execute on function public.rpc_rider_request_phone_code(uuid) to authenticated;
grant execute on function public.rpc_rider_verify_phone_code(uuid, text) to authenticated;
grant execute on function public.rpc_rider_save_step(uuid, smallint, jsonb) to authenticated;
grant execute on function public.rpc_rider_set_vehicle(uuid, public.vehicle_type) to authenticated;
grant execute on function public.rpc_book_slot(uuid, uuid) to authenticated;
grant execute on function public.rpc_rider_payout_name_check(uuid) to authenticated;
grant execute on function public.rpc_rider_submit(uuid) to authenticated;
grant execute on function public.rpc_rider_waitlist(uuid, uuid) to authenticated;
grant execute on function public.rpc_rider_resume_token(uuid) to authenticated;
grant execute on function public.rpc_rider_resume_claim(text) to authenticated;
