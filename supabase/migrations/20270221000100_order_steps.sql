-- Order steps: one table of who moves an order, and to where (shared services
-- D5, approved by the owner on 22 Nov 2026).
--
-- The steps themselves were already built, each in its own function:
--   * the shop starts a paid order and marks it ready (rpc_merchant_order_step,
--     20270109000300). Paying confirms the order, so there is no separate
--     accept (owner, 18 Nov 2026);
--   * the rider marks picked up, arriving and delivered, with proof
--     (rpc_rider_order_step, 20270115000400), and records cash collected;
--   * the shop enters a rider's or a customer's hand-over code
--     (rpc_merchant_handover_code_enter, 20270115000600), and sends the codes
--     of a digital order (rpc_merchant_order_send_codes, 20270130000400);
--   * the customer cancels an unpaid order that is still 'placed'
--     (rpc_order_cancel_mine, 20270128000100);
--   * staff confirm a delivery by hand (rpc_order_mark), cancel
--     (dispatch.rpc_cancel, rpc_dispatch_disposal_decide) and refund
--     (rpc_refund_issued);
--   * the system cancels unpaid M-Pesa orders after 30 minutes and the open
--     orders of a deleted account.
-- But each function checked only its own moves. Nothing stopped a new path,
-- or a mistake in an old one, from taking a delivered order back to
-- 'preparing', say. And every app had to work out for itself which buttons to
-- show.
--
-- 1. public.order_step_rule lists every step: who takes it, from which stages,
--    to which stage, and which function does it. Anyone may read it.
-- 2. The trigger order_stage_follows_rules refuses any change of
--    order.stage that no rule allows. The rules hold exactly the moves the
--    code above makes today (surveyed on 22 Nov 2026), so nothing that works
--    now stops working; a new move needs a new rule first. Data repairs by
--    hand can set nexg.order_stage_any = 'on' for their transaction.
-- 3. rpc_order_next_steps(order) answers, for the signed-in caller, which
--    steps they can take now on that order, and what each waits for. The
--    website, the Consumer app, the merchant tools and the Rider app all ask
--    it, so they show the same buttons.
--
-- Not changed: the step functions themselves, their checks and messages.
--
-- Rollback:
--   drop trigger if exists order_stage_follows_rules on public.order;
--   drop function if exists public.tg_order_stage_follows_rules();
--   drop function if exists public.rpc_order_next_steps(uuid);
--   drop function if exists public.fn_order_stage_move_allowed(public.order_stage, public.order_stage);
--   drop table if exists public.order_step_rule;

create table public.order_step_rule (
  actor       text not null,
  step        text not null,
  from_stages public.order_stage[] not null,
  to_stage    public.order_stage,
  fulfilment  text[],
  call        text not null,
  args        jsonb not null default '{}'::jsonb,
  needs       text,
  primary key (actor, step),
  constraint order_step_rule_actor check (actor in ('customer', 'merchant', 'rider', 'staff', 'system'))
);

comment on table public.order_step_rule is
  'Who moves an order, from which stages, to which stage, and through which function (D5). '
  'to_stage null: a step that does not move the order. fulfilment null: every kind of order. '
  'The trigger order_stage_follows_rules refuses any stage change no row allows.';

alter table public.order_step_rule enable row level security;
create policy order_step_rule_read on public.order_step_rule for select to anon, authenticated using (true);
revoke all on public.order_step_rule from public, anon, authenticated;
grant select on public.order_step_rule to anon, authenticated;

insert into public.order_step_rule (actor, step, from_stages, to_stage, fulfilment, call, args, needs) values
  -- the customer
  ('customer', 'cancel', '{placed}', 'cancelled', null,
   'rpc_order_cancel_mine', '{"p_reason": null}',
   'Nothing paid and no M-Pesa prompt open. After that the customer reports a problem and support refunds.'),
  -- the shop
  ('merchant', 'start', '{placed,confirmed}', 'preparing', null,
   'rpc_merchant_order_step', '{"p_step": "start"}',
   'An order paid online is started only once it is paid.'),
  ('merchant', 'ready', '{preparing}', 'ready', null,
   'rpc_merchant_order_step', '{"p_step": "ready"}',
   'Starts the rider search for a delivery.'),
  ('merchant', 'rider_code', '{ready}', 'picked_up', '{delivery}',
   'rpc_merchant_handover_code_enter', '{"p_code": null}',
   'The rider''s pickup code.'),
  ('merchant', 'customer_code', '{ready}', 'delivered', '{pickup}',
   'rpc_merchant_handover_code_enter', '{"p_code": null}',
   'The customer''s collection code.'),
  ('merchant', 'send_codes', '{placed,confirmed,preparing,ready}', 'delivered', '{digital}',
   'rpc_merchant_order_send_codes', '{}',
   'A paid digital order, once every code is sent.'),
  -- the rider
  ('rider', 'at_pickup', '{placed,confirmed,preparing,ready}', null, '{delivery}',
   'rpc_rider_order_step', '{"p_step": "at_pickup"}', 'The assigned rider.'),
  ('rider', 'picked_up', '{ready}', 'picked_up', '{delivery}',
   'rpc_rider_order_step', '{"p_step": "picked_up"}', 'The assigned rider.'),
  ('rider', 'arriving', '{picked_up}', 'arriving', '{delivery}',
   'rpc_rider_order_step', '{"p_step": "arriving"}', 'The assigned rider.'),
  ('rider', 'delivered', '{picked_up,arriving}', 'delivered', '{delivery}',
   'rpc_rider_order_step', '{"p_step": "delivered", "p_handed_to": "guest", "p_code": null, "p_photo_path": null}',
   'Proof: the customer''s code or a photo. Cash on delivery must be collected first.'),
  ('rider', 'cash_collected', '{picked_up,arriving,delivered}', null, '{delivery}',
   'rpc_rider_cash_collected', '{"p_amount_cents": null}', 'Cash on delivery orders only.'),
  -- staff
  ('staff', 'mark_delivered', '{placed,confirmed,preparing,ready,picked_up,arriving,disputed,cancelled,refunded}',
   'delivered', null, 'rpc_order_mark', '{"p_event": "delivered_confirmed", "p_reason": null, "p_detail": {"handed_to": null}}',
   'A reason, and who took it.'),
  ('staff', 'cancel', '{placed,confirmed,preparing,ready,picked_up,arriving,disputed}', 'cancelled', null,
   'dispatch.rpc_cancel', '{"p_reason_code": null, "p_note": null}',
   'Above the approval threshold it is queued for a second person.'),
  ('staff', 'disposal', '{picked_up,arriving}', 'cancelled', '{delivery}',
   'rpc_dispatch_disposal_decide', '{"p_approve": true, "p_note": null}',
   'Approves a rider''s request to dispose of an order.'),
  ('staff', 'refund', '{placed,confirmed,preparing,ready,picked_up,arriving,delivered,disputed}', 'refunded', null,
   'rpc_refund_issued', '{}',
   'Moves the order only once refunds cover its total. Also reached by the M-Pesa payout result.'),
  -- the system
  ('system', 'expire_unpaid', '{placed}', 'cancelled', null,
   'cron_expire_unpaid_mpesa_orders', '{}', 'An unpaid M-Pesa order after 30 minutes.'),
  ('system', 'account_deleted', '{placed}', 'cancelled', null,
   'rpc_my_account_deletion_request', '{}', 'Unpaid orders of an account being deleted.');

-- ── The guard ───────────────────────────────────────────────────────────────

create or replace function public.fn_order_stage_move_allowed(
  p_from public.order_stage, p_to public.order_stage)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_from is not distinct from p_to
      or exists (select 1 from public.order_step_rule r
                  where r.to_stage = p_to and p_from = any (r.from_stages));
$$;

revoke execute on function public.fn_order_stage_move_allowed(public.order_stage, public.order_stage)
  from public, anon, authenticated;

create or replace function public.tg_order_stage_follows_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('nexg.order_stage_any', true), '') = 'on' then
    return new;
  end if;
  if not public.fn_order_stage_move_allowed(old.stage, new.stage) then
    raise exception 'An order cannot go from % to %.', old.stage, new.stage
      using errcode = '22023', hint = 'stage_move_not_allowed';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_order_stage_follows_rules() from public, anon, authenticated;

create trigger order_stage_follows_rules
  before update of stage on public.order
  for each row
  when (old.stage is distinct from new.stage)
  execute function public.tg_order_stage_follows_rules();

-- ── What the caller can do next ─────────────────────────────────────────────
-- Answers {order_id, stage, fulfilment, you: [actors], steps: [...]}, where
-- each step is {actor, step, to_stage, call, args, needs, waiting_for}.
-- waiting_for is null when the step can be taken now, or says what it waits
-- for ('payment', 'rider'). A caller who is none of the order's customer, its
-- shop's team, its assigned rider or live operations for its city gets
-- 'Order not found.', as from the step functions.
create or replace function public.rpc_order_next_steps(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_mine public.order;
  v_you text[] := '{}';
  v_fulfilment text;
  v_paid_online boolean;
  v_paid boolean;
  v_cod boolean;
  v_steps jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into o from public.order where id = p_order_id;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  select * into v_mine from authz.customer_order(p_order_id);
  if v_mine.id is not null then v_you := v_you || 'customer'::text; end if;
  if authz.is_merchant_member(o.merchant_id) then v_you := v_you || 'merchant'::text; end if;
  /* The assigned rider, as dispatch.maps_rider_actor() finds one, without its error for everybody else. */
  if exists (select 1 from public.rider r
              where r.id = o.rider_id and r.user_id = (select auth.uid())
                and r.status = 'active' and r.offboarded_at is null) then
    v_you := v_you || 'rider'::text;
  end if;
  if authz.works_live_ops(o.city_id) then v_you := v_you || 'staff'::text; end if;
  if cardinality(v_you) = 0 then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  /* order.fulfilment arrives with 20270130009000 and 'digital' with
     20270130000400; read through to_jsonb so this runs with or without them. */
  v_fulfilment := coalesce(to_jsonb(o) ->> 'fulfilment', 'delivery');
  v_paid := o.payment_status in ('paid', 'collected');
  v_paid_online := o.payment_method in ('mpesa_stk', 'card', 'bank_transfer');
  v_cod := o.payment_method = 'cash_on_delivery';

  select coalesce(jsonb_agg(jsonb_build_object(
           'actor', r.actor, 'step', r.step, 'to_stage', r.to_stage,
           'call', r.call, 'args', jsonb_build_object('p_order_id', o.id) || r.args,
           'needs', r.needs,
           'waiting_for', case
             when r.actor = 'merchant' and r.step in ('start', 'send_codes')
                  and v_paid_online and not v_paid then 'payment'
             when r.actor = 'merchant' and r.step = 'rider_code' and o.rider_id is null then 'rider'
             end)
           order by array_position(array['customer', 'merchant', 'rider', 'staff'], r.actor), r.step),
         '[]'::jsonb)
    into v_steps
    from public.order_step_rule r
   where r.actor = any (v_you)
     and o.stage = any (r.from_stages)
     and (r.fulfilment is null or v_fulfilment = any (r.fulfilment))
     /* The customer cancels only while nothing is paid. */
     and not (r.actor = 'customer' and r.step = 'cancel'
              and o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded'))
     /* Cash is collected once, on a cash order. */
     and not (r.step = 'cash_collected' and (not v_cod or o.payment_status = 'collected'))
     /* Staff refunds start from Finance's refund screen, not from an order. */
     and r.step <> 'refund';

  return jsonb_build_object(
    'order_id', o.id,
    'stage', o.stage,
    'fulfilment', v_fulfilment,
    'payment_status', o.payment_status,
    'you', to_jsonb(v_you),
    'steps', v_steps);
end;
$$;

revoke execute on function public.rpc_order_next_steps(uuid) from public, anon;
grant execute on function public.rpc_order_next_steps(uuid) to authenticated;
