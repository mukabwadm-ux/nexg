/*
 * Catalogues → Publish Changes: rpc_catalogue_edit_review failed on every
 * call. It wrote the notification kind as text into an enum column
 * (public.notification.kind is public.notification_kind), so publishing or
 * turning down any change a merchant asked for raised 42804 and rolled back.
 * Found by the database lint while building the Catalogues screen.
 *
 * Also: publishing a price change whose payload has no whole, non-negative
 * price now says so (22023) instead of failing on the cast or writing null.
 *
 * Publishing the other kinds (new_item, remove_item, photo) still records
 * the decision only: nothing defines their payload yet, and the console
 * says so where they are listed.
 *
 * Otherwise the body is unchanged from 20260101007400. Production's copy
 * matched that definition (normalised md5 4fe30325…) on 2026-11-18. Nothing
 * creates edit requests yet, so no request was ever reviewed.
 *
 * Rollback: run the definition in 20260101007400_merchant_console_rpcs.sql.
 */

create or replace function public.rpc_catalogue_edit_review(
  p_request_id uuid, p_approve boolean, p_reason text default null
)
returns public.catalogue_edit_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.catalogue_edit_request;
  v_price text;
begin
  select * into v_request from public.catalogue_edit_request
  where id = p_request_id and status = 'pending';

  if v_request.id is null then
    raise exception 'No such pending edit.' using errcode = 'no_data_found';
  end if;
  if not authz.works_merchant(v_request.merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;
  if not p_approve and coalesce(trim(coalesce(p_reason, '')), '') = '' then
    raise exception 'Say why you are rejecting it. The merchant reads this.'
      using errcode = 'check_violation';
  end if;

  if p_approve and v_request.kind = 'price_change' and v_request.catalogue_item_id is not null then
    v_price := trim(v_request.payload ->> 'price_kes');
    if v_price is null or v_price !~ '^[0-9]{1,8}$' then
      raise exception 'This price change has no price in whole shillings, so it cannot be published.'
        using errcode = 'invalid_parameter_value';
    end if;
    update public.catalogue_item
    set price_kes = v_price::integer
    where id = v_request.catalogue_item_id;
  end if;

  update public.catalogue_edit_request
  set status = case when p_approve then 'approved' else 'rejected' end::public.edit_approval_status,
      reviewed_by = authz.staff_id(), reviewed_at = now(),
      reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_request_id
  returning * into v_request;

  insert into public.notification (kind, status)
  values (
    (case when p_approve then 'edit_approved' else 'edit_rejected' end)::public.notification_kind,
    'pending'
  );

  perform audit.log('staff'::public.actor_type, 'merchants', 'catalogue.edit_reviewed',
    p_target_type => 'catalogue_edit_request', p_target_id => p_request_id,
    p_reason => p_reason, p_after => jsonb_build_object('approved', p_approve));

  return v_request;
end;
$$;
