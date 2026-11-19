-- Hosts hear about their payouts, cancellations and payout details.
--
-- Two channels reach a host today: email (the outbox, which notify-dispatch
-- sends every minute) and their host workspace (Finances → Receipts, and
-- Statements & folios). The workspace Inbox reads the conversation system and
-- nothing shows public.host_message, so the "New NexG booking" note that
-- tg_payment_stay_settled writes there never reaches a host; the
-- booking-earnings receipt email does. Everything below uses those two
-- channels.
--
--   1. A payout receipt, emailed, when a host's settlement line is marked
--      paid: stay earnings and referral rewards, the total sent, how and
--      where to. Nothing marks a run line paid yet (the run's send step is
--      not built), so this starts the day that step exists.
--   2. The host's statement shows each paid payout as a minus line, so it
--      reads earned, then paid.
--   3. An email when NexG cancels a booking the host was confirmed for: the
--      guest is refunded and the host's share no longer counts.
--   4. An email when NexG saves new payout details for the host, and another
--      when Finance verifies them. A change the host did not ask for is the
--      first sign of payout fraud, so the first email always goes out.
--
-- Each is best-effort: a failure is a warning in the log and never undoes
-- the payment, cancellation or change that triggered it. Emails use the
-- host's email on file (host.email), as receipts do; a host without one gets
-- none.
--
-- Also re-created, from its latest definition with only this change:
--   host_statement_v  20270117000100: paid payouts as "payout" lines
-- Run after 20270117000100 and 20270122000100.
--
-- Rollback, in this order:
--   drop trigger if exists host_payout_receipt on public.fin_settlement_line;
--   drop trigger if exists stay_cancel_tells_host on public.stay;
--   drop trigger if exists host_payout_tells_host on public.host_payout;
--   re-run host_statement_v from 20270117000100;
--   drop function public.tg_receipt_host_payout(),
--     public.fn_receipt_for_host_payout(uuid, boolean),
--     public.tg_stay_cancel_tells_host(), public.tg_host_payout_tells_host();
--   receipts and emails already issued stay.

-- ═══════════════════════════════════════════════════════ 1. payout receipts

/*
 * A host's payout, once their settlement line is paid. The lines are what
 * the payout was made of, from the ledger entries the line claimed, so they
 * add up to what was sent. Issued once per line.
 */
create or replace function public.fn_receipt_for_host_payout(p_line_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.fin_settlement_line;
  r public.fin_settlement_run;
  v_stays bigint;
  v_rewards bigint;
begin
  select * into l from public.fin_settlement_line where id = p_line_id;
  if l.id is null or l.party_type <> 'host' or l.state <> 'paid' then
    return;
  end if;
  select * into r from public.fin_settlement_run where id = l.run_id;

  select coalesce(sum(e.credit - e.debit) filter (where a.base = 'stay.host_share'), 0)::bigint,
         coalesce(sum(e.credit - e.debit) filter (where a.base = 'payable.host_credit'), 0)::bigint
    into v_stays, v_rewards
    from ledger.entry e
    join ledger.account a on a.code = e.account_code
   where e.id = any (l.ledger_entry_ids);

  perform public.fn_receipt_issue('host', l.party_id, 'fin_settlement_line', l.id, 'payout',
    'Payout · ' || coalesce(r.reference, 'NexG') || coalesce(' · ' || l.destination_masked, ''),
    (select coalesce(jsonb_agg(x) filter (where (x ->> 'amount_cents')::bigint <> 0), '[]'::jsonb)
       from (values
         (jsonb_build_object('label', 'Stay earnings', 'amount_cents', v_stays)),
         (jsonb_build_object('label', 'Referral rewards', 'amount_cents', v_rewards)),
         (jsonb_build_object('label', 'Adjustments',
                             'amount_cents', greatest(l.net_cents, 0) - v_stays - v_rewards))) v(x)),
    greatest(l.net_cents, 0),
    case l.rail when 'bank_eft' then 'Bank transfer' else 'M-Pesa' end,
    l.provider_ref, coalesce(l.paid_at, now()), p_email);
end;
$$;

create or replace function public.tg_receipt_host_payout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.state = 'paid' and old.state is distinct from 'paid' then
      perform public.fn_receipt_for_host_payout(new.id, true);
    end if;
  exception when others then
    raise warning 'receipt not issued for host payout %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists host_payout_receipt on public.fin_settlement_line;
create trigger host_payout_receipt after update of state on public.fin_settlement_line
  for each row when (new.party_type = 'host')
  execute function public.tg_receipt_host_payout();

-- ═════════════════════════════════════════ 2. payouts on the host's statement

create or replace view public.host_statement_v
with (security_invoker = false) as
select
  e.id,
  e.party_id as host_id,
  e.effective_at,
  a.base,
  case a.base
    when 'receivable.host' then 'invoice'
    when 'payable.host_credit' then 'reward'
    when 'stay.host_share' then 'stay'
    else a.base
  end as line_kind,
  e.memo,
  /* Signed from the host's point of view, which is the opposite
     of ours: a receivable is our asset and their bill. Getting
     this backwards would show a host their debts as earnings. */
  case a.base
    when 'receivable.host' then -(e.debit - e.credit)
    when 'payable.host_credit' then (e.credit - e.debit)
    when 'stay.host_share' then (e.credit - e.debit)
    else 0
  end as amount_cents,
  t.kind as transaction_kind
from ledger.entry e
join ledger.account a on a.code = e.account_code
join ledger.transaction t on t.id = e.transaction_id
where a.base in ('receivable.host', 'payable.host_credit', 'stay.host_share')
  and e.party_id is not null
  and authz.is_host_member(e.party_id)
/* A payout from the weekly run, once its line is paid. It is not a ledger
   entry: the run claims the entries above rather than posting against them,
   so the payout is read from the line itself. Its id is negative, so it can
   never meet an entry's. */
union all
select
  -(('x' || substr(md5(l.id::text), 1, 15))::bit(60)::bigint),
  l.party_id,
  l.paid_at,
  'payout'::text,
  'payout'::text,
  'Paid to ' || coalesce(l.destination_masked, 'your account')
    || coalesce(' · ' || l.provider_ref, ''),
  -greatest(l.net_cents, 0),
  'settlement_payout'::text
from public.fin_settlement_line l
where l.party_type = 'host'
  and l.state = 'paid'
  and l.paid_at is not null
  and authz.is_host_member(l.party_id);

-- ═══════════════════════════════════════ 3. a cancelled booking, told to the host

/*
 * NexG staff cancelled a booking the host was confirmed for and paid
 * through NexG (rpc_stay_cancel sets refund_due_at). A stay paid after its
 * nights were taken was never confirmed, so its host hears nothing.
 */
create or replace function public.tg_stay_cancel_tells_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_place text;
  v_dates text;
  v_receipt text;
begin
  begin
    v_email := public.fn_receipt_email('host', new.host_id);
    if v_email is null then
      return null;
    end if;

    select nullif(coalesce(pr.name, '') || coalesce(' · ' || coalesce(u.label_public, u.name), ''), '')
      into v_place
      from public.unit u
      left join public.property pr on pr.id = u.property_id
     where u.id = new.unit_id;
    v_dates := to_char(new.check_in at time zone 'Africa/Nairobi', 'DD Mon') || ' to '
               || to_char(new.check_out at time zone 'Africa/Nairobi', 'DD Mon YYYY');
    select x.number into v_receipt from public.receipt x
     where x.source_type = 'stay' and x.source_id = new.id and x.party_type = 'host';

    perform public.fn_notify_enqueue(
      p_channel => 'email',
      p_recipient => v_email,
      p_template => 'host_booking_cancelled',
      p_subject => 'Booking cancelled · ' || coalesce(v_place, 'your NexG stay') || ' · ' || v_dates,
      p_body => 'NexG has cancelled ' || coalesce(new.guest_first_name, 'a guest') || '''s booking at '
        || coalesce(v_place, 'your property') || ', ' || v_dates || '.' || E'\n\n'
        || 'The guest is being refunded KES ' || to_char(coalesce(new.paid_kes, 0), 'FM999,999,999')
        || ', so your share of KES ' || to_char(coalesce(new.host_share_kes, 0), 'FM999,999,999')
        || ' is no longer owed to you'
        || coalesce(', and receipt ' || v_receipt || ' no longer applies', '') || '. '
        || 'It shows as a minus line on your NexG statement, under Finances, Statements & folios. '
        || 'The nights are open again on your calendar.' || E'\n\n'
        || '— NexG Concierge',
      p_payload => jsonb_build_object('stay_id', new.id, 'receipt', v_receipt));
  exception when others then
    raise warning 'cancellation email not queued for stay %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists stay_cancel_tells_host on public.stay;
create trigger stay_cancel_tells_host after update of refund_due_at on public.stay
  for each row
  when (old.refund_due_at is null and new.refund_due_at is not null
        and new.confirmed_at is not null and new.source = 'nexg' and new.host_share_kes is not null)
  execute function public.tg_stay_cancel_tells_host();

-- ═════════════════════════════════════════ 4. payout details, told to the host

/*
 * New details (declared, or declared again) and their verification. The
 * destination is masked in the email, as it is everywhere but Finance.
 */
create or replace function public.tg_host_payout_tells_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_where text;
begin
  begin
    v_email := public.fn_receipt_email('host', new.host_id);
    if v_email is null then
      return null;
    end if;
    v_where := case new.rail
                 when 'mpesa_phone' then 'M-PESA number '
                 when 'mpesa_till' then 'M-PESA till '
                 when 'mpesa_paybill' then 'M-PESA paybill '
                 else 'bank account ' end
               || public.fn_experience_partner_payout_masked(new.rail, new.account);

    if tg_op = 'INSERT' or new.version is distinct from old.version then
      perform public.fn_notify_enqueue(
        p_channel => 'email',
        p_recipient => v_email,
        p_template => 'host_payout_details',
        p_subject => 'Your NexG payout details were saved',
        p_body => 'NexG has saved where to pay you: ' || v_where || '.' || E'\n\n'
          || 'Finance checks these details before your next payout. Until then, your stay earnings '
          || 'and referral rewards are held.' || E'\n\n'
          || 'If you did not ask for this change, contact NexG straight away.' || E'\n\n'
          || '— NexG Concierge',
        p_payload => jsonb_build_object('host_id', new.host_id, 'version', new.version));
    elsif new.verified_version is not null
          and new.verified_version is distinct from old.verified_version then
      perform public.fn_notify_enqueue(
        p_channel => 'email',
        p_recipient => v_email,
        p_template => 'host_payout_verified',
        p_subject => 'Your NexG payout details are verified',
        p_body => 'Finance has verified your payout details: ' || v_where || '.' || E'\n\n'
          || 'NexG pays your stay earnings and referral rewards there in the weekly payout run.'
          || E'\n\n' || '— NexG Concierge',
        p_payload => jsonb_build_object('host_id', new.host_id, 'version', new.version));
    end if;
  exception when others then
    raise warning 'payout details email not queued for host %: %', new.host_id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists host_payout_tells_host on public.host_payout;
create trigger host_payout_tells_host after insert or update on public.host_payout
  for each row execute function public.tg_host_payout_tells_host();

-- ═══════════════════════════════════════════════════════════════ 5. grants

revoke execute on function
  public.fn_receipt_for_host_payout(uuid, boolean),
  public.tg_receipt_host_payout(),
  public.tg_stay_cancel_tells_host(),
  public.tg_host_payout_tells_host()
  from public, anon, authenticated;
grant execute on function public.fn_receipt_for_host_payout(uuid, boolean) to service_role;
