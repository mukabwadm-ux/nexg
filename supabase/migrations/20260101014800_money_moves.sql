-- Taking money, and giving it back.
--
-- Everything built so far stops at the edge of this. An order is
-- priced, a refund is approved, a featured slot is quoted — and
-- then nothing moves, because no payment provider is connected.
-- Each of those screens says so plainly rather than claiming
-- otherwise, which was the right answer while it was true.
--
-- This is the rail. It is built whole and inert: with no Paystack
-- keys configured, every path here refuses exactly as it does
-- today and says why. The moment the keys are set, the same paths
-- carry real money with no further code.
--
-- Three things decide the shape:
--
--   * The webhook is the truth, not the browser. A guest who pays
--     and closes the tab has still paid; one who reaches the
--     success page through the back button has not. So the order
--     moves on `charge.success` arriving at our server, and the
--     redirect only ever shows what the database already knows.
--   * Every provider message is kept. Reconciliation at the end of
--     a month is somebody reading what the provider actually said,
--     not what our code concluded from it.
--   * Nothing is idempotent by accident. Paystack retries, and a
--     retry that charged an order twice would be the worst bug
--     this system could have.

create type public.payment_intent as enum ('order', 'featured_slot', 'rider_float');

create type public.payment_state as enum (
  'pending',     -- created, nobody has paid yet
  'authorised',  -- the provider holds it
  'paid',        -- settled
  'failed',
  'abandoned',   -- nobody finished it
  'reversed'
);

create table public.payment (
  id uuid primary key default gen_random_uuid(),

  /*
   * Our reference, not theirs. Generated here so the row exists
   * before the provider is told anything — a provider reference we
   * learned about afterwards would leave a window where money
   * moved against nothing.
   */
  reference text not null unique,

  intent public.payment_intent not null,
  order_id uuid references public.order (id) on delete restrict,
  booking_id uuid references public.featured_booking (id) on delete restrict,
  merchant_id uuid references public.merchant (id) on delete restrict,
  guest_id uuid references public.guest (id) on delete set null,
  city_id uuid references public.city (id) on delete restrict,

  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'KES',

  provider text not null default 'paystack',
  provider_ref text,
  authorization_url text,
  channel text,

  state public.payment_state not null default 'pending',
  failure_reason text,

  /* Who or what asked for this. */
  created_by uuid,
  created_via text not null check (created_via in (
    'guest_checkout', 'merchant_dashboard', 'desk', 'rider_app', 'staff_console')),

  expires_at timestamptz,
  authorised_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_points_at_one_thing check (
    (intent = 'order' and order_id is not null and booking_id is null)
    or (intent = 'featured_slot' and booking_id is not null and order_id is null)
    or (intent = 'rider_float' and order_id is null and booking_id is null)),
  constraint payment_settled_is_referenced check (
    state <> 'paid' or (provider_ref is not null and paid_at is not null))
);

create index payment_order_idx on public.payment (order_id);
create index payment_booking_idx on public.payment (booking_id);
create index payment_state_idx on public.payment (state, created_at desc);
create unique index payment_provider_ref_idx on public.payment (provider, provider_ref)
  where provider_ref is not null;

/*
 * One live attempt per thing being paid for. Two pending payments
 * against one order is how a guest pays twice.
 */
create unique index payment_one_live_per_order on public.payment (order_id)
  where order_id is not null and state in ('pending', 'authorised');
create unique index payment_one_live_per_booking on public.payment (booking_id)
  where booking_id is not null and state in ('pending', 'authorised');

comment on table public.payment is
  'An attempt to move money in. The row exists before the provider is told anything, so there is never a window where money moved against nothing.';

/*
 * Everything the provider ever said, kept verbatim.
 *
 * Reconciliation is somebody reading what the provider actually
 * sent, not what our code concluded from it. It is also how a
 * retry is recognised: the provider's event id is unique here, so
 * the second delivery of the same event does nothing.
 */
create table public.payment_event (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payment (id) on delete cascade,
  provider text not null default 'paystack',
  event text not null,
  /* Paystack has no event id, so this is a digest of the body —
     the same thing for the same delivery, different for a genuine
     second event. */
  dedupe_key text not null,
  reference text,
  payload jsonb not null,
  signature_ok boolean not null,
  handled boolean not null default false,
  handled_note text,
  received_at timestamptz not null default now(),
  unique (provider, dedupe_key)
);

create index payment_event_payment_idx on public.payment_event (payment_id, received_at);

alter table public.payment enable row level security;
alter table public.payment_event enable row level security;

create policy payment_read on public.payment
  for select to authenticated
  using (
    (order_id is not null and exists (
      select 1 from public.order o where o.id = payment.order_id
        and (authz.is_merchant_member(o.merchant_id) or authz.works_merchant(o.merchant_id))))
    or (merchant_id is not null and authz.is_merchant_member(merchant_id))
    or authz.reaches_module('orders')
    or authz.reaches_module('finance')
  );

create policy payment_event_read on public.payment_event
  for select to authenticated
  using (authz.reaches_module('orders') or authz.reaches_module('finance'));

-- ══════════════════════════════ is this rail actually live

/*
 * Whether a provider is connected, answered once.
 *
 * The database holds the intent — that NexG means to take card
 * payments through Paystack — and the application holds the
 * secret. Neither can answer alone, so this returns what it knows
 * and names the variable the deployment still has to set. An
 * integration row claiming "connected" with nothing behind it is
 * the kind of lie that costs an afternoon.
 */
alter table public.integration
  add column if not exists requires_env text[] not null default '{}';

update public.integration set requires_env = array['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'NEXT_PUBLIC_GOOGLE_MAPS_ID']
 where key = 'maps';

insert into public.integration (key, label, provider, status, enabled, requires_env, blocks, notes, sort)
values (
  'payments', 'Card & M-Pesa payments', 'Paystack', 'to_do', false,
  array['PAYSTACK_SECRET_KEY', 'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY'],
  array['guest_checkout', 'refunds', 'featured_billing'],
  'Paystack carries card and M-Pesa in Kenya. Until the keys are set, checkout refuses, a refund is recorded but not moved, and a featured slot is quoted but not billed.',
  35)
on conflict (key) do update set
  requires_env = excluded.requires_env,
  blocks = excluded.blocks,
  notes = excluded.notes;

create or replace function public.fn_capability(p_key text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'key', i.key,
    'label', i.label,
    'provider', i.provider,
    'intended', i.enabled,
    'claims', i.status,
    'requires_env', to_jsonb(i.requires_env),
    'blocks', to_jsonb(i.blocks),
    'notes', i.notes)
  from public.integration i where i.key = p_key
$$;

comment on function public.fn_capability is
  'What NexG means to have connected, and which variables the deployment must set for it. The secret lives in the app, so this half of the answer cannot be the whole one — the app combines them.';

grant execute on function public.fn_capability(text) to authenticated, anon;

-- ═══════════════════════════════════ starting a payment

create or replace function public.fn_payment_reference()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'NXP-' || to_char(now() at time zone 'Africa/Nairobi', 'YYMMDD') || '-'
         || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
$$;

/*
 * Open a payment for an order.
 *
 * Returns the row the caller needs to hand to the provider. It
 * does not talk to Paystack — that needs the secret key, which
 * lives in the application — so the shape is: this makes the
 * record, the route makes the call, and `rpc_payment_authorised`
 * writes back what the provider said.
 */
create or replace function public.rpc_payment_begin_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_existing public.payment;
  v_id uuid;
  v_ref text;
  v_owed bigint;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  if o.payment_method not in ('mpesa_stk', 'card') then
    raise exception 'That order is %, which is not paid online.',
      replace(o.payment_method::text, '_', ' ');
  end if;
  if o.payment_status in ('paid', 'collected') then
    raise exception 'That order is already paid.';
  end if;
  if o.stage in ('cancelled', 'refunded') then
    raise exception 'That order is %.', o.stage;
  end if;

  /* Already open: hand back the same one rather than making a
     second. Two pending payments on one order is how a guest pays
     twice. */
  select * into v_existing from public.payment
   where order_id = p_order_id and state in ('pending', 'authorised')
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true, 'payment_id', v_existing.id, 'reference', v_existing.reference,
      'amount_cents', v_existing.amount_cents, 'currency', v_existing.currency,
      'authorization_url', v_existing.authorization_url, 'reused', true);
  end if;

  v_owed := o.total_cents
    - coalesce((select sum(p.amount_cents) from public.payment p
                 where p.order_id = p_order_id and p.state = 'paid'), 0);
  if v_owed <= 0 then
    raise exception 'Nothing is owed on that order.';
  end if;

  v_ref := public.fn_payment_reference();

  insert into public.payment (
    reference, intent, order_id, merchant_id, guest_id, city_id,
    amount_cents, currency, created_by, created_via, expires_at)
  values (
    v_ref, 'order', p_order_id, o.merchant_id, o.guest_id, o.city_id,
    v_owed, o.currency, (select auth.uid()),
    case when o.channel = 'manual' then 'desk' else 'guest_checkout' end,
    now() + interval '1 hour')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_owed, 'currency', o.currency,
    'order_reference', o.reference, 'reused', false);
end;
$$;

create or replace function public.rpc_payment_begin_featured(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.featured_booking;
  m public.merchant;
  v_id uuid;
  v_ref text;
  v_amount bigint;
begin
  select * into b from public.featured_booking where id = p_booking_id;
  if not found then raise exception 'No such booking.'; end if;
  perform public.fn_merchant_mine(b.merchant_id);
  select * into m from public.merchant where id = b.merchant_id;

  if b.status not in ('quoted', 'booked') then
    raise exception 'That slot is %, so there is nothing to pay yet. We quote it first.', b.status;
  end if;
  if b.quoted_price is null then
    raise exception 'Nobody has put a price on that slot yet.';
  end if;

  if exists (select 1 from public.payment p
              where p.booking_id = p_booking_id and p.state = 'paid') then
    raise exception 'That slot is already paid for.';
  end if;

  /* The quote is per week, in shillings. */
  v_amount := b.quoted_price * coalesce(b.weeks, 1) * 100;
  v_ref := public.fn_payment_reference();

  insert into public.payment (
    reference, intent, booking_id, merchant_id, city_id,
    amount_cents, currency, created_by, created_via, expires_at)
  values (
    v_ref, 'featured_slot', p_booking_id, b.merchant_id, b.city_id,
    v_amount, 'KES', (select auth.uid()), 'merchant_dashboard',
    now() + interval '24 hours')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_amount, 'currency', 'KES',
    'weeks', b.weeks, 'merchant', coalesce(m.trading_name, m.legal_name));
end;
$$;

/* The provider has given us somewhere to send them. */
create or replace function public.rpc_payment_authorised(
  p_reference text, p_provider_ref text, p_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment
     set provider_ref = p_provider_ref,
         authorization_url = p_url,
         state = 'authorised',
         authorised_at = now(),
         updated_at = now()
   where reference = p_reference and state = 'pending';

  if not found then
    raise exception 'No payment waiting on that reference.';
  end if;
  return jsonb_build_object('ok', true, 'authorization_url', p_url);
end;
$$;

-- ═══════════════════════════ the provider tells us what happened

/*
 * The webhook's only way in.
 *
 * Granted to `anon`, because Paystack arrives with no session.
 * That is safe only because of what it cannot do: it moves a
 * payment we created, named by a reference we generated, and only
 * from pending or authorised. It cannot create a payment, change
 * an amount, or touch anything else.
 *
 * The real gate is upstream: the route verifies Paystack's HMAC
 * signature against the secret key before calling this at all, and
 * records whether that check passed. An event with a bad signature
 * is stored and not acted on, because the attempt is worth seeing.
 */
drop function if exists public.rpc_payment_webhook(
  text, text, text, boolean, bigint, text, jsonb, boolean, text);

/*
 * Everything after the reference has a default, because a failed
 * charge carries no channel and a declined one carries no amount
 * — a caller forced to pass nulls for those is a caller who will
 * eventually pass the wrong one.
 */
create or replace function public.rpc_payment_webhook(
  p_event text,
  p_reference text,
  p_dedupe_key text,
  p_signature_ok boolean,
  p_payload jsonb,
  p_paid boolean default false,
  p_provider_ref text default null,
  p_amount_cents bigint default null,
  p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_event uuid;
  v_already boolean := false;
begin
  select * into p from public.payment where reference = p_reference;

  /* Store first, decide second. Even an event we will refuse is
     worth keeping — a run of bad signatures is somebody probing. */
  insert into public.payment_event
    (payment_id, event, dedupe_key, reference, payload, signature_ok)
  values (p.id, p_event, p_dedupe_key, p_reference, p_payload, p_signature_ok)
  on conflict (provider, dedupe_key) do nothing
  returning id into v_event;

  if v_event is null then
    return jsonb_build_object('ok', true, 'duplicate', true,
      'message', 'Already had that one.');
  end if;

  if not p_signature_ok then
    update public.payment_event set handled_note = 'signature did not verify'
     where id = v_event;
    return jsonb_build_object('ok', false, 'reason', 'bad_signature');
  end if;

  if p.id is null then
    update public.payment_event set handled_note = 'no payment with that reference'
     where id = v_event;
    return jsonb_build_object('ok', false, 'reason', 'unknown_reference');
  end if;

  if p.state = 'paid' then
    update public.payment_event set handled = true,
           handled_note = 'already paid; nothing to do'
     where id = v_event;
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  /*
   * The amount is checked, not trusted. A provider event claiming
   * a different figure from the one we asked for is the single
   * most expensive thing to wave through.
   */
  if p_paid and p_amount_cents is not null and p_amount_cents <> p.amount_cents then
    update public.payment set state = 'failed',
           failure_reason = 'the provider settled a different amount from the one we asked for',
           updated_at = now()
     where id = p.id;
    update public.payment_event set handled = true,
           handled_note = 'amount mismatch: asked ' || p.amount_cents
                          || ', settled ' || p_amount_cents
     where id = v_event;

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.amount_mismatch',
      p_actor_label => '[System] · payments',
      p_target_type => 'order', p_target_id => p.order_id,
      p_city_id => p.city_id, p_severity => 'high',
      p_reason => 'Settled amount did not match the amount requested.',
      p_after => jsonb_build_object('asked_cents', p.amount_cents,
                                    'settled_cents', p_amount_cents,
                                    'reference', p_reference));

    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  if p_paid then
    update public.payment
       set state = 'paid', paid_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref),
           channel = coalesce(p_channel, channel), updated_at = now()
     where id = p.id;

    if p.intent = 'order' then
      update public.order
         set payment_status = 'paid'
       where id = p.order_id and payment_status <> 'paid';

      insert into public.order_event
        (order_id, kind, title, detail, actor_type, actor_label, payload)
      values (p.order_id, 'paid', 'Paid',
              coalesce(p_channel, 'online') || ' · ' || p_reference,
              'system', '[System] · payments',
              jsonb_build_object('amount_cents', p.amount_cents, 'reference', p_reference));
    elsif p.intent = 'featured_slot' then
      update public.featured_booking
         set status = 'booked', confirmed_at = now()
       where id = p.booking_id and status in ('quoted', 'booked');

      insert into public.merchant_message
        (merchant_id, direction, channel, subject, body)
      values (p.merchant_id, 'out', 'in_app', 'Featured slot paid',
              'Payment received. Your slot is booked and goes live on its Monday.');
    end if;

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.settled',
      p_actor_label => '[System] · payments',
      p_target_type => case when p.intent = 'order' then 'order' else 'merchant' end,
      p_target_id => coalesce(p.order_id, p.merchant_id),
      p_city_id => p.city_id, p_severity => 'notice',
      p_after => jsonb_build_object('amount_cents', p.amount_cents, 'currency', p.currency,
                                    'reference', p_reference, 'channel', p_channel));
  else
    update public.payment
       set state = 'failed', failure_reason = coalesce(p_payload ->> 'gateway_response', p_event),
           updated_at = now()
     where id = p.id;
  end if;

  update public.payment_event set handled = true where id = v_event;
  return jsonb_build_object('ok', true, 'state', case when p_paid then 'paid' else 'failed' end);
end;
$$;

-- ═════════════════════════════════════ giving it back

/*
 * A refund that has actually moved.
 *
 * `rpc_order_refund` approves one; this records that the provider
 * carried it out. Until a provider is connected nothing calls this
 * and refunds sit at `approved`, which is what the console says.
 */
create or replace function public.rpc_refund_issued(
  p_refund_id uuid, p_provider_ref text, p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  o public.order;
  v_total bigint;
begin
  select * into r from public.refund where id = p_refund_id;
  if not found then raise exception 'No such refund.'; end if;
  if r.status = 'issued' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if r.status <> 'approved' then
    raise exception 'That refund is %, not approved.', r.status;
  end if;

  select * into o from public.order where id = r.order_id;

  update public.refund
     set status = 'issued', provider_ref = p_provider_ref, issued_at = now()
   where id = p_refund_id;

  select coalesce(sum(amount_cents), 0) into v_total
    from public.refund where order_id = r.order_id and status = 'issued';

  /* The casts are not decoration: a CASE yields text, and text
     will not bind to an enum column. */
  update public.order
     set payment_status = (case when v_total >= o.total_cents
                                then 'refunded' else 'partially_refunded' end
                          )::public.order_payment_status,
         stage = (case when v_total >= o.total_cents and o.stage <> 'cancelled'
                       then 'refunded' else o.stage::text end)::public.order_stage
   where id = r.order_id;

  insert into public.order_event
    (order_id, kind, title, detail, actor_type, actor_label, payload)
  values (r.order_id, 'refund_issued', 'Refund sent',
          'KES ' || (r.amount_cents / 100) || ' · ' || r.method
            || coalesce(' · ' || p_provider_ref, ''),
          'system', '[System] · payments',
          jsonb_build_object('refund_id', p_refund_id, 'amount_cents', r.amount_cents));

  perform audit.log(
    p_actor_type => 'system'::public.actor_type, p_module => 'orders',
    p_action => 'order.refund_issued',
    p_actor_label => '[System] · payments',
    p_target_type => 'order', p_target_id => r.order_id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high',
    p_after => jsonb_build_object('amount_cents', r.amount_cents, 'currency', o.currency,
                                  'provider_ref', p_provider_ref, 'refunded_total', v_total));

  return jsonb_build_object('ok', true, 'refunded_total_cents', v_total);
end;
$$;

/* What is approved and waiting on a provider to carry it out. */
create or replace view public.refunds_to_issue_v
with (security_invoker = true) as
select
  r.id as refund_id,
  r.order_id,
  o.reference as order_reference,
  o.city_id,
  r.amount_cents,
  o.currency,
  r.method,
  r.reason_code,
  r.reason_text,
  r.requested_at,
  g.phone as guest_phone,
  (select p.provider_ref from public.payment p
    where p.order_id = r.order_id and p.state = 'paid'
    order by p.paid_at desc limit 1) as original_provider_ref
from public.refund r
join public.order o on o.id = r.order_id
left join public.guest g on g.id = o.guest_id
where r.status = 'approved';

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('payment.settled', 'orders', 'notice', false, false, true, 'A payment was settled by the provider'),
  ('payment.amount_mismatch', 'orders', 'high', true, false, true, 'A provider settled a different amount from the one requested'),
  ('order.refund_issued', 'orders', 'high', false, false, true, 'A refund actually left the account')
on conflict (action) do nothing;

grant select on public.refunds_to_issue_v to authenticated;
grant execute on function public.fn_payment_reference() to authenticated;
grant execute on function public.rpc_payment_begin_order(uuid) to authenticated;
grant execute on function public.rpc_payment_begin_featured(uuid) to authenticated;
grant execute on function public.rpc_payment_authorised(text, text, text) to authenticated, anon;
grant execute on function public.rpc_payment_webhook(text, text, text, boolean, jsonb, boolean, text, bigint, text) to anon, authenticated;
grant execute on function public.rpc_refund_issued(uuid, text, jsonb) to authenticated;
