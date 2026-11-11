-- Riders verify an email, not a phone, and buy the NexG rider kit before
-- going live.
--
-- 1. Email instead of SMS. The phone code needed an SMS provider that is not
--    connected, so on production the code was only ever shown on screen.
--    Riders now confirm an email with a code (the same email-change OTP the
--    host and customer forms use), which turns their anonymous application
--    session into a real login. Submitting requires that confirmed email and
--    copies it onto the rider for staff. The phone number stays, as the
--    M-Pesa payout number.
--
-- 2. The rider kit. One NexG-branded kit bundle, required before a rider
--    goes live. The rider orders it from their dashboard (collect at the
--    onboarding session, or delivered to an address); they pay in person at
--    onboarding and rider ops records the payment; the kit can only be
--    marked issued once it is paid, and activation already requires an
--    issued kit (or a written override). The kit's contents and price are
--    settings (payments.rider_kit_contents / payments.rider_kit_price_kes),
--    unset until the business confirms them.
--
-- Idempotent; safe to re-run.

-- ───────────────────────────────────────────── 1. email instead of phone

alter table public.rider add column if not exists email text
  check (email is null or (length(email) <= 320 and email like '%@%'));

create or replace function public.rpc_rider_submit(p_rider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_missing text;
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
  if v_email is null or v_confirmed is null or v_anonymous then
    raise exception 'Verify your email address first.' using errcode = 'check_violation';
  end if;

  /* The ID counts only with both sides; everything else with one photo. */
  select string_agg(q.label, ', ') into v_missing
  from public.fn_rider_required_docs(r.id) q
  where q.essential
    and not (
      case when q.kind = 'national_id' then
        (select count(distinct d.side) from public.document d
          where d.owner_type = 'rider' and d.owner_id = r.id
            and d.requirement_id = q.id and d.status in ('uploaded', 'verified')
            and d.side is not null) >= 2
      else
        exists (select 1 from public.document d
          where d.owner_type = 'rider' and d.owner_id = r.id
            and d.requirement_id = q.id and d.status in ('uploaded', 'verified'))
      end
    );

  if v_missing is not null then
    raise exception 'We still need: %', v_missing using errcode = 'check_violation';
  end if;

  update public.rider
    set submitted_at = now(), onboarding_step = 6, email = lower(v_email)
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

/* "About you" is complete with a confirmed email login (or, for older
   applications, a verified phone). Otherwise unchanged from
   20260101004900_rider_readiness_and_activation.sql. */
create or replace function public.fn_rider_readiness(p_rider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_about boolean;
  v_ride boolean;
  v_areas boolean;
  v_docs boolean;
  v_payout boolean;
  v_kit boolean;
  v_done integer;
begin
  select * into r from public.rider where id = p_rider_id;
  if r.id is null then
    return null;
  end if;

  if (select auth.uid()) is not null
     and not (r.user_id = (select auth.uid()) or authz.can_manage_riders(r.city_id))
  then
    raise exception 'Not yours to look at.' using errcode = 'insufficient_privilege';
  end if;

  v_about := coalesce(length(trim(r.first_name)), 0) > 0
             and (
               r.phone_verified_at is not null
               or exists (select 1 from auth.users u
                 where u.id = r.user_id and u.email_confirmed_at is not null
                   and not coalesce(u.is_anonymous, false))
             )
             and r.city_id is not null;

  v_ride := r.vehicle is not null
            and (
              r.vehicle = 'bicycle'
              or (r.plate_no is not null and r.ownership is not null and r.insurance is not null)
            );

  /* array_length of an empty array is null, not 0. */
  v_areas := coalesce(array_length(r.areas, 1), 0) >= 1
             and coalesce(array_length(r.shifts, 1), 0) >= 1;

  /*
   * Every required photo, not only the essential ones. A rider waiting on a
   * good conduct certificate sees five of six ticks and an honest 66% —
   * they can still be activated, and the ring is not claiming they are done.
   */
  select coalesce(bool_and(
    case when q.kind = 'national_id' then
      (select count(distinct d.side) from public.document d
        where d.owner_type = 'rider' and d.owner_id = r.id
          and d.requirement_id = q.id and d.status in ('uploaded', 'verified')
          and d.side is not null) >= 2
    else
      exists (select 1 from public.document d
        where d.owner_type = 'rider' and d.owner_id = r.id
          and d.requirement_id = q.id and d.status in ('uploaded', 'verified'))
    end
  ), false)
  into v_docs
  from public.fn_rider_required_docs(r.id) q;

  v_payout := r.payout_msisdn is not null;

  /* The kit in their hands at the hub, not a slot in a calendar. */
  v_kit := r.kit_issued_at is not null;

  v_done := coalesce(v_about, false)::int + coalesce(v_ride, false)::int
          + coalesce(v_areas, false)::int + coalesce(v_docs, false)::int
          + coalesce(v_payout, false)::int + coalesce(v_kit, false)::int;

  return jsonb_build_object(
    'about_you', v_about,
    'your_ride', v_ride,
    'areas_hours', v_areas,
    'documents', v_docs,
    'mpesa_payout', v_payout,
    'kit_onboarding', v_kit,
    'pct', floor(v_done * 100.0 / 6)::int
  );
end;
$$;

-- ─────────────────────────────────────────────── 2. the kit, as settings

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('payments.rider_kit_price_kes', 'payments', 'global', 'int', 'KES',
   'Rider kit price',
   'The NexG branded rider kit every rider buys before going live. Paid in person at the onboarding session. Not set: riders see "price confirmed at onboarding".',
   true, false, 'single:ops_manager', '{riders}', null, 400),
  ('payments.rider_kit_contents', 'payments', 'global', 'text', null,
   'Rider kit contents',
   'What the rider kit includes, as riders see it (for example: delivery bag, jacket, T-shirt). Not set: riders see "NexG branded rider kit".',
   false, false, 'single:ops_manager', '{riders}', null, 401)
on conflict (key) do nothing;

-- ─────────────────────────────────────────────── 3. the kit order

create table if not exists public.rider_kit_order (
  rider_id uuid primary key references public.rider (id) on delete cascade,
  hand_over text not null check (hand_over in ('collect', 'deliver')),
  delivery_address text check (delivery_address is null or length(delivery_address) between 5 and 300),
  /* The price shown when the rider ordered, if one was set. */
  price_kes bigint check (price_kes is null or price_kes >= 0),
  status text not null default 'ordered' check (status in ('ordered', 'paid', 'issued')),
  paid_at timestamptz,
  paid_amount_kes bigint check (paid_amount_kes is null or paid_amount_kes >= 0),
  paid_method text check (paid_method is null or paid_method in ('cash', 'mpesa', 'card', 'waived')),
  paid_reference text check (paid_reference is null or length(paid_reference) <= 80),
  paid_recorded_by uuid references public.staff_user (id) on delete set null,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hand_over <> 'deliver' or delivery_address is not null),
  check (status = 'ordered' or paid_at is not null)
);

alter table public.rider_kit_order enable row level security;

drop policy if exists rider_kit_order_read on public.rider_kit_order;
create policy rider_kit_order_read on public.rider_kit_order
  for select to authenticated using (
    exists (select 1 from public.rider r where r.id = rider_id and r.user_id = (select auth.uid()))
    or authz.works_rider(rider_id)
  );
revoke insert, update, delete on public.rider_kit_order from anon, authenticated;
grant select on public.rider_kit_order to authenticated;

/* What the rider dashboard and the console show. */
create or replace function public.rpc_rider_kit_status(p_rider_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rider public.rider;
  v_order public.rider_kit_order;
begin
  select * into v_rider from public.rider where id = p_rider_id;
  if v_rider.id is null
     or not (v_rider.user_id = (select auth.uid()) or authz.works_rider(p_rider_id)) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_order from public.rider_kit_order where rider_id = p_rider_id;
  return jsonb_build_object(
    'kit', jsonb_build_object(
      'contents', settings.fn_text('payments.rider_kit_contents'),
      'price_kes', settings.fn_int('payments.rider_kit_price_kes')),
    'issued_at', v_rider.kit_issued_at,
    'order', case when v_order.rider_id is null then null else jsonb_build_object(
      'hand_over', v_order.hand_over, 'delivery_address', v_order.delivery_address,
      'price_kes', v_order.price_kes, 'status', v_order.status,
      'paid_at', v_order.paid_at, 'paid_amount_kes', v_order.paid_amount_kes,
      'paid_method', v_order.paid_method, 'paid_reference', v_order.paid_reference,
      'issued_at', v_order.issued_at, 'created_at', v_order.created_at) end
  );
end;
$$;

/* The rider orders the kit, or changes how they get it, until it is issued. */
create or replace function public.rpc_rider_kit_order(
  p_rider_id uuid, p_hand_over text, p_delivery_address text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rider public.rider;
  v_status text;
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
begin
  select * into v_rider from public.rider where id = p_rider_id;
  if v_rider.id is null or v_rider.user_id is distinct from (select auth.uid()) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if p_hand_over not in ('collect', 'deliver') then
    raise exception 'Choose collect at onboarding or delivery.' using errcode = '22023';
  end if;
  if p_hand_over = 'deliver' and (v_address is null or length(v_address) < 5) then
    raise exception 'Enter the address to deliver your kit to.' using errcode = '22023';
  end if;
  if v_address is not null and length(v_address) > 300 then
    raise exception 'Keep the address under 300 characters.' using errcode = '22023';
  end if;
  select status into v_status from public.rider_kit_order where rider_id = p_rider_id;
  if v_status = 'issued' or v_rider.kit_issued_at is not null then
    raise exception 'Your kit has already been handed over.' using errcode = '22023';
  end if;

  insert into public.rider_kit_order (rider_id, hand_over, delivery_address, price_kes)
  values (p_rider_id, p_hand_over,
          case when p_hand_over = 'deliver' then v_address end,
          settings.fn_int('payments.rider_kit_price_kes'))
  on conflict (rider_id) do update set
    hand_over = excluded.hand_over,
    delivery_address = excluded.delivery_address,
    /* Keep the price the rider first saw once they have paid. */
    price_kes = case when public.rider_kit_order.status = 'ordered'
                     then excluded.price_kes else public.rider_kit_order.price_kes end,
    updated_at = now();

  perform audit.log(p_actor_type => 'rider'::public.actor_type, p_module => 'rider',
    p_action => 'rider.kit_ordered', p_target_type => 'rider', p_target_id => p_rider_id,
    p_city_id => v_rider.city_id,
    p_after => jsonb_build_object('hand_over', p_hand_over));

  return public.rpc_rider_kit_status(p_rider_id);
end;
$$;

/* Rider ops records the in-person payment at the onboarding session. */
create or replace function public.rpc_rider_kit_mark_paid(
  p_rider_id uuid, p_method text, p_amount_kes bigint default null, p_reference text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rider public.rider;
  v_staff uuid := authz.staff_id();
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  select * into v_rider from public.rider where id = p_rider_id;
  if v_rider.id is null then
    raise exception 'No rider with id %', p_rider_id using errcode = 'no_data_found';
  end if;
  if v_staff is null or not authz.works_rider(p_rider_id) then
    raise exception 'You need rider operations access for this city.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_method not in ('cash', 'mpesa', 'card', 'waived') then
    raise exception 'Choose how the kit was paid.' using errcode = '22023';
  end if;
  if p_method = 'mpesa' and v_reference is null then
    raise exception 'Enter the M-Pesa reference.' using errcode = '22023';
  end if;
  if p_method <> 'waived' and (p_amount_kes is null or p_amount_kes < 0) then
    raise exception 'Enter the amount paid.' using errcode = '22023';
  end if;
  if v_reference is not null and length(v_reference) > 80 then
    raise exception 'Keep the reference under 80 characters.' using errcode = '22023';
  end if;

  /* A rider who never ordered online collects at onboarding. */
  insert into public.rider_kit_order (rider_id, hand_over, price_kes)
  values (p_rider_id, 'collect', settings.fn_int('payments.rider_kit_price_kes'))
  on conflict (rider_id) do nothing;

  update public.rider_kit_order set
    status = case when status = 'issued' then 'issued' else 'paid' end,
    paid_at = now(),
    paid_amount_kes = case when p_method = 'waived' then 0 else p_amount_kes end,
    paid_method = p_method,
    paid_reference = v_reference,
    paid_recorded_by = v_staff,
    updated_at = now()
  where rider_id = p_rider_id;

  perform audit.log(p_actor_type => 'staff'::public.actor_type, p_module => 'rider',
    p_action => 'rider.kit_paid', p_actor_id => v_staff,
    p_target_type => 'rider', p_target_id => p_rider_id, p_city_id => v_rider.city_id,
    p_after => jsonb_build_object('method', p_method, 'amount_kes', p_amount_kes,
      'reference', v_reference),
    p_severity => 'notice'::public.audit_severity);

  return public.rpc_rider_kit_status(p_rider_id);
end;
$$;

/* A kit is issued only once it is paid (or waived), and the order follows. */
create or replace function public.fn_rider_kit_require_paid(p_rider_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.rider_kit_order o
    where o.rider_id = p_rider_id and o.status in ('paid', 'issued')
  ) then
    raise exception 'Record the rider''s kit payment before issuing the kit.'
      using errcode = 'check_violation';
  end if;
  update public.rider_kit_order
    set status = 'issued', issued_at = coalesce(issued_at, now()), updated_at = now()
  where rider_id = p_rider_id;
end;
$$;

create or replace function public.rpc_rider_issue_kit(p_rider_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_staff uuid := authz.staff_id();
begin
  select * into v_rider from public.rider where id = p_rider_id;
  if v_rider.id is null then
    raise exception 'No rider with id %', p_rider_id using errcode = 'no_data_found';
  end if;

  if v_staff is null or not authz.can_manage_riders(v_rider.city_id) then
    raise exception 'You need rider_ops or super_admin for this city.'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.fn_rider_kit_require_paid(p_rider_id);
  update public.rider set kit_issued_at = coalesce(kit_issued_at, now()) where id = p_rider_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.kit_issued',
    p_actor_id => v_staff,
    p_target_type => 'rider',
    p_target_id => p_rider_id,
    p_city_id => v_rider.city_id
  );

  return (select kit_issued_at from public.rider where id = p_rider_id);
end;
$$;

create or replace function public.rpc_rider_issue_kit(
  p_rider_id uuid,
  p_deposit_kes bigint default null
)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;

  perform public.fn_rider_kit_require_paid(p_rider_id);

  update public.rider set
    kit_issued_at = now(),
    kit_deposit_kes = coalesce(p_deposit_kes, kit_deposit_kes),
    kit_deposit_status = case when p_deposit_kes is not null then 'held' else kit_deposit_status end
  where id = p_rider_id
  returning * into v_rider;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.kit_issued',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_city_id => v_rider.city_id,
    p_after => jsonb_build_object('deposit_kes', p_deposit_kes),
    p_severity => 'notice'::public.audit_severity);

  return v_rider;
end;
$$;

revoke all on function public.fn_rider_kit_require_paid(uuid) from public, anon, authenticated;
revoke all on function public.rpc_rider_kit_status(uuid), public.rpc_rider_kit_order(uuid, text, text),
  public.rpc_rider_kit_mark_paid(uuid, text, bigint, text) from public, anon;
grant execute on function public.rpc_rider_kit_status(uuid), public.rpc_rider_kit_order(uuid, text, text),
  public.rpc_rider_kit_mark_paid(uuid, text, bigint, text) to authenticated;
grant execute on function public.rpc_rider_issue_kit(uuid),
  public.rpc_rider_issue_kit(uuid, bigint) to authenticated;
