-- Stay and featured-slot payments on the ledger.
--
-- Orders, host invoices and referral rewards, experience plans and client
-- invoices already post to the ledger. A guest paying for a stay and a
-- merchant paying for a featured slot moved money the books never saw.
-- Decided with the owner on 19 Nov 2026:
--
--   * a stay's host share is owed to the host as soon as the stay is paid;
--   * a featured slot is revenue when it is paid;
--   * rider-float payments stay off the ledger: nothing creates them yet,
--     and a payment row cannot say which rider paid.
--
-- On the ledger, in cents (stays keep whole shillings, multiplied by 100):
--
--   Featured slot paid     Dr cash.mpesa_paybill or cash.bank  the amount paid
--                          Cr revenue.featured                 the amount paid
--                          key featured_paid:<payment id>
--     A slot is priced at the rate card's ex-VAT price and nothing adds VAT
--     to the charge, so there is no VAT to separate.
--
--   Stay paid, confirmed   Dr cash                             what the guest paid
--                          Cr stay.host_share:<host id>        the host's share (85%)
--                          Cr revenue.stay_commission          NexG's 15% less its VAT
--                          Cr tax.vat_output                   the VAT in the 15%
--                          key stay_paid:<payment id>
--   Stay paid too late     Dr cash                             what the guest paid
--     (its nights had      Cr refunds_pending                  owed back to the guest
--     gone to somebody     key stay_paid:<payment id>
--     else)
--   Paid stay cancelled    Dr each credit of the confirmed posting, entry for entry
--     by staff             Cr refunds_pending                  what the guest paid
--                          key stay_refund_due:<payment id>
--   Refund recorded        Dr refunds_pending                  what is still pending
--                          Cr the cash account it came in on
--                          key stay_refunded:<payment id>
--
-- Cash is the bank account for a bank collection and the M-Pesa paybill
-- otherwise. A refund is credited back to the account the payment came in
-- on; one sent by B2C really leaves the B2C wallet, which this does not
-- know.
--
-- stay.host_share is a liability of its own, not payable.host_credit. The
-- weekly settlement run settles every payable.* balance, and it settles a
-- host's as a credit note against their next invoice, which is not how a
-- stay's share is paid. Hosts have no payout details in NexG yet, so these
-- shares are paid outside the run for now. They show on Finance's owed list
-- under the host's name and on the host's statement as "stay" lines. Host
-- payouts, when built, can take them from here.
--
-- The postings run from triggers: on payment for featured slots, and on stay
-- for the payment that settled it, a cancellation that makes a refund due,
-- and a refund recorded. tg_payment_stay_settled must never raise: it runs
-- inside the payment webhook, and an error would undo the record that the
-- guest paid. So neither trigger raises. A posting that fails is logged as
-- ledger.posting_failed (high) and can be posted again from the SQL Editor:
-- every posting function is idempotent.
--
-- Payments already settled when this runs are posted once, at the end.
-- Production had none on 19 Nov 2026.
--
-- Also re-created, from their latest definitions with only this change:
--   fn_fin_build_party_owed  20270108300600: also counts stay.host_share
--   host_statement_v         20260101019600: shows stay.host_share as "stay"
-- Run after 20270106060100 and 20270108300600, which re-create
-- fn_fin_build_party_owed too; run before them, they would drop this change.
--
-- Rollback, in this order:
--   drop trigger if exists stay_posts_to_ledger on public.stay;
--   drop trigger if exists featured_payment_posts_to_ledger on public.payment;
--   re-run fn_fin_build_party_owed from 20270108300600 and host_statement_v
--     from 20260101019600;
--   drop function public.tg_stay_posts_to_ledger(),
--     public.tg_featured_payment_posts_to_ledger(),
--     ledger.fn_post_stay_refunded(uuid), ledger.fn_post_stay_refund_due(uuid),
--     ledger.fn_post_stay_paid(uuid), ledger.fn_post_featured_paid(uuid),
--     ledger.fn_payment_cash_account(public.payment);
--   the two accounts and anything posted stay: the ledger is append-only.

-- ═══════════════════════════════════════════════════════════ 1. accounts

insert into ledger.account (code, base, name, kind, party_type, party_id, normal_side) values
  ('stay.host_share', 'stay.host_share',
   'A host''s share of stays paid through NexG, not yet paid out', 'liability', 'host', null, 'C'),
  ('revenue.stay_commission', 'revenue.stay_commission', 'Stay commission', 'revenue', 'nexg', null, 'C')
on conflict (code) do nothing;

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('ledger.posting_failed', 'finance', 'high', true,
   'A payment could not be posted to the ledger; post it again from the SQL Editor')
on conflict (action) do nothing;

-- ═══════════════════════════════════════ 2. where a payment's money landed

/* The bank account for a bank collection; the M-Pesa paybill otherwise, where
   STK prompts and paybill payments both settle. */
create or replace function ledger.fn_payment_cash_account(p public.payment)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p.channel = 'bank' or p.provider like 'bank\_%' then 'cash.bank'
              else 'cash.mpesa_paybill' end
$$;

-- ═════════════════════════════════════════════════ 3. a featured slot, paid

/*
 * A merchant paid for a featured slot. All of it is featured revenue when
 * it is paid. Idempotent per payment, and posts nothing for a payment that
 * is not a settled featured-slot payment.
 */
create or replace function ledger.fn_post_featured_paid(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
begin
  select * into p from public.payment where id = p_payment_id;
  if p.id is null then
    raise exception 'No such payment.' using errcode = 'no_data_found';
  end if;
  if p.intent <> 'featured_slot' or p.state <> 'paid' then
    return null;
  end if;

  return ledger.post(
    p_kind => 'featured_slot_paid',
    p_idempotency_key => 'featured_paid:' || p.id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', ledger.fn_payment_cash_account(p), 'debit', p.amount_cents,
                         'memo', p.reference),
      jsonb_build_object('account', 'revenue.featured', 'credit', p.amount_cents,
                         'memo', 'Featured placement · ' || p.reference)),
    p_effective_at => coalesce(p.paid_at, now()),
    p_city_id => p.city_id,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'featured_slot_paid',
    p_related => jsonb_build_object('payment_id', p.id, 'booking_id', p.booking_id,
                                    'merchant_id', p.merchant_id, 'reference', p.reference));
end;
$$;

create or replace function public.tg_featured_payment_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform ledger.fn_post_featured_paid(new.id);
  exception when others then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'finance',
      p_action => 'ledger.posting_failed', p_actor_label => '[System] · ledger',
      p_target_type => 'payment', p_target_id => new.id, p_city_id => new.city_id,
      p_severity => 'high',
      p_reason => 'A featured slot payment could not be posted to the ledger.',
      p_after => jsonb_build_object('reference', new.reference, 'error', sqlerrm,
                                    'sqlstate', sqlstate));
  end;
  return new;
end;
$$;

drop trigger if exists featured_payment_posts_to_ledger on public.payment;
create trigger featured_payment_posts_to_ledger
  after update of state on public.payment
  for each row
  when (new.intent = 'featured_slot' and new.state = 'paid' and old.state is distinct from 'paid')
  execute function public.tg_featured_payment_posts_to_ledger();

-- ═══════════════════════════════════════════════════════════ 4. a stay, paid

/*
 * A guest's stay payment, once tg_payment_stay_settled has recorded it on
 * the stay. That trigger either confirmed the stay and split the money (15%
 * NexG, the rest the host's) or, the nights having gone to somebody else,
 * made a refund due. The posting follows what it decided. Idempotent per
 * payment.
 */
create or replace function ledger.fn_post_stay_paid(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  s public.stay;
  v_cash text;
  v_paid bigint;
  v_share bigint;
  v_commission bigint;
  v_vat bigint;
  v_confirmed boolean;
begin
  select * into p from public.payment where id = p_payment_id;
  if p.id is null then
    raise exception 'No such payment.' using errcode = 'no_data_found';
  end if;
  if p.intent <> 'stay' or p.state <> 'paid' then
    return null;
  end if;

  select * into s from public.stay where id = p.stay_id;
  if s.id is null or s.payment_reference is distinct from p.reference then
    return null;
  end if;

  v_cash := ledger.fn_payment_cash_account(p);
  v_paid := p.amount_cents;
  v_confirmed := s.confirmed_at is not null and s.host_share_kes is not null;

  if v_confirmed then
    v_share := least(ledger.from_kes(s.host_share_kes), v_paid);
    v_commission := v_paid - v_share;
    v_vat := ledger.fn_vat_part(v_commission, coalesce(settings.fn_num('tax.vat_pct', p.city_id), 16));
  end if;

  return ledger.post(
    p_kind => case when v_confirmed then 'stay_paid' else 'stay_paid_refund_due' end,
    p_idempotency_key => 'stay_paid:' || p.id::text,
    p_entries => case when v_confirmed then jsonb_build_array(
        jsonb_build_object('account', v_cash, 'debit', v_paid, 'memo', p.reference),
        jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                           'party_id', s.host_id, 'credit', v_share,
                           'memo', 'Stay · ' || p.reference),
        jsonb_build_object('account', 'revenue.stay_commission', 'credit', v_commission - v_vat,
                           'memo', 'Stay commission · ' || p.reference),
        jsonb_build_object('account', 'tax.vat_output', 'credit', v_vat,
                           'memo', 'VAT on the stay commission · ' || p.reference))
      else jsonb_build_array(
        jsonb_build_object('account', v_cash, 'debit', v_paid, 'memo', p.reference),
        jsonb_build_object('account', 'refunds_pending', 'credit', v_paid,
                           'memo', 'Stay paid after its dates were taken · refund due'))
      end,
    p_effective_at => coalesce(p.paid_at, now()),
    p_city_id => p.city_id,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => case when v_confirmed then 'stay_paid' else 'stay_paid_late' end,
    p_related => jsonb_build_object('payment_id', p.id, 'stay_id', s.id, 'host_id', s.host_id,
                                    'reference', p.reference));
end;
$$;

/*
 * Staff cancelled a paid stay (rpc_stay_cancel), so the guest is owed their
 * money back and the host is owed nothing for it. The confirmed posting's
 * credits (host share, commission, VAT) are taken back into refunds_pending
 * entry for entry, so they match what was posted even if the VAT rate has
 * changed since. Posts nothing unless that confirmed posting exists.
 * Idempotent per payment.
 */
create or replace function ledger.fn_post_stay_refund_due(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid ledger.transaction;
  s public.stay;
  v_entries jsonb;
  v_total bigint;
begin
  select * into v_paid from ledger.transaction
   where idempotency_key = 'stay_paid:' || p_payment_id::text;
  if v_paid.id is null or v_paid.kind <> 'stay_paid' then
    return null;
  end if;

  select x.* into s from public.stay x
    join public.payment p on p.stay_id = x.id
   where p.id = p_payment_id;
  if s.refund_due_at is null then
    return null;
  end if;

  select jsonb_agg(jsonb_build_object('account', e.account_code, 'debit', e.credit,
                                      'memo', 'Stay cancelled · ' || coalesce(e.memo, ''))
                   order by e.id),
         sum(e.credit)::bigint
    into v_entries, v_total
    from ledger.entry e
   where e.transaction_id = v_paid.id and e.credit > 0;

  return ledger.post(
    p_kind => 'stay_cancelled_refund_due',
    p_idempotency_key => 'stay_refund_due:' || p_payment_id::text,
    p_entries => v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'refunds_pending', 'credit', v_total, 'memo', 'Stay cancelled · refund due')),
    p_effective_at => s.refund_due_at,
    p_city_id => v_paid.city_id,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'stay_cancelled',
    p_related => v_paid.related);
end;
$$;

/*
 * Staff recorded the refund (rpc_stay_refund_record): the money went back.
 * Clears what refunds_pending holds for this payment, from the cash account
 * it came in on. Idempotent per payment.
 */
create or replace function ledger.fn_post_stay_refunded(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid ledger.transaction;
  s public.stay;
  v_cash text;
  v_pending bigint;
begin
  select * into v_paid from ledger.transaction
   where idempotency_key = 'stay_paid:' || p_payment_id::text;
  if v_paid.id is null then
    return null;
  end if;

  select x.* into s from public.stay x
    join public.payment p on p.stay_id = x.id
   where p.id = p_payment_id;
  if s.refunded_at is null then
    return null;
  end if;

  select e.account_code into v_cash from ledger.entry e
   where e.transaction_id = v_paid.id and e.debit > 0
   order by e.id limit 1;

  select coalesce(sum(e.credit - e.debit), 0)::bigint into v_pending
    from ledger.entry e
    join ledger.transaction t on t.id = e.transaction_id
   where e.account_code = 'refunds_pending'
     and t.idempotency_key in ('stay_paid:' || p_payment_id::text,
                               'stay_refund_due:' || p_payment_id::text);
  if v_pending <= 0 then
    return null;
  end if;

  return ledger.post(
    p_kind => 'stay_refunded',
    p_idempotency_key => 'stay_refunded:' || p_payment_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'refunds_pending', 'debit', v_pending,
                         'memo', 'Stay refund · ' || coalesce(s.refund_reference, '')),
      jsonb_build_object('account', v_cash, 'credit', v_pending,
                         'memo', coalesce(s.refund_reference, ''))),
    p_effective_at => s.refunded_at,
    p_city_id => v_paid.city_id,
    p_actor_kind => case when s.refunded_by is null then 'system' else 'staff' end::public.actor_type,
    p_actor_id => s.refunded_by,
    p_actor_label => case when s.refunded_by is null then '[System] · ledger' end,
    p_reason_code => 'stay_refunded',
    p_related => v_paid.related || jsonb_build_object('refund_reference', s.refund_reference));
end;
$$;

/*
 * On the stay: the payment that settled it (tg_payment_stay_settled sets
 * payment_reference), a cancellation that makes a refund due, a refund
 * recorded. Never raises; see the header.
 */
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
  if p.id is null then
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

drop trigger if exists stay_posts_to_ledger on public.stay;
create trigger stay_posts_to_ledger
  after update of payment_reference, refund_due_at, refunded_at on public.stay
  for each row
  when (old.payment_reference is distinct from new.payment_reference
        or old.refund_due_at is distinct from new.refund_due_at
        or old.refunded_at is distinct from new.refunded_at)
  execute function public.tg_stay_posts_to_ledger();

-- ═════════════════════════════════ 5. a host owed for stays has a name on it

create or replace function public.fn_fin_build_party_owed()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  delete from public.fin_party_owed;

  with owed as (
    select
      e.party_type,
      e.party_id,
      /* Payables are credit-normal, so credits less debits is
         what is still owed. An entry already claimed by a
         settlement line is excluded — it is owed no longer, it
         is scheduled. */
      sum(e.credit - e.debit)::bigint as owed,
      min(e.effective_at) as oldest,
      count(*)::integer as n
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
     where a.kind = 'liability'
       and a.base in ('payable.merchant', 'payable.rider', 'payable.host_credit',
                      'payable.experience_partner', 'stay.host_share')
       and e.party_type is not null
       and e.party_id is not null
       and not exists (select 1 from public.fin_settled_entry s where s.entry_id = e.id)
     group by e.party_type, e.party_id
    having sum(e.credit - e.debit) <> 0
  ),
  inserted as (
    insert into public.fin_party_owed
      (party_type, party_id, label, owed_cents, oldest_unsettled, entry_count,
       as_of_entry_id, built_at)
    select o.party_type, o.party_id,
           coalesce(
             case o.party_type
               when 'merchant' then (select coalesce(m.trading_name, m.legal_name)
                                       from public.merchant m where m.id = o.party_id)
               when 'rider' then (select nullif(trim(coalesce(r.first_name, '') || ' '
                                                  || coalesce(r.last_name, '')), '')
                                    from public.rider r where r.id = o.party_id)
               when 'host' then (select nullif(trim(h.display_name), '')
                                   from public.host h where h.id = o.party_id)
               when 'experience_partner' then (select nullif(trim(p.name), '')
                                                 from public.experience_partner p
                                                where p.id = o.party_id)
               else null
             end,
             /* Never a bare uuid on a payout screen. If the name
                will not resolve, say so — an unnamed payee is a
                reason to stop, not a cosmetic gap. */
             '[name not found]'),
           o.owed, o.oldest, o.n,
           coalesce((select max(id) from ledger.entry), 0), now()
      from owed o
    returning 1
  )
  select count(*)::integer into v_rows from inserted;

  return v_rows;
end;
$$;

-- ═════════════════════════════════════════ 6. and sees it on their statement

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
  and authz.is_host_member(e.party_id);

-- ═══════════════════════════════════════════════════════════════ 7. grants

revoke execute on function
  ledger.fn_payment_cash_account(public.payment),
  ledger.fn_post_featured_paid(uuid),
  ledger.fn_post_stay_paid(uuid),
  ledger.fn_post_stay_refund_due(uuid),
  ledger.fn_post_stay_refunded(uuid),
  public.tg_featured_payment_posts_to_ledger(),
  public.tg_stay_posts_to_ledger()
  from public, anon, authenticated;

-- ═══════════════════════════════════════ 8. payments settled before today

do $$
declare
  r record;
begin
  for r in select id from public.payment
            where intent = 'featured_slot' and state = 'paid' order by paid_at loop
    begin
      perform ledger.fn_post_featured_paid(r.id);
    exception when others then
      raise notice 'Featured payment % not posted: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select p.id from public.payment p
             join public.stay s on s.id = p.stay_id and s.payment_reference = p.reference
            where p.intent = 'stay' and p.state = 'paid' order by p.paid_at loop
    begin
      perform ledger.fn_post_stay_paid(r.id);
      perform ledger.fn_post_stay_refund_due(r.id);
    exception when others then
      raise notice 'Stay payment % not posted: %', r.id, sqlerrm;
    end;
  end loop;
end
$$;
