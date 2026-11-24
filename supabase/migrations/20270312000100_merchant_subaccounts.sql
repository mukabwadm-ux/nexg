-- Merchants paid by Paystack sub-accounts (payouts, merchants; owner,
-- 24 Nov 2026: "LET MERCHANTS USE SUB ACCOUNTS FOR NOW"; "a manual account is
-- good for those who need immediate"; commission stays NexG's, set per
-- merchant, and merchants see it).
--
-- How it works:
--   * Finance records a merchant's Paystack sub-account (made in the Paystack
--     dashboard) and its payout schedule: auto (Paystack: two working days in
--     Kenya), weekly, monthly, or manual (paid when Finance releases it in
--     Paystack, for merchants who need their money at once). A second Finance
--     person switches it on. One per merchant per Paystack mode.
--   * At checkout, an order from such a merchant is split by Paystack as it is
--     paid: the merchant's sub-account gets the items less NexG's commission
--     (the order's own figures, from the merchant's agreed rate); NexG keeps
--     the rest (commission, delivery, fees, the rider's tip). NexG bears
--     Paystack's fee (bearer: account). The split is fixed on the attempt.
--   * The books: when such an order is paid, what Paystack sends the merchant
--     leaves their payable balance at once, so the payout run never pays it
--     again. Anything not split (bookings, merchants without a sub-account,
--     cash) stays with the payout run as before.
--   * Refunds: Paystack takes a refund out of NexG's balance, even when the
--     merchant was already paid. Finance decides, refund by refund, who carries
--     the merchant's part: take it from their next sales (NexG keeps that much
--     more of their next payments), invoice them, or NexG absorbs it.
--
-- Test mode as everywhere: test keys only at test shops, test payments post
-- nothing to the ledger.
--
-- Changes to existing functions:
--   rpc_payment_paystack_attempt (latest 20270222000200): answers the split
--     for an order from a merchant with an active sub-account in this mode.

-- ═══════════════════════════════════════════════════════ 1. the chart

insert into ledger.account (code, base, name, kind, party_type, party_id, normal_side) values
  ('receivable.merchant', 'receivable.merchant', 'Owed to NexG by a merchant (refund recovery)',
   'asset', 'merchant', null, 'D')
on conflict (code) do nothing;

-- ═══════════════════════════════════════════════ 2. the sub-account

create table public.merchant_paystack_subaccount (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  is_test boolean not null,
  subaccount_code text not null check (subaccount_code ~ '^ACCT_[A-Za-z0-9]{4,60}$'),
  schedule text not null check (schedule in ('auto', 'weekly', 'monthly', 'manual')),
  /* What Paystack says the sub-account pays out to, as Finance looked it up. */
  paystack_details jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'replaced', 'rejected')),
  note text check (note is null or length(note) <= 500),
  requested_by uuid references public.staff_user (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  updated_at timestamptz not null default now()
);
comment on table public.merchant_paystack_subaccount is
  'A merchant''s Paystack sub-account: Paystack pays the merchant its share of each order directly, on this schedule. Switched on by a second Finance person.';

create unique index merchant_paystack_subaccount_one_active
  on public.merchant_paystack_subaccount (merchant_id, is_test) where status in ('active', 'paused');
create unique index merchant_paystack_subaccount_one_pending
  on public.merchant_paystack_subaccount (merchant_id, is_test) where status = 'pending';

alter table public.merchant_paystack_subaccount enable row level security;
revoke all on public.merchant_paystack_subaccount from public, anon, authenticated;

/* The split each try carried: whose sub-account, the merchant's share, and
   how much of it NexG kept back for a refund still to recover. */
alter table public.paystack_attempt
  add column if not exists split_merchant_id uuid references public.merchant (id) on delete set null,
  add column if not exists split_subaccount text,
  add column if not exists split_share_cents bigint check (split_share_cents is null or split_share_cents > 0),
  add column if not exists split_recovery_cents bigint not null default 0 check (split_recovery_cents >= 0);

-- ══════════════════════════════════════════════ 3. refunds to recover

create table public.merchant_recovery (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete restrict,
  order_id uuid references public.order (id) on delete restrict,
  refund_id uuid unique references public.refund (id) on delete restrict,
  is_test boolean not null default false,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('next_sales', 'invoice', 'nexg')),
  recovered_cents bigint not null default 0 check (recovered_cents >= 0),
  state text not null check (state in ('open', 'recovered', 'invoiced', 'settled', 'absorbed', 'cancelled')),
  note text check (note is null or length(note) <= 500),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_not_more_than_owed check (recovered_cents <= amount_cents)
);
comment on table public.merchant_recovery is
  'A merchant''s part of a refund NexG paid on an order Paystack had already paid out: taken from the merchant''s next sales, invoiced, or absorbed by NexG.';
create index merchant_recovery_open on public.merchant_recovery (merchant_id, decided_at)
  where state = 'open' and method = 'next_sales';
alter table public.merchant_recovery enable row level security;
revoke all on public.merchant_recovery from public, anon, authenticated;

/* Which recoveries a paid order paid back, and how much. */
create table public.merchant_recovery_applied (
  attempt_id uuid not null references public.paystack_attempt (id) on delete restrict,
  recovery_id uuid not null references public.merchant_recovery (id) on delete restrict,
  cents bigint not null check (cents > 0),
  primary key (attempt_id, recovery_id)
);
alter table public.merchant_recovery_applied enable row level security;
revoke all on public.merchant_recovery_applied from public, anon, authenticated;

-- ═══════════════════════════════════════════════ 4. reading them

/* The active sub-account for a merchant in a mode, or none. */
create function public.fn_merchant_subaccount(p_merchant_id uuid, p_is_test boolean)
returns public.merchant_paystack_subaccount
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.merchant_paystack_subaccount
   where merchant_id = p_merchant_id and is_test = p_is_test and status = 'active'
$$;
revoke execute on function public.fn_merchant_subaccount(uuid, boolean) from public, anon, authenticated;

/* What a merchant still owes from refunds, to take from next sales (cents),
   less what tries still open have already set aside. */
create function public.fn_merchant_recovery_due(p_merchant_id uuid, p_is_test boolean)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((select sum(r.amount_cents - r.recovered_cents) from public.merchant_recovery r
               where r.merchant_id = p_merchant_id and r.is_test = p_is_test
                 and r.state = 'open' and r.method = 'next_sales'), 0)
    - coalesce((select sum(a.split_recovery_cents) from public.paystack_attempt a
                 where a.split_merchant_id = p_merchant_id and a.is_test = p_is_test
                   and a.outcome is null and a.created_at > now() - interval '1 day'), 0),
    0)::bigint
$$;
revoke execute on function public.fn_merchant_recovery_due(uuid, boolean) from public, anon, authenticated;

-- ══════════════════════════════════ 5. Finance records the sub-account

/*
 * Finance records a merchant's sub-account (looked up in Paystack by the
 * console first, which passes what Paystack says it pays out to). It waits
 * for a second Finance person.
 */
create function public.rpc_merchant_subaccount_request(
  p_merchant_id uuid, p_is_test boolean, p_subaccount_code text, p_schedule text,
  p_paystack_details jsonb, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_id uuid;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Only Finance records a merchant''s Paystack sub-account.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.merchant m where m.id = p_merchant_id and m.deleted_at is null) then
    raise exception 'No such merchant.' using errcode = '22023';
  end if;
  if coalesce(p_subaccount_code, '') !~ '^ACCT_[A-Za-z0-9]{4,60}$' then
    raise exception 'A Paystack sub-account code starts ACCT_.' using errcode = '22023';
  end if;
  if p_schedule is null or p_schedule not in ('auto', 'weekly', 'monthly', 'manual') then
    raise exception 'Choose how often Paystack pays them.' using errcode = '22023';
  end if;
  if p_is_test is null then
    raise exception 'Say whether this is the test or the live sub-account.' using errcode = '22023';
  end if;
  if p_is_test and not coalesce((select m.accepts_test_payments from public.merchant m
                                  where m.id = p_merchant_id), false) then
    raise exception 'Only a test shop has a test sub-account.' using errcode = '22023';
  end if;
  if exists (select 1 from public.merchant_paystack_subaccount s
              where s.merchant_id = p_merchant_id and s.is_test = p_is_test and s.status = 'pending') then
    raise exception 'A sub-account for this merchant is already waiting to be switched on.'
      using errcode = 'check_violation';
  end if;

  insert into public.merchant_paystack_subaccount
    (merchant_id, is_test, subaccount_code, schedule, paystack_details, note, requested_by)
  values (p_merchant_id, p_is_test, p_subaccount_code, p_schedule,
          coalesce(p_paystack_details, '{}'::jsonb) - 'account_number',
          left(nullif(trim(coalesce(p_note, '')), ''), 500), v_me)
  returning id into v_id;

  perform audit.log('staff'::public.actor_type, 'finance', 'merchant.subaccount_requested',
    p_actor_id => v_me, p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('id', v_id, 'code', p_subaccount_code, 'schedule', p_schedule,
      'test', p_is_test));
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending');
end;
$$;
revoke execute on function public.rpc_merchant_subaccount_request(uuid, boolean, text, text, jsonb, text)
  from public, anon;
grant execute on function public.rpc_merchant_subaccount_request(uuid, boolean, text, text, jsonb, text)
  to authenticated;

/* A second Finance person switches it on (or turns it down). Never the one who asked. */
create function public.rpc_merchant_subaccount_decide(
  p_id uuid, p_approve boolean, p_note text default null, p_paystack_details jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  s public.merchant_paystack_subaccount;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Only Finance switches on a merchant''s sub-account.' using errcode = '42501';
  end if;
  select * into s from public.merchant_paystack_subaccount where id = p_id for update;
  if s.id is null or s.status <> 'pending' then
    raise exception 'That sub-account is not waiting for a decision.' using errcode = '22023';
  end if;
  if s.requested_by is null or s.requested_by = v_me then
    raise exception 'A second Finance person decides; not the one who asked.' using errcode = '42501';
  end if;
  if not coalesce(p_approve, false) and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why it is turned down.' using errcode = 'check_violation';
  end if;
  /* Switched on only on the second person's own look-up in Paystack, of the
     same code, in the same mode: never on what the first person typed. */
  if p_approve and (p_paystack_details is null
       or p_paystack_details->>'subaccount_code' is distinct from s.subaccount_code
       or (p_paystack_details->>'test')::boolean is distinct from s.is_test) then
    raise exception 'Look the sub-account up in Paystack again before switching it on.'
      using errcode = '22023';
  end if;

  if p_approve then
    update public.merchant_paystack_subaccount
       set status = 'replaced', updated_at = now()
     where merchant_id = s.merchant_id and is_test = s.is_test and status in ('active', 'paused');
  end if;
  update public.merchant_paystack_subaccount
     set status = case when p_approve then 'active' else 'rejected' end,
         paystack_details = case when p_approve then p_paystack_details - 'account_number'
                                 else paystack_details end,
         decided_by = v_me, decided_at = now(),
         decision_note = left(nullif(trim(coalesce(p_note, '')), ''), 500), updated_at = now()
   where id = s.id;

  perform audit.log('staff'::public.actor_type, 'finance',
    case when p_approve then 'merchant.subaccount_activated' else 'merchant.subaccount_rejected' end,
    p_actor_id => v_me, p_target_type => 'merchant', p_target_id => s.merchant_id,
    p_severity => 'notice',
    p_after => jsonb_build_object('id', s.id, 'code', s.subaccount_code, 'schedule', s.schedule,
      'test', s.is_test, 'requested_by', s.requested_by, 'paystack', p_paystack_details - 'account_number'));
  return jsonb_build_object('ok', true, 'status', case when p_approve then 'active' else 'rejected' end);
end;
$$;
revoke execute on function public.rpc_merchant_subaccount_decide(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.rpc_merchant_subaccount_decide(uuid, boolean, text, jsonb) to authenticated;

/* Finance pauses a merchant's sub-account (new payments are no longer split) or resumes it. */
create function public.rpc_merchant_subaccount_pause(p_id uuid, p_pause boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  s public.merchant_paystack_subaccount;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Only Finance pauses a merchant''s sub-account.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why.' using errcode = 'check_violation';
  end if;
  select * into s from public.merchant_paystack_subaccount where id = p_id for update;
  if s.id is null or s.status <> (case when p_pause then 'active' else 'paused' end) then
    raise exception 'That sub-account is not %.', case when p_pause then 'active' else 'paused' end
      using errcode = '22023';
  end if;
  update public.merchant_paystack_subaccount
     set status = case when p_pause then 'paused' else 'active' end,
         decision_note = left(trim(p_note), 500), updated_at = now()
   where id = s.id;
  perform audit.log('staff'::public.actor_type, 'finance',
    case when p_pause then 'merchant.subaccount_paused' else 'merchant.subaccount_resumed' end,
    p_actor_id => v_me, p_target_type => 'merchant', p_target_id => s.merchant_id,
    p_reason => left(trim(p_note), 300), p_after => jsonb_build_object('id', s.id, 'test', s.is_test));
  return jsonb_build_object('ok', true, 'status', case when p_pause then 'paused' else 'active' end);
end;
$$;
revoke execute on function public.rpc_merchant_subaccount_pause(uuid, boolean, text) from public, anon;
grant execute on function public.rpc_merchant_subaccount_pause(uuid, boolean, text) to authenticated;

-- ═════════════════════════════════════ 6. checkout answers the split

/* As 20270222000200, and an order from a merchant with an active sub-account
   in this mode is split: the merchant's share goes to it, NexG keeps the rest
   (less any refund still to recover from them) and bears Paystack's fee. */
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
  o public.order;
  v_sub public.merchant_paystack_subaccount;
  v_uid uuid := (select auth.uid());
  v_mode text;
  v_test boolean;
  v_wait integer;
  v_n integer;
  v_ref text;
  v_save boolean := false;
  v_share bigint;
  v_recovery bigint := 0;
  v_split jsonb := '{}'::jsonb;
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

  /* The split, for an order whose merchant Paystack pays directly. The share
     is the order's items less its commission, as the ledger owes it; NexG's
     part is everything else, plus any refund still to recover. */
  if p.intent = 'order' and p.order_id is not null then
    select * into o from public.order where id = p.order_id;
    v_sub := public.fn_merchant_subaccount(o.merchant_id, v_test);
    if v_sub.id is not null then
      v_share := coalesce(o.subtotal_cents, 0) - coalesce(o.commission_cents, 0);
      if v_share > 0 and v_share < p.amount_cents then
        perform 1 from public.merchant where id = o.merchant_id for update;
        v_recovery := least(public.fn_merchant_recovery_due(o.merchant_id, v_test), greatest(v_share - 100, 0));
        v_split := jsonb_build_object('split', jsonb_build_object(
          'subaccount', v_sub.subaccount_code,
          'transaction_charge', p.amount_cents - v_share + v_recovery,
          'bearer', 'account'));
      else
        v_share := null;
      end if;
    end if;
  end if;

  insert into public.paystack_attempt
    (payment_id, reference, channel, is_test, phone, created_by, save_card, customer_card_id,
     split_merchant_id, split_subaccount, split_share_cents, split_recovery_cents)
  values (p.id, v_ref, p_channel, v_test,
          case when p_channel in ('mpesa', 'airtel') then p_phone end, v_uid, v_save, c.id,
          case when v_share is not null then o.merchant_id end,
          case when v_share is not null then v_sub.subaccount_code end,
          v_share, case when v_share is not null then v_recovery else 0 end);

  update public.payment
     set provider = 'paystack', is_test = v_test, updated_at = now()
   where id = p.id;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'attempt_reference', v_ref, 'channel', p_channel,
    'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', v_test,
    'save_card', v_save)
    || v_split
    || case when c.id is not null
         then jsonb_build_object('authorization_code', c.authorization_code, 'email', c.email)
         else '{}'::jsonb end;
end;
$$;

-- ═══════════════════════════════ 7. the books: Paystack paid the merchant

/*
 * After the sale is posted (order_posts_to_ledger, which this trigger follows
 * by name), the share Paystack sent the merchant leaves their payable balance,
 * dated as the sale so the payout run sees the two cancel out. Any refund kept
 * back is paid off the merchant's recovery.
 */
create or replace function public.tg_order_split_settled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payment;
  a public.paystack_attempt;
  v_left bigint;
  v_take bigint;
  v_applied bigint;
  v_payload jsonb;
  r record;
begin
  if not (new.payment_status in ('paid', 'collected')
          and (old is null or old.payment_status is distinct from new.payment_status)) then
    return new;
  end if;
  select * into v_pay from public.payment
   where order_id = new.id and state = 'paid' order by paid_at desc nulls last limit 1;
  if v_pay.id is null or v_pay.provider <> 'paystack' then
    return new;
  end if;
  select * into a from public.paystack_attempt
   where payment_id = v_pay.id and outcome = 'paid' and split_subaccount is not null
   order by created_at desc limit 1;
  if a.id is null then
    return new;
  end if;

  /* Paystack's own word on the charge (the signed webhook, or the verify the
     server fetched) must name the same sub-account; otherwise the money all
     came to NexG and the payout run pays the merchant as before. */
  select e.payload into v_payload from public.payment_event e
   where e.provider = 'paystack' and e.reference = v_pay.reference
     and e.payload #>> '{data,reference}' = a.reference
   order by e.id desc limit 1;
  if coalesce(v_payload #>> '{data,subaccount,subaccount_code}', '') is distinct from a.split_subaccount then
    update public.paystack_attempt
       set split_merchant_id = null, split_subaccount = null, split_share_cents = null,
           split_recovery_cents = 0
     where id = a.id;
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'finance',
      p_action => 'payment.split_not_made', p_actor_label => '[System] · Paystack split',
      p_target_type => 'merchant', p_target_id => a.split_merchant_id, p_city_id => new.city_id,
      p_severity => 'high',
      p_reason => 'Paystack took the whole payment, not split to the merchant''s sub-account; the payout run pays them.',
      p_after => jsonb_build_object('attempt', a.reference, 'expected', a.split_subaccount,
        'paystack', v_payload #>> '{data,subaccount,subaccount_code}'));
    return new;
  end if;

  /* What was kept back pays the oldest recoveries first; anything kept beyond
     what is still owed stays the merchant's, for the payout run. */
  v_left := a.split_recovery_cents;
  for r in
    select * from public.merchant_recovery
     where merchant_id = a.split_merchant_id and is_test = a.is_test
       and state = 'open' and method = 'next_sales'
     order by decided_at, id
     for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.amount_cents - r.recovered_cents);
    continue when v_take <= 0;
    insert into public.merchant_recovery_applied (attempt_id, recovery_id, cents)
    values (a.id, r.id, v_take) on conflict do nothing;
    continue when not found;
    update public.merchant_recovery
       set recovered_cents = recovered_cents + v_take,
           state = case when recovered_cents + v_take >= amount_cents then 'recovered' else state end,
           updated_at = now()
     where id = r.id;
    v_left := v_left - v_take;
  end loop;
  v_applied := a.split_recovery_cents - v_left;

  if not a.is_test then
    perform ledger.post(
      p_kind => 'merchant_paid_by_paystack',
      p_idempotency_key => 'split:' || a.id::text,
      p_entries => jsonb_build_array(
        jsonb_build_object('account', 'payable.merchant', 'party_type', 'merchant',
          'party_id', a.split_merchant_id, 'debit', a.split_share_cents - v_left, 'memo', a.reference),
        jsonb_build_object('account', 'cash.card_processor_receivable',
          'credit', a.split_share_cents - a.split_recovery_cents,
          'memo', a.reference || ' to ' || a.split_subaccount),
        jsonb_build_object('account', 'receivable.merchant', 'party_type', 'merchant',
          'party_id', a.split_merchant_id, 'credit', v_applied,
          'memo', a.reference || ' refund recovered')),
      p_effective_at => coalesce(new.delivered_at, new.placed_at, now()),
      p_order_id => new.id,
      p_city_id => new.city_id,
      p_actor_kind => 'system',
      p_actor_label => '[System] · Paystack split',
      p_reason_text => 'Paystack paid the merchant''s share to its sub-account');
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_order_split_settled() from public, anon, authenticated;

drop trigger if exists order_split_settled on public.order;
create trigger order_split_settled
  after insert or update of payment_status on public.order
  for each row execute function public.tg_order_split_settled();

-- ═════════════════════════════════ 8. Finance decides who carries a refund

/*
 * For a refund on an order Paystack paid out to the merchant: who carries the
 * merchant's part. 'next_sales' or 'invoice' make it owed by the merchant
 * (it comes back off NexG's refund cost); 'nexg' records that NexG absorbs it.
 */
create function public.rpc_merchant_recovery_decide(
  p_refund_id uuid, p_method text, p_amount_cents bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  f public.refund;
  o public.order;
  a public.paystack_attempt;
  v_id uuid;
  v_test boolean;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Only Finance decides who carries a refund.' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('next_sales', 'invoice', 'nexg') then
    raise exception 'Choose next sales, invoice or NexG.' using errcode = '22023';
  end if;
  select * into f from public.refund where id = p_refund_id for update;
  if f.id is null or f.status <> 'issued' then
    raise exception 'Decide once the refund has gone back to the customer.' using errcode = '22023';
  end if;
  select * into o from public.order where id = f.order_id for update;
  select at.* into a from public.paystack_attempt at
    join public.payment pm on pm.id = at.payment_id
   where pm.order_id = o.id and at.outcome = 'paid' and at.split_subaccount is not null
   order by at.created_at desc limit 1;
  if a.id is null then
    raise exception 'That order was not paid out by Paystack to the merchant; the payout run carries it as before.'
      using errcode = '22023';
  end if;
  v_test := a.is_test;
  if p_amount_cents is null or p_amount_cents <= 0
     or p_amount_cents > least(f.amount_cents,
          a.split_share_cents - coalesce((select sum(x.amount_cents) from public.merchant_recovery x
                                           where x.order_id = o.id and x.method <> 'nexg'
                                             and x.state <> 'cancelled'), 0)) then
    raise exception 'The merchant''s part is more than nothing and at most what they were paid for the order.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.merchant_recovery where refund_id = f.id) then
    raise exception 'Already decided for that refund.' using errcode = 'check_violation';
  end if;

  insert into public.merchant_recovery
    (merchant_id, order_id, refund_id, is_test, amount_cents, method, state, note, decided_by)
  values (a.split_merchant_id, o.id, f.id, v_test, p_amount_cents, p_method,
          case p_method when 'next_sales' then 'open' when 'invoice' then 'invoiced' else 'absorbed' end,
          left(nullif(trim(coalesce(p_note, '')), ''), 500), v_me)
  returning id into v_id;

  if p_method <> 'nexg' and not v_test then
    perform ledger.post(
      p_kind => 'merchant_refund_recovery',
      p_idempotency_key => 'recovery:' || v_id::text,
      p_entries => jsonb_build_array(
        jsonb_build_object('account', 'receivable.merchant', 'party_type', 'merchant',
          'party_id', a.split_merchant_id, 'debit', p_amount_cents, 'memo', o.reference),
        jsonb_build_object('account', 'revenue.commission', 'credit', p_amount_cents,
          'memo', 'merchant carries this part of the refund')),
      p_order_id => o.id,
      p_city_id => o.city_id,
      p_actor_kind => 'staff',
      p_actor_id => v_me,
      p_reason_text => case p_method when 'invoice' then 'Refund invoiced to the merchant'
                                     else 'Refund taken from the merchant''s next sales' end);
  end if;

  perform audit.log('staff'::public.actor_type, 'finance', 'merchant.refund_recovery_decided',
    p_actor_id => v_me, p_target_type => 'merchant', p_target_id => a.split_merchant_id,
    p_severity => 'notice',
    p_after => jsonb_build_object('recovery_id', v_id, 'refund_id', f.id, 'method', p_method,
      'amount_cents', p_amount_cents, 'test', v_test));
  return jsonb_build_object('ok', true, 'id', v_id, 'method', p_method);
end;
$$;
revoke execute on function public.rpc_merchant_recovery_decide(uuid, text, bigint, text) from public, anon;
grant execute on function public.rpc_merchant_recovery_decide(uuid, text, bigint, text) to authenticated;

/* An invoiced recovery the merchant paid NexG (into the bank). */
create function public.rpc_merchant_recovery_settle(p_id uuid, p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  r public.merchant_recovery;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Only Finance records a merchant''s payment.' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_reference)), 0) < 4 then
    raise exception 'Give the payment''s reference.' using errcode = 'check_violation';
  end if;
  select * into r from public.merchant_recovery where id = p_id for update;
  if r.id is null or r.state <> 'invoiced' then
    raise exception 'That recovery is not invoiced and waiting.' using errcode = '22023';
  end if;
  update public.merchant_recovery
     set state = 'settled', recovered_cents = amount_cents,
         note = left(coalesce(note || ' · ', '') || 'paid ' || trim(p_reference), 500), updated_at = now()
   where id = r.id;
  if not r.is_test then
    perform ledger.post(
      p_kind => 'merchant_refund_recovery_paid',
      p_idempotency_key => 'recovery_paid:' || r.id::text,
      p_entries => jsonb_build_array(
        jsonb_build_object('account', 'cash.bank', 'debit', r.amount_cents, 'memo', left(trim(p_reference), 64)),
        jsonb_build_object('account', 'receivable.merchant', 'party_type', 'merchant',
          'party_id', r.merchant_id, 'credit', r.amount_cents, 'memo', left(trim(p_reference), 64))),
      p_order_id => r.order_id,
      p_actor_kind => 'staff',
      p_actor_id => v_me,
      p_reason_text => 'Merchant paid an invoiced refund');
  end if;
  perform audit.log('staff'::public.actor_type, 'finance', 'merchant.refund_recovery_paid',
    p_actor_id => v_me, p_target_type => 'merchant', p_target_id => r.merchant_id,
    p_after => jsonb_build_object('recovery_id', r.id, 'reference', left(trim(p_reference), 64)));
  return jsonb_build_object('ok', true, 'state', 'settled');
end;
$$;
revoke execute on function public.rpc_merchant_recovery_settle(uuid, text) from public, anon;
grant execute on function public.rpc_merchant_recovery_settle(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════ 9. what people see

/*
 * One merchant's Paystack payouts, for Finance (all of it) and the
 * merchant's own team (their schedule, their orders split, what NexG kept,
 * refunds being recovered; no staff names or notes).
 */
create function public.rpc_merchant_split_overview(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean := authz.finance_reads() or authz.reaches_module('merchants');
  v_member boolean := authz.is_merchant_member(p_merchant_id);
  v_test boolean;
begin
  if not (v_staff or v_member) then
    raise exception 'Not your shop.' using errcode = '42501';
  end if;
  v_test := coalesce((select m.accepts_test_payments from public.merchant m where m.id = p_merchant_id), false);

  return jsonb_build_object(
    'viewer', case when v_staff then 'staff' else 'merchant' end,
    'subaccounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'test', s.is_test, 'code', s.subaccount_code, 'schedule', s.schedule,
        'status', s.status, 'details', s.paystack_details, 'requestedAt', s.requested_at,
        'decidedAt', s.decided_at)
        || case when v_staff then jsonb_build_object(
             'requestedBy', (select u.display_name from public.staff_user u where u.id = s.requested_by),
             'decidedBy', (select u.display_name from public.staff_user u where u.id = s.decided_by),
             'note', s.note, 'decisionNote', s.decision_note,
             'canDecide', s.status = 'pending' and authz.has_full_finance()
                          and s.requested_by is distinct from authz.staff_id()
                          and s.requested_by is not null)
           else '{}'::jsonb end
        order by s.requested_at desc)
      from public.merchant_paystack_subaccount s
      where s.merchant_id = p_merchant_id
        and (v_staff or (s.status in ('active', 'paused') and s.is_test = v_test))), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(x.j order by x.paid_at desc) from (
        select jsonb_build_object(
          'orderId', o.id, 'reference', o.reference, 'paidAt', pm.paid_at,
          'totalCents', pm.amount_cents, 'commissionCents', o.commission_cents,
          'shareCents', a.split_share_cents, 'keptForRefundsCents', a.split_recovery_cents,
          'toMerchantCents', a.split_share_cents - a.split_recovery_cents,
          'test', a.is_test) as j, pm.paid_at
          from public.paystack_attempt a
          join public.payment pm on pm.id = a.payment_id
          join public.order o on o.id = pm.order_id
         where a.split_merchant_id = p_merchant_id and a.outcome = 'paid'
           and (v_staff or a.is_test = v_test)
         order by pm.paid_at desc limit 30) x), '[]'::jsonb),
    'recoveries', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'orderReference', (select o.reference from public.order o where o.id = r.order_id),
        'amountCents', r.amount_cents, 'recoveredCents', r.recovered_cents, 'method', r.method,
        'state', r.state, 'decidedAt', r.decided_at, 'test', r.is_test)
        || case when v_staff then jsonb_build_object('note', r.note) else '{}'::jsonb end
        order by r.decided_at desc)
      from public.merchant_recovery r where r.merchant_id = p_merchant_id), '[]'::jsonb),
    /* Refunds on orders Paystack paid out, still waiting for Finance to say who carries them. */
    'refundsToDecide', case when v_staff then coalesce((select jsonb_agg(jsonb_build_object(
        'refundId', f.id, 'orderReference', o.reference, 'refundCents', f.amount_cents,
        'shareCents', a.split_share_cents, 'status', f.status, 'requestedAt', f.requested_at,
        'test', a.is_test) order by f.requested_at)
      from public.refund f
      join public.order o on o.id = f.order_id
      join public.payment pm on pm.order_id = o.id and pm.state in ('paid', 'reversed')
      join public.paystack_attempt a on a.payment_id = pm.id and a.outcome = 'paid'
                                    and a.split_subaccount is not null
      where a.split_merchant_id = p_merchant_id and f.status = 'issued'
        and not exists (select 1 from public.merchant_recovery r where r.refund_id = f.id)), '[]'::jsonb)
      else '[]'::jsonb end,
    'owedCents', public.fn_merchant_recovery_due(p_merchant_id, v_test),
    'canRecord', authz.has_full_finance());
end;
$$;
revoke execute on function public.rpc_merchant_split_overview(uuid) from public, anon;
grant execute on function public.rpc_merchant_split_overview(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════ 10. the audit

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('merchant.subaccount_requested', 'finance', 'notice', false, true, true, '{}',
   'Finance recorded a merchant''s Paystack sub-account, waiting for a second person'),
  ('merchant.subaccount_activated', 'finance', 'notice', false, true, true, '{}',
   'A second Finance person switched on a merchant''s Paystack sub-account'),
  ('merchant.subaccount_rejected', 'finance', 'info', false, true, true, '{}',
   'Finance turned down a merchant''s Paystack sub-account'),
  ('merchant.subaccount_paused', 'finance', 'notice', true, false, true, '{}',
   'Finance paused a merchant''s Paystack sub-account; new payments are not split'),
  ('merchant.subaccount_resumed', 'finance', 'notice', false, false, true, '{}',
   'Finance resumed a merchant''s Paystack sub-account'),
  ('merchant.refund_recovery_decided', 'finance', 'notice', true, false, true, '{}',
   'Finance decided who carries a merchant''s part of a refund on an order Paystack paid out'),
  ('merchant.refund_recovery_paid', 'finance', 'notice', true, false, true, '{}',
   'A merchant paid NexG an invoiced refund'),
  ('payment.split_not_made', 'finance', 'high', true, false, true, '{}',
   'Paystack took a payment whole instead of splitting it to the merchant''s sub-account')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 11. the Payout rules screen

/* Merchants have no city rules: how each is paid is set on its own page. The
   screen says so; it lists no merchant keys. (payout_rules_v is unchanged.) */
