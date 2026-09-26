-- Required-document resolution and the status gate — spec section 3.3.

/*
 * Which requirements apply to this rider. An empty applies_when means always;
 * otherwise the rider's vehicle must appear in the listed values.
 */
create or replace function public.fn_rider_required_docs(p_rider_id uuid)
returns setof public.document_requirement
language sql
stable
set search_path = ''
as $$
  select dr.*
  from public.document_requirement dr
  join public.rider r on r.id = p_rider_id
  where dr.owner_type = 'rider'
    and dr.required
    and (
      dr.applies_when = '{}'::jsonb
      or (
        dr.applies_when ? 'vehicle'
        and dr.applies_when -> 'vehicle' @> to_jsonb(r.vehicle::text)
      )
    )
  order by dr.sort
$$;

create or replace function public.fn_merchant_required_docs(p_merchant_id uuid)
returns setof public.document_requirement
language sql
stable
set search_path = ''
as $$
  select dr.*
  from public.document_requirement dr
  join public.merchant m on m.id = p_merchant_id
  where dr.owner_type = 'merchant'
    and dr.required
    and (
      dr.applies_when = '{}'::jsonb
      or (
        dr.applies_when ? 'category'
        and dr.applies_when -> 'category' @> to_jsonb(m.category::text)
      )
    )
  order by dr.sort
$$;

grant execute on function public.fn_rider_required_docs(uuid) to anon, authenticated, service_role;
grant execute on function public.fn_merchant_required_docs(uuid) to anon, authenticated, service_role;

-- --------------------------------------------------------------- the gate
/*
 * Recompute a partner's status from the documents on file. Section 3.3:
 *
 *   any required document missing        -> documents_pending
 *   any current document rejected        -> documents_pending, reason surfaced
 *   all present, some not yet reviewed   -> under_review
 *   all verified, not yet activated      -> under_review, awaiting an explicit
 *                                           activate or go-live
 *   already active or live, and a document later expires or is rejected
 *                                        -> suspended (rider) / paused (merchant)
 *
 * Reaching active or live is deliberately not something this function can do.
 * That is rpc_activate_rider and rpc_merchant_go_live, and nothing else.
 */
create or replace function public.fn_partner_recompute_status(
  p_owner_type public.document_owner_type,
  p_owner_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_applicable uuid[];
  v_required int;
  v_present int;
  v_verified int;
  v_rejected int;
  v_expired int;
  v_reject_reason text;
  v_current text;
  v_next text;
  v_city uuid;
begin
  -- Which requirements apply, and where the partner currently stands.
  if p_owner_type = 'rider' then
    select r.status::text, r.city_id into v_current, v_city
    from public.rider r where r.id = p_owner_id;

    select coalesce(array_agg(q.id), '{}') into v_applicable
    from public.fn_rider_required_docs(p_owner_id) q;
  else
    select m.status::text, m.city_id into v_current, v_city
    from public.merchant m where m.id = p_owner_id;

    select coalesce(array_agg(q.id), '{}') into v_applicable
    from public.fn_merchant_required_docs(p_owner_id) q;
  end if;

  if v_current is null then
    raise exception 'No % with id %', p_owner_type, p_owner_id;
  end if;

  v_required := cardinality(v_applicable);

  -- Only the live version of each document counts; superseded rows are history.
  select
    count(*),
    count(*) filter (where d.status = 'verified'),
    count(*) filter (where d.status = 'rejected'),
    count(*) filter (where d.status = 'expired'),
    max(d.rejection_reason) filter (where d.status = 'rejected')
  into v_present, v_verified, v_rejected, v_expired, v_reject_reason
  from public.document d
  where d.owner_type = p_owner_type
    and d.owner_id = p_owner_id
    and d.superseded_at is null
    and d.requirement_id = any (v_applicable);

  -- An already-approved partner is only ever pulled back by this function.
  if v_current in ('active', 'live') then
    if v_rejected > 0 or v_expired > 0 then
      v_next := case when p_owner_type = 'rider' then 'suspended' else 'paused' end;
    else
      return v_current;
    end if;
  elsif v_rejected > 0 then
    v_next := 'documents_pending';
  elsif v_present < v_required or v_expired > 0 then
    v_next := 'documents_pending';
  elsif v_verified = v_required then
    -- Everything checks out, but activation stays a human decision.
    v_next := 'under_review';
  else
    v_next := 'under_review';
  end if;

  if v_next = v_current then
    return v_current;
  end if;

  -- Ground rule 4: the status change and its audit event share a transaction.
  if p_owner_type = 'rider' then
    update public.rider
    set status = v_next::public.rider_status,
        status_reason = case when v_rejected > 0 then v_reject_reason else null end
    where id = p_owner_id;
  else
    update public.merchant
    set status = v_next::public.partner_status,
        status_reason = case when v_rejected > 0 then v_reject_reason else null end
    where id = p_owner_id;
  end if;

  -- Both casts are load-bearing: a CASE yields text, and named-argument calls
  -- will not implicitly narrow text to an enum.
  perform audit.log(
    p_actor_type => 'system'::public.actor_type,
    p_module => p_owner_type::text,
    p_action => p_owner_type || '.status_recomputed',
    p_target_type => p_owner_type::text,
    p_target_id => p_owner_id,
    p_before => jsonb_build_object('status', v_current),
    p_after => jsonb_build_object('status', v_next),
    p_reason => case when v_rejected > 0 then v_reject_reason else null end,
    p_severity => (case when v_next in ('suspended', 'paused') then 'high' else 'info' end)::public.audit_severity,
    p_city_id => v_city
  );

  return v_next;
end;
$$;

comment on function public.fn_partner_recompute_status is
  'Derives status from the documents on file. Cannot produce active or live — only the activation RPCs can.';

-- Every document change re-evaluates the owner.
create or replace function public.tg_document_recompute_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_type public.document_owner_type;
  v_owner_id uuid;
begin
  v_owner_type := coalesce(new.owner_type, old.owner_type);
  v_owner_id := coalesce(new.owner_id, old.owner_id);

  perform public.fn_partner_recompute_status(v_owner_type, v_owner_id);
  return null;
end;
$$;

create trigger document_recompute_status
  after insert or update on public.document
  for each row execute function public.tg_document_recompute_status();
