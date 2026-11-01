/*
 * Documents no longer block a merchant from submitting.
 *
 * Merchants can finish onboarding without uploading everything and add the
 * documents afterwards. The safety rule is unchanged and still enforced in the
 * database elsewhere: nothing goes public or dispatchable until the documents
 * behind it are verified (fn_partner_recompute_status). This only removes the
 * "We still need: ..." refusal from submission.
 *
 * Rollback: re-apply rpc_merchant_submit from 20260101003900_onboarding_rpcs.sql.
 */
create or replace function public.rpc_merchant_submit(p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  if m.submitted_at is not null then
    return jsonb_build_object('already_submitted', true, 'reference', 'NX-M-' || left(m.id::text, 6));
  end if;

  if m.category is null then
    raise exception 'Tell us what you sell before we can check you.'
      using errcode = 'check_violation';
  end if;

  if m.city_id is null then
    raise exception 'Drop a pin on your main branch before we can check you.'
      using errcode = 'check_violation';
  end if;

  update public.merchant
  set submitted_at = now(),
      legal_name = coalesce(legal_name, trading_name),
      onboarding_step = 7
  where id = m.id;

  perform public.fn_partner_recompute_status('merchant'::public.document_owner_type, m.id);

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.submitted',
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object('category', m.category, 'city_id', m.city_id),
    p_city_id => m.city_id
  );

  return jsonb_build_object(
    'reference', 'NX-M-' || left(m.id::text, 6),
    'submitted_at', now(),
    'readiness', public.fn_merchant_readiness(m.id)
  );
end;
$$;
