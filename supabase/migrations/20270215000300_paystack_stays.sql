-- Paystack, stays (owner, 22 Nov 2026: stays paid in full at booking, through
-- the same company Paystack account; approved in the Paystack chat).
--
-- The native stay checkout (20270123000100) holds the dates; this lets its
-- payment step pay through Paystack. rpc_payment_begin_stay (20270116000400)
-- still opens the one payment for the stay, for the full quoted total, and
-- expires it with the hold; tg_payment_stay_settled still books the stay and
-- splits it (85% host, 15% commission) when Paystack's paid answer lands, or
-- cancels it with a refund due when the nights went to someone else.
--
-- Added here:
--   * Paystack tries for stay payments, at most KES 150,000 by M-Pesa or Airtel;
--   * property.accepts_test_payments: test keys are refused for every other
--     property, and a test stay posts nothing to the ledger, so no host is owed
--     test money;
--   * rpc_stay_payment_state, the customer's view of the stay's payment.
-- Not here: cancellation fees by the host's policy (slice 4b) and refunds
-- through Paystack (slice 6).
--
-- Builds on 20270215000200 (bookings).

alter table public.property
  add column if not exists accepts_test_payments boolean not null default false;

comment on column public.property.accepts_test_payments is
  'A test or review property: its stays may be paid with Paystack test keys. Off for every real property.';

-- ───────────────── a try at Paystack, now for stays too (else as before)

create or replace function public.rpc_payment_paystack_attempt(
  p_payment_reference text,
  p_channel text,
  p_phone text,
  p_proof text,
  p_save_card boolean default false,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  a public.paystack_attempt;
  c public.customer_card;
  v_uid uuid := (select auth.uid());
  v_mode text;
  v_test boolean;
  v_wait integer;
  v_n integer;
  v_ref text;
  v_save boolean := false;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  v_mode := authz.paystack_mode(p_proof);
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  v_test := v_mode = 'test';

  if p_channel is null or p_channel not in ('card', 'mpesa', 'airtel', 'saved_card') then
    raise exception 'Choose card, M-Pesa or Airtel Money.' using errcode = '22023';
  end if;
  if p_channel in ('card', 'saved_card') and p_phone is not null then
    raise exception 'A card payment takes no phone number.' using errcode = '22023';
  end if;
  if p_channel in ('mpesa', 'airtel') and (p_phone is null or p_phone !~ '^\+254[17][0-9]{8}$') then
    raise exception 'Enter a Kenyan mobile number like 0712 345 678.' using errcode = '22023';
  end if;
  if (p_channel = 'saved_card') <> (p_card_id is not null) then
    raise exception 'Choose a saved card to pay with it.' using errcode = '22023';
  end if;

  select * into p from public.payment where reference = p_payment_reference for update;
  if not found or p.state not in ('pending', 'authorised')
     or (p.expires_at is not null and p.expires_at <= now()) then
    raise exception 'No payment waiting on that reference.';
  end if;
  if not (p.created_by is not distinct from v_uid or authz.reaches_module('orders')) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;
  if p.intent not in ('order', 'booking', 'stay') then
    raise exception 'Only orders, bookings and stays are paid through Paystack so far.' using errcode = '22023';
  end if;
  if p.provider not in ('unassigned', 'paystack') then
    raise exception 'This payment was started another way. Check its status first.' using errcode = '22023';
  end if;
  if p.provider = 'paystack' and p.is_test <> v_test then
    raise exception 'This payment was started in the other Paystack mode.' using errcode = '22023';
  end if;
  -- Test keys only for test shops, and for stays only at test properties.
  if v_test and p.intent = 'stay' and not coalesce((
       select pr.accepts_test_payments from public.stay s
         join public.property pr on pr.id = s.property_id
        where s.id = p.stay_id), false) then
    raise exception 'Test payments are taken only by test properties.' using errcode = '22023';
  end if;
  if v_test and p.intent <> 'stay' and not coalesce((select m.accepts_test_payments from public.merchant m
                                where m.id = p.merchant_id), false) then
    raise exception 'Test payments are taken only by test shops.' using errcode = '22023';
  end if;
  -- M-Pesa and Airtel Money take up to KES 150,000 a payment through Paystack.
  if p_channel in ('mpesa', 'airtel') and p.amount_cents > 15000000 then
    raise exception 'M-Pesa takes up to KES 150,000 a payment. Pay this by card.' using errcode = '22023';
  end if;

  if p_channel = 'saved_card' then
    select * into c from public.customer_card
     where id = p_card_id and user_id = v_uid and removed_at is null and is_test = v_test;
    if not found then
      raise exception 'That card is not saved here. Choose another way to pay.' using errcode = '22023';
    end if;
    if c.exp_year * 12 + c.exp_month
       < extract(year from now() at time zone 'Africa/Nairobi')::int * 12
         + extract(month from now() at time zone 'Africa/Nairobi')::int then
      raise exception 'That card has expired. Choose another way to pay.' using errcode = '22023';
    end if;

    -- A saved card charged in the last minute: charge nothing more.
    select * into a from public.paystack_attempt
     where payment_id = p.id and channel = 'saved_card' and outcome is null
       and created_at > now() - interval '1 minute'
     order by created_at desc limit 1;
    if a.id is not null then
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', 'saved_card',
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (a.created_at + interval '1 minute' - now())))::integer));
    end if;
  end if;

  if p_channel = 'card' and coalesce(p_save_card, false) then
    v_save := not coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true);
  end if;

  -- A prompt sent in the last minute, to any number: wait, so a double tap
  -- never sends two prompts.
  if p_channel in ('mpesa', 'airtel') then
    select * into a from public.paystack_attempt
     where payment_id = p.id and outcome is null and channel in ('mpesa', 'airtel')
       and opened_at > now() - interval '3 minutes'
     order by opened_at desc limit 1;
    if a.id is not null and (a.opened_at > now() - interval '1 minute'
                             or (a.channel = p_channel and a.phone = p_phone)) then
      v_wait := greatest(1, ceil(extract(epoch from (a.opened_at + case
                  when a.channel = p_channel and a.phone = p_phone then interval '3 minutes'
                  else interval '1 minute' end - now())))::integer);
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', a.channel,
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'retry_after_seconds', v_wait);
    end if;
  end if;

  if p_channel = 'card' then
    select * into a from public.paystack_attempt
     where payment_id = p.id and outcome is null and channel = 'card'
       and authorization_url is not null and opened_at > now() - interval '30 minutes'
       and save_card = v_save
     order by opened_at desc limit 1;
    if a.id is not null then
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', 'card',
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'authorization_url', a.authorization_url);
    end if;
  end if;

  select count(*) + 1 into v_n from public.paystack_attempt where payment_id = p.id;
  if v_n > 20 then
    raise exception 'Too many tries on this payment. Contact NexG support.' using errcode = '22023';
  end if;
  v_ref := p.reference || '-' || v_n;

  insert into public.paystack_attempt
    (payment_id, reference, channel, is_test, phone, created_by, save_card, customer_card_id)
  values (p.id, v_ref, p_channel, v_test,
          case when p_channel in ('mpesa', 'airtel') then p_phone end, v_uid, v_save, c.id);

  update public.payment
     set provider = 'paystack', is_test = v_test, updated_at = now()
   where id = p.id;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'attempt_reference', v_ref, 'channel', p_channel,
    'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', v_test,
    'save_card', v_save)
    || case when c.id is not null
         then jsonb_build_object('authorization_code', c.authorization_code, 'email', c.email)
         else '{}'::jsonb end;
end;
$$;

-- ───────────────────────────── what the guest's screen shows

/*
 * The stay's latest payment, in the same shape as rpc_order_payment_state:
 * unpaid, pending (a page or prompt in play), failed or paid. The stay itself
 * is booked by tg_payment_stay_settled when the payment is paid.
 */
create function public.rpc_stay_payment_state(p_stay_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  s public.stay;
  p public.payment;
  a public.paystack_attempt;
  v_uid uuid := (select auth.uid());
  v_wait integer;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  select * into s from public.stay where id = p_stay_id;
  if not found or s.guest_user_id is distinct from v_uid then
    raise exception 'That stay is not yours.' using errcode = '42501';
  end if;

  select * into p from public.payment
   where stay_id = s.id and state <> 'abandoned' order by created_at desc limit 1;
  if p.id is null then
    return jsonb_build_object('status', 'unpaid');
  end if;
  if p.state = 'paid' then
    return jsonb_build_object('status', 'paid', 'reference', p.reference, 'channel', p.channel,
      'is_test', p.is_test, 'paid_at', p.paid_at);
  end if;

  select * into a from public.paystack_attempt where payment_id = p.id order by created_at desc limit 1;
  if p.state in ('pending', 'authorised') and (p.expires_at is null or p.expires_at > now()) then
    if a.id is not null and a.outcome is null and a.opened_at is not null
       and a.opened_at > now() - interval '30 minutes' then
      if a.channel not in ('card', 'saved_card') then
        v_wait := greatest(0, ceil(extract(epoch from (a.opened_at + interval '3 minutes' - now())))::integer);
      end if;
      return jsonb_build_object('status', 'pending', 'reference', p.reference,
        'attempt_reference', a.reference, 'channel', a.channel, 'is_test', p.is_test,
        'opened_seconds_ago', floor(extract(epoch from (now() - a.opened_at)))::integer,
        'checked_seconds_ago', case when a.checked_at is not null
          then floor(extract(epoch from (now() - a.checked_at)))::integer end,
        'retry_after_seconds', v_wait,
        'authorization_url', case when a.channel = 'card' then a.authorization_url end);
    end if;
    if a.id is not null and a.outcome = 'failed' then
      return jsonb_build_object('status', 'failed', 'reference', p.reference);
    end if;
    return jsonb_build_object('status', 'unpaid', 'reference', p.reference);
  end if;
  if p.state = 'failed' then
    return jsonb_build_object('status', 'failed', 'reference', p.reference);
  end if;
  return jsonb_build_object('status', 'unpaid');
end;
$$;

revoke execute on function public.rpc_stay_payment_state(uuid) from public, anon;
grant execute on function public.rpc_stay_payment_state(uuid) to authenticated;

-- ─────────────────────── a test stay posts nothing to the ledger

-- As 20270117000100, plus: a stay paid with Paystack test keys posts nothing,
-- so no host is owed test money and no report counts it.
create or replace function public.tg_stay_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
begin
  if new.payment_reference is null then
    return new;
  end if;
  select * into p from public.payment
   where reference = new.payment_reference and intent = 'stay' and stay_id = new.id;
  if p.id is null or p.is_test then
    return new;
  end if;

  begin
    if new.payment_reference is distinct from old.payment_reference then
      perform ledger.fn_post_stay_paid(p.id);
    elsif old.refund_due_at is null and new.refund_due_at is not null then
      perform ledger.fn_post_stay_refund_due(p.id);
    end if;
    if old.refunded_at is null and new.refunded_at is not null then
      perform ledger.fn_post_stay_refunded(p.id);
    end if;
  exception when others then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'finance',
      p_action => 'ledger.posting_failed', p_actor_label => '[System] · ledger',
      p_target_type => 'stay', p_target_id => new.id, p_city_id => p.city_id,
      p_severity => 'high',
      p_reason => 'A stay payment could not be posted to the ledger.',
      p_after => jsonb_build_object('payment_id', p.id, 'reference', p.reference,
                                    'error', sqlerrm, 'sqlstate', sqlstate));
  end;
  return new;
end;
$$;
