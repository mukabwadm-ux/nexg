-- Approving, running and closing a day; and the gates on the catalogue.
--
-- On money, plainly: there is no payments provider wired to this project
-- and no ledger to write to. The build prompt says to reuse the Payments
-- service and not to create a second ledger — there is no first one, and
-- inventing one here would be a worse mistake than the gap.
--
-- So approval is separated from payment. `rpc_approve_plan` records that
-- the guest said yes to a specific quoted total, which is a real and
-- useful fact. `rpc_mark_paid` demands a reference from whatever actually
-- took the money, and the plan table refuses `paid` without one. Nothing
-- can drift into looking settled.

create or replace function public.rpc_approve_plan(p_plan_id uuid)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare v_plan public.plan;
begin
  select * into v_plan from public.plan where id = p_plan_id;

  if v_plan.id is null or v_plan.user_id is distinct from (select auth.uid()) then
    raise exception 'That day is not yours.' using errcode = 'insufficient_privilege';
  end if;
  if v_plan.status <> 'quoted' then
    raise exception 'There is nothing quoted to approve.' using errcode = 'check_violation';
  end if;
  if v_plan.expires_at is not null and v_plan.expires_at < now() then
    raise exception 'That quote has expired. Ask your concierge to refresh it.'
      using errcode = 'check_violation';
  end if;

  update public.plan set status = 'approved', approved_at = now()
  where id = p_plan_id returning * into v_plan;

  insert into public.notification (kind, plan_id, to_phone, status)
  values ('plan_approved', p_plan_id, v_plan.guest_phone, 'pending');

  perform audit.log('guest'::public.actor_type, 'experiences', 'plan.approved',
    p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id,
    p_severity => 'notice'::public.audit_severity,
    p_after => jsonb_build_object('total', v_plan.quote_total_kes));

  return v_plan;
end;
$$;

comment on function public.rpc_approve_plan is
  'The guest agrees to the quoted total. It takes no money: no provider is wired, and a plan cannot reach paid without a reference from whatever does.';

create or replace function public.rpc_mark_paid(p_plan_id uuid, p_reference text)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare v_plan public.plan;
begin
  if not authz.works_plan(p_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reference), '') = '' then
    raise exception 'A payment needs the reference it was taken under.'
      using errcode = 'check_violation';
  end if;

  update public.plan
  set status = 'paid', paid_at = now(), payment_reference = trim(p_reference)
  where id = p_plan_id and status = 'approved'
  returning * into v_plan;

  if v_plan.id is null then
    raise exception 'That day is not waiting on payment.' using errcode = 'check_violation';
  end if;

  insert into public.notification (kind, plan_id, to_phone, status)
  values ('plan_paid', p_plan_id, v_plan.guest_phone, 'pending');

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan.paid',
    p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id,
    p_severity => 'notice'::public.audit_severity,
    p_after => jsonb_build_object('total', v_plan.quote_total_kes, 'reference', trim(p_reference)));

  return v_plan;
end;
$$;

-- ──────────────────────────────────────────────────── running it

create or replace function public.rpc_assign_driver(
  p_plan_id uuid,
  p_rider_id uuid default null,
  p_partner_id uuid default null
)
returns public.plan_block
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.plan_block;
  v_plan public.plan;
begin
  if not authz.works_plan(p_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;
  if (p_rider_id is null) = (p_partner_id is null) then
    raise exception 'A driver is one of ours or one of theirs, not both and not neither.'
      using errcode = 'check_violation';
  end if;

  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.status not in ('paid', 'in_progress') then
    raise exception 'Assign a driver once the day is paid for.' using errcode = 'check_violation';
  end if;

  update public.plan_block
  set assigned_rider_id = p_rider_id, assigned_driver_partner_id = p_partner_id
  where plan_id = p_plan_id and kind = 'transport' and included_by is null
    and status <> 'removed'
  returning * into v_block;

  if v_block.id is null then
    raise exception 'There is no transport block to put a driver on.'
      using errcode = 'no_data_found';
  end if;

  insert into public.notification (kind, plan_id, to_phone, status)
  values ('plan_driver_assigned', p_plan_id, v_plan.guest_phone, 'pending');

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan.driver_assigned',
    p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id);

  return v_block;
end;
$$;

create or replace function public.rpc_attach_tickets(p_block_id uuid, p_paths text[])
returns public.plan_block
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.plan_block;
  v_plan_id uuid;
begin
  select plan_id into v_plan_id from public.plan_block where id = p_block_id;
  if not authz.works_plan(v_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;

  update public.plan_block set ticket_asset_paths = coalesce(p_paths, '{}')
  where id = p_block_id and event_id is not null
  returning * into v_block;

  if v_block.id is null then
    raise exception 'Tickets go on an event block.' using errcode = 'check_violation';
  end if;

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan.tickets_attached',
    p_target_type => 'plan_block', p_target_id => p_block_id);

  return v_block;
end;
$$;

create or replace function public.rpc_block_done(p_block_id uuid)
returns public.plan_block
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.plan_block;
  v_plan_id uuid;
begin
  select plan_id into v_plan_id from public.plan_block where id = p_block_id;
  if not authz.works_plan(v_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;

  update public.plan_block set status = 'done', done_at = now()
  where id = p_block_id returning * into v_block;

  /* The first block finishing is the day starting. */
  update public.plan set status = 'in_progress'
  where id = v_plan_id and status = 'paid';

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan_block.done',
    p_target_type => 'plan_block', p_target_id => p_block_id);

  return v_block;
end;
$$;

create or replace function public.rpc_complete_plan(
  p_plan_id uuid, p_override_note text default null
)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_open integer;
begin
  if not authz.works_plan(p_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_open
  from public.plan_block
  where plan_id = p_plan_id and status not in ('done', 'removed', 'unavailable')
    and kind <> 'free';

  /*
   * A day can be closed with blocks still open, but then somebody says
   * why in writing. Closing quietly is how "completed" stops meaning
   * anything, and the review request goes out on the back of it.
   */
  if v_open > 0 and coalesce(trim(p_override_note), '') = '' then
    raise exception '% block(s) are not marked done. Mark them, or say why not.', v_open
      using errcode = 'check_violation';
  end if;

  update public.plan set status = 'completed', completed_at = now(),
         handover_note = coalesce(nullif(trim(coalesce(p_override_note, '')), ''), handover_note)
  where id = p_plan_id returning * into v_plan;

  insert into public.notification (kind, plan_id, to_phone, status)
  values ('plan_completed', p_plan_id, v_plan.guest_phone, 'pending');

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan.completed',
    p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id,
    p_reason => nullif(trim(coalesce(p_override_note, '')), ''));

  return v_plan;
end;
$$;

create or replace function public.rpc_cancel_plan(p_plan_id uuid, p_reason text)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_is_guest boolean;
begin
  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'No such day.' using errcode = 'no_data_found';
  end if;

  v_is_guest := v_plan.user_id is not distinct from (select auth.uid());
  if not v_is_guest and not authz.works_plan(p_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why.' using errcode = 'check_violation';
  end if;

  /*
   * After payment this is a refund, and a refund is two people — the same
   * rule Finance already runs on. Cancelling here would move money on one
   * person's say-so.
   */
  if v_plan.status in ('paid', 'in_progress') then
    insert into public.approval_request
      (kind, target_type, target_id, city_id, requested_by, reason, payload)
    values ('experience_refund', 'plan', p_plan_id, v_plan.city_id,
            authz.staff_id(), trim(p_reason),
            jsonb_build_object('total', v_plan.quote_total_kes,
                               'reference', v_plan.payment_reference));

    perform audit.log('staff'::public.actor_type, 'experiences', 'plan.refund_requested',
      p_target_type => 'plan', p_target_id => p_plan_id, p_reason => trim(p_reason),
      p_city_id => v_plan.city_id, p_severity => 'high'::public.audit_severity);

    raise exception 'That day is paid for. A refund needs a second person — the request is logged.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.plan set status = 'cancelled', cancel_reason = trim(p_reason)
  where id = p_plan_id returning * into v_plan;

  perform audit.log(
    case when v_is_guest then 'guest' else 'staff' end::public.actor_type,
    'experiences', 'plan.cancelled',
    p_target_type => 'plan', p_target_id => p_plan_id, p_reason => trim(p_reason),
    p_city_id => v_plan.city_id);

  return v_plan;
end;
$$;

/* Run by the timer. Expiring is not cancelling: the day can be refreshed. */
create or replace function public.rpc_expire_quotes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  with gone as (
    update public.plan set status = 'expired'
    where status = 'quoted' and expires_at < now()
    returning id, guest_phone
  )
  insert into public.notification (kind, plan_id, to_phone, status)
  select 'plan_quote_expired', id, guest_phone, 'pending' from gone;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ──────────────────────────────────────────── gates on the catalogue

create or replace function public.rpc_publish_event(p_event_id uuid)
returns public.event
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.event;
begin
  if not (authz.is_super_admin() or authz.has_role('growth') or authz.has_role('ops_manager')) then
    raise exception 'Only growth publishes events.' using errcode = 'insufficient_privilege';
  end if;

  update public.event
  set status = 'published', published_by = authz.staff_id(), published_at = now(),
      reviewed_by = authz.staff_id()
  where id = p_event_id and status = 'draft'
  returning * into v_event;

  if v_event.id is null then
    raise exception 'That event is not a draft.' using errcode = 'check_violation';
  end if;

  perform audit.log('staff'::public.actor_type, 'experiences',
    case when v_event.source = 'partner' then 'event.submission_approved' else 'event.published' end,
    p_target_type => 'event', p_target_id => p_event_id, p_city_id => v_event.city_id,
    p_after => jsonb_build_object('name', v_event.name, 'source', v_event.source));

  if v_event.source = 'partner' then
    insert into public.notification (kind, plan_id, status) values
      ('event_submission_reviewed', null, 'pending');
  end if;

  return v_event;
end;
$$;

create or replace function public.rpc_reject_event_submission(p_event_id uuid, p_reason text)
returns public.event
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.event;
begin
  if not (authz.is_super_admin() or authz.has_role('growth') or authz.has_role('ops_manager')) then
    raise exception 'Only growth decides on a submission.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason. The partner is sent it.' using errcode = 'check_violation';
  end if;

  update public.event
  set status = 'cancelled', rejected_reason = trim(p_reason), reviewed_by = authz.staff_id()
  where id = p_event_id and status = 'draft'
  returning * into v_event;

  if v_event.id is null then
    raise exception 'That event is not a draft.' using errcode = 'check_violation';
  end if;

  insert into public.notification (kind, plan_id, status)
  values ('event_submission_reviewed', null, 'pending');

  perform audit.log('staff'::public.actor_type, 'experiences', 'event.submission_rejected',
    p_target_type => 'event', p_target_id => p_event_id, p_reason => trim(p_reason),
    p_city_id => v_event.city_id);

  return v_event;
end;
$$;

create or replace function public.rpc_publish_curated_day(p_day_id uuid)
returns public.curated_day
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.curated_day;
  v_bad integer;
begin
  if not (authz.is_super_admin() or authz.has_role('growth')) then
    raise exception 'Only growth publishes a curated day.' using errcode = 'insufficient_privilege';
  end if;

  /* Publishing a day that contains a draft component puts a price on the
     home page that nobody can actually be sold. */
  select count(*) into v_bad
  from public.curated_day_block b
  join public.experience_component k on k.id = b.component_id
  where b.curated_day_id = p_day_id
    and (k.status <> 'live' or (k.price_kes is null and k.price_basis <> 'face_value'));

  if v_bad > 0 then
    raise exception '% block(s) are not live and priced.', v_bad using errcode = 'check_violation';
  end if;

  update public.curated_day set status = 'live' where id = p_day_id returning * into v_day;

  if v_day.price_per_person_kes is null then
    raise exception 'A published day needs a price per person.' using errcode = 'check_violation';
  end if;

  perform audit.log('staff'::public.actor_type, 'experiences', 'curated_day.published',
    p_target_type => 'curated_day', p_target_id => p_day_id, p_city_id => v_day.city_id);

  return v_day;
end;
$$;

create or replace function public.rpc_partner_go_live(p_partner_id uuid)
returns public.experience_partner
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner public.experience_partner;
  v_missing integer;
begin
  if not (authz.is_super_admin() or authz.has_role('ops_manager')) then
    raise exception 'Only ops puts a partner live.' using errcode = 'insufficient_privilege';
  end if;

  /* The same document gate merchants and riders go through. */
  select count(*) into v_missing
  from public.document_requirement r
  where r.owner_type = 'experience_partner' and r.essential
    and not exists (
      select 1 from public.document d
      where d.owner_type = 'experience_partner' and d.owner_id = p_partner_id
        and d.requirement_id = r.id and d.status = 'verified' and d.superseded_at is null
    );

  if v_missing > 0 then
    raise exception '% essential document(s) are not verified.', v_missing
      using errcode = 'check_violation';
  end if;

  update public.experience_partner
  set status = 'live', went_live_at = coalesce(went_live_at, now())
  where id = p_partner_id returning * into v_partner;

  perform audit.log('staff'::public.actor_type, 'experiences', 'partner.went_live',
    p_target_type => 'experience_partner', p_target_id => p_partner_id,
    p_city_id => v_partner.city_id, p_severity => 'notice'::public.audit_severity);

  return v_partner;
end;
$$;

-- ──────────────────────────────────────────── is the catalogue thin?

/*
 * Where the allocator has nothing to choose from. A slot with one live
 * component cannot be swapped and cannot be fitted to a budget — the
 * feature silently stops working there, and this is how anybody finds out
 * before a guest does.
 */
create view public.catalogue_health
with (security_invoker = true)
/* Invoker: this one has no public audience. It is staff-only, and a staff
   member's own read permissions on the catalogue should still apply. */
as
select
  k.city_id,
  k.mood,
  k.default_slot as slot,
  k.swap_group,
  count(*) filter (where k.status = 'live') as live_components,
  count(distinct k.tier) filter (where k.status = 'live') as tiers,
  min(k.price_kes) filter (where k.status = 'live') as cheapest_kes,
  count(*) filter (where k.status = 'draft' and k.price_kes is null) as drafts_without_a_price
from public.experience_component k
group by k.city_id, k.mood, k.default_slot, k.swap_group;

comment on view public.catalogue_health is
  'Per city, mood and swap group: how much the allocator actually has to choose from. One live component in a group means no swap and no budget fitting.';

grant select on public.catalogue_health to authenticated;

grant execute on function
  public.rpc_approve_plan(uuid),
  public.rpc_mark_paid(uuid, text),
  public.rpc_assign_driver(uuid, uuid, uuid),
  public.rpc_attach_tickets(uuid, text[]),
  public.rpc_block_done(uuid),
  public.rpc_complete_plan(uuid, text),
  public.rpc_cancel_plan(uuid, text),
  public.rpc_expire_quotes(),
  public.rpc_publish_event(uuid),
  public.rpc_reject_event_submission(uuid, text),
  public.rpc_publish_curated_day(uuid),
  public.rpc_partner_go_live(uuid)
to authenticated, service_role;
