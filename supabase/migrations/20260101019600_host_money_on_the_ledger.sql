-- Host money, on the ledger.
--
-- Until now a host's figures and Finance's figures came from
-- different places and could not be reconciled, because they
-- were never connected. `host_invoice` and `host_referral` were
-- standalone tables; the Earnings page added them up itself,
-- and the Finance console could not see a host at all. Two
-- numbers derived independently from the same events will
-- eventually disagree, and the first anybody hears of it is a
-- host saying they were charged twice.
--
-- The chart already had `receivable.host` and `payable.host_credit`
-- seeded and nothing had ever posted to them. So:
--
--   * issuing an invoice posts a receivable
--   * paying one clears it
--   * crediting a referral reward posts a payable
--   * `finance_host_v` lets the Finance console see hosts the
--     way it already sees merchants and riders
--   * `host_statement_v` is what the host's Earnings page reads
--
-- Both sides now read the ledger. They cannot drift, because
-- there is only one of them.
--
-- The accounts are per party — `receivable.host:<uuid>` — which
-- means anything matching on `code` rather than `base` compiles,
-- runs, and returns zero. That mistake has been made on this
-- schema before.

-- ══════════════════════════════════════════════ the postings

/**
 * An invoice becomes a receivable.
 *
 * Idempotent on the invoice id: re-running a backfill, or a
 * retried webhook, must not post the same debt twice. The
 * ledger is append-only, so a double post is not something that
 * can be tidied up afterwards — it is corrected by a reversal,
 * which is visible forever.
 */
create or replace function ledger.fn_post_host_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.host_invoice;
  v_city uuid;
begin
  select * into v_inv from public.host_invoice where id = p_invoice_id;
  if not found then
    raise exception 'No such invoice.' using errcode = 'no_data_found';
  end if;
  if coalesce(v_inv.total, 0) <= 0 then
    raise exception 'Nothing to post: that invoice totals zero.' using errcode = '22023';
  end if;

  select city_id into v_city from public.host where id = v_inv.host_id;

  return ledger.post(
    p_kind => 'host_invoice_issued',
    p_idempotency_key => 'host_invoice:' || p_invoice_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'receivable.host', 'party_type', 'host',
        'party_id', v_inv.host_id, 'debit', v_inv.total,
        'memo', 'Invoice ' || to_char(v_inv.period, 'Mon YYYY')),
      jsonb_build_object('account', 'revenue.packages', 'credit', v_inv.total)),
    p_effective_at => v_inv.created_at,
    p_city_id => v_city,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'host_invoice');
end;
$$;

/** Payment clears the receivable. */
create or replace function ledger.fn_post_host_invoice_paid(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.host_invoice;
  v_city uuid;
begin
  select * into v_inv from public.host_invoice where id = p_invoice_id;
  if not found then
    raise exception 'No such invoice.' using errcode = 'no_data_found';
  end if;
  if v_inv.paid_at is null then
    raise exception 'That invoice is not marked paid, so there is nothing to clear.'
      using errcode = '22023';
  end if;

  select city_id into v_city from public.host where id = v_inv.host_id;

  return ledger.post(
    p_kind => 'host_invoice_paid',
    p_idempotency_key => 'host_invoice_paid:' || p_invoice_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'cash.mpesa', 'debit', v_inv.total),
      jsonb_build_object('account', 'receivable.host', 'party_type', 'host',
        'party_id', v_inv.host_id, 'credit', v_inv.total,
        'memo', 'Paid ' || to_char(v_inv.period, 'Mon YYYY'))),
    p_effective_at => v_inv.paid_at,
    p_city_id => v_city,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'host_invoice_paid');
end;
$$;

/**
 * A referral reward becomes money we owe.
 *
 * In whole shillings on the referral row and in cents on the
 * ledger, so it is multiplied here, once. Rider pay made the
 * opposite mistake on this schema — shillings added to cents —
 * and every rider came out a hundred times over their cash cap
 * with a plausible-sounding exclusion each time.
 */
create or replace function ledger.fn_post_host_referral_reward(p_referral_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref public.host_referral;
  v_city uuid;
  v_cents bigint;
begin
  select * into v_ref from public.host_referral where id = p_referral_id;
  if not found then
    raise exception 'No such referral.' using errcode = 'no_data_found';
  end if;
  if coalesce(v_ref.reward_amount_kes, 0) <= 0 then
    raise exception 'That referral has no reward on it yet.' using errcode = '22023';
  end if;

  v_cents := v_ref.reward_amount_kes * 100;
  select city_id into v_city from public.host where id = v_ref.referrer_host_id;

  return ledger.post(
    p_kind => 'host_referral_credited',
    p_idempotency_key => 'host_referral:' || p_referral_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'expense.referral_reward', 'debit', v_cents),
      jsonb_build_object('account', 'payable.host_credit', 'party_type', 'host',
        'party_id', v_ref.referrer_host_id, 'credit', v_cents,
        'memo', 'Referral ' || coalesce(v_ref.code, ''))),
    p_effective_at => coalesce(v_ref.live_at, now()),
    p_city_id => v_city,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'host_referral');
end;
$$;

/* The expense account the reward lands in; the chart is seeded
   in migrations, never at runtime, so it goes in here. */
insert into ledger.account (code, base, name, kind, currency, normal_side)
values
  ('expense.referral_reward', 'expense.referral_reward',
   'Referral rewards', 'expense', 'KES', 'D'),
  ('revenue.packages', 'revenue.packages',
   'Welcome package revenue', 'revenue', 'KES', 'C')
on conflict (code) do nothing;

/**
 * Post on the event, not on a schedule.
 *
 * A nightly job would leave the Finance console a day behind
 * the host's own page, and a host looking at both on the same
 * morning would see two different numbers and be right to.
 */
create or replace function public.tg_host_invoice_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform ledger.fn_post_host_invoice(new.id);
  elsif tg_op = 'UPDATE' and old.paid_at is null and new.paid_at is not null then
    perform ledger.fn_post_host_invoice_paid(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists host_invoice_to_ledger on public.host_invoice;
create trigger host_invoice_to_ledger
  after insert or update of paid_at on public.host_invoice
  for each row execute function public.tg_host_invoice_to_ledger();

create or replace function public.tg_host_referral_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /* Only when it becomes credited, and only once. A reward goes
     pending → credited → paid; posting on every update would
     post it three times. */
  if new.reward_status = 'credited'
     and coalesce(old.reward_status, '') <> 'credited'
     and coalesce(new.reward_amount_kes, 0) > 0
  then
    perform ledger.fn_post_host_referral_reward(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists host_referral_to_ledger on public.host_referral;
create trigger host_referral_to_ledger
  after update of reward_status on public.host_referral
  for each row execute function public.tg_host_referral_to_ledger();

-- ═══════════════════════════════════════════════════ the views

/**
 * What the Finance console reads about a host.
 *
 * Shaped like `finance_merchant_v` and `finance_rider_v` so the
 * console's existing party pages can take a third kind without
 * learning a fourth shape.
 *
 * `a.base`, not `a.code`. The accounts are per party, so a join
 * on `code` matches the template row nobody posts to and
 * returns zero — which reads as a host who owes nothing.
 */
create or replace view finance_host_v
with (security_invoker = true) as
select
  h.id as host_id,
  h.display_name,
  h.city_id,
  h.status::text as status,
  h.tier::text as tier,
  h.billing_method,
  coalesce(owed.cents, 0) as receivable_cents,
  coalesce(credit.cents, 0) as credit_payable_cents,
  /* What we would actually move on payout day: rewards owed to
     them, less invoices they owe us. Netted here rather than on
     a page, so Finance and the host see one answer. */
  coalesce(credit.cents, 0) - coalesce(owed.cents, 0) as net_cents,
  inv.invoices,
  inv.unpaid,
  inv.oldest_unpaid
from public.host h
left join lateral (
  select sum(e.debit - e.credit) as cents
  from ledger.entry e join ledger.account a on a.code = e.account_code
  where a.base = 'receivable.host' and e.party_id = h.id
) owed on true
left join lateral (
  select sum(e.credit - e.debit) as cents
  from ledger.entry e join ledger.account a on a.code = e.account_code
  where a.base = 'payable.host_credit' and e.party_id = h.id
) credit on true
left join lateral (
  select count(*) as invoices,
         count(*) filter (where paid_at is null) as unpaid,
         min(due_at) filter (where paid_at is null) as oldest_unpaid
  from public.host_invoice where host_id = h.id
) inv on true;

/**
 * The host's own statement, from the same entries.
 *
 * Definer, scoped on the host, for the reason the other host
 * views are: a host cannot read `ledger.entry`, and an invoker
 * view would show them an empty statement rather than an error.
 */
create or replace view host_statement_v
with (security_invoker = false) as
select
  e.id,
  e.party_id as host_id,
  e.effective_at,
  a.base,
  case a.base
    when 'receivable.host' then 'invoice'
    when 'payable.host_credit' then 'reward'
    else a.base
  end as line_kind,
  e.memo,
  /* Signed from the host's point of view, which is the opposite
     of ours: a receivable is our asset and their bill. Getting
     this backwards would show a host their debts as earnings. */
  case a.base
    when 'receivable.host' then -(e.debit - e.credit)
    when 'payable.host_credit' then (e.credit - e.debit)
    else 0
  end as amount_cents,
  t.kind as transaction_kind
from ledger.entry e
join ledger.account a on a.code = e.account_code
join ledger.transaction t on t.id = e.transaction_id
where a.base in ('receivable.host', 'payable.host_credit')
  and e.party_id is not null
  and authz.is_host_member(e.party_id);

/**
 * Do the two sides agree?
 *
 * One row per host where the ledger and the source tables
 * disagree. Empty is the only acceptable state, and a test
 * asserts it — the whole point of putting host money on the
 * ledger is lost if nobody ever checks the two match.
 */
create or replace view host_money_reconciliation_v
with (security_invoker = true) as
select
  h.id as host_id,
  h.display_name,
  coalesce(tbl.invoiced, 0) as invoiced_from_table_cents,
  coalesce(led.invoiced, 0) as invoiced_from_ledger_cents,
  coalesce(tbl.rewards, 0) as rewards_from_table_cents,
  coalesce(led.rewards, 0) as rewards_from_ledger_cents,
  coalesce(tbl.invoiced, 0) <> coalesce(led.invoiced, 0)
    or coalesce(tbl.rewards, 0) <> coalesce(led.rewards, 0) as disagrees
from public.host h
left join lateral (
  select
    (select coalesce(sum(total), 0) from public.host_invoice where host_id = h.id) as invoiced,
    (select coalesce(sum(reward_amount_kes), 0) * 100 from public.host_referral
      where referrer_host_id = h.id and reward_status in ('credited', 'paid')) as rewards
) tbl on true
left join lateral (
  select
    (select coalesce(sum(e.debit), 0) from ledger.entry e
       join ledger.account a on a.code = e.account_code
      where a.base = 'receivable.host' and e.party_id = h.id) as invoiced,
    (select coalesce(sum(e.credit), 0) from ledger.entry e
       join ledger.account a on a.code = e.account_code
      where a.base = 'payable.host_credit' and e.party_id = h.id) as rewards
) led on true;

-- ════════════════════════════════════════════════════ backfill

/*
 * Anything already in the tables, posted once.
 *
 * `ledger.post` is idempotent on its key, so this is safe to
 * re-run and safe to leave in the migration — which matters,
 * because a backfill kept in a one-off script is one that never
 * runs on the next environment.
 */
do $$
declare r record;
begin
  for r in select id from public.host_invoice loop
    begin
      perform ledger.fn_post_host_invoice(r.id);
    exception when others then
      raise notice 'Invoice % not posted: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select id from public.host_invoice where paid_at is not null loop
    begin
      perform ledger.fn_post_host_invoice_paid(r.id);
    exception when others then
      raise notice 'Invoice payment % not posted: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select id from public.host_referral
            where reward_status in ('credited', 'paid')
              and coalesce(reward_amount_kes, 0) > 0 loop
    begin
      perform ledger.fn_post_host_referral_reward(r.id);
    exception when others then
      raise notice 'Referral % not posted: %', r.id, sqlerrm;
    end;
  end loop;
end
$$;

grant select on finance_host_v, host_statement_v, host_money_reconciliation_v to authenticated;
revoke all on host_statement_v from anon;
revoke insert, update, delete, truncate on
  finance_host_v, host_statement_v, host_money_reconciliation_v from authenticated;
