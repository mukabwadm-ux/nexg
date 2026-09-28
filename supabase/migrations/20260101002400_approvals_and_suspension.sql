-- Two-person approval, and merchant pause / suspend — spec section 5.2.
--
-- The `Merchants` artboard puts a line under the Suspend button: "Suspension
-- needs a reason and a second approver · payout is held while suspended". The
-- `Overview` artboard has an "Approvals waiting for you" panel listing the
-- same kind of thing for money. So this is one mechanism, not a merchant
-- feature: a staff member proposes, a different staff member decides.
--
-- role_grant already works this way (granted_by / approved_by). This
-- generalises it so the next thing that needs a second pair of eyes — a payout
-- release, a fee change — does not invent its own.

create type public.approval_kind as enum ('merchant_suspension');

create type public.approval_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table public.approval_request (
  id uuid primary key default gen_random_uuid(),
  kind public.approval_kind not null,
  target_type text not null,
  target_id uuid not null,
  city_id uuid references public.city (id) on delete set null,
  requested_by uuid not null references public.staff_user (id) on delete restrict,
  reason text not null,
  /* Whatever the decision needs to apply that is not on the target row. */
  payload jsonb not null default '{}'::jsonb,
  status public.approval_status not null default 'pending',
  decided_by uuid references public.staff_user (id) on delete restrict,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint approval_reason_not_blank check (length(trim(reason)) > 0),
  constraint approval_decision_is_attributed check (
    status = 'pending' or (decided_by is not null and decided_at is not null)
  ),
  /*
   * The whole point. Proposing and approving your own suspension is one pair
   * of eyes wearing a second hat, and a constraint is the only version of
   * this rule that cannot be forgotten in a code path.
   */
  constraint approval_needs_a_second_person check (
    decided_by is null or decided_by <> requested_by
  )
);

create index approval_request_pending_idx
  on public.approval_request (status, created_at)
  where status = 'pending';

create index approval_request_target_idx
  on public.approval_request (target_type, target_id);

create trigger approval_request_set_updated_at
  before update on public.approval_request
  for each row execute function public.tg_set_updated_at();

comment on table public.approval_request is
  'Something one staff member proposes and a different one decides. The second-approver rule is a check constraint, not a convention.';

alter table public.approval_request enable row level security;

create policy approval_read_staff on public.approval_request
  for select to authenticated
  using (authz.is_super_admin() or authz.can_manage_merchants(city_id));

/* Writes go through the RPCs below, which is where the rules live. */

-- --------------------------------------------------------------- requesting

create or replace function public.rpc_merchant_request_suspension(
  p_merchant_id uuid,
  p_reason text
)
returns public.approval_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_staff uuid := authz.staff_id();
  v_request public.approval_request;
begin
  if v_staff is null then
    raise exception 'Only staff can request a suspension.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_merchant from public.merchant where id = p_merchant_id;
  if v_merchant.id is null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if not authz.can_manage_merchants(v_merchant.city_id) then
    raise exception 'You cannot suspend a business in that city.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. The reason is shown to whoever approves it.'
      using errcode = 'check_violation';
  end if;

  if v_merchant.status = 'suspended' then
    raise exception 'That business is already suspended.' using errcode = 'check_violation';
  end if;

  -- One open request at a time, or two approvers can suspend the same
  -- business twice and the second decision has nothing left to do.
  if exists (
    select 1 from public.approval_request r
    where r.target_type = 'merchant'
      and r.target_id = p_merchant_id
      and r.kind = 'merchant_suspension'
      and r.status = 'pending'
  ) then
    raise exception 'A suspension is already waiting for approval on that business.'
      using errcode = 'unique_violation';
  end if;

  insert into public.approval_request (
    kind, target_type, target_id, city_id, requested_by, reason,
    payload
  )
  values (
    'merchant_suspension', 'merchant', p_merchant_id, v_merchant.city_id, v_staff,
    trim(p_reason),
    jsonb_build_object('status_before', v_merchant.status)
  )
  returning * into v_request;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.suspension_requested',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_after => jsonb_build_object('approval_request_id', v_request.id),
    p_reason => trim(p_reason),
    p_city_id => v_merchant.city_id
  );

  return v_request;
end;
$$;

-- ---------------------------------------------------------------- deciding

create or replace function public.rpc_approval_decide(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.approval_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_request;
  v_staff uuid := authz.staff_id();
  v_merchant public.merchant;
begin
  if v_staff is null then
    raise exception 'Only staff can decide an approval.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.approval_request where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'That request does not exist.' using errcode = 'no_data_found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'That request was already %.', v_request.status
      using errcode = 'check_violation';
  end if;

  if not authz.can_manage_merchants(v_request.city_id) then
    raise exception 'You cannot decide approvals for that city.'
      using errcode = 'insufficient_privilege';
  end if;

  -- The check constraint would catch this too; the message is the point.
  if v_request.requested_by = v_staff then
    raise exception 'Someone other than you has to approve this.'
      using errcode = 'check_violation';
  end if;

  update public.approval_request
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.approval_status,
      decided_by = v_staff,
      decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_request_id
  returning * into v_request;

  if p_approve and v_request.kind = 'merchant_suspension' then
    /*
     * Suspending takes the business off every surface at once. Leaving
     * `featured` set would keep a suspended merchant in the homepage band,
     * which is exactly the kind of thing ground rule 5 exists to prevent.
     */
    update public.merchant
    set status = 'suspended',
        status_reason = v_request.reason,
        accepting_orders = false,
        concierge_pick = false,
        featured = false
    where id = v_request.target_id
    returning * into v_merchant;

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.suspended',
      p_target_type => 'merchant',
      p_target_id => v_request.target_id,
      p_before => jsonb_build_object('status', v_request.payload ->> 'status_before'),
      p_after => jsonb_build_object('status', 'suspended', 'approval_request_id', v_request.id),
      p_reason => v_request.reason,
      p_city_id => v_request.city_id
    );
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'approval',
    p_action => case when p_approve then 'approval.approved' else 'approval.rejected' end,
    p_target_type => 'approval_request',
    p_target_id => v_request.id,
    p_after => jsonb_build_object('kind', v_request.kind, 'target_id', v_request.target_id),
    p_reason => nullif(trim(coalesce(p_note, '')), ''),
    p_city_id => v_request.city_id
  );

  return v_request;
end;
$$;

-- ------------------------------------------------------- pause and resume

/*
 * A pause needs no second approver: it is reversible, it stops nothing that
 * is owed, and the merchant can ask for it themselves. A suspension is a
 * sanction, which is why only that one goes through approval.
 */
create or replace function public.rpc_merchant_set_paused(
  p_merchant_id uuid,
  p_paused boolean,
  p_reason text default null
)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
begin
  select * into v_merchant from public.merchant where id = p_merchant_id;
  if v_merchant.id is null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if not authz.can_manage_merchants(v_merchant.city_id) then
    raise exception 'You cannot change that business.' using errcode = 'insufficient_privilege';
  end if;

  if p_paused and v_merchant.status <> 'live' then
    raise exception 'Only a live business can be paused. This one is %.', v_merchant.status
      using errcode = 'check_violation';
  end if;

  -- Coming back from a suspension is an approval decision, not a toggle.
  if not p_paused and v_merchant.status <> 'paused' then
    raise exception 'That business is %, not paused.', v_merchant.status
      using errcode = 'check_violation';
  end if;

  update public.merchant
  -- A CASE yields text, which will not bind to partner_status.
  set status = (case when p_paused then 'paused' else 'live' end)::public.partner_status,
      status_reason = nullif(trim(coalesce(p_reason, '')), ''),
      accepting_orders = case when p_paused then false else accepting_orders end,
      concierge_pick = case when p_paused then false else concierge_pick end
  where id = p_merchant_id
  returning * into v_merchant;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => case when p_paused then 'merchant.paused' else 'merchant.resumed' end,
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_after => jsonb_build_object('status', v_merchant.status),
    p_reason => nullif(trim(coalesce(p_reason, '')), ''),
    p_city_id => v_merchant.city_id
  );

  return v_merchant;
end;
$$;

grant execute on function public.rpc_merchant_request_suspension(uuid, text)
  to authenticated, service_role;
grant execute on function public.rpc_approval_decide(uuid, boolean, text)
  to authenticated, service_role;
grant execute on function public.rpc_merchant_set_paused(uuid, boolean, text)
  to authenticated, service_role;
