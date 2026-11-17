-- A rider application can be submitted before the document photos are in.
--
-- The rider form on /riders is now one short page, like the merchant form
-- (owner, 17 Nov 2026): name, phone, a confirmed email, the number plate and
-- the terms. Photos, areas and the kit come afterwards, from the rider
-- dashboard, which already accepts riders who are not active yet. So
-- submitting no longer waits for every essential document.
--
-- Approval is unchanged: rpc_activate_rider still requires every essential
-- document to be verified, a plate, the payout name check (or a reason) and
-- the kit (or a reason). The old five-step form keeps working: it only
-- reaches Submit after the photos anyway.
--
-- Otherwise identical to 20261209000100. Idempotent.

create or replace function public.rpc_rider_submit(p_rider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_email text;
  v_confirmed timestamptz;
  v_anonymous boolean;
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

  /* The login is the confirmed email on the account that owns the draft. */
  select u.email, u.email_confirmed_at, coalesce(u.is_anonymous, false)
    into v_email, v_confirmed, v_anonymous
  from auth.users u where u.id = r.user_id;
  /* A confirmed email login (the current form), or a verified phone (the
     earlier form). */
  if (v_email is null or v_confirmed is null or v_anonymous) and r.phone_verified_at is null then
    raise exception 'Verify your email address first.' using errcode = 'check_violation';
  end if;

  update public.rider
    set submitted_at = now(), onboarding_step = 6,
        email = case when v_confirmed is not null and not v_anonymous then lower(v_email) else email end
  where id = r.id;

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

grant execute on function public.rpc_rider_submit(uuid) to authenticated;
