-- A paused merchant stops taking orders, so documents expire again.
--
-- expire-documents-nightly failed every night from at least 9 Nov 2026,
-- most likely from 31 Oct. Expiring a live merchant's document fires
-- document_recompute_status, and fn_partner_recompute_status pauses the
-- merchant. It changed the status and nothing else, so a merchant taking
-- orders broke merchant_not_live_takes_no_orders (20260101002200): a
-- merchant that is not live takes no orders. The job is one transaction,
-- so the first such merchant (a demo kitchen whose permit lapsed on
-- 30 Oct) stopped every document expiring, riders' included. Staff
-- rejecting a live merchant's document hit the same wall.
--
-- 1. fn_partner_recompute_status never makes anybody live, so a merchant
--    it moves is not live: orders and the concierge pick go off with the
--    status, as merchant_not_live_takes_no_orders and
--    merchant_not_live_is_no_pick require. Turning orders back on after
--    going live again stays the merchant's own choice.
-- 2. fn_expire_documents expires each document in its own subtransaction.
--    A document whose expiry cannot be applied stays as it was, with a
--    warning in the database log naming it, and every other document
--    still expires.
--
-- Rollback: re-run fn_partner_recompute_status from
-- 20260101001000_status_functions.sql and fn_expire_documents from
-- 20260101001500_expiry_and_cron.sql.

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
    -- Never live from here, so a merchant moved by this function takes no
    -- orders and is nobody's concierge pick (merchant_not_live_takes_no_orders,
    -- merchant_not_live_is_no_pick).
    update public.merchant
    set status = v_next::public.partner_status,
        status_reason = case when v_rejected > 0 then v_reject_reason else null end,
        accepting_orders = false,
        concierge_pick = false
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

create or replace function public.fn_expire_documents()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select id, owner_type, owner_id
    from public.document
    where superseded_at is null
      and status in ('uploaded', 'verified')
      and expires_at is not null
      and expires_at < current_date
  loop
    /*
     * Each document in its own subtransaction. One partner whose
     * status cannot change must not stop every other document
     * expiring, as one demo kitchen did from October to November 2026.
     */
    begin
      update public.document
      set status = 'expired'
      where id = v_row.id;

      perform audit.log(
        p_actor_type => 'system',
        p_module => v_row.owner_type::text,
        p_action => 'document.expired',
        p_target_type => 'document',
        p_target_id => v_row.id,
        p_after => jsonb_build_object('status', 'expired'),
        p_severity => 'high'
      );

      v_count := v_count + 1;
    exception when others then
      raise warning 'fn_expire_documents: document % (% %) was not expired: %',
        v_row.id, v_row.owner_type, v_row.owner_id, sqlerrm;
    end;
  end loop;

  return v_count;
end;
$$;
