-- Managed application review reads. Existing review commands retain ownership
-- of decisions, idempotency and audit. No payout declaration is exposed here.
create index merchant_application_review_queue_order_idx
  on public.merchant_application(updated_at, merchant_id) include (review_state);

create function public.rpc_merchant_application_review_queue(
  p_state text default 'pending', p_limit integer default 25,
  p_after_updated_at timestamptz default null, p_after_merchant_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb; v_more boolean; v_last jsonb;
begin
  perform authz.require_merchant_application_session();
  if not exists (
    select 1 from public.staff_user su
    join public.role_grant rg on rg.staff_user_id=su.id
    join public.role r on r.id=rg.role_id
    where su.user_id=(select auth.uid()) and su.status='active'
      and r.key in ('merchant_ops','super_admin') and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at>now())
  ) then raise exception 'Merchant review permission is required.' using errcode='42501'; end if;
  if p_state is null or p_state not in ('all','draft','pending','changes_requested','approved','rejected')
    or p_limit is null or p_limit<1 or p_limit>50
    or (p_after_updated_at is null)<>(p_after_merchant_id is null)
    or (p_after_updated_at is not null and not isfinite(p_after_updated_at)) then
    raise exception 'Invalid review queue request.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at,q.merchant_id),'[]'::jsonb)
    into v_rows from (
      select a.merchant_id,a.revision,a.submitted_revision,a.review_state,a.submitted_at,a.updated_at,
        a.payload#>>'{business,name}' as business_name,a.payload->>'categoryId' as category_id,
        a.payload->'subcategories' as subcategories,
        a.submitted_revision is not null and a.submitted_revision<>a.revision as needs_resubmission
      from public.merchant_application a
      where authz.merchant_application_staff(a.merchant_id)
        and (p_state='all' or a.review_state=p_state)
        and (p_after_updated_at is null or (a.updated_at,a.merchant_id)>(p_after_updated_at,p_after_merchant_id))
      order by a.updated_at,a.merchant_id limit p_limit+1
    ) q;
  v_more:=jsonb_array_length(v_rows)>p_limit;
  if v_more then v_rows:=v_rows-p_limit; end if;
  v_last:=v_rows->(jsonb_array_length(v_rows)-1);
  return jsonb_build_object('items',v_rows,'next_cursor',case when v_more then
    jsonb_build_object('updated_at',v_last->>'updated_at','merchant_id',v_last->>'merchant_id') else null end);
end;
$$;

create function public.rpc_merchant_application_review_detail(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.merchant_application; v_submitted jsonb;
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant review permission is required.' using errcode='42501'; end if;
  select * into a from public.merchant_application where merchant_id=p_merchant_id;
  if a.merchant_id is null then raise exception 'Application not found.' using errcode='P0002'; end if;
  if a.submitted_revision is not null then
    select jsonb_build_object('merchant_id',s.merchant_id,'revision',s.revision,'payload',s.payload,
      'submitted_at',s.submitted_at,'submitted_by',s.submitted_by)
      into v_submitted from public.merchant_application_submission s
      where s.merchant_id=p_merchant_id and s.revision=a.submitted_revision;
    if v_submitted is null then raise exception 'Submitted snapshot is unavailable.' using errcode='55000'; end if;
  end if;
  return jsonb_build_object('record',public.fn_merchant_application_result(p_merchant_id),
    'submitted',v_submitted,'can_review',a.review_state='pending' and a.submitted_revision=a.revision);
end;
$$;

-- A PI-free branch check lets the legacy detail avoid loading stale legacy
-- capture for managed merchants. Errors must never fall back to legacy reads.
create function public.rpc_merchant_application_review_lookup(p_merchant_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant review permission is required.' using errcode='42501'; end if;
  return exists(select 1 from public.merchant_application where merchant_id=p_merchant_id);
end;
$$;

revoke all on function public.rpc_merchant_application_review_queue(text,integer,timestamptz,uuid),
  public.rpc_merchant_application_review_detail(uuid),public.rpc_merchant_application_review_lookup(uuid)
  from public,anon,authenticated;
grant execute on function public.rpc_merchant_application_review_queue(text,integer,timestamptz,uuid),
  public.rpc_merchant_application_review_detail(uuid),public.rpc_merchant_application_review_lookup(uuid)
  to authenticated;
alter function public.rpc_merchant_application_review_queue(text,integer,timestamptz,uuid)
  set statement_timeout='5s';
alter function public.rpc_merchant_application_review_queue(text,integer,timestamptz,uuid)
  set lock_timeout='2s';
alter function public.rpc_merchant_application_review_detail(uuid) set statement_timeout='5s';
alter function public.rpc_merchant_application_review_detail(uuid) set lock_timeout='2s';
alter function public.rpc_merchant_application_review_lookup(uuid) set statement_timeout='5s';
alter function public.rpc_merchant_application_review_lookup(uuid) set lock_timeout='2s';
