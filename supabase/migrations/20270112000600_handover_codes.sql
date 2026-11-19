-- One code per handover: whoever receives shows it, whoever hands over enters it.
--
-- Owner (19 Nov 2026): "this code is not only for users but merchants also
-- need one to verify"; "when the order tracking reaches delivered the
-- customer can click on the activity screen and a code will have appeared
-- to share with the rider".
--
-- 1. Delivery (rider to customer), from 20270112000400. The customer now sees
--    the code only while it can be used: from picked_up, through arriving.
--    Before or after, rpc_my_order_handoff_code returns code null. The rider
--    enters it (rpc_rider_verify_handoff_code, or rpc_rider_order_step
--    'delivered' with p_code). Left with an askari, reception, a lockbox or a
--    caretaker: a photo instead.
-- 2. Pickup (shop to rider). When a rider is assigned, a 4-digit code is made
--    for that rider (a new rider gets a new code). The rider reads it with
--    rpc_my_rider_pickup_code; the shop enters it with
--    rpc_merchant_handover_code_enter, which marks the order picked_up, so the
--    bag goes to the right rider. The rider's own "picked up" tap still works
--    unless dispatch.pickup_code_required is set for the city.
-- 3. Collection (shop to customer), for an order the customer collects
--    (order.fulfilment = 'pickup', from PR #155). From ready, the customer
--    reads it with rpc_my_order_collection_code; the shop enters it with the
--    same rpc_merchant_handover_code_enter, which marks the order delivered,
--    handed to the guest. Written to work whether or not #155's column is
--    there yet: without it, no order is a collection order.
--
-- Every code: the receiver reads it, the one entering it never can (the
-- table has no grants), five wrong tries lock it, and a used code is spent.
--
-- Rollback: drop the functions, triggers and table added here; delete the
-- setting; re-run rpc_my_order_handoff_code from 20270112000400.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('order.shop_handed_to_rider', 'orders', 'info', false, 'A shop handed an order to the rider who showed its code'),
  ('order.shop_handed_to_customer', 'orders', 'notice', false, 'A shop handed a collection order to the customer who showed its code')
on conflict (action) do nothing;

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('dispatch.pickup_code_required', 'dispatch', 'city', 'bool', null,
   'Shop enters the rider''s pickup code',
   'When on, an order is only picked up when the shop enters the code the rider shows. When off, the rider''s own "picked up" tap also works.',
   false, true, 'single:ops_manager', '{dispatch,merchants}', 'false'::jsonb, 211)
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════ the shop's codes

create table if not exists public.order_shop_code (
  order_id uuid not null references public.order (id) on delete cascade,
  kind text not null check (kind in ('pickup', 'collection')),
  rider_id uuid references public.rider (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  attempts integer not null default 0,
  locked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (order_id, kind),
  constraint order_shop_code_pickup_has_rider check (kind <> 'pickup' or rider_id is not null)
);

comment on table public.order_shop_code is
  'The code the rider (pickup) or the customer (collection) shows the shop. Read only through functions: the shop enters it, never reads it.';

alter table public.order_shop_code enable row level security;
revoke all on public.order_shop_code from public, anon, authenticated;

create or replace function public.fn_order_is_collection(p_order public.order)
returns boolean
language sql
stable
set search_path = ''
as $$
  /* order.fulfilment arrives with PR #155; until then nothing is collected. */
  select coalesce(to_jsonb(p_order) ->> 'fulfilment', 'delivery') = 'pickup'
$$;

/* A rider is assigned: their pickup code. A different rider: a new one. */
create or replace function dispatch.tg_job_pickup_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state in ('assigned', 'manual_assigned') and new.assigned_rider_id is not null
     and new.ended_at is null
     and (tg_op = 'INSERT' or old.assigned_rider_id is distinct from new.assigned_rider_id
          or old.state not in ('assigned', 'manual_assigned')) then
    insert into public.order_shop_code (order_id, kind, rider_id, code)
    values (new.order_id, 'pickup', new.assigned_rider_id, public.fn_handoff_code_new())
    on conflict (order_id, kind) do update
      set rider_id = excluded.rider_id, code = excluded.code,
          attempts = 0, locked_at = null, used_at = null, created_at = now()
      where public.order_shop_code.rider_id is distinct from excluded.rider_id
         or public.order_shop_code.used_at is not null;
  end if;
  return null;
end;
$$;
revoke execute on function dispatch.tg_job_pickup_code() from public, anon, authenticated;

drop trigger if exists job_pickup_code on dispatch.job;
create trigger job_pickup_code
  after insert or update of state, assigned_rider_id on dispatch.job
  for each row execute function dispatch.tg_job_pickup_code();

-- Orders already assigned when this runs get their code too.
insert into public.order_shop_code (order_id, kind, rider_id, code)
select j.order_id, 'pickup', j.assigned_rider_id, public.fn_handoff_code_new()
  from dispatch.job j
 where j.state in ('assigned', 'manual_assigned') and j.ended_at is null
   and j.assigned_rider_id is not null
on conflict (order_id, kind) do nothing;

/* When the city asks for it, only the shop's code entry picks an order up. */
create or replace function public.tg_order_pickup_needs_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage = 'picked_up' and old.stage is distinct from 'picked_up'
     and coalesce(settings.fn_bool('dispatch.pickup_code_required', new.city_id), false)
     and not exists (select 1 from public.order_shop_code c
                      where c.order_id = new.id and c.kind = 'pickup' and c.used_at is not null) then
    raise exception 'Show the shop your pickup code; they enter it to hand the order over.'
      using errcode = '22023', hint = 'shop_enters_code';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_order_pickup_needs_code() from public, anon, authenticated;

drop trigger if exists order_pickup_needs_code on public.order;
create trigger order_pickup_needs_code
  before update of stage on public.order
  for each row execute function public.tg_order_pickup_needs_code();

-- ═══════════════════════════════════════════════ who reads which code

/* The rider shows the shop this. Only the rider it was made for. */
create or replace function public.rpc_my_rider_pickup_code(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  o public.order;
  c public.order_shop_code;
begin
  select * into o from public.order where id = p_order_id;
  if o.id is null or o.rider_id is distinct from v_rider then
    raise exception 'This order is not assigned to you.' using errcode = 'P0002';
  end if;
  select * into c from public.order_shop_code
   where order_id = o.id and kind = 'pickup' and rider_id = v_rider;
  if c.order_id is null or c.used_at is not null or c.locked_at is not null
     or o.stage not in ('placed', 'confirmed', 'preparing', 'ready') then
    return jsonb_build_object('ok', true, 'code', null,
      'used', c.used_at is not null, 'locked', c.locked_at is not null);
  end if;
  return jsonb_build_object('ok', true, 'code', c.code, 'codeLength', 4,
    'message', 'Show this to the shop. They enter it to hand you the order.');
end;
$$;
revoke execute on function public.rpc_my_rider_pickup_code(uuid) from public, anon;
grant execute on function public.rpc_my_rider_pickup_code(uuid) to authenticated;

/* The customer shows the shop this, for an order they collect. */
create or replace function public.rpc_my_order_collection_code(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  c public.order_shop_code;
begin
  select ord.* into o
    from public.order ord
    join public.guest g on g.id = ord.guest_id
   where ord.id = p_order_id and g.user_id = (select auth.uid()) and g.anonymised_at is null;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if not public.fn_order_is_collection(o) or o.stage <> 'ready' then
    return jsonb_build_object('ok', true, 'code', null, 'stage', o.stage);
  end if;

  insert into public.order_shop_code (order_id, kind, code)
  values (o.id, 'collection', public.fn_handoff_code_new())
  on conflict (order_id, kind) do nothing;
  select * into c from public.order_shop_code where order_id = o.id and kind = 'collection';
  if c.used_at is not null or c.locked_at is not null then
    return jsonb_build_object('ok', true, 'code', null, 'stage', o.stage,
      'locked', c.locked_at is not null);
  end if;
  return jsonb_build_object('ok', true, 'code', c.code, 'codeLength', 4, 'stage', o.stage,
    'message', 'Show this code at the shop to collect your order.');
end;
$$;
revoke execute on function public.rpc_my_order_collection_code(uuid) from public, anon;
grant execute on function public.rpc_my_order_collection_code(uuid) to authenticated;

/* The delivery code, only while it can be used: picked up or arriving. */
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
  if o.stage not in ('picked_up', 'arriving') then
    return jsonb_build_object('ok', true, 'code', null, 'stage', o.stage);
  end if;

  insert into public.order_handoff_code (order_id, code)
  values (o.id, public.fn_handoff_code_new())
  on conflict (order_id) do nothing;
  update public.order_handoff_code set shown_at = coalesce(shown_at, now())
   where order_id = o.id
  returning * into h;

  if h.verified_at is not null or h.locked_at is not null then
    return jsonb_build_object('ok', true, 'code', null, 'stage', o.stage,
      'verified', h.verified_at is not null, 'locked', h.locked_at is not null);
  end if;
  return jsonb_build_object('ok', true, 'code', h.code, 'codeLength', 4, 'stage', o.stage,
    'message', 'Give this code to your rider when they hand the order to you.');
end;
$$;

-- ═══════════════════════════════════════════════ the shop enters a code

create or replace function public.rpc_merchant_handover_code_enter(p_order_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  c public.order_shop_code;
  v_kind text;
  v_phone text;
  h public.order_handoff_code;
  v_rider_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to your shop first.' using errcode = '42501';
  end if;
  select * into o from public.order where id = p_order_id for update;
  if not found or not authz.is_merchant_member(o.merchant_id) then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  v_kind := case when public.fn_order_is_collection(o) then 'collection' else 'pickup' end;
  select * into c from public.order_shop_code where order_id = o.id and kind = v_kind for update;
  if c.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used', 'kind', v_kind, 'stage', o.stage,
      'message', 'That code was already used.');
  end if;
  if o.stage <> 'ready' then
    raise exception 'Mark the order ready before handing it over (it is %).', o.stage
      using errcode = '22023', hint = 'wrong_stage';
  end if;
  if c.order_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_code', 'kind', v_kind,
      'message', case when v_kind = 'pickup'
        then 'No rider has this order yet.'
        else 'The customer has not opened their collection code yet.' end);
  end if;
  if c.locked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'kind', v_kind,
      'message', 'Too many wrong codes. Call NexG rider ops before handing it over.');
  end if;
  if v_kind = 'pickup' and c.rider_id is distinct from o.rider_id then
    return jsonb_build_object('ok', false, 'reason', 'rider_changed', 'kind', v_kind,
      'message', 'This order moved to another rider. Ask them for their code.');
  end if;
  if c.code <> trim(coalesce(p_code, '')) then
    update public.order_shop_code
       set attempts = attempts + 1, locked_at = case when attempts + 1 >= 5 then now() end
     where order_id = o.id and kind = v_kind
    returning * into c;
    return jsonb_build_object('ok', false, 'kind', v_kind,
      'reason', case when c.locked_at is not null then 'locked' else 'wrong_code' end,
      'attemptsLeft', greatest(0, 5 - c.attempts),
      'message', case when c.locked_at is not null
        then 'Too many wrong codes. Call NexG rider ops before handing it over.'
        else 'That code is not right. Check it with the person in front of you.' end);
  end if;

  update public.order_shop_code set used_at = now(), attempts = attempts + 1
   where order_id = o.id and kind = v_kind;

  if v_kind = 'pickup' then
    select nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '')
      into v_rider_name from public.rider r where r.id = o.rider_id;
    update public.order set stage = 'picked_up', picked_up_at = now() where id = o.id;
    insert into public.order_event (order_id, kind, title, detail, payload, actor_type, actor_id)
    values (o.id, 'picked_up', 'Picked up by your rider',
            'The shop checked ' || coalesce(v_rider_name, 'the rider') || '''s code',
            jsonb_build_object('proof', 'shop_code'), 'merchant_user', (select auth.uid()));

    /* As at the rider's own pickup: the customer gets their delivery code. */
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

    perform audit.log('merchant_user'::public.actor_type, 'orders', 'order.shop_handed_to_rider',
      p_actor_id => (select auth.uid()), p_target_type => 'order', p_target_id => o.id,
      p_target_label => o.reference, p_city_id => o.city_id,
      p_after => jsonb_build_object('rider_id', o.rider_id));
    return jsonb_build_object('ok', true, 'kind', 'pickup', 'order_id', o.id, 'stage', 'picked_up',
      'message', 'Handed to ' || coalesce(v_rider_name, 'the rider') || '.');
  end if;

  update public.order
     set stage = 'delivered', delivered_at = now(), handed_to = 'guest'
   where id = o.id;
  insert into public.order_event (order_id, kind, title, payload, actor_type, actor_id)
  values (o.id, 'collected', 'Collected at the shop', jsonb_build_object('proof', 'customer_code'),
          'merchant_user', (select auth.uid()));
  perform audit.log('merchant_user'::public.actor_type, 'orders', 'order.shop_handed_to_customer',
    p_actor_id => (select auth.uid()), p_target_type => 'order', p_target_id => o.id,
    p_target_label => o.reference, p_city_id => o.city_id);
  return jsonb_build_object('ok', true, 'kind', 'collection', 'order_id', o.id, 'stage', 'delivered',
    'message', 'Collected. The order is done.');
end;
$$;

comment on function public.rpc_merchant_handover_code_enter(uuid, text) is
  'The shop enters the code shown to it: the rider''s pickup code (order picked_up) or the customer''s collection code (order delivered).';
revoke execute on function public.rpc_merchant_handover_code_enter(uuid, text) from public, anon;
grant execute on function public.rpc_merchant_handover_code_enter(uuid, text) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_my_order_collection_code', 'Shows the customer their own collection code, making it the first time; the handover it allows is audited.',
   '20270112000600_handover_codes')
on conflict do nothing;
