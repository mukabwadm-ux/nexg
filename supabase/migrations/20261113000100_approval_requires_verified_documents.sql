-- A merchant's workspace opens only after staff have verified their documents.
--
-- Until now an application could be approved while its required documents
-- were still unchecked: document verification ran separately. Approval now
-- requires every essential document that applies to the business to have a
-- current, verified version. Non-essential documents keep their grace period.

create function authz.merchant_documents_verified(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.fn_merchant_required_docs(p_merchant_id) rq
    where rq.essential
      and not exists (
        select 1 from public.document d
        where d.owner_type = 'merchant' and d.owner_id = p_merchant_id
          and d.requirement_id = rq.id and d.superseded_at is null
          and d.status = 'verified'));
$$;

revoke execute on function authz.merchant_documents_verified(uuid) from public, anon, authenticated;

comment on function authz.merchant_documents_verified(uuid) is
  'True when every essential document that applies to the merchant has a current verified version. Gates application approval.';

-- What the review screen shows beside the Approve button.
create function public.rpc_merchant_document_readiness(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant review permission is required.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ready', authz.merchant_documents_verified(p_merchant_id),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
          'kind', rq.kind,
          'label', rq.label,
          'essential', rq.essential,
          'status', coalesce(d.status::text, 'missing'))
        order by rq.sort, rq.kind)
      from public.fn_merchant_required_docs(p_merchant_id) rq
      left join public.document d
        on d.owner_type = 'merchant' and d.owner_id = p_merchant_id
       and d.requirement_id = rq.id and d.superseded_at is null), '[]'::jsonb));
end;
$$;

revoke execute on function public.rpc_merchant_document_readiness(uuid) from public, anon;
grant execute on function public.rpc_merchant_document_readiness(uuid) to authenticated;

-- The review command, unchanged except for the document gate.
create or replace function public.rpc_merchant_application_review(p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid,p_decision text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.merchant_application; v_request jsonb; v_replay jsonb;
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_staff(p_merchant_id) then raise exception 'Merchant review permission is required.' using errcode='42501'; end if;
  if p_decision not in ('approved','changes_requested','rejected') or p_decision is null
    or length(coalesce(p_reason,''))>2000 or (p_decision<>'approved' and trim(coalesce(p_reason,''))='') then
    raise exception 'Choose a review decision and explain required changes or rejection.' using errcode='22023'; end if;
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'expected_revision',p_expected_revision,'decision',p_decision,'reason',nullif(trim(p_reason),''));
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'review',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('review');
  select * into a from public.merchant_application where merchant_id=p_merchant_id for update;
  if a.merchant_id is null then raise exception 'Application not found.' using errcode='P0002'; end if;
  if p_expected_revision is distinct from a.revision or a.submitted_revision is distinct from a.revision then
    raise exception 'Review the current submitted revision.' using errcode='40001'; end if;
  if a.review_state<>'pending' then raise exception 'This revision has already been reviewed.' using errcode='22023'; end if;
  -- Approval opens the whole workspace, so every essential document must
  -- already be verified by staff. Changes and rejections are never blocked.
  if p_decision='approved' and not authz.merchant_documents_verified(p_merchant_id) then
    raise exception 'Verify every required document before approving this business.' using errcode='22023'; end if;
  update public.merchant_application set review_state=p_decision,review_reason=nullif(trim(p_reason),''),
    approved_revision=case when p_decision='approved' then revision else null end,
    reviewed_by=authz.staff_id(),reviewed_at=now(),updated_at=now() where merchant_id=p_merchant_id;
  perform audit.log(p_actor_type=>'staff'::public.actor_type,p_actor_id=>authz.staff_id(),p_module=>'merchant',
    p_action=>'merchant.application_reviewed',p_target_type=>'merchant',p_target_id=>p_merchant_id,
    p_after=>jsonb_build_object('revision',a.revision,'decision',p_decision),p_reason=>nullif(trim(p_reason),''));
  return public.fn_merchant_application_operation_finish(p_operation_id,'review',v_request,p_merchant_id,
    public.fn_merchant_application_result(p_merchant_id,p_operation_id));
end;
$$;
