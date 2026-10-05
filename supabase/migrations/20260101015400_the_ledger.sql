-- The ledger.
--
-- Everything built in this project so far keeps money on the row
-- it belongs to: a total on the order, a figure on the earning, a
-- net on the statement. That works until two of them have to
-- agree, and then there is no answer to "which one is right" —
-- only two numbers and an argument.
--
-- This is the answer. Every shilling that moves is a pair of
-- entries in a balanced transaction, and nothing else holds a
-- balance. A statement becomes a projection of ledger lines; an
-- order's money state becomes a function of them; the Finance
-- screens stop summing and start reading.
--
-- Four things are enforced rather than intended:
--
--   * A transaction balances or it does not commit. Deferred, so
--     entries can be written in any order inside one statement,
--     and checked before the transaction ends.
--   * Nothing is ever updated or deleted. A mistake is corrected
--     by a reversal that points at what it reverses, so the
--     history of a wrong number survives being made right.
--   * Every external operation carries an idempotency key. A
--     provider that retries, a double-clicked button and a
--     replayed webhook all produce one transaction.
--   * Minor units, everywhere. The rest of this schema has both
--     `_cents` and `_kes` columns, which has already caused one
--     real bug — rider cash in shillings compared against an
--     order in cents, which silently excluded every rider from
--     every cash job. Conversion happens once, at the boundary,
--     in `ledger.from_kes`.

create schema if not exists ledger;

comment on schema ledger is
  'Double-entry. Every shilling that moves is a balanced pair of entries, and nothing outside this schema holds a balance — so two surfaces can disagree about presentation but never about money.';

/*
 * Minor units, with a floor of zero.
 *
 * A negative amount is always a sign that somebody meant a credit
 * and wrote a debit. Direction is carried by which column the
 * amount is in, never by its sign.
 */
create domain ledger.money_minor as bigint
  check (value >= 0);

create type ledger.account_kind as enum
  ('asset', 'liability', 'revenue', 'expense', 'clearing');

create type ledger.party_kind as enum
  ('merchant', 'rider', 'host', 'hotel', 'guest', 'provider', 'nexg');

-- ══════════════════════════════════════ the chart

create table ledger.account (
  code text primary key,
  base text not null,
  name text not null,
  kind ledger.account_kind not null,
  party_type ledger.party_kind,
  party_id uuid,
  currency char(3) not null default 'KES',
  /* Which way a positive balance runs. Assets and expenses rise
     on the debit side; everything else on the credit side. */
  normal_side char(1) not null check (normal_side in ('D', 'C')),
  created_at timestamptz not null default now(),

  /*
   * Two shapes live here. A *template* names the kind of party
   * its instances will belong to and has no id —
   * `cash.rider_on_hand` is the shape of every rider's cash
   * account and the balance of none of them. An *instance* has
   * both, and its code carries the id so two riders can never
   * share one.
   */
  constraint account_instance_names_its_party check (
    party_id is null or party_type is not null),
  constraint account_code_matches_party check (
    party_id is null or code = base || ':' || party_id::text),
  constraint account_template_is_its_own_base check (
    party_id is not null or code = base)
);

create index account_party_idx on ledger.account (party_type, party_id);
create index account_base_idx on ledger.account (base);

comment on column ledger.account.normal_side is
  'Which way a positive balance runs, so a balance can be reported without every reader remembering the sign convention.';

-- ════════════════════════════ transactions and entries

create table ledger.transaction (
  id uuid primary key default gen_random_uuid(),
  kind text not null,

  order_id uuid references public.order (id) on delete restrict,
  city_id uuid references public.city (id) on delete restrict,
  currency char(3) not null default 'KES',

  /* When the economic event happened, and when we heard about it.
     Every view and every cut-off uses the first. */
  effective_at timestamptz not null,
  recorded_at timestamptz not null default now(),

  actor_kind public.actor_type not null,
  actor_id uuid,
  actor_label text,
  reason_code text,
  reason_text text,

  /*
   * One external operation, one transaction. A provider that
   * retries, a double-clicked button and a replayed webhook all
   * collapse onto the same key.
   */
  idempotency_key text not null unique,

  related jsonb not null default '{}'::jsonb,
  audit_event_id uuid,

  /* Nothing is edited. A mistake is reversed by a transaction
     that says what it reverses. */
  reversal_of uuid references ledger.transaction (id),

  created_at timestamptz not null default now()
);

create index transaction_order_idx on ledger.transaction (order_id);
create index transaction_effective_idx on ledger.transaction (effective_at desc);
create index transaction_kind_idx on ledger.transaction (kind, effective_at desc);
create index transaction_city_idx on ledger.transaction (city_id, effective_at desc);
create unique index transaction_one_reversal on ledger.transaction (reversal_of)
  where reversal_of is not null;

create table ledger.entry (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references ledger.transaction (id) on delete restrict,
  account_code text not null references ledger.account (code) on delete restrict,
  debit ledger.money_minor not null default 0,
  credit ledger.money_minor not null default 0,
  memo text,

  /* Denormalised from the transaction so a balance query never
     has to join. It is written by a trigger, not by callers. */
  effective_at timestamptz not null,
  party_type ledger.party_kind,
  party_id uuid,

  constraint entry_is_one_sided check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index entry_account_idx on ledger.entry (account_code, effective_at);
create index entry_transaction_idx on ledger.entry (transaction_id);
create index entry_party_idx on ledger.entry (party_type, party_id, effective_at)
  where party_type is not null;

/*
 * The balance check, twice over.
 *
 * `ledger.assert_balanced` is called at the end of `ledger.post`,
 * where it raises immediately and points at the posting that is
 * wrong. The constraint triggers below are the backstop for
 * anything that writes entries another way — they are deferred,
 * because entries arrive one at a time and a pair is only
 * balanced once both are in.
 *
 * Both are needed. Deferred alone means an unbalanced posting
 * returns successfully and the transaction only dies at COMMIT,
 * a long way from the function that caused it and impossible for
 * a caller to catch. Immediate alone could be sidestepped by
 * inserting entries directly.
 */
create or replace function ledger.assert_balanced(p_transaction_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_debit bigint;
  v_credit bigint;
  v_count integer;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    into v_debit, v_credit, v_count
    from ledger.entry where transaction_id = p_transaction_id;

  if v_count < 2 then
    raise exception 'A ledger transaction needs at least two entries; % has %.',
      p_transaction_id, v_count using errcode = 'check_violation';
  end if;

  if v_debit <> v_credit then
    raise exception 'Ledger transaction % does not balance: debits %, credits %, out by %.',
      p_transaction_id, v_debit, v_credit, abs(v_debit - v_credit)
      using errcode = 'check_violation';
  end if;
end;
$$;

/* One function per table: plpgsql resolves every field reference
   in a statement against the actual record type, so a single
   function reaching for `new.transaction_id` and `new.id` fails
   on whichever table lacks one. */
create or replace function ledger.tg_entry_balances()
returns trigger language plpgsql set search_path = '' as $$
begin perform ledger.assert_balanced(new.transaction_id); return null; end;
$$;

create or replace function ledger.tg_txn_balances()
returns trigger language plpgsql set search_path = '' as $$
begin perform ledger.assert_balanced(new.id); return null; end;
$$;

create constraint trigger entry_balances
  after insert on ledger.entry
  deferrable initially deferred
  for each row execute function ledger.tg_entry_balances();

create constraint trigger transaction_balances
  after insert on ledger.transaction
  deferrable initially deferred
  for each row execute function ledger.tg_txn_balances();

/*
 * Append-only.
 *
 * The reason a ledger is trustworthy is that yesterday's answer
 * is still yesterday's answer. An UPDATE here would make every
 * statement hash meaningless.
 */
create or replace function ledger.tg_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The ledger is append-only: % on %.% is not permitted. Post a reversal instead.',
    tg_op, tg_table_schema, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger transaction_is_append_only
  before update or delete on ledger.transaction
  for each statement execute function ledger.tg_append_only();

create trigger entry_is_append_only
  before update or delete on ledger.entry
  for each statement execute function ledger.tg_append_only();

/* Entries inherit when and whose from their transaction, so a
   balance query never joins and a caller cannot get it wrong. */
create or replace function ledger.tg_entry_inherits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare a ledger.account;
begin
  select * into a from ledger.account where code = new.account_code;
  new.effective_at := (select t.effective_at from ledger.transaction t
                        where t.id = new.transaction_id);
  new.party_type := a.party_type;
  new.party_id := a.party_id;
  return new;
end;
$$;

create trigger entry_inherits
  before insert on ledger.entry
  for each row execute function ledger.tg_entry_inherits();

-- ═══════════════════════════════════ the only way to write

create or replace function ledger.from_kes(p_kes numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$ select round(coalesce(p_kes, 0) * 100)::bigint $$;

comment on function ledger.from_kes is
  'The one conversion. Half this schema counts in shillings and half in cents, and mixing them has already cost a real bug — so it happens here and nowhere else.';

/*
 * Find or make a party account.
 *
 * Accounts are created on demand rather than seeded per party:
 * there is no useful moment to create `payable.merchant:{id}` for
 * a merchant who has never been owed anything, and a chart full
 * of empty accounts hides the ones that matter.
 */
create or replace function ledger.fn_account(
  p_base text,
  p_party_type ledger.party_kind default null,
  p_party_id uuid default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
  v_template ledger.account;
begin
  v_code := case when p_party_id is null then p_base
                 else p_base || ':' || p_party_id::text end;

  if exists (select 1 from ledger.account where code = v_code) then
    return v_code;
  end if;

  select * into v_template from ledger.account where code = p_base and party_id is null;
  if v_template.code is null then
    raise exception 'No such ledger account: %. The chart is seeded in a migration, not at runtime.',
      p_base using errcode = 'no_data_found';
  end if;

  insert into ledger.account (code, base, name, kind, party_type, party_id, currency, normal_side)
  values (v_code, p_base,
          v_template.name || ' · ' || coalesce(p_party_type::text, '') || ' ' || left(p_party_id::text, 8),
          v_template.kind, coalesce(p_party_type, v_template.party_type), p_party_id,
          v_template.currency, v_template.normal_side)
  on conflict (code) do nothing;

  return v_code;
end;
$$;

/*
 * Post a transaction.
 *
 * The single writer. Entries arrive as a jsonb array of
 * `{account, party_type, party_id, debit|credit, memo}`, which
 * keeps the signature stable as the chart grows and means a
 * caller cannot write one leg and forget the other — the balance
 * trigger refuses the whole thing.
 *
 * Returns the transaction id, or the existing one if this
 * idempotency key has been seen. Callers do not have to check:
 * posting twice is safe by construction.
 */
create or replace function ledger.post(
  p_kind text,
  p_idempotency_key text,
  p_entries jsonb,
  p_effective_at timestamptz default now(),
  p_order_id uuid default null,
  p_city_id uuid default null,
  p_actor_kind public.actor_type default 'system',
  p_actor_id uuid default null,
  p_actor_label text default null,
  p_reason_code text default null,
  p_reason_text text default null,
  p_related jsonb default '{}'::jsonb,
  p_reversal_of uuid default null,
  p_currency char(3) default 'KES'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  e jsonb;
  v_code text;
  v_debit bigint;
  v_credit bigint;
begin
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Every ledger transaction needs an idempotency key. Without one a retry is a second payment.'
      using errcode = 'check_violation';
  end if;

  /* Already posted. Hand back the same transaction rather than
     raising: the caller's job is to describe what happened, not
     to know whether it is the first to say so. */
  select id into v_id from ledger.transaction where idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;

  if jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) < 2 then
    raise exception 'A ledger transaction needs at least two entries.'
      using errcode = 'check_violation';
  end if;

  insert into ledger.transaction (
    kind, order_id, city_id, currency, effective_at,
    actor_kind, actor_id, actor_label, reason_code, reason_text,
    idempotency_key, related, reversal_of)
  values (
    p_kind, p_order_id, p_city_id, p_currency, p_effective_at,
    p_actor_kind, p_actor_id, p_actor_label, p_reason_code, p_reason_text,
    p_idempotency_key, coalesce(p_related, '{}'::jsonb), p_reversal_of)
  returning id into v_id;

  for e in select * from jsonb_array_elements(p_entries) loop
    v_code := ledger.fn_account(
      e ->> 'account',
      nullif(e ->> 'party_type', '')::ledger.party_kind,
      nullif(e ->> 'party_id', '')::uuid);

    v_debit := coalesce((e ->> 'debit')::bigint, 0);
    v_credit := coalesce((e ->> 'credit')::bigint, 0);

    /* Zero-value legs are dropped rather than rejected. A fee
       that happens to be nothing this time should not make the
       whole posting fail — but it should not clutter the ledger
       either. */
    if v_debit = 0 and v_credit = 0 then
      continue;
    end if;

    insert into ledger.entry (transaction_id, account_code, debit, credit, memo)
    values (v_id, v_code, v_debit, v_credit, e ->> 'memo');
  end loop;

  /* Here, not at commit. The caller gets an error naming the
     posting that is wrong, while it is still on the stack. */
  perform ledger.assert_balanced(v_id);

  return v_id;
end;
$$;

comment on function ledger.post is
  'The single writer. Idempotent by key, balanced by trigger, append-only by trigger — so a caller can describe what happened and cannot describe it wrongly twice.';

/*
 * Undo, properly.
 *
 * Every entry mirrored, pointing at what it reverses. The
 * original stays exactly as it was, which is the point: the
 * history of a wrong number has to survive being made right.
 */
create or replace function ledger.reverse(
  p_transaction_id uuid,
  p_reason_code text,
  p_reason_text text,
  p_actor_kind public.actor_type default 'staff',
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t ledger.transaction;
  v_entries jsonb;
begin
  select * into t from ledger.transaction where id = p_transaction_id;
  if not found then raise exception 'No such transaction.'; end if;

  /* The request is checked before the world is. A caller who
     forgot the reason should be told that, not told something
     about the transaction's history that they then have to work
     out is beside the point. */
  if coalesce(trim(p_reason_text), '') = '' then
    raise exception 'Say why. A reversal with no reason is the thing an auditor asks about first.';
  end if;
  if exists (select 1 from ledger.transaction where reversal_of = p_transaction_id) then
    raise exception 'That transaction has already been reversed.';
  end if;
  if t.reversal_of is not null then
    raise exception 'That transaction is itself a reversal. Post a new one rather than unwinding an unwinding.';
  end if;

  select jsonb_agg(jsonb_build_object(
           'account', e.account_code,
           'debit', e.credit,
           'credit', e.debit,
           'memo', 'reversal · ' || coalesce(e.memo, '')))
    into v_entries
    from ledger.entry e where e.transaction_id = p_transaction_id;

  return ledger.post(
    p_kind => 'correction',
    p_idempotency_key => 'reversal:' || p_transaction_id::text,
    p_entries => v_entries,
    p_effective_at => now(),
    p_order_id => t.order_id,
    p_city_id => t.city_id,
    p_actor_kind => p_actor_kind,
    p_actor_id => p_actor_id,
    p_reason_code => p_reason_code,
    p_reason_text => p_reason_text,
    p_related => t.related,
    p_reversal_of => p_transaction_id,
    p_currency => t.currency);
end;
$$;

-- ═════════════════════════════════════════ the chart, seeded

insert into ledger.account (code, base, name, kind, party_type, party_id, normal_side) values
  -- Assets
  ('cash.mpesa_paybill', 'cash.mpesa_paybill', 'M-Pesa paybill float', 'asset', 'nexg', null, 'D'),
  ('cash.mpesa_b2c_wallet', 'cash.mpesa_b2c_wallet', 'M-Pesa B2C wallet', 'asset', 'nexg', null, 'D'),
  ('cash.bank', 'cash.bank', 'Bank account', 'asset', 'nexg', null, 'D'),
  ('cash.card_processor_receivable', 'cash.card_processor_receivable', 'Captured, not yet settled by the processor', 'asset', 'provider', null, 'D'),
  ('cash.rider_on_hand', 'cash.rider_on_hand', 'Cash a rider holds for NexG', 'asset', 'rider', null, 'D'),
  ('receivable.hotel', 'receivable.hotel', 'Charge-to-room owed by a hotel', 'asset', 'hotel', null, 'D'),
  ('receivable.host', 'receivable.host', 'Welcome packages invoiced to a host', 'asset', 'host', null, 'D'),
  ('receivable.guest_on_account', 'receivable.guest_on_account', 'Corporate account', 'asset', 'guest', null, 'D'),

  -- Liabilities
  ('payable.merchant', 'payable.merchant', 'Owed to a merchant', 'liability', 'merchant', null, 'C'),
  ('payable.rider', 'payable.rider', 'Owed to a rider', 'liability', 'rider', null, 'C'),
  ('payable.host_credit', 'payable.host_credit', 'Credit owed to a host', 'liability', 'host', null, 'C'),
  ('guest_wallet', 'guest_wallet', 'Credit held for a guest', 'liability', 'guest', null, 'C'),
  ('refunds_pending', 'refunds_pending', 'Approved, not yet executed', 'liability', 'nexg', null, 'C'),
  ('unapplied_receipts', 'unapplied_receipts', 'Provider money with no order yet', 'liability', 'nexg', null, 'C'),
  ('chargeback_reserve', 'chargeback_reserve', 'Held against open disputes', 'liability', 'nexg', null, 'C'),
  ('tax.vat_output', 'tax.vat_output', 'VAT charged on NexG fees', 'liability', 'nexg', null, 'C'),
  ('tax.withholding', 'tax.withholding', 'Withheld, to remit', 'liability', 'nexg', null, 'C'),

  -- Revenue
  ('revenue.commission', 'revenue.commission', 'Merchant commission', 'revenue', 'nexg', null, 'C'),
  ('revenue.service_fee', 'revenue.service_fee', 'Concierge service fee', 'revenue', 'nexg', null, 'C'),
  ('revenue.delivery_fee', 'revenue.delivery_fee', 'Delivery fee charged to the guest', 'revenue', 'nexg', null, 'C'),
  ('revenue.concierge_fee', 'revenue.concierge_fee', 'Concierge flat fee', 'revenue', 'nexg', null, 'C'),
  ('revenue.featured', 'revenue.featured', 'Featured placement', 'revenue', 'nexg', null, 'C'),
  ('revenue.small_basket', 'revenue.small_basket', 'Small basket fee', 'revenue', 'nexg', null, 'C'),
  ('revenue.cash_handling', 'revenue.cash_handling', 'Cash handling fee', 'revenue', 'nexg', null, 'C'),
  ('revenue.packages_margin', 'revenue.packages_margin', 'Welcome packages margin', 'revenue', 'nexg', null, 'C'),
  ('revenue.night_surcharge', 'revenue.night_surcharge', 'Night surcharge', 'revenue', 'nexg', null, 'C'),

  -- Expenses
  ('expense.rider_pay', 'expense.rider_pay', 'Rider pay', 'expense', 'nexg', null, 'D'),
  ('expense.rider_bonus', 'expense.rider_bonus', 'Rider bonuses', 'expense', 'nexg', null, 'D'),
  ('expense.compensation_merchant', 'expense.compensation_merchant', 'Compensation to a merchant', 'expense', 'nexg', null, 'D'),
  ('expense.compensation_rider', 'expense.compensation_rider', 'Compensation to a rider', 'expense', 'nexg', null, 'D'),
  ('expense.goodwill', 'expense.goodwill', 'Goodwill to a guest', 'expense', 'nexg', null, 'D'),
  ('expense.provider_fees', 'expense.provider_fees', 'Provider fees', 'expense', 'nexg', null, 'D'),
  ('expense.chargeback_loss', 'expense.chargeback_loss', 'Chargebacks lost', 'expense', 'nexg', null, 'D'),
  ('expense.write_off', 'expense.write_off', 'Written off', 'expense', 'nexg', null, 'D'),

  -- Clearing
  ('clearing.stk_pending', 'clearing.stk_pending', 'STK pushed, awaiting callback', 'clearing', 'nexg', null, 'D'),
  ('clearing.card_auth', 'clearing.card_auth', 'Authorised, not captured', 'clearing', 'nexg', null, 'D'),
  ('clearing.refund_in_flight', 'clearing.refund_in_flight', 'Refund sent, not confirmed', 'clearing', 'nexg', null, 'D'),
  ('clearing.b2c_in_flight', 'clearing.b2c_in_flight', 'Payout sent, not confirmed', 'clearing', 'nexg', null, 'D')
on conflict (code) do nothing;

-- ══════════════════════════════════════════════ reading it

create or replace view ledger.balance_v as
select
  a.code,
  a.base,
  a.name,
  a.kind,
  a.party_type,
  a.party_id,
  a.currency,
  coalesce(sum(e.debit), 0) as debits,
  coalesce(sum(e.credit), 0) as credits,
  /* Positive means "this account holds what it is supposed to
     hold" regardless of which side that is, so a reader does not
     need the sign convention in their head. */
  case a.normal_side
    when 'D' then coalesce(sum(e.debit), 0) - coalesce(sum(e.credit), 0)
    else coalesce(sum(e.credit), 0) - coalesce(sum(e.debit), 0)
  end as balance,
  max(e.effective_at) as last_movement_at
from ledger.account a
left join ledger.entry e on e.account_code = a.code and e.effective_at <= now()
group by a.code, a.base, a.name, a.kind, a.party_type, a.party_id, a.currency, a.normal_side;

comment on view ledger.balance_v is
  'A balance is a sum of entries, computed here and nowhere else. No table holds one.';

-- ═══════════════════════════════════════════════════ RLS

alter table ledger.account enable row level security;
alter table ledger.transaction enable row level security;
alter table ledger.entry enable row level security;

grant usage on schema ledger to authenticated;
revoke all on all tables in schema ledger from anon, authenticated;
grant select on ledger.account, ledger.transaction, ledger.entry to authenticated;

/*
 * Reading the ledger is a finance grant, not a staff grant. It
 * carries every party's position against every other, which is
 * not something a city lead needs to answer a guest's question.
 */
create or replace function authz.reads_ledger()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin()
      or authz.has_role('finance')
      or authz.has_role('finance_lead')
      or authz.has_role('accountant')
$$;

create policy account_read on ledger.account
  for select to authenticated using (authz.reads_ledger());

create policy transaction_read on ledger.transaction
  for select to authenticated using (authz.reads_ledger());

create policy entry_read on ledger.entry
  for select to authenticated using (authz.reads_ledger());

grant execute on function authz.reads_ledger() to authenticated;
revoke execute on function ledger.post(
  text, text, jsonb, timestamptz, uuid, uuid, public.actor_type, uuid, text, text, text, jsonb, uuid, char)
  from public, anon, authenticated;
revoke execute on function ledger.reverse(uuid, text, text, public.actor_type, uuid)
  from public, anon;
grant execute on function ledger.reverse(uuid, text, text, public.actor_type, uuid) to authenticated;

/*
 * `ledger.post` is callable by nobody directly — not even
 * Finance. Money is posted by the functions that know what
 * happened: a payment settling, a refund issuing, a settlement
 * paying. A console with a "post a journal" button is a console
 * where the ledger stops being derived from events.
 *
 * `ledger.reverse` is the exception, because a correction is
 * itself an event somebody has to be able to cause.
 */
