-- Receipts, for customers, merchants, riders and hosts.
--
-- A receipt is proof that money moved, issued the moment it moves. It is not
-- a KRA tax invoice (those stay in tax_invoice, for finance). Each one has a
-- number from a gapless yearly series per prefix (RCT-26-00001 for money in
-- or out, RFD-26-00001 for refunds), the party it belongs to, the lines that
-- make up the total, and how it was paid.
--
-- Issued automatically, once per source (a retry never issues a second):
--   customer  an order or stay payment settling; an order refund issued;
--             a stay refund recorded
--   merchant  a featured-slot payment settling; a weekly statement paid out
--   rider     a weekly payout paid; a cash deposit matched to them
--   host      a NexG booking confirmed (their earnings, after the 15%
--             commission); a NexG invoice paid
-- Each new receipt also queues an email through the existing outbox
-- (fn_notify_enqueue) with a link to view and print it. Receipts issued for
-- money that moved before this migration are created without emails.
-- Nothing here ever raises into the money movement that triggered it.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('receipt.issued', 'finance', 'info', true, 'Receipt issued')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════ the receipts

create table if not exists public.receipt (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  kind text not null check (kind in ('payment', 'payout', 'refund', 'deposit', 'earnings')),
  party_type text not null check (party_type in ('guest', 'merchant', 'rider', 'host')),
  /* guest: their auth user id; merchant, rider, host: that row's id. */
  party_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  title text not null,
  /* [{label, amount_cents}]; deductions are negative. */
  lines jsonb not null default '[]'::jsonb,
  total_cents bigint not null check (total_cents >= 0),
  currency text not null default 'KES',
  method text,
  method_ref text,
  issued_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (source_type, source_id, party_type)
);

create index if not exists receipt_by_party on public.receipt (party_type, party_id, issued_at desc);

comment on table public.receipt is
  'Proof that money moved, one per settled payment, payout, deposit or refund. Not a tax invoice.';

alter table public.receipt enable row level security;
revoke all on public.receipt from anon, authenticated;
grant select on public.receipt to authenticated;

drop policy if exists receipt_party_read on public.receipt;
create policy receipt_party_read on public.receipt
  for select to authenticated
  using (
    (party_type = 'guest' and party_id = (select auth.uid()))
    or (party_type = 'merchant' and authz.is_merchant_member(party_id))
    or (party_type = 'rider' and authz.is_rider_self(party_id))
    or (party_type = 'host' and authz.is_host_member(party_id))
    or authz.reaches_module('finance')
  );

/* Gapless numbering: one counter row per prefix and year, taken under a lock. */
create table if not exists public.receipt_counter (
  prefix text not null,
  year integer not null,
  last_value integer not null default 0,
  primary key (prefix, year)
);
alter table public.receipt_counter enable row level security;
revoke all on public.receipt_counter from anon, authenticated;

create or replace function public.fn_receipt_next_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from now() at time zone 'Africa/Nairobi')::integer;
  v_next integer;
begin
  insert into public.receipt_counter (prefix, year, last_value) values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last_value = public.receipt_counter.last_value + 1
  returning last_value into v_next;
  return p_prefix || '-' || lpad((v_year % 100)::text, 2, '0') || '-' || lpad(v_next::text, 5, '0');
end;
$$;

/* Who a receipt is emailed to. */
create or replace function public.fn_receipt_email(p_party_type text, p_party_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_party_type
    when 'guest' then (select u.email::text from auth.users u where u.id = p_party_id)
    when 'merchant' then (select m.contact_email from public.merchant m where m.id = p_party_id)
    when 'rider' then (select u.email::text from public.rider r join auth.users u on u.id = r.user_id
                        where r.id = p_party_id)
    when 'host' then (select h.email from public.host h where h.id = p_party_id)
  end;
$$;

/*
 * Issue a receipt once per source and party. Returns the receipt, or null when
 * one already exists. With p_email, the new receipt is also emailed.
 */
create or replace function public.fn_receipt_issue(
  p_party_type text,
  p_party_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_kind text,
  p_title text,
  p_lines jsonb,
  p_total_cents bigint,
  p_method text default null,
  p_method_ref text default null,
  p_issued_at timestamptz default now(),
  p_email boolean default true
)
returns public.receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipt;
  v_email text;
  v_total text;
begin
  if p_party_id is null or p_total_cents is null or p_total_cents < 0 then
    return null;
  end if;
  if exists (select 1 from public.receipt
              where source_type = p_source_type and source_id = p_source_id and party_type = p_party_type) then
    return null;
  end if;

  insert into public.receipt (
    number, kind, party_type, party_id, source_type, source_id, title, lines,
    total_cents, method, method_ref, issued_at)
  values (
    public.fn_receipt_next_number(case when p_kind = 'refund' then 'RFD' else 'RCT' end),
    p_kind, p_party_type, p_party_id, p_source_type, p_source_id, p_title,
    coalesce(p_lines, '[]'::jsonb), p_total_cents, p_method, p_method_ref,
    coalesce(p_issued_at, now()))
  returning * into v_receipt;

  perform audit.log('system'::public.actor_type, 'finance', 'receipt.issued',
    p_target_type => 'receipt', p_target_id => v_receipt.id,
    p_after => jsonb_build_object('number', v_receipt.number, 'party', p_party_type,
                                  'source', p_source_type, 'total_cents', p_total_cents));

  if p_email then
    v_email := public.fn_receipt_email(p_party_type, p_party_id);
    v_total := 'KES ' || to_char(p_total_cents / 100.0, 'FM999,999,999,990.00');
    if v_email is not null then
      perform public.fn_notify_enqueue(
        'email', v_email, 'receipt',
        'Your NexG receipt ' || v_receipt.number || E'\n\n'
          || p_title || E'\n' || v_total
          || coalesce(E'\nPaid by ' || p_method, '')
          || coalesce(' · ' || p_method_ref, '') || E'\n\n'
          || 'View or print it: https://www.nexgapp.com/receipts/' || v_receipt.number || E'\n\n'
          || '— NexG Concierge',
        'Receipt ' || v_receipt.number || ' · ' || v_total,
        jsonb_build_object('receipt', v_receipt.number));
      update public.receipt set emailed_at = now() where id = v_receipt.id;
    end if;
  end if;

  return v_receipt;
end;
$$;

revoke execute on function public.fn_receipt_next_number(text), public.fn_receipt_email(text, uuid),
  public.fn_receipt_issue(text, uuid, text, uuid, text, text, jsonb, bigint, text, text, timestamptz, boolean)
from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ what issues them

/* The receipt for one settled payment. */
create or replace function public.fn_receipt_for_payment(p_payment_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  o public.order;
  s public.stay;
  v_guest uuid;
  v_method text;
  v_nights integer;
  v_place text;
begin
  select * into p from public.payment where id = p_payment_id;
  if p.id is null or p.state <> 'paid' then return; end if;
  v_method := case when p.provider = 'mpesa' or p.channel = 'mpesa' then 'M-Pesa'
                   when p.channel = 'card' then 'Card' else initcap(coalesce(p.channel, p.provider)) end;

  if p.intent = 'order' then
    select * into o from public.order where id = p.order_id;
    v_guest := coalesce(p.created_by, (select g.user_id from public.guest g where g.id = o.guest_id));
    perform public.fn_receipt_issue('guest', v_guest, 'payment', p.id, 'payment',
      'Order ' || o.reference || ' · ' || coalesce((select m.trading_name from public.merchant m where m.id = o.merchant_id), 'NexG'),
      (select coalesce(jsonb_agg(l) filter (where (l ->> 'amount_cents')::bigint <> 0), '[]'::jsonb) from (values
        (jsonb_build_object('label', 'Items', 'amount_cents', o.subtotal_cents)),
        (jsonb_build_object('label', 'Delivery', 'amount_cents', o.delivery_fee_cents)),
        (jsonb_build_object('label', 'Service fee', 'amount_cents', o.service_fee_cents))) v(l)),
      p.amount_cents, v_method, coalesce(p.provider_receipt, p.reference), p.paid_at, p_email);

  elsif p.intent = 'stay' then
    select * into s from public.stay where id = p.stay_id;
    select coalesce(pr.name, '') || coalesce(' · ' || coalesce(u.label_public, u.name), '') into v_place
      from public.unit u left join public.property pr on pr.id = u.property_id where u.id = s.unit_id;
    v_nights := greatest(1, (s.check_out::date - s.check_in::date));
    perform public.fn_receipt_issue('guest', coalesce(s.guest_user_id, p.created_by), 'payment', p.id, 'payment',
      'Stay · ' || coalesce(nullif(v_place, ''), 'NexG stay'),
      jsonb_build_array(jsonb_build_object(
        'label', v_nights || ' night' || case when v_nights = 1 then '' else 's' end
                 || ', ' || to_char(s.check_in at time zone 'Africa/Nairobi', 'DD Mon')
                 || ' to ' || to_char(s.check_out at time zone 'Africa/Nairobi', 'DD Mon YYYY'),
        'amount_cents', p.amount_cents)),
      p.amount_cents, v_method, coalesce(p.provider_receipt, p.reference), p.paid_at, p_email);

  elsif p.intent = 'featured_slot' then
    perform public.fn_receipt_issue('merchant', p.merchant_id, 'payment', p.id, 'payment',
      'Featured slot',
      jsonb_build_array(jsonb_build_object('label', 'Featured placement', 'amount_cents', p.amount_cents)),
      p.amount_cents, v_method, coalesce(p.provider_receipt, p.reference), p.paid_at, p_email);
  end if;
end;
$$;

create or replace function public.tg_receipt_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.state = 'paid' and old.state is distinct from 'paid' then
      perform public.fn_receipt_for_payment(new.id, true);
    elsif new.provider_receipt is not null and old.provider_receipt is distinct from new.provider_receipt then
      /* The M-Pesa receipt code arrives just after the payment settles. */
      update public.receipt set method_ref = new.provider_receipt
       where source_type = 'payment' and source_id = new.id;
    end if;
  exception when others then
    raise warning 'receipt not issued for payment %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists payment_receipt on public.payment;
create trigger payment_receipt after update of state, provider_receipt on public.payment
  for each row execute function public.tg_receipt_payment();

/* Host earnings on a confirmed NexG booking, and a guest's stay refund. */
create or replace function public.fn_receipt_for_stay(p_stay_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stay;
  v_place text;
begin
  select * into s from public.stay where id = p_stay_id;
  if s.id is null then return; end if;
  select coalesce(pr.name, '') || coalesce(' · ' || coalesce(u.label_public, u.name), '') into v_place
    from public.unit u left join public.property pr on pr.id = u.property_id where u.id = s.unit_id;

  if s.status in ('booked', 'in_stay', 'departed') and s.source = 'nexg' and s.host_share_kes is not null then
    perform public.fn_receipt_issue('host', s.host_id, 'stay', s.id, 'earnings',
      'Booking earnings · ' || coalesce(nullif(v_place, ''), 'NexG stay')
        || ' · ' || to_char(s.check_in at time zone 'Africa/Nairobi', 'DD Mon')
        || ' to ' || to_char(s.check_out at time zone 'Africa/Nairobi', 'DD Mon YYYY'),
      jsonb_build_array(
        jsonb_build_object('label', 'Guest paid', 'amount_cents', s.paid_kes * 100),
        jsonb_build_object('label', 'NexG commission (15%)', 'amount_cents', -s.commission_kes * 100)),
      s.host_share_kes * 100, 'NexG booking', s.payment_reference, coalesce(s.confirmed_at, now()), p_email);
  end if;

  if s.refunded_at is not null and s.guest_user_id is not null then
    perform public.fn_receipt_issue('guest', s.guest_user_id, 'stay_refund', s.id, 'refund',
      'Refund · ' || coalesce(nullif(v_place, ''), 'NexG stay'),
      jsonb_build_array(jsonb_build_object('label', 'Refund of stay payment', 'amount_cents', coalesce(s.paid_kes, 0) * 100)),
      coalesce(s.paid_kes, 0) * 100, 'M-Pesa', s.refund_reference, s.refunded_at, p_email);
  end if;
end;
$$;

create or replace function public.tg_receipt_stay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if (new.status is distinct from old.status or new.host_share_kes is distinct from old.host_share_kes
        or new.refunded_at is distinct from old.refunded_at) then
      perform public.fn_receipt_for_stay(new.id, true);
    end if;
  exception when others then
    raise warning 'receipt not issued for stay %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists stay_receipt on public.stay;
create trigger stay_receipt after update of status, host_share_kes, refunded_at on public.stay
  for each row execute function public.tg_receipt_stay();

/* An order refund that has actually moved. */
create or replace function public.tg_receipt_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_guest uuid;
begin
  begin
    if new.status = 'issued' and old.status is distinct from 'issued' then
      select * into o from public.order where id = new.order_id;
      v_guest := coalesce(
        (select g.user_id from public.guest g where g.id = o.guest_id),
        (select p.created_by from public.payment p where p.order_id = o.id and p.state in ('paid', 'reversed')
          order by p.paid_at desc nulls last limit 1));
      perform public.fn_receipt_issue('guest', v_guest, 'refund', new.id, 'refund',
        'Refund · Order ' || o.reference,
        jsonb_build_array(jsonb_build_object('label', new.reason_text, 'amount_cents', new.amount_cents)),
        new.amount_cents,
        case new.method when 'mpesa_b2c' then 'M-Pesa' when 'wallet_credit' then 'NexG credit' else 'Original payment' end,
        new.provider_ref, coalesce(new.issued_at, now()), true);
    end if;
  exception when others then
    raise warning 'receipt not issued for refund %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists refund_receipt on public.refund;
create trigger refund_receipt after update of status on public.refund
  for each row execute function public.tg_receipt_refund();

/* A merchant's weekly statement paid out. */
create or replace function public.fn_receipt_for_statement(p_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.merchant_statement;
begin
  select * into st from public.merchant_statement where id = p_id;
  if st.id is null or st.status <> 'paid' then return; end if;
  perform public.fn_receipt_issue('merchant', st.merchant_id, 'merchant_statement', st.id, 'payout',
    'Payout · ' || to_char(st.period_start, 'DD Mon') || ' to ' || to_char(st.period_end, 'DD Mon YYYY'),
    (select coalesce(jsonb_agg(l) filter (where (l ->> 'amount_cents')::bigint <> 0), '[]'::jsonb) from (values
      (jsonb_build_object('label', 'Sales', 'amount_cents', st.gross_kes * 100)),
      (jsonb_build_object('label', 'NexG commission', 'amount_cents', -st.commission_kes * 100)),
      (jsonb_build_object('label', 'Adjustments', 'amount_cents', st.adjustments_kes * 100)),
      (jsonb_build_object('label', 'Penalties', 'amount_cents', -st.penalties_kes * 100)),
      (jsonb_build_object('label', 'Tax withheld', 'amount_cents', -st.tax_withheld_kes * 100))) v(l)),
    greatest(st.net_kes, 0) * 100, 'Payout', st.provider_ref, st.paid_at, p_email);
end;
$$;

create or replace function public.tg_receipt_statement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'paid' and old.status is distinct from 'paid' then
      perform public.fn_receipt_for_statement(new.id, true);
    end if;
  exception when others then
    raise warning 'receipt not issued for statement %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists merchant_statement_receipt on public.merchant_statement;
create trigger merchant_statement_receipt after update of status on public.merchant_statement
  for each row execute function public.tg_receipt_statement();

/* A rider's weekly payout paid. */
create or replace function public.fn_receipt_for_rider_payout(p_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.rider_settlement_line;
begin
  select * into l from public.rider_settlement_line where id = p_id;
  if l.id is null or l.status <> 'paid' then return; end if;
  perform public.fn_receipt_issue('rider', l.rider_id, 'rider_settlement_line', l.id, 'payout',
    'Weekly payout · ' || l.trips || ' trip' || case when l.trips = 1 then '' else 's' end,
    (select coalesce(jsonb_agg(x) filter (where (x ->> 'amount_cents')::bigint <> 0), '[]'::jsonb) from (values
      (jsonb_build_object('label', 'Earnings', 'amount_cents', l.earnings_kes * 100)),
      (jsonb_build_object('label', 'Bonuses', 'amount_cents', l.bonuses_kes * 100)),
      (jsonb_build_object('label', 'Tips', 'amount_cents', l.tips_kes * 100)),
      (jsonb_build_object('label', 'Cash kept from deliveries', 'amount_cents', -l.cash_net_kes * 100))) v(x)),
    greatest(l.net_pay_kes, 0) * 100, 'M-Pesa', l.provider_ref, l.paid_at, p_email);
end;
$$;

create or replace function public.tg_receipt_rider_payout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'paid' and old.status is distinct from 'paid' then
      perform public.fn_receipt_for_rider_payout(new.id, true);
    end if;
  exception when others then
    raise warning 'receipt not issued for rider payout %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists rider_payout_receipt on public.rider_settlement_line;
create trigger rider_payout_receipt after update of status on public.rider_settlement_line
  for each row execute function public.tg_receipt_rider_payout();

/* Cash a rider handed back to NexG, once matched to them. */
create or replace function public.fn_receipt_for_deposit(p_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.cash_deposit;
begin
  select * into d from public.cash_deposit where id = p_id;
  if d.id is null or d.rider_id is null or d.match_status not in ('auto_matched', 'manual_matched') then return; end if;
  perform public.fn_receipt_issue('rider', d.rider_id, 'cash_deposit', d.id, 'deposit',
    'Cash deposit received',
    jsonb_build_array(jsonb_build_object('label', 'Cash collected on deliveries, paid to NexG', 'amount_cents', d.amount_kes * 100)),
    d.amount_kes * 100, 'M-Pesa', d.provider_ref, d.paid_at, p_email);
end;
$$;

create or replace function public.tg_receipt_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.fn_receipt_for_deposit(new.id, true);
  exception when others then
    raise warning 'receipt not issued for deposit %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists cash_deposit_receipt on public.cash_deposit;
create trigger cash_deposit_receipt after insert or update of match_status, rider_id on public.cash_deposit
  for each row execute function public.tg_receipt_deposit();

/* A NexG invoice a host has paid. */
create or replace function public.fn_receipt_for_host_invoice(p_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.host_invoice;
begin
  select * into i from public.host_invoice where id = p_id;
  if i.id is null or i.status <> 'paid' then return; end if;
  perform public.fn_receipt_issue('host', i.host_id, 'host_invoice', i.id, 'payment',
    'NexG invoice · ' || to_char(i.period, 'Mon YYYY'),
    coalesce((select jsonb_agg(jsonb_build_object(
                'label', coalesce(x ->> 'label', x ->> 'description', 'NexG services'),
                'amount_cents', coalesce((x ->> 'amount')::numeric, (x ->> 'total')::numeric, 0)::bigint * 100))
                from jsonb_array_elements(i.lines) x),
             jsonb_build_array(jsonb_build_object('label', 'NexG services', 'amount_cents', i.total * 100))),
    i.total * 100, 'Payment', i.provider_ref, i.paid_at, p_email);
end;
$$;

create or replace function public.tg_receipt_host_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'paid' and old.status is distinct from 'paid' then
      perform public.fn_receipt_for_host_invoice(new.id, true);
    end if;
  exception when others then
    raise warning 'receipt not issued for host invoice %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists host_invoice_receipt on public.host_invoice;
create trigger host_invoice_receipt after update of status on public.host_invoice
  for each row execute function public.tg_receipt_host_invoice();

revoke execute on function public.fn_receipt_for_payment(uuid, boolean), public.fn_receipt_for_stay(uuid, boolean),
  public.fn_receipt_for_statement(uuid, boolean), public.fn_receipt_for_rider_payout(uuid, boolean),
  public.fn_receipt_for_deposit(uuid, boolean), public.fn_receipt_for_host_invoice(uuid, boolean),
  public.tg_receipt_payment(), public.tg_receipt_stay(), public.tg_receipt_refund(),
  public.tg_receipt_statement(), public.tg_receipt_rider_payout(), public.tg_receipt_deposit(),
  public.tg_receipt_host_invoice()
from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ what already moved

/* Receipts for money that moved before today, oldest first so numbers follow
   time. Not emailed: nobody should get a pile of old receipts at once. */
do $$
declare
  r record;
begin
  for r in
    select 'payment' as kind, id, paid_at as at from public.payment where state = 'paid'
    union all select 'stay', id, coalesce(confirmed_at, refunded_at) from public.stay
      where (source = 'nexg' and host_share_kes is not null) or refunded_at is not null
    union all select 'statement', id, paid_at from public.merchant_statement where status = 'paid'
    union all select 'rider', id, paid_at from public.rider_settlement_line where status = 'paid'
    union all select 'deposit', id, paid_at from public.cash_deposit
      where rider_id is not null and match_status in ('auto_matched', 'manual_matched')
    union all select 'host_invoice', id, paid_at from public.host_invoice where status = 'paid'
    order by 3 nulls first
  loop
    begin
      case r.kind
        when 'payment' then perform public.fn_receipt_for_payment(r.id, false);
        when 'stay' then perform public.fn_receipt_for_stay(r.id, false);
        when 'statement' then perform public.fn_receipt_for_statement(r.id, false);
        when 'rider' then perform public.fn_receipt_for_rider_payout(r.id, false);
        when 'deposit' then perform public.fn_receipt_for_deposit(r.id, false);
        when 'host_invoice' then perform public.fn_receipt_for_host_invoice(r.id, false);
      end case;
    exception when others then
      raise warning 'no receipt for % %: %', r.kind, r.id, sqlerrm;
    end;
  end loop;
end $$;
