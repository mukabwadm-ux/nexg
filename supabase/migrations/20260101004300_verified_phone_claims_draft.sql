-- One business, one application, once the number is proved.
--
-- rpc_merchant_start deliberately refuses to hand an existing draft to
-- somebody who merely knows the phone number — knowing a number is not a
-- credential, and handing it over would let anyone rewrite a real merchant's
-- legal name and contact details.
--
-- The consequence was a duplicate. A merchant who got to the documents step
-- on a laptop and came back on their phone typed the same name and number,
-- could not be given the old draft, and started a second one. The merchant
-- console then shows two applications for the same shop and a reviewer has to
-- work out which is real.
--
-- Verifying the code is the missing credential. At that moment the caller has
-- proved they hold the number, which is exactly the evidence rpc_merchant_start
-- did not have. So verification adopts the earlier draft and throws away the
-- stub just created — and only the stub: the merge is refused if the new row
-- has anything in it worth keeping.

create or replace function public.rpc_merchant_verify_phone_code(
  p_merchant_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_caller uuid := (select auth.uid());
  v_earlier public.merchant;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  if m.phone_verified_at is not null then
    return jsonb_build_object('verified', true, 'merchant_id', m.id);
  end if;

  if m.phone_code_hash is null or m.phone_code_expires_at < now() then
    raise exception 'That code has expired. Ask for a new one.'
      using errcode = 'no_data_found';
  end if;

  if m.phone_code_attempts >= 3 then
    raise exception 'Too many tries. Ask for a new code.' using errcode = 'check_violation';
  end if;

  if encode(extensions.digest(trim(p_code), 'sha256'), 'hex') <> m.phone_code_hash then
    update public.merchant
    set phone_code_attempts = phone_code_attempts + 1
    where id = m.id;
    raise exception 'That code is not right.' using errcode = 'check_violation';
  end if;

  update public.merchant
  set phone_verified_at = now(),
      phone_code_hash = null,
      phone_code_expires_at = null
  where id = m.id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.phone_verified',
    p_target_type => 'merchant',
    p_target_id => m.id
  );

  /*
   * Is there an earlier application on this number that got further? Only
   * an unsubmitted one — a submitted application is a reviewer's workload,
   * not a draft to be folded into something else.
   */
  if m.onboarding_step <= 2 then
    select * into v_earlier
    from public.merchant
    where contact_phone = m.contact_phone
      and id <> m.id
      and submitted_at is null
      and onboarding_step > m.onboarding_step
    order by onboarding_step desc, updated_at desc
    limit 1;
  end if;

  if v_earlier.id is not null then
    insert into public.merchant_user (merchant_id, user_id, role)
    values (v_earlier.id, v_caller, 'owner')
    on conflict (merchant_id, user_id) do nothing;

    /* Carry across the two things they may have just corrected, and the
       proof itself. Everything else on the older row is further along. */
    update public.merchant
    set trading_name = m.trading_name,
        contact_name = coalesce(m.contact_name, contact_name),
        contact_email = coalesce(m.contact_email, contact_email),
        phone_verified_at = now()
    where id = v_earlier.id;

    /* The stub had a name, an owner and a number, all of which just moved.
       It cascades to nothing because nothing else was attached to it. */
    delete from public.merchant where id = m.id;

    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.resumed',
      p_target_type => 'merchant',
      p_target_id => v_earlier.id,
      p_after => jsonb_build_object('via', 'verified_phone', 'discarded_stub', m.id)
    );

    return jsonb_build_object(
      'verified', true,
      'merchant_id', v_earlier.id,
      'resumed_step', v_earlier.onboarding_step
    );
  end if;

  return jsonb_build_object('verified', true, 'merchant_id', m.id);
end;
$$;

grant execute on function public.rpc_merchant_verify_phone_code(uuid, text) to authenticated;
