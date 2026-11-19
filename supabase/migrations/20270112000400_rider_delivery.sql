-- The rider's delivery, end to end: arrive, wait, collect, contact, cash,
-- proof, pay, and an order that cannot be delivered.
--
-- Owner's rules (19 Nov 2026):
--  * Proof: the customer's code when it is handed to them; a photo when it is
--    left with an askari, reception, a lockbox or a caretaker.
--  * An order that cannot be delivered is not brought back. The rider
--    photographs disposing of it; it waits on the rider's screen as pending;
--    live operations approve or reject it.
--
-- 1. order_handoff_code: a four-digit code per order. The customer reads it
--    with rpc_my_order_handoff_code (and gets it by SMS when the order is
--    picked up). Riders never read it; they check it with
--    rpc_rider_verify_handoff_code. Five wrong tries lock it; then, or if the
--    customer was never shown it, a photo is accepted instead.
-- 2. Storage bucket rider-proof, private, paths {rider_id}/{order_id}/{file}.
--    The rider writes their own folder; the rider, the order's customer and
--    staff read it.
-- 3. rpc_rider_order_step gains steps 'at_pickup' and 'waiting', the proof
--    for 'delivered' (p_code, p_photo_path) and p_details (item checks,
--    notes). A delivery that fails a proof or cash rule is answered
--    {ok:false, reason} rather than raised, so a wrong code is still counted.
-- 4. rpc_rider_cash_collected(order, amount): a cash order's money is
--    recorded once in the cash ledger before it can be delivered.
-- 5. Pay: public.fn_rider_trip_pay works a trip out from the city's current
--    rate card (base, distance after 2 km, paid waiting after a grace). A
--    delivered order writes rider_earning; nothing did before. No current
--    rate card, no earning and no estimate: the apps say "not set".
--    Offers now carry the estimate (rpc_my_rider_offers.payEstimate).
-- 6. Disposal: rpc_rider_disposal_request(order, reason, photo); live
--    operations see dispatch_disposal_queue_v and answer with
--    rpc_dispatch_disposal_decide(id, approve, note). Approved: the order is
--    cancelled as 'disposed_undeliverable', the job ends, and the rate card's
--    cancellation-after-pickup pay is written if set. Refunding the customer
--    stays with staff, as for any cancelled order.
-- 7. rpc_rider_contact_attempt(order, who, channel, outcome): a call or
--    message to the shop or customer, on the order's timeline.
-- 8. rpc_my_rider_jobs(): the rider's open jobs in full (pins, phones,
--    items, cash, proof, disposal, pay).
--
-- Rollback: drop the functions, views, tables and bucket added here; drop
-- dispatch.job.at_pickup_at; re-run rpc_rider_order_step(uuid, text, text)
-- from 20270109000300 and rpc_my_rider_offers from 20270112000200.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('order.rider_at_pickup', 'orders', 'info', false, 'A rider arrived at the shop'),
  ('order.rider_waiting', 'orders', 'info', false, 'A rider reported waiting at the shop'),
  ('order.rider_contact', 'orders', 'info', false, 'A rider called or messaged about an order'),
  ('order.rider_cash_collected', 'orders', 'notice', true, 'A rider recorded cash collected'),
  ('order.rider_disposal_requested', 'orders', 'notice', false, 'A rider asked to dispose of an undeliverable order'),
  ('order.disposal_decided', 'orders', 'notice', true, 'Live operations decided on a disposal'),
  ('rider.earning_written', 'riders', 'info', true, 'A trip''s pay was written from the rate card')
on conflict (action) do nothing;

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('dispatch.paid_wait_grace_min', 'dispatch', 'city', 'int', 'min',
   'Free waiting at the shop',
   'Minutes a rider waits at the shop before waiting is paid (from "at the shop" to pickup), per the rate card''s rate per 5 minutes.',
   true, false, 'finance+ops_manager', '{dispatch,riders}', '10'::jsonb, 210)
on conflict (key) do nothing;

alter table dispatch.job add column if not exists at_pickup_at timestamptz;

-- ═══════════════════════════════════════════════ 1. the handoff code

create table if not exists public.order_handoff_code (
  order_id uuid primary key references public.order (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  attempts integer not null default 0,
  locked_at timestamptz,
  shown_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.order_handoff_code is
  'The code the customer gives the rider at the door. Read only through functions: the rider checks it, never reads it.';

alter table public.order_handoff_code enable row level security;
revoke all on public.order_handoff_code from public, anon, authenticated;

create or replace function public.fn_handoff_code_new()
returns text
language sql
volatile
set search_path = ''
as $$
  select lpad(((get_byte(b, 0)::int * 256 + get_byte(b, 1)::int) % 10000)::text, 4, '0')
    from (select extensions.gen_random_bytes(2) as b) x
$$;
revoke execute on function public.fn_handoff_code_new() from public, anon, authenticated;

create or replace function public.tg_order_handoff_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_handoff_code (order_id, code)
  values (new.id, public.fn_handoff_code_new())
  on conflict (order_id) do nothing;
  return null;
end;
$$;
revoke execute on function public.tg_order_handoff_code() from public, anon, authenticated;

drop trigger if exists order_handoff_code on public.order;
create trigger order_handoff_code
  after insert on public.order
  for each row execute function public.tg_order_handoff_code();

/* The customer: whichever session owns the order (account or guest). */
create or replace function public.rpc_my_order_handoff_code(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  h public.order_handoff_code;
begin
  select ord.id, ord.stage into o
    from public.order ord
    join public.guest g on g.id = ord.guest_id
   where ord.id = p_order_id and g.user_id = (select auth.uid()) and g.anonymised_at is null;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if o.stage not in ('placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving') then
    return jsonb_build_object('ok', true, 'code', null, 'reason', 'not_active');
  end if;

  insert into public.order_handoff_code (order_id, code)
  values (o.id, public.fn_handoff_code_new())
  on conflict (order_id) do nothing;

  update public.order_handoff_code set shown_at = coalesce(shown_at, now())
   where order_id = o.id
  returning * into h;

  return jsonb_build_object('ok', true, 'code', h.code,
    'verified', h.verified_at is not null,
    'message', 'Give this code to your rider when they hand the order to you.');
end;
$$;
revoke execute on function public.rpc_my_order_handoff_code(uuid) from public, anon;
grant execute on function public.rpc_my_order_handoff_code(uuid) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_my_order_handoff_code', 'Shows the customer their own code; only notes when it was first shown.',
   '20270112000400_rider_delivery')
on conflict do nothing;

-- ═══════════════════════════════════════════════ 2. photo proof

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rider-proof', 'rider-proof', false, 8 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rider_proof_insert on storage.objects;
create policy rider_proof_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rider-proof'
    and (storage.foldername(name))[1] in (
      select r.id::text from public.rider r
       where r.user_id = (select auth.uid()) and r.status = 'active'));

drop policy if exists rider_proof_read on storage.objects;
create policy rider_proof_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rider-proof'
    and (
      (storage.foldername(name))[1] in (
        select r.id::text from public.rider r where r.user_id = (select auth.uid()))
      or (authz.staff_id() is not null
          and (authz.reaches_module('riders') or authz.works_live_ops()))
      or exists (
        select 1 from public.order o join public.guest g on g.id = o.guest_id
         where o.id::text = (storage.foldername(name))[2]
           and g.user_id = (select auth.uid()))));

/* A proof path: in this rider's folder for this order, and really uploaded. */
create or replace function public.fn_rider_proof_ok(p_path text, p_rider_id uuid, p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_path is not null
     and p_path like p_rider_id::text || '/' || p_order_id::text || '/%'
     and p_path not like '%..%'
     and exists (select 1 from storage.objects s
                  where s.bucket_id = 'rider-proof' and s.name = p_path)
$$;
revoke execute on function public.fn_rider_proof_ok(text, uuid, uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════ 5. pay from the rate card

create or replace function public.fn_rider_trip_pay(
  p_city_id uuid, p_trip_km numeric, p_wait_min numeric default 0, p_cancelled boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.rider_rate_card;
  v_grace integer := coalesce(settings.fn_int('dispatch.paid_wait_grace_min', p_city_id), 10)::int;
  v_base bigint;
  v_distance bigint := 0;
  v_waiting bigint := 0;
begin
  select * into c from public.rider_rate_card
   where city_id = p_city_id and status = 'current' and effective_from <= now()
   order by effective_from desc limit 1;
  if not found then return null; end if;

  if p_cancelled then
    if c.cancellation_after_pickup_kes is null then return null; end if;
    return jsonb_build_object('rateCardId', c.id, 'currency', 'KES',
      'baseKes', c.cancellation_after_pickup_kes, 'distanceKes', 0, 'waitingKes', 0,
      'totalKes', c.cancellation_after_pickup_kes, 'basis', 'cancellation_after_pickup');
  end if;

  if c.base_per_trip_kes is null then return null; end if;
  v_base := c.base_per_trip_kes;
  if c.per_km_after_2km_kes is not null and p_trip_km is not null then
    v_distance := c.per_km_after_2km_kes * greatest(0, ceil(p_trip_km - 2))::bigint;
  end if;
  if c.paid_waiting_per_5min_kes is not null and p_wait_min is not null then
    v_waiting := c.paid_waiting_per_5min_kes * floor(greatest(0, p_wait_min - v_grace) / 5)::bigint;
  end if;

  return jsonb_build_object('rateCardId', c.id, 'currency', 'KES',
    'baseKes', v_base, 'distanceKes', v_distance, 'waitingKes', v_waiting,
    'totalKes', v_base + v_distance + v_waiting, 'basis', 'rate_card');
end;
$$;
revoke execute on function public.fn_rider_trip_pay(uuid, numeric, numeric, boolean) from public, anon;
grant execute on function public.fn_rider_trip_pay(uuid, numeric, numeric, boolean) to authenticated;

create or replace function public.fn_rider_write_earning(
  p_rider_id uuid, p_order_id uuid, p_cancelled boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  j dispatch.job;
  v_pay jsonb;
  v_cash bigint;
begin
  select * into o from public.order where id = p_order_id;
  if exists (select 1 from public.rider_earning e
              where e.rider_id = p_rider_id and e.order_reference = o.reference) then
    return null;
  end if;
  select * into j from dispatch.job where order_id = o.id order by started_at desc limit 1;

  v_pay := public.fn_rider_trip_pay(o.city_id, j.distance_km,
    extract(epoch from (coalesce(o.picked_up_at, now()) - j.at_pickup_at)) / 60.0, p_cancelled);
  if v_pay is null then return null; end if;

  select coalesce(sum(ce.amount_kes), 0) into v_cash from public.cash_event ce
   where ce.rider_id = p_rider_id and ce.order_reference = o.reference and ce.kind = 'collected';

  insert into public.rider_earning (rider_id, order_reference, rate_card_id,
    base_kes, distance_kes, waiting_kes, total_kes, cash_collected_kes)
  values (p_rider_id, o.reference, (v_pay ->> 'rateCardId')::uuid,
    (v_pay ->> 'baseKes')::bigint, (v_pay ->> 'distanceKes')::bigint,
    (v_pay ->> 'waitingKes')::bigint, (v_pay ->> 'totalKes')::bigint, v_cash);

  perform audit.log('system'::public.actor_type, 'riders', 'rider.earning_written',
    p_target_type => 'rider', p_target_id => p_rider_id, p_target_label => o.reference,
    p_city_id => o.city_id, p_after => v_pay);
  return v_pay;
end;
$$;
revoke execute on function public.fn_rider_write_earning(uuid, uuid, boolean) from public, anon, authenticated;

-- ═══════════════════════════════════════════════ 3. the rider's steps

drop function if exists public.rpc_rider_order_step(uuid, text, text);

create or replace function public.rpc_rider_order_step(
  p_order_id uuid,
  p_step text,
  p_handed_to text default 'guest',
  p_code text default null,
  p_photo_path text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  o public.order;
  j dispatch.job;
  h public.order_handoff_code;
  v_to public.order_stage;
  v_handed public.handoff_target;
  v_proof text;
  v_phone text;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
begin
  if jsonb_typeof(v_details) <> 'object' or length(v_details::text) > 4000 then
    raise exception 'Details must be a small object.' using errcode = '22023';
  end if;

  select * into o from public.order where id = p_order_id for update;
  select * into j from dispatch.job jb
   where jb.order_id = o.id and jb.assigned_rider_id = v_rider
     and jb.state in ('assigned', 'manual_assigned') and jb.ended_at is null
   for update;
  if o.id is null or o.rider_id is distinct from v_rider or j.id is null then
    raise exception 'This order is not assigned to you.' using errcode = 'P0002';
  end if;

  -- ── steps that do not move the order

  if p_step = 'at_pickup' then
    if o.stage not in ('placed', 'confirmed', 'preparing', 'ready') then
      raise exception 'This order is % and is past the shop.', o.stage
        using errcode = '22023', hint = 'wrong_stage';
    end if;
    if j.at_pickup_at is not null then
      return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', o.stage, 'already', true,
        'atPickupAt', j.at_pickup_at);
    end if;
    update dispatch.job set at_pickup_at = now() where id = j.id;
    insert into public.order_event (order_id, kind, title, actor_type, actor_id)
    values (o.id, 'rider_at_pickup', 'Your rider is at the shop', 'rider', v_rider);
    perform audit.log(p_actor_type => 'rider'::public.actor_type, p_actor_id => v_rider,
      p_module => 'orders', p_action => 'order.rider_at_pickup',
      p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
      p_city_id => o.city_id);
    return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', o.stage, 'atPickupAt', now());
  end if;

  if p_step = 'waiting' then
    if j.at_pickup_at is null or o.stage not in ('placed', 'confirmed', 'preparing', 'ready') then
      raise exception 'Tell us you are at the shop first.' using errcode = '22023', hint = 'wrong_stage';
    end if;
    if exists (select 1 from public.order_event e where e.order_id = o.id and e.kind = 'rider_waiting'
                and e.at > now() - interval '5 minutes') then
      return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', o.stage, 'already', true);
    end if;
    insert into public.order_event (order_id, kind, title, detail, payload, actor_type, actor_id)
    values (o.id, 'rider_waiting', 'Your rider is waiting at the shop',
      'Waiting ' || greatest(1, floor(extract(epoch from now() - j.at_pickup_at) / 60))::int || ' min',
      jsonb_build_object('minutes', floor(extract(epoch from now() - j.at_pickup_at) / 60)::int,
                         'note', left(v_details ->> 'note', 300)),
      'rider', v_rider);
    perform audit.log(p_actor_type => 'rider'::public.actor_type, p_actor_id => v_rider,
      p_module => 'orders', p_action => 'order.rider_waiting',
      p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
      p_city_id => o.city_id);
    return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', o.stage,
      'waitingMinutes', floor(extract(epoch from now() - j.at_pickup_at) / 60)::int);
  end if;

  -- ── steps that move the order

  v_to := case p_step
    when 'picked_up' then 'picked_up'::public.order_stage
    when 'arriving' then 'arriving'::public.order_stage
    when 'delivered' then 'delivered'::public.order_stage
  end;
  if v_to is null then
    raise exception 'Unknown step: %.', p_step using errcode = '22023';
  end if;
  if o.stage = v_to then
    return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', o.stage, 'already', true);
  end if;
  if (v_to = 'picked_up' and o.stage <> 'ready')
     or (v_to = 'arriving' and o.stage <> 'picked_up')
     or (v_to = 'delivered' and o.stage not in ('picked_up', 'arriving')) then
    raise exception 'This order is % and cannot be marked %.', o.stage, p_step
      using errcode = '22023', hint = 'wrong_stage';
  end if;
  if exists (select 1 from public.order_disposal d where d.order_id = o.id and d.status = 'pending') then
    raise exception 'A disposal request is waiting for live operations.' using errcode = '22023',
      hint = 'disposal_pending';
  end if;

  if v_to = 'picked_up' then
    update public.order set stage = 'picked_up', picked_up_at = now() where id = o.id;
    insert into public.order_event (order_id, kind, title, payload, actor_type, actor_id)
    values (o.id, 'picked_up', 'Picked up by your rider',
            jsonb_build_object('checks', v_details -> 'checks'), 'rider', v_rider);

    /* The customer gets their code now, in case they have no app open. */
    select g.phone into v_phone from public.guest g where g.id = o.guest_id;
    if v_phone is not null then
      insert into public.order_handoff_code (order_id, code)
      values (o.id, public.fn_handoff_code_new())
      on conflict (order_id) do nothing;
      select * into h from public.order_handoff_code where order_id = o.id;
      perform public.fn_notify_enqueue('sms', v_phone, 'order_handoff_code',
        'NexG: your order ' || o.reference || ' is on its way. Give your rider this code: ' || h.code,
        null, jsonb_build_object('order_id', o.id), true, now() + interval '6 hours');
      update public.order_handoff_code set shown_at = coalesce(shown_at, now()) where order_id = o.id;
    end if;

  elsif v_to = 'arriving' then
    update public.order set stage = 'arriving' where id = o.id;
    insert into public.order_event (order_id, kind, title, actor_type, actor_id)
    values (o.id, 'arriving', 'Your rider is nearly there', 'rider', v_rider);

  else
    begin
      v_handed := coalesce(nullif(p_handed_to, ''), 'guest')::public.handoff_target;
    exception when invalid_text_representation then
      raise exception 'Who took it? One of guest, askari, reception, lockbox, caretaker.'
        using errcode = '22023';
    end;

    /* Cash first: the money is on the ledger before the order is done. */
    if o.payment_method = 'cash_on_delivery' and not exists (
         select 1 from public.cash_event ce
          where ce.rider_id = v_rider and ce.order_reference = o.reference and ce.kind = 'collected') then
      return jsonb_build_object('ok', false, 'order_id', o.id, 'stage', o.stage,
        'reason', 'cash_not_recorded', 'message', 'Record the cash you collected first.');
    end if;

    select * into h from public.order_handoff_code where order_id = o.id for update;
    if p_photo_path is not null and not public.fn_rider_proof_ok(p_photo_path, v_rider, o.id) then
      return jsonb_build_object('ok', false, 'order_id', o.id, 'stage', o.stage,
        'reason', 'photo_not_found', 'message', 'Upload the photo again, then finish.');
    end if;

    if v_handed = 'guest' then
      if h.verified_at is not null then
        v_proof := 'code';
      elsif p_code is not null and h.order_id is not null and h.locked_at is null then
        if h.code = trim(p_code) then
          update public.order_handoff_code set verified_at = now(), attempts = attempts + 1
           where order_id = o.id;
          v_proof := 'code';
        else
          update public.order_handoff_code
             set attempts = attempts + 1,
                 locked_at = case when attempts + 1 >= 5 then now() end
           where order_id = o.id
          returning * into h;
          return jsonb_build_object('ok', false, 'order_id', o.id, 'stage', o.stage,
            'reason', case when h.locked_at is not null then 'code_locked' else 'wrong_code' end,
            'attemptsLeft', greatest(0, 5 - h.attempts),
            'message', case when h.locked_at is not null
              then 'Too many wrong codes. Take a photo of the handover instead.'
              else 'That code is not right. Ask the customer to check it.' end);
        end if;
      elsif p_photo_path is not null
            and (h.order_id is null or h.locked_at is not null or h.shown_at is null) then
        /* The customer could not give a code: locked, or never shown one. */
        v_proof := 'photo';
      else
        return jsonb_build_object('ok', false, 'order_id', o.id, 'stage', o.stage,
          'reason', 'code_required', 'codeLength', 4,
          'message', 'Ask the customer for their 4-digit code.');
      end if;
    else
      if p_photo_path is null then
        return jsonb_build_object('ok', false, 'order_id', o.id, 'stage', o.stage,
          'reason', 'photo_required',
          'message', 'Take a photo of where you left it, then finish.');
      end if;
      v_proof := 'photo';
    end if;

    update public.order
       set stage = 'delivered', delivered_at = now(), handed_to = v_handed
     where id = o.id;
    update dispatch.job set state = 'completed', ended_at = now(), end_reason = 'delivered'
     where order_id = o.id and state not in ('cancelled', 'completed');
    insert into public.order_event (order_id, kind, title, detail, payload, actor_type, actor_id, photo_path)
    values (o.id, 'delivered', 'Delivered', 'Handed to ' || v_handed::text,
            jsonb_build_object('proof', v_proof, 'note', left(v_details ->> 'note', 300)),
            'rider', v_rider, case when v_proof = 'photo' then p_photo_path end);

    perform public.fn_rider_write_earning(v_rider, o.id, false);
  end if;

  perform audit.log(p_actor_type => 'rider'::public.actor_type, p_actor_id => v_rider,
    p_module => 'orders', p_action => 'order.rider_' || p_step,
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id,
    p_after => case when v_to = 'delivered'
                    then jsonb_build_object('handed_to', v_handed::text, 'proof', v_proof) end);

  return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', v_to, 'proof', v_proof);
end;
$$;

comment on function public.rpc_rider_order_step(uuid, text, text, text, text, jsonb) is
  'The assigned rider''s steps: at_pickup, waiting, picked_up, arriving, delivered (with who took it, and the code or a photo).';
revoke execute on function public.rpc_rider_order_step(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.rpc_rider_order_step(uuid, text, text, text, text, jsonb) to authenticated;

/* The code alone, before finishing: the app's "check code" button. */
create or replace function public.rpc_rider_verify_handoff_code(p_order_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  h public.order_handoff_code;
begin
  if not exists (select 1 from public.order o
                  where o.id = p_order_id and o.rider_id = v_rider
                    and o.stage in ('picked_up', 'arriving')) then
    raise exception 'This order is not yours to hand over.' using errcode = 'P0002';
  end if;
  select * into h from public.order_handoff_code where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_code',
      'message', 'This order has no code. Take a photo of the handover.');
  end if;
  if h.verified_at is not null then
    return jsonb_build_object('ok', true, 'verified', true, 'already', true);
  end if;
  if h.locked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'code_locked', 'attemptsLeft', 0,
      'message', 'Too many wrong codes. Take a photo of the handover instead.');
  end if;
  if h.code = trim(coalesce(p_code, '')) then
    update public.order_handoff_code set verified_at = now(), attempts = attempts + 1
     where order_id = p_order_id;
    return jsonb_build_object('ok', true, 'verified', true);
  end if;
  update public.order_handoff_code
     set attempts = attempts + 1, locked_at = case when attempts + 1 >= 5 then now() end
   where order_id = p_order_id
  returning * into h;
  return jsonb_build_object('ok', false,
    'reason', case when h.locked_at is not null then 'code_locked' else 'wrong_code' end,
    'attemptsLeft', greatest(0, 5 - h.attempts));
end;
$$;
revoke execute on function public.rpc_rider_verify_handoff_code(uuid, text) from public, anon;
grant execute on function public.rpc_rider_verify_handoff_code(uuid, text) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_rider_verify_handoff_code', 'Checks a code and counts tries; the delivery it allows is audited by rpc_rider_order_step.',
   '20270112000400_rider_delivery')
on conflict do nothing;

-- ═══════════════════════════════════════════════ 4. cash collected

create or replace function public.rpc_rider_cash_collected(p_order_id uuid, p_amount_cents bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  o public.order;
  v_kes bigint;
begin
  select * into o from public.order where id = p_order_id for update;
  if o.id is null or o.rider_id is distinct from v_rider or o.stage not in ('picked_up', 'arriving') then
    raise exception 'This order is not yours to collect for.' using errcode = 'P0002';
  end if;
  if o.payment_method <> 'cash_on_delivery' then
    raise exception 'This order is not paid in cash.' using errcode = '22023', hint = 'not_cash';
  end if;
  if exists (select 1 from public.cash_event ce
              where ce.rider_id = v_rider and ce.order_reference = o.reference and ce.kind = 'collected') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if p_amount_cents is distinct from o.total_cents then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch',
      'expectedCents', o.total_cents, 'currency', o.currency,
      'message', 'The amount must match the order. If the customer paid a different amount, report it.');
  end if;

  v_kes := round(o.total_cents / 100.0)::bigint;
  insert into public.cash_event (rider_id, kind, amount_kes, order_reference, note)
  values (v_rider, 'collected', v_kes, o.reference, 'Collected at the door');

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id)
  values (o.id, 'cash_collected', 'Cash collected', 'KES ' || v_kes, 'rider', v_rider);

  perform audit.log(p_actor_type => 'rider'::public.actor_type, p_actor_id => v_rider,
    p_module => 'orders', p_action => 'order.rider_cash_collected',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_after => jsonb_build_object('amount_kes', v_kes));

  return jsonb_build_object('ok', true, 'amountKes', v_kes);
end;
$$;
revoke execute on function public.rpc_rider_cash_collected(uuid, bigint) from public, anon;
grant execute on function public.rpc_rider_cash_collected(uuid, bigint) to authenticated;

-- ═══════════════════════════════════════════════ 6. an order that cannot be delivered

create table if not exists public.order_disposal (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  rider_id uuid not null references public.rider (id) on delete cascade,
  job_id uuid references dispatch.job (id) on delete set null,
  reason text not null check (length(trim(reason)) between 3 and 500),
  photo_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  constraint order_disposal_decided check (status = 'pending' or decided_at is not null)
);

create unique index if not exists order_disposal_one_pending
  on public.order_disposal (order_id) where status = 'pending';

alter table public.order_disposal enable row level security;
revoke all on public.order_disposal from public, anon, authenticated;
grant select on public.order_disposal to authenticated;

drop policy if exists order_disposal_read on public.order_disposal;
create policy order_disposal_read on public.order_disposal
  for select to authenticated
  using (authz.is_rider_self(rider_id)
         or exists (select 1 from public.order o where o.id = order_id
                     and authz.works_live_ops(o.city_id)));

create or replace function public.rpc_rider_disposal_request(
  p_order_id uuid, p_reason text, p_photo_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  o public.order;
  v_job uuid;
  v_id uuid;
begin
  select * into o from public.order where id = p_order_id for update;
  select jb.id into v_job from dispatch.job jb
   where jb.order_id = o.id and jb.assigned_rider_id = v_rider
     and jb.state in ('assigned', 'manual_assigned') and jb.ended_at is null;
  if o.id is null or o.rider_id is distinct from v_rider or v_job is null then
    raise exception 'This order is not assigned to you.' using errcode = 'P0002';
  end if;
  if o.stage not in ('picked_up', 'arriving') then
    raise exception 'Only an order you have picked up can be disposed of.'
      using errcode = '22023', hint = 'wrong_stage';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Say why it cannot be delivered.' using errcode = 'check_violation';
  end if;
  if not public.fn_rider_proof_ok(p_photo_path, v_rider, o.id) then
    raise exception 'Upload the photo of disposing of it first.' using errcode = '22023',
      hint = 'photo_not_found';
  end if;

  select d.id into v_id from public.order_disposal d where d.order_id = o.id and d.status = 'pending';
  if v_id is not null then
    return jsonb_build_object('ok', true, 'already', true, 'disposalId', v_id, 'status', 'pending');
  end if;

  insert into public.order_disposal (order_id, rider_id, job_id, reason, photo_path)
  values (o.id, v_rider, v_job, trim(p_reason), p_photo_path)
  returning id into v_id;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, photo_path)
  values (o.id, 'disposal_requested', 'Rider could not deliver', trim(p_reason),
          'rider', v_rider, p_photo_path);

  perform audit.log(p_actor_type => 'rider'::public.actor_type, p_actor_id => v_rider,
    p_module => 'orders', p_action => 'order.rider_disposal_requested',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_reason => trim(p_reason));

  return jsonb_build_object('ok', true, 'disposalId', v_id, 'status', 'pending',
    'message', 'Sent to live operations. Keep the area clear until they answer.');
end;
$$;
revoke execute on function public.rpc_rider_disposal_request(uuid, text, text) from public, anon;
grant execute on function public.rpc_rider_disposal_request(uuid, text, text) to authenticated;

/* What live operations answer, in their city. */
create or replace view public.dispatch_disposal_queue_v
with (security_invoker = false) as
  select d.id, d.order_id, o.reference as order_reference, o.city_id,
         d.rider_id,
         nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '') as rider_name,
         d.reason, d.photo_path, d.status, d.requested_at, d.decided_at, d.decision_note,
         o.payment_method::text as payment_method, o.total_cents, o.currency,
         o.dropoff_label
    from public.order_disposal d
    join public.order o on o.id = d.order_id
    join public.rider r on r.id = d.rider_id
   where authz.works_live_ops(o.city_id);

revoke all on public.dispatch_disposal_queue_v from public, anon;
grant select on public.dispatch_disposal_queue_v to authenticated;

create or replace function public.rpc_dispatch_disposal_decide(
  p_disposal_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.order_disposal;
  o public.order;
  v_pay jsonb;
begin
  select * into d from public.order_disposal where id = p_disposal_id for update;
  if not found then raise exception 'No such disposal request.' using errcode = 'P0002'; end if;
  select * into o from public.order where id = d.order_id for update;
  if not authz.works_live_ops(o.city_id) then
    raise exception 'Only live operations in this city can decide.' using errcode = '42501';
  end if;
  if d.status <> 'pending' then
    return jsonb_build_object('ok', true, 'already', true, 'status', d.status);
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Tell the rider what to do instead.' using errcode = 'check_violation';
  end if;

  update public.order_disposal
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = authz.staff_id(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = d.id;

  if p_approve then
    update public.order
       set stage = 'cancelled', cancelled_at = now(),
           cancel_reason_code = 'disposed_undeliverable',
           cancel_note = left(d.reason, 500), cancelled_by = authz.staff_id()
     where id = o.id;
    update dispatch.job set state = 'completed', ended_at = now(), end_reason = 'disposed'
     where order_id = o.id and state not in ('cancelled', 'completed');
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, photo_path)
    values (o.id, 'disposed', 'Could not be delivered', d.reason, 'staff', authz.staff_id(), d.photo_path);
    v_pay := public.fn_rider_write_earning(d.rider_id, o.id, true);
  else
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id)
    values (o.id, 'disposal_rejected', 'Keep trying to deliver', trim(p_note), 'staff', authz.staff_id());
  end if;

  perform audit.log('staff'::public.actor_type, 'orders', 'order.disposal_decided',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_reason => nullif(trim(coalesce(p_note, '')), ''),
    p_after => jsonb_build_object('approved', p_approve, 'pay', v_pay));

  return jsonb_build_object('ok', true,
    'status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;
revoke execute on function public.rpc_dispatch_disposal_decide(uuid, boolean, text) from public, anon;
grant execute on function public.rpc_dispatch_disposal_decide(uuid, boolean, text) to authenticated;

-- ═══════════════════════════════════════════════ 7. calls and messages

create or replace function public.rpc_rider_contact_attempt(
  p_order_id uuid, p_who text, p_channel text, p_outcome text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  o public.order;
begin
  select * into o from public.order where id = p_order_id;
  if o.id is null or o.rider_id is distinct from v_rider
     or o.stage not in ('placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving') then
    raise exception 'This order is not yours.' using errcode = 'P0002';
  end if;
  if p_who not in ('shop', 'customer') or p_channel not in ('call', 'message') then
    raise exception 'Who is shop or customer; channel is call or message.' using errcode = '22023';
  end if;

  insert into public.order_event (order_id, kind, title, detail, payload, actor_type, actor_id)
  values (o.id, 'rider_contact',
          'Rider ' || case when p_channel = 'call' then 'called' else 'messaged' end || ' the ' || p_who,
          left(nullif(trim(coalesce(p_outcome, '')), ''), 300),
          jsonb_build_object('who', p_who, 'channel', p_channel), 'rider', v_rider);

  perform audit.log(p_actor_type => 'rider'::public.actor_type, p_actor_id => v_rider,
    p_module => 'orders', p_action => 'order.rider_contact',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id);

  return jsonb_build_object('ok', true, 'at', now());
end;
$$;
revoke execute on function public.rpc_rider_contact_attempt(uuid, text, text, text) from public, anon;
grant execute on function public.rpc_rider_contact_attempt(uuid, text, text, text) to authenticated;

-- ═══════════════════════════════════════════════ 8. the rider's jobs, in full

create or replace function public.rpc_my_rider_jobs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  v_jobs jsonb;
begin
  select coalesce(jsonb_agg(x.job order by x.assigned_at), '[]'::jsonb) into v_jobs
  from (
    select j.assigned_at, jsonb_build_object(
      'orderId', o.id,
      'jobId', j.id,
      'assignedAt', j.assigned_at,
      'reference', o.reference,
      'stage', o.stage::text,
      'category', m.category::text,
      'atPickupAt', j.at_pickup_at,
      'pickedUpAt', o.picked_up_at,
      'promisedAt', o.promised_delivery_at,
      'tripKm', j.distance_km,
      'needs', to_jsonb(j.vehicle_requirements),
      'pickup', jsonb_build_object(
        'name', coalesce(m.trading_name, m.legal_name), 'branch', b.name,
        'address', b.address_text, 'latitude', b.latitude, 'longitude', b.longitude,
        'phone', m.contact_phone),
      'dropoff', jsonb_build_object(
        'label', o.dropoff_label, 'note', o.dropoff_note,
        'latitude', case when o.dropoff_point is not null
                         then extensions.st_y(o.dropoff_point::extensions.geometry) end,
        'longitude', case when o.dropoff_point is not null
                          then extensions.st_x(o.dropoff_point::extensions.geometry) end,
        'name', g.name, 'phone', g.phone),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name,
                                  'quantity', i.quantity) order by i.created_at)
                           from public.order_item i
                          where i.order_id = o.id and i.removed_at is null), '[]'::jsonb),
      'payment', jsonb_build_object(
        'method', o.payment_method::text, 'status', o.payment_status::text,
        'collectCents', case when o.payment_method = 'cash_on_delivery' then o.total_cents end,
        'currency', o.currency,
        'cashRecorded', exists (select 1 from public.cash_event ce
                                 where ce.rider_id = v_rider and ce.order_reference = o.reference
                                   and ce.kind = 'collected')),
      'proof', jsonb_build_object(
        'guest', case when h.verified_at is not null then 'verified'
                      when h.order_id is null or h.locked_at is not null or h.shown_at is null
                        then 'code_or_photo'
                      else 'code' end,
        'others', 'photo',
        'codeLength', 4,
        'attemptsLeft', case when h.order_id is not null then greatest(0, 5 - h.attempts) end),
      'disposal', (select jsonb_build_object('id', d.id, 'status', d.status,
                          'requestedAt', d.requested_at, 'decisionNote', d.decision_note)
                     from public.order_disposal d where d.order_id = o.id
                    order by d.requested_at desc limit 1),
      'payEstimate', public.fn_rider_trip_pay(o.city_id, j.distance_km,
          extract(epoch from (coalesce(o.picked_up_at, now()) - j.at_pickup_at)) / 60.0, false),
      'contacts', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'title', e.title,
                                     'detail', e.detail, 'channel', e.payload ->> 'channel')
                                     order by e.at)
                              from public.order_event e
                             where e.order_id = o.id and e.kind = 'rider_contact'), '[]'::jsonb)
    ) as job
    from dispatch.job j
    join public.order o on o.id = j.order_id
    left join public.merchant m on m.id = o.merchant_id
    left join public.merchant_branch b on b.id = o.branch_id
    left join public.guest g on g.id = o.guest_id
    left join public.order_handoff_code h on h.order_id = o.id
   where j.assigned_rider_id = v_rider
     and j.state in ('assigned', 'manual_assigned') and j.ended_at is null
   limit 10
  ) x;

  return jsonb_build_object('contractVersion', '1', 'riderId', v_rider, 'jobs', v_jobs);
end;
$$;

comment on function public.rpc_my_rider_jobs() is
  'The signed-in rider''s open jobs in full: pins, phones, items, cash, proof rule, disposal, pay estimate.';
revoke execute on function public.rpc_my_rider_jobs() from public, anon;
grant execute on function public.rpc_my_rider_jobs() to authenticated;

-- ═══════════════════════════════════════════════ offers carry the pay estimate

create or replace function public.rpc_my_rider_offers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  v_offers jsonb;
begin
  select coalesce(jsonb_agg(x.offer order by x.offered_at desc), '[]'::jsonb)
    into v_offers
    from (
      select ofr.offered_at, jsonb_build_object(
        'offerId', ofr.id,
        'jobId', j.id,
        'orderId', o.id,
        'orderReference', o.reference,
        'round', ofr.round,
        'offeredAt', ofr.offered_at,
        'expiresAt', ofr.expires_at,
        'direct', ofr.direct,
        'toPickupKm', ofr.distance_km,
        'toPickupMinutes', ofr.eta_min,
        'tripKm', j.distance_km,
        'needs', to_jsonb(j.vehicle_requirements),
        'category', m.category::text,
        'pickup', jsonb_build_object(
          'name', j.pickup_label,
          'address', b.address_text,
          'latitude', case when j.pickup_point is not null
                           then extensions.st_y(j.pickup_point::extensions.geometry) end,
          'longitude', case when j.pickup_point is not null
                            then extensions.st_x(j.pickup_point::extensions.geometry) end),
        'dropoff', jsonb_build_object('label', j.dropoff_label),
        'itemCount', (select coalesce(sum(i.quantity), 0)::int from public.order_item i
                       where i.order_id = o.id and i.removed_at is null),
        'payment', jsonb_build_object(
          'method', o.payment_method::text,
          'status', o.payment_status::text,
          'collectCents', case when o.payment_method = 'cash_on_delivery' then o.total_cents end,
          'currency', o.currency),
        'payEstimate', public.fn_rider_trip_pay(o.city_id, j.distance_km, 0, false)
      ) as offer
      from dispatch.offer ofr
      join dispatch.job j on j.id = ofr.job_id
      join public.order o on o.id = j.order_id
      left join public.merchant m on m.id = o.merchant_id
      left join public.merchant_branch b on b.id = o.branch_id
     where ofr.rider_id = v_rider
       and ofr.outcome = 'pending'
       and ofr.expires_at > now()
       and j.state = 'offering'
     order by ofr.offered_at desc
     limit 20
    ) x;

  return jsonb_build_object('contractVersion', '1', 'riderId', v_rider, 'offers', v_offers);
end;
$$;
