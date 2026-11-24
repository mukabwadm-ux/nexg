-- Riders' payout modes (payouts slice R2b; owner, 23-24 Nov 2026: "MAKE AN
-- INTERFACE THAT THEY CAN BE CONFIGURED ... THEY SHOULD BE FLEXIBLE"; Paystack
-- "manual ... does daily or immediate and the automated one does any 48 hours
-- and can be made weekly or monthly"; "work on payouts one group at a time
-- end to end").
--
-- Finance chooses per city, on the Payout rules screen, how riders are paid:
--   run        today's Finance payout run, approved by hand (the default:
--              nothing changes until Finance switches a city);
--   immediate  as soon as earnings clear the hold, at most every few hours;
--   daily, weekly (a weekday), monthly (a day 1-28), at a Nairobi hour;
-- with the hold period, who carries Paystack's transfer fee, the fee itself,
-- the largest payout that goes out without Finance, and the day automatic
-- payouts start counting from. Automatic payouts go out of NexG's Paystack
-- balance to the rider's M-Pesa through the transfer engine (20270225000400).
--
-- Safety, in order:
--   * Real money only once payouts.rider.automatic_live is on (a global rule,
--     approved by Finance and Tech, off by default) and Paystack is live. In
--     test mode only riders marked accepts_test_payouts are "paid", with
--     Paystack's test keys, and nothing reaches the ledger.
--   * A city pays automatically only from payouts.rider.automatic_from (a
--     date Finance sets), and never what a payout run already paid this rider.
--   * Every payout claims the exact ledger entries (and rider adjustments) it
--     pays (rider_payout_entry, rider_payout_adjustment). The payout run skips
--     claimed entries and skips riders paid automatically, so nothing is paid
--     by both, whichever way a city switches.
--   * One open payout per rider; a rider is locked while it is decided; an
--     early cash-out and an automatic payout never run at once.
--   * Nothing goes out while the ledger's invariants block outbound money
--     (live), or while a transfer waits on Paystack's OTP.
--   * A payout over the cap waits for Finance; Finance releases or cancels it.
--
-- The money, live mode (test posts nothing):
--   sent     Dr payable.rider (the claimed balance)
--            Dr/Cr expense.rider_bonus (claimed adjustments: bonuses, penalties)
--            Cr cash.rider_on_hand (cash the rider still holds, netted)
--            Cr clearing.b2c_in_flight (what leaves Paystack)
--   success  Dr clearing.b2c_in_flight   Cr cash.card_processor_receivable
--            and, when NexG carries the fee,
--            Dr expense.provider_fees     Cr cash.card_processor_receivable
--   failed   Dr clearing.b2c_in_flight   Cr payable.rider (paid at the next payout)
-- When the rider carries the fee, it comes off what is sent and the whole
-- amount (sent + fee) leaves Paystack, so clearing holds both.
--
-- Changes to existing functions (each copied from its latest body):
--   fn_settlement_owed (20270122000100): skips entries automatic payouts claimed.
--   rpc_settlement_build (20270225000300): skips riders paid automatically.
--   rpc_paystack_transfer_open (20270225000400): Finance releases a held
--     automatic payout ('rider_payout').
--   rpc_paystack_transfer_answered (20270225000400): an unclear answer about a
--     released payout leaves it pending for the worker to check.
--   fn_paystack_transfer_apply (20270225000400): automatic payouts; postings
--     use the amount that left the rider (ledger_cents); a late success after a
--     failure is booked again instead of ignored; OTP never overwrites a result.
--   rpc_rider_payout_overview, rpc_rider_payout_request (20270225000300): the
--     real schedule and payouts; no early cash-out while a payout is open.
--   cron_paystack_sweep (20270222000100): also wakes the worker for riders.

-- ═══════════════════════════════════════════════════════ 1. the rules

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort, constraints)
values
  ('payouts.rider.mode', 'payouts', 'city', 'enum', null,
   'Riders: how they are paid',
   'Payout run: Finance''s weekly run, approved by hand. The others send riders their money automatically through Paystack to M-Pesa.',
   true, false, 'finance+tech', '{finance,riders}', '"run"'::jsonb, 412,
   '{"enum": ["run", "immediate", "daily", "weekly", "monthly"],
     "labels": {"run": "Payout run (Finance approves)", "immediate": "As soon as earnings clear",
                "daily": "Every day", "weekly": "Every week", "monthly": "Every month"}}'::jsonb),
  ('payouts.rider.automatic_from', 'payouts', 'city', 'text', 'YYYY-MM-DD',
   'Riders: pay automatically for work from',
   'Automatic payouts count earnings from this day (Nairobi time), and never what a payout run already paid. Set it to the first day no payout run has paid yet; earlier earnings stay with the payout run. Empty: nothing is paid automatically.',
   true, false, 'finance+tech', '{finance,riders}', null, 413, '{}'::jsonb),
  ('payouts.rider.weekday', 'payouts', 'city', 'enum', null,
   'Riders: payout day (weekly)',
   'The day riders are paid when they are paid every week.',
   true, false, 'finance+tech', '{finance,riders}', '"friday"'::jsonb, 414,
   '{"enum": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]}'::jsonb),
  ('payouts.rider.monthly_day', 'payouts', 'city', 'int', 'day of the month',
   'Riders: payout day (monthly)',
   'The day of the month riders are paid when they are paid every month (1 to 28, so every month has it).',
   true, false, 'finance+tech', '{finance,riders}', '1'::jsonb, 415, '{"min": 1, "max": 28}'::jsonb),
  ('payouts.rider.pay_hour', 'payouts', 'city', 'int', 'hour, Nairobi',
   'Riders: payout time',
   'The hour (0 to 23, Nairobi time) daily, weekly and monthly payouts go out. Keep it before Paystack settles NexG''s balance to the bank, so the money is there.',
   true, false, 'finance+tech', '{finance,riders}', '9'::jsonb, 416, '{"min": 0, "max": 23}'::jsonb),
  ('payouts.rider.hold_hours', 'payouts', 'city', 'int', 'hours',
   'Riders: hold before paying',
   'Earnings younger than this wait for the next payout, so a refused or reversed order can still be put right first.',
   true, false, 'finance+tech', '{finance,riders}', '24'::jsonb, 417, '{"min": 0, "max": 720}'::jsonb),
  ('payouts.rider.immediate_gap_hours', 'payouts', 'city', 'int', 'hours',
   'Riders: least time between payouts (as soon as earnings clear)',
   'With "as soon as earnings clear", a rider is paid at most this often, so one day''s deliveries are not a dozen transfers and a dozen fees.',
   true, false, 'finance+tech', '{finance,riders}', '6'::jsonb, 418, '{"min": 1, "max": 168}'::jsonb),
  ('payouts.rider.fee_paid_by', 'payouts', 'city', 'enum', null,
   'Riders: who pays the transfer fee',
   'NexG: the rider receives the whole amount. Rider: Paystack''s fee comes off what is sent.',
   true, false, 'finance+tech', '{finance,riders}', '"nexg"'::jsonb, 419,
   '{"enum": ["nexg", "rider"], "labels": {"nexg": "NexG", "rider": "The rider"}}'::jsonb),
  ('payouts.rider.transfer_fee_kes', 'payouts', 'city', 'money', 'KES',
   'Riders: Paystack transfer fee',
   'What Paystack charges for one M-Pesa transfer, as NexG''s Paystack pricing says. Needed when riders pay the fee; when NexG pays, it is booked as a provider fee.',
   true, false, 'finance+tech', '{finance,riders}', null, 420, '{"min": 0, "max": 1000}'::jsonb),
  ('payouts.rider.auto_max_kes', 'payouts', 'city', 'money', 'KES',
   'Riders: largest automatic payout',
   'A payout above this waits for Finance to release it. Empty: no limit.',
   true, false, 'finance+tech', '{finance,riders}', '50000'::jsonb, 421, '{"min": 0}'::jsonb),
  ('payouts.rider.automatic_live', 'payouts', 'global', 'bool', null,
   'Riders: automatic payouts send real money',
   'Off: automatic payouts only "pay" test riders with Paystack''s test keys, and every real rider stays on the payout run. On: real riders in cities with an automatic schedule are paid real money once Paystack is live.',
   true, false, 'finance+tech', '{finance,riders}', 'false'::jsonb, 422, '{}'::jsonb)
on conflict (key) do nothing;

/* The Payout rules screen (20270225000300), with the new riders' rules. */
create or replace view public.payout_rules_v
with (security_invoker = true) as
with rule (party, key, sort) as (
  values
    ('rider', 'payouts.rider.mode', 10),
    ('rider', 'payouts.rider.automatic_from', 11),
    ('rider', 'payouts.rider.weekday', 12),
    ('rider', 'payouts.rider.monthly_day', 13),
    ('rider', 'payouts.rider.pay_hour', 14),
    ('rider', 'payouts.rider.hold_hours', 15),
    ('rider', 'payouts.rider.immediate_gap_hours', 16),
    ('rider', 'payouts.rider.minimum_kes', 20),
    ('rider', 'payouts.rider.auto_max_kes', 21),
    ('rider', 'payouts.rider.fee_paid_by', 22),
    ('rider', 'payouts.rider.transfer_fee_kes', 23),
    ('rider', 'payouts.rider.early_cashout', 30),
    ('rider', 'payments.rider_early_payout_min_kes', 31),
    ('rider', 'payouts.rider.automatic_live', 40)
)
select
  rule.party,
  rule.sort,
  d.key,
  d."group",
  d.scope_kind::text as scope_kind,
  d.value_type::text as value_type,
  d.unit,
  d.label,
  d.help,
  d.constraints,
  c.id as city_id,
  c.name as city_name,
  settings.fn_get(d.key, d.scope_kind, c.id) -> 'value' as value
from rule
join settings.definition d on d.key = rule.key and d.deprecated_at is null
left join public.city c on d.scope_kind = 'city';

grant select on public.payout_rules_v to authenticated;

-- ═══════════════════════════════════════════ 2. riders' payout details

/*
 * Who may change where a rider's money goes. A changed payout number is
 * dated whatever wrote it, so automatic payouts and early cash-out wait 24
 * hours after any change (not only the verified one, 20270115000500), and
 * the change is audited. Only Finance marks a rider as a test rider, since
 * test riders are "paid" with test money instead of their real earnings.
 */
create or replace function public.tg_rider_payout_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payout_msisdn is distinct from old.payout_msisdn then
    new.payout_msisdn_changed_at := now();
    new.payout_name_lookup := null;
    perform audit.log(
      p_actor_type => case when authz.staff_id() is not null then 'staff'::public.actor_type
                           else 'system'::public.actor_type end,
      p_module => 'riders', p_action => 'rider.payout_number_changed',
      p_actor_id => authz.staff_id(), p_target_type => 'rider', p_target_id => new.id,
      p_city_id => new.city_id, p_severity => 'notice',
      p_after => jsonb_build_object('changed_at', now()));
  end if;
  if new.accepts_test_payouts is distinct from old.accepts_test_payouts
     and coalesce(current_setting('role', true), '') in ('authenticated', 'anon')
     and not (authz.has_full_finance() or authz.is_super_admin()) then
    raise exception 'Only Finance marks a rider as a test rider.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_rider_payout_details() from public, anon, authenticated;

drop trigger if exists rider_payout_details on public.rider;
create trigger rider_payout_details
  before update of payout_msisdn, accepts_test_payouts on public.rider
  for each row execute function public.tg_rider_payout_details();

-- ═══════════════════════════════════════════════════════ 3. the tables

create table public.rider_payout (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete restrict,
  city_id uuid references public.city (id) on delete set null,
  mode text not null check (mode in ('immediate', 'daily', 'weekly', 'monthly')),
  slot_at timestamptz not null,
  cutoff_at timestamptz not null,
  is_test boolean not null,
  /* What the payout claimed: ledger balance and adjustments (cents). */
  ledger_claimed_cents bigint not null default 0,
  adjustments_cents bigint not null default 0,
  gross_cents bigint not null,
  /* Decided when it is sent. */
  cash_netted_cents bigint not null default 0 check (cash_netted_cents >= 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  fee_paid_by text not null default 'nexg' check (fee_paid_by in ('nexg', 'rider')),
  net_cents bigint not null default 0 check (net_cents >= 0),
  state text not null check (state in ('held', 'sending', 'paid', 'failed', 'cancelled', 'rolled')),
  hold_reason text,
  destination text,
  transfer_reference text,
  failure_reason text,
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  paid_at timestamptz,
  adjustment_id uuid references public.rider_adjustment (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rider_payout is
  'A rider paid automatically (Payout rules: immediate, daily, weekly, monthly). It claims the exact entries it pays; paid only on Paystack''s word.';

/* One open payout per rider: with "as soon as earnings clear" every slot is
   new, so this is what stops two sweeps paying twice. */
create unique index rider_payout_one_open on public.rider_payout (rider_id)
  where state in ('held', 'sending');
create index rider_payout_by_rider on public.rider_payout (rider_id, created_at desc);
create index rider_payout_by_state on public.rider_payout (state, created_at desc);

alter table public.rider_payout enable row level security;
revoke all on public.rider_payout from public, anon, authenticated;

/* Which ledger entries a payout paid. Test claims are their own namespace:
   test money never uses up a real balance. */
create table public.rider_payout_entry (
  entry_id bigint not null,
  is_test boolean not null,
  payout_id uuid not null references public.rider_payout (id) on delete cascade,
  primary key (entry_id, is_test)
);
create index rider_payout_entry_by_payout on public.rider_payout_entry (payout_id);
alter table public.rider_payout_entry enable row level security;
revoke all on public.rider_payout_entry from public, anon, authenticated;

/* Rider adjustments (bonuses, penalties, early payouts recorded by hand)
   are not ledger entries; a payout claims those it pays the same way. */
create table public.rider_payout_adjustment (
  adjustment_id uuid not null references public.rider_adjustment (id) on delete cascade,
  is_test boolean not null,
  payout_id uuid not null references public.rider_payout (id) on delete cascade,
  primary key (adjustment_id, is_test)
);
create index rider_payout_adjustment_by_payout on public.rider_payout_adjustment (payout_id);
alter table public.rider_payout_adjustment enable row level security;
revoke all on public.rider_payout_adjustment from public, anon, authenticated;

/* The transfer engine learns two amounts: what left the rider's balance
   (ledger_cents, sent + the rider's fee) and Paystack's fee. */
alter table public.paystack_transfer drop constraint if exists paystack_transfer_kind_check;
alter table public.paystack_transfer
  add constraint paystack_transfer_kind_check check (kind in ('rider_early', 'rider_payout')),
  add column if not exists ledger_cents bigint check (ledger_cents is null or ledger_cents > 0),
  add column if not exists fee_cents bigint not null default 0 check (fee_cents >= 0),
  add column if not exists fee_paid_by text check (fee_paid_by is null or fee_paid_by in ('nexg', 'rider'));

create or replace view public.paystack_transfer_v
with (security_invoker = false) as
  select t.id, t.reference, t.kind, t.party_type, t.party_id, t.source_id, t.amount_cents,
         t.is_test, t.destination, t.state, t.failure_reason, t.transfer_code,
         t.created_at, t.updated_at, t.completed_at,
         coalesce(t.ledger_cents, t.amount_cents) as ledger_cents, t.fee_cents, t.fee_paid_by
    from public.paystack_transfer t
   where authz.finance_reads();
revoke all on public.paystack_transfer_v from public, anon;
grant select on public.paystack_transfer_v to authenticated;

/* What Finance sees of automatic payouts. */
create view public.rider_payout_v
with (security_invoker = false) as
  select p.id, p.rider_id,
         nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '') as rider_name,
         p.city_id, p.mode, p.slot_at, p.cutoff_at, p.is_test, p.gross_cents, p.cash_netted_cents,
         p.fee_cents, p.fee_paid_by, p.net_cents, p.state, p.hold_reason, p.destination,
         p.transfer_reference, p.failure_reason, p.decided_at, p.paid_at, p.created_at,
         t.state as transfer_state
    from public.rider_payout p
    join public.rider r on r.id = p.rider_id
    left join public.paystack_transfer t on t.reference = p.transfer_reference
   where authz.finance_reads();
revoke all on public.rider_payout_v from public, anon;
grant select on public.rider_payout_v to authenticated;

/* When the payments worker last ran on live Paystack keys. Real riders are
   paid automatically only while it does, so they never leave the payout run
   while the worker still holds test keys. */
create table public.rider_payout_worker (
  id boolean primary key default true check (id),
  live_seen_at timestamptz
);
alter table public.rider_payout_worker enable row level security;
revoke all on public.rider_payout_worker from public, anon, authenticated;

-- ═══════════════════════════════════════════════ 4. the rules, read

/* The city's rules in one place, as a payout is decided. */
create function public.fn_rider_payout_rules(p_city_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mode', coalesce(nullif(settings.fn_text('payouts.rider.mode', p_city_id), ''), 'run'),
    'automaticFrom', nullif(settings.fn_text('payouts.rider.automatic_from', p_city_id), ''),
    'weekday', coalesce(nullif(settings.fn_text('payouts.rider.weekday', p_city_id), ''), 'friday'),
    'monthlyDay', least(greatest(coalesce(round(settings.fn_num('payouts.rider.monthly_day', p_city_id)), 1), 1), 28),
    'payHour', least(greatest(coalesce(round(settings.fn_num('payouts.rider.pay_hour', p_city_id)), 9), 0), 23),
    'holdHours', least(greatest(coalesce(round(settings.fn_num('payouts.rider.hold_hours', p_city_id)), 24), 0), 720),
    'gapHours', least(greatest(coalesce(round(settings.fn_num('payouts.rider.immediate_gap_hours', p_city_id)), 6), 1), 168),
    'feePaidBy', coalesce(nullif(settings.fn_text('payouts.rider.fee_paid_by', p_city_id), ''), 'nexg'),
    'feeKes', settings.fn_num('payouts.rider.transfer_fee_kes', p_city_id),
    'maxKes', settings.fn_num('payouts.rider.auto_max_kes', p_city_id),
    'minimumKes', coalesce(settings.fn_num('payouts.rider.minimum_kes', p_city_id),
                           settings.fn_num('settlement.minimum_payout', p_city_id), 100),
    'live', coalesce(settings.fn_bool('payouts.rider.automatic_live'), false))
$$;
revoke execute on function public.fn_rider_payout_rules(uuid) from public, anon, authenticated;

/* The day automatic payouts count from, as a time, or null when unset or unreadable. */
create function public.fn_rider_payout_from(p_rules jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(p_rules->>'automaticFrom', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return ((p_rules->>'automaticFrom')::date)::timestamp at time zone 'Africa/Nairobi';
exception when others then
  return null;
end;
$$;
revoke execute on function public.fn_rider_payout_from(jsonb) from public, anon, authenticated;

/*
 * How this rider is paid: 'run' or the city's automatic mode. Automatic only
 * when the city has a mode and a start day, and either the rider is a test
 * rider (test money only) or Finance has switched real money on. Everyone
 * else stays on the payout run, so no rider falls between the two.
 */
create function public.fn_rider_payout_mode(p_rider_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_rules jsonb;
begin
  select * into r from public.rider where id = p_rider_id;
  if r.id is null or r.status <> 'active' or r.offboarded_at is not null then
    /* Suspended or leaving: the payout run holds their pay where Finance sees it. */
    return 'run';
  end if;
  v_rules := public.fn_rider_payout_rules(r.city_id);
  if v_rules->>'mode' not in ('immediate', 'daily', 'weekly', 'monthly')
     or public.fn_rider_payout_from(v_rules) is null then
    return 'run';
  end if;
  if r.accepts_test_payouts then
    return v_rules->>'mode';
  end if;
  if (v_rules->>'live')::boolean
     and exists (select 1 from public.rider_payout_worker w
                  where w.live_seen_at > now() - interval '1 day') then
    return v_rules->>'mode';
  end if;
  return 'run';
end;
$$;
revoke execute on function public.fn_rider_payout_mode(uuid) from public, anon, authenticated;

/* The latest payout time at or before p_at (Nairobi), for daily, weekly, monthly. */
create function public.fn_rider_payout_slot(p_rules jsonb, p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_at at time zone 'Africa/Nairobi';
  v_hour interval := make_interval(hours => (p_rules->>'payHour')::int);
  v_day int := (p_rules->>'monthlyDay')::int;
  v_dow int := array_position(array['monday', 'tuesday', 'wednesday', 'thursday', 'friday',
                                    'saturday', 'sunday'], p_rules->>'weekday');
  v_slot timestamp;
begin
  if p_rules->>'mode' = 'daily' then
    v_slot := date_trunc('day', v_local) + v_hour;
    if v_slot > v_local then v_slot := v_slot - interval '1 day'; end if;
  elsif p_rules->>'mode' = 'weekly' then
    v_slot := date_trunc('day', v_local)
              - make_interval(days => ((extract(isodow from v_local)::int - coalesce(v_dow, 5) + 7) % 7))
              + v_hour;
    if v_slot > v_local then v_slot := v_slot - interval '7 days'; end if;
  elsif p_rules->>'mode' = 'monthly' then
    v_slot := date_trunc('month', v_local) + make_interval(days => v_day - 1) + v_hour;
    if v_slot > v_local then
      v_slot := date_trunc('month', v_local - interval '1 month') + make_interval(days => v_day - 1) + v_hour;
    end if;
  else
    return null;
  end if;
  return v_slot at time zone 'Africa/Nairobi';
end;
$$;
revoke execute on function public.fn_rider_payout_slot(jsonb, timestamptz) from public, anon, authenticated;

/* The next payout time after p_at, for the rider's page. */
create function public.fn_rider_payout_next(p_rules jsonb, p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_slot timestamptz := public.fn_rider_payout_slot(p_rules, p_at);
begin
  if v_slot is null then return null; end if;
  return case p_rules->>'mode'
    when 'daily' then v_slot + interval '1 day'
    when 'weekly' then v_slot + interval '7 days'
    /* Monthly: this month's payout if it is still to come, else next month's. */
    else (select case when this_month > p_at then this_month else
            public.fn_rider_payout_slot(p_rules,
              ((date_trunc('month', p_at at time zone 'Africa/Nairobi') + interval '1 month'
                + interval '27 days 23 hours 59 minutes') at time zone 'Africa/Nairobi')) end
            from (select public.fn_rider_payout_slot(p_rules,
                    ((date_trunc('month', p_at at time zone 'Africa/Nairobi')
                      + interval '27 days 23 hours 59 minutes') at time zone 'Africa/Nairobi')) as this_month) m)
  end;
end;
$$;
revoke execute on function public.fn_rider_payout_next(jsonb, timestamptz) from public, anon, authenticated;

/*
 * Where automatic payouts start for this rider: the city's start day, or the
 * end of the last old-style rider run that paid them (those paid outside the
 * ledger), whichever is later. Finance's payout run claims its entries, so
 * nothing it paid is paid again either way; entries before this day stay
 * with the payout run.
 */
create function public.fn_rider_payout_boundary(p_rider_id uuid, p_rules jsonb)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    public.fn_rider_payout_from(p_rules),
    (select max(((run.period_end + 1)::timestamp) at time zone 'Africa/Nairobi')
       from public.rider_settlement_line l
       join public.rider_settlement_run run on run.id = l.run_id
      where l.rider_id = p_rider_id and run.status in ('approved', 'sent', 'reconciled')))
$$;
revoke execute on function public.fn_rider_payout_boundary(uuid, jsonb) from public, anon, authenticated;

/*
 * What an automatic payout would pay this rider: every unclaimed entry on
 * their payable account since the boundary (credits only once they are
 * older than the hold, by when they were recorded too, since some are
 * dated back; debits at once), and every unclaimed rider adjustment since
 * then, except the automatic payouts' own and the early payouts Paystack
 * paid live (those are ledger debits already). Nothing a payout run claimed.
 */
create function public.fn_rider_payout_candidates(
  p_rider_id uuid, p_boundary timestamptz, p_cutoff timestamptz, p_is_test boolean)
returns table (entry_id bigint, adjustment_id uuid, cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, null::uuid, (e.credit - e.debit)::bigint
    from ledger.entry e
    join ledger.transaction t on t.id = e.transaction_id
   where e.account_code = 'payable.rider:' || p_rider_id::text
     and p_boundary is not null
     and e.effective_at >= p_boundary
     and (e.debit > 0 or greatest(e.effective_at, t.recorded_at) <= p_cutoff)
     and not exists (select 1 from public.fin_settled_entry s where s.entry_id = e.id)
     and not exists (select 1 from public.rider_payout_entry c
                      where c.entry_id = e.id and (c.is_test = p_is_test or not c.is_test))
  union all
  select null::bigint, a.id, ledger.from_kes(a.amount_kes)
    from public.rider_adjustment a
   where a.rider_id = p_rider_id
     and p_boundary is not null
     and a.created_at >= p_boundary
     and (a.amount_kes < 0 or a.created_at <= p_cutoff)
     and a.kind <> 'scheduled_payout'
     and not exists (
       select 1 from public.rider_payout_request q
         join public.paystack_transfer x on x.kind = 'rider_early' and x.source_id = q.id
        where q.adjustment_id = a.id and x.state = 'success' and x.sent_txn is not null)
     and not exists (select 1 from public.rider_payout_adjustment c
                      where c.adjustment_id = a.id and (c.is_test = p_is_test or not c.is_test))
$$;
revoke execute on function public.fn_rider_payout_candidates(uuid, timestamptz, timestamptz, boolean)
  from public, anon, authenticated;

/* What this rider could be paid now, before cash and fees (cents). */
create function public.fn_rider_payout_owed(p_rider_id uuid, p_cutoff timestamptz default now())
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.rider;
begin
  select * into r from public.rider where id = p_rider_id;
  if r.id is null then return 0; end if;
  return coalesce((select sum(c.cents) from public.fn_rider_payout_candidates(
    r.id, public.fn_rider_payout_boundary(r.id, public.fn_rider_payout_rules(r.city_id)),
    p_cutoff, r.accepts_test_payouts) c), 0);
end;
$$;
revoke execute on function public.fn_rider_payout_owed(uuid, timestamptz) from public, anon, authenticated;

/* A payout no longer paying gives back what it claimed. */
create function public.fn_rider_payout_unclaim(p_payout_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rider_payout_entry where payout_id = p_payout_id;
  delete from public.rider_payout_adjustment where payout_id = p_payout_id;
$$;
revoke execute on function public.fn_rider_payout_unclaim(uuid) from public, anon, authenticated, service_role;

-- ═════════════════════════════════════════════════ 5. sending a payout

/*
 * Opens the Paystack transfer for a payout that has claimed what it pays
 * (state held or sending), nets the cash the rider holds and the fee, and
 * in live mode posts the money as sent. Answers what the worker or the
 * console sends to Paystack, or a refusal with a reason.
 */
create function public.fn_rider_payout_send(
  p_payout_id uuid, p_mode text, p_staff uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.rider_payout;
  r public.rider;
  x public.paystack_transfer;
  v_cash bigint;
  v_fee bigint;
  v_leaving bigint;
  v_sent bigint;
  v_ref text;
  v_txn uuid;
  v_name text;
  v_recipient text;
  v_dest text;
  v_entries jsonb;
begin
  select * into p from public.rider_payout where id = p_payout_id for update;
  select * into r from public.rider where id = p.rider_id;
  if p.id is null or p.state not in ('held', 'sending') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  if p.is_test <> (p_mode = 'test') then
    return jsonb_build_object('ok', false, 'reason', 'mode_mismatch');
  end if;

  select * into x from public.paystack_transfer
   where kind = 'rider_payout' and source_id = p.id and state not in ('failed', 'reversed');
  if x.id is not null then
    return jsonb_build_object('ok', true, 'reused', true, 'sent', x.state <> 'opened',
      'reference', x.reference, 'state', x.state, 'amount_cents', x.amount_cents,
      'destination', x.destination, 'name', x.account_name, 'test', x.is_test,
      'recipient_code', x.recipient_code, 'payout_id', p.id);
  end if;

  v_dest := public.fn_kenyan_msisdn(r.payout_msisdn);
  if v_dest is null then
    return jsonb_build_object('ok', false, 'reason', 'no_payout_phone');
  end if;
  if r.payout_msisdn_changed_at is not null and r.payout_msisdn_changed_at > now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'reason', 'payout_phone_recent');
  end if;

  /* Cash the rider still holds comes off (it is NexG's). */
  if p.is_test then
    v_cash := 0;
  else
    select coalesce(balance, 0) into v_cash from ledger.balance_v
     where code = 'cash.rider_on_hand:' || r.id::text;
    v_cash := least(greatest(coalesce(v_cash, 0), 0), greatest(p.gross_cents, 0));
  end if;
  v_leaving := p.gross_cents - v_cash;
  v_fee := coalesce(ledger.from_kes((p_rules->>'feeKes')::numeric), 0);
  if p_rules->>'feePaidBy' = 'rider' and (p_rules->>'feeKes') is null then
    return jsonb_build_object('ok', false, 'reason', 'fee_not_set');
  end if;
  v_sent := v_leaving - case when p_rules->>'feePaidBy' = 'rider' then v_fee else 0 end;
  if v_sent < 100 then
    return jsonb_build_object('ok', false, 'reason', 'too_little');
  end if;

  v_name := coalesce(nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
                     'NexG rider');
  select recipient_code into v_recipient from public.paystack_recipient
   where party_type = 'rider' and party_id = r.id and is_test = p.is_test and destination = v_dest;
  v_ref := 'NXT-' || replace(gen_random_uuid()::text, '-', '');

  if not p.is_test then
    v_entries := jsonb_build_array(
      case when p.ledger_claimed_cents >= 0
           then jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', r.id,
                                   'debit', p.ledger_claimed_cents, 'memo', v_ref)
           else jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', r.id,
                                   'credit', -p.ledger_claimed_cents, 'memo', v_ref) end,
      case when p.adjustments_cents >= 0
           then jsonb_build_object('account', 'expense.rider_bonus', 'debit', p.adjustments_cents,
                                   'memo', v_ref || ' adjustments')
           else jsonb_build_object('account', 'expense.rider_bonus', 'credit', -p.adjustments_cents,
                                   'memo', v_ref || ' adjustments') end,
      jsonb_build_object('account', 'cash.rider_on_hand', 'party_type', 'rider', 'party_id', r.id,
                         'credit', v_cash, 'memo', v_ref || ' cash netted'),
      jsonb_build_object('account', 'clearing.b2c_in_flight', 'credit', v_leaving, 'memo', v_ref));
    v_txn := ledger.post(
      p_kind => 'payout_sent',
      p_idempotency_key => 'payout_sent:' || v_ref,
      p_entries => v_entries,
      p_city_id => r.city_id,
      p_actor_kind => case when p_staff is null then 'system'::public.actor_type else 'staff'::public.actor_type end,
      p_actor_id => p_staff,
      p_actor_label => case when p_staff is null then '[System] · Rider payouts' end,
      p_reason_text => 'Rider payout through Paystack');
    /* The send's own debit is part of what this payout settled. */
    insert into public.rider_payout_entry (entry_id, is_test, payout_id)
    select e.id, false, p.id from ledger.entry e
     where e.transaction_id = v_txn and e.account_code = 'payable.rider:' || r.id::text
    on conflict do nothing;
  end if;

  insert into public.paystack_transfer (reference, kind, party_type, party_id, source_id, amount_cents,
    is_test, destination, account_name, recipient_code, sent_txn, created_by,
    ledger_cents, fee_cents, fee_paid_by)
  values (v_ref, 'rider_payout', 'rider', r.id, p.id, v_sent, p.is_test, v_dest, v_name, v_recipient,
    v_txn, p_staff, v_leaving, v_fee, p_rules->>'feePaidBy')
  returning * into x;

  update public.rider_payout
     set state = 'sending', hold_reason = null, cash_netted_cents = v_cash, fee_cents = v_fee,
         fee_paid_by = p_rules->>'feePaidBy', net_cents = v_sent, destination = v_dest,
         transfer_reference = v_ref, failure_reason = null,
         decided_by = coalesce(p_staff, decided_by),
         decided_at = case when p_staff is not null then now() else decided_at end,
         updated_at = now()
   where id = p.id;

  perform audit.log(
    p_actor_type => case when p_staff is null then 'system'::public.actor_type else 'staff'::public.actor_type end,
    p_module => 'finance', p_action => 'payout.rider_payout_sent',
    p_actor_id => p_staff,
    p_actor_label => case when p_staff is null then '[System] · Rider payouts' end,
    p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id,
    p_after => jsonb_build_object('reference', v_ref, 'payout_id', p.id, 'gross_cents', p.gross_cents,
      'cash_netted_cents', v_cash, 'fee_cents', v_fee, 'sent_cents', v_sent, 'test', p.is_test));

  return jsonb_build_object('ok', true, 'reused', false, 'sent', false, 'reference', v_ref,
    'state', 'opened', 'amount_cents', v_sent, 'destination', v_dest, 'name', v_name,
    'test', p.is_test, 'recipient_code', v_recipient, 'payout_id', p.id);
end;
$$;
revoke execute on function public.fn_rider_payout_send(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════ 6. the worker asks what is due

/*
 * Called by the payments worker (the database's Paystack sweep, every two
 * minutes), with a Paystack secret key as proof, as rpc_payment_paystack_due.
 * Decides, rider by rider, who is due a payout now and opens it: claims what
 * it pays, holds it for Finance above the cap, rolls it under the minimum.
 * Also answers transfers to send again (a worker that stopped half way) or
 * to check with Paystack. Test keys only ever "pay" test riders.
 */
create function public.rpc_rider_payouts_due(p_proof text, p_limit integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := authz.paystack_mode(p_proof);
  v_test boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 20);
  v_items jsonb := '[]'::jsonb;
  v_held integer := 0;
  v_rolled integer := 0;
  v_skipped integer := 0;
  v_live_on boolean := coalesce(settings.fn_bool('payouts.rider.automatic_live'), false);
  r public.rider;
  x public.paystack_transfer;
  v_rules jsonb;
  v_slot timestamptz;
  v_cutoff timestamptz;
  v_boundary timestamptz;
  v_payout uuid;
  v_ledger bigint;
  v_adj bigint;
  v_gross bigint;
  v_cash bigint;
  v_open jsonb;
begin
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  v_test := v_mode = 'test';
  if not v_test then
    insert into public.rider_payout_worker (id, live_seen_at) values (true, now())
    on conflict (id) do update set live_seen_at = excluded.live_seen_at;
  end if;

  /* Nothing new while a transfer waits on Paystack's OTP (switch it off in
     the Paystack dashboard), or, with real money, while the ledger's checks
     stop money leaving. */
  if exists (select 1 from public.paystack_transfer
              where kind = 'rider_payout' and state = 'otp' and is_test = v_test
                and updated_at > now() - interval '30 minutes') then
    return jsonb_build_object('ok', true, 'paused', 'otp', 'items', '[]'::jsonb);
  end if;
  if not v_test and coalesce((public.fn_outbound_blocked()->>'blocked')::boolean, false) then
    return jsonb_build_object('ok', true, 'paused', 'outbound_blocked', 'items', '[]'::jsonb);
  end if;

  /* Transfers opened but not answered (the worker stopped half way), or
     pending a long time: send again under the same reference, or check. */
  for x in
    select t.* from public.paystack_transfer t
     where t.kind = 'rider_payout' and t.is_test = v_test
       and ((t.state = 'opened' and t.updated_at < now() - interval '5 minutes')
         or (t.state in ('pending', 'otp') and t.updated_at < now() - interval '30 minutes'))
     order by t.updated_at
     limit v_limit
     for update skip locked
  loop
    update public.paystack_transfer set updated_at = now() where id = x.id;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'reference', x.reference, 'amount_cents', x.amount_cents, 'destination', x.destination,
      'name', x.account_name, 'recipient_code', x.recipient_code, 'test', x.is_test,
      'resume', true, 'state', x.state));
  end loop;

  for r in
    select rd.* from public.rider rd
     where rd.status = 'active' and rd.offboarded_at is null
       and rd.accepts_test_payouts = v_test
       and (v_test or v_live_on)
       and coalesce(nullif(settings.fn_text('payouts.rider.mode', rd.city_id), ''), 'run') <> 'run'
       and not exists (select 1 from public.rider_payout o
                        where o.rider_id = rd.id and o.state in ('held', 'sending'))
     order by rd.id
  loop
    exit when jsonb_array_length(v_items) >= v_limit;
    begin
      v_rules := public.fn_rider_payout_rules(r.city_id);
      continue when public.fn_rider_payout_mode(r.id) = 'run';
      /* Only the rider being decided is locked, and one another sweep holds is left to it. */
      perform 1 from public.rider where id = r.id for update skip locked;
      continue when not found;
      continue when exists (select 1 from public.rider_payout o
                             where o.rider_id = r.id and o.state in ('held', 'sending'));
      v_boundary := public.fn_rider_payout_boundary(r.id, v_rules);
      continue when v_boundary is null;

      /* An early cash-out waiting: it goes first. */
      continue when exists (select 1 from public.rider_payout_request q
                             where q.rider_id = r.id and q.status in ('pending', 'approved'));
      /* A failed payout is tried again after six hours, not every sweep. */
      continue when exists (select 1 from public.rider_payout f
                             where f.rider_id = r.id and f.state = 'failed'
                               and f.updated_at > now() - interval '6 hours');
      /* No number, or a number changed in the last day: wait. */
      if public.fn_kenyan_msisdn(r.payout_msisdn) is null
         or (r.payout_msisdn_changed_at is not null and r.payout_msisdn_changed_at > now() - interval '24 hours') then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_rules->>'mode' = 'immediate' then
        continue when exists (select 1 from public.rider_payout o
                               where o.rider_id = r.id and o.state <> 'failed'
                                 and o.created_at > now() - make_interval(hours => (v_rules->>'gapHours')::int));
        v_slot := now();
        v_cutoff := now() - make_interval(hours => (v_rules->>'holdHours')::int);
      else
        v_slot := public.fn_rider_payout_slot(v_rules, now());
        continue when v_slot is null;
        /* The slot is done once any payout (not a failed one) was decided in it,
           so a rule changed mid-day never makes a second payout. */
        continue when exists (select 1 from public.rider_payout o
                               where o.rider_id = r.id and o.state <> 'failed' and o.created_at >= v_slot);
        v_cutoff := v_slot - make_interval(hours => (v_rules->>'holdHours')::int);
      end if;

      select coalesce(sum(c.cents) filter (where c.entry_id is not null), 0),
             coalesce(sum(c.cents) filter (where c.adjustment_id is not null), 0)
        into v_ledger, v_adj
        from public.fn_rider_payout_candidates(r.id, v_boundary, v_cutoff, v_test) c;
      v_gross := v_ledger + v_adj;

      /* Cash the rider holds counts against the minimum and the cap. */
      v_cash := 0;
      if not v_test then
        select greatest(coalesce(balance, 0), 0) into v_cash from ledger.balance_v
         where code = 'cash.rider_on_hand:' || r.id::text;
        v_cash := coalesce(v_cash, 0);
      end if;

      if v_gross - v_cash < ledger.from_kes((v_rules->>'minimumKes')::numeric) then
        if v_rules->>'mode' <> 'immediate' and v_gross > 0 then
          insert into public.rider_payout (rider_id, city_id, mode, slot_at, cutoff_at, is_test,
            ledger_claimed_cents, adjustments_cents, gross_cents, state, hold_reason, fee_paid_by)
          values (r.id, r.city_id, v_rules->>'mode', v_slot, v_cutoff, v_test, v_ledger, v_adj, v_gross,
            'rolled', 'under the minimum payout · carried to the next payout', v_rules->>'feePaidBy')
          returning id into v_payout;
          v_rolled := v_rolled + 1;
          perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'finance',
            p_action => 'payout.rider_payout_rolled', p_actor_label => '[System] · Rider payouts',
            p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id,
            p_after => jsonb_build_object('payout_id', v_payout, 'gross_cents', v_gross, 'test', v_test));
        end if;
        continue;
      end if;

      insert into public.rider_payout (rider_id, city_id, mode, slot_at, cutoff_at, is_test,
        ledger_claimed_cents, adjustments_cents, gross_cents, state, fee_paid_by)
      values (r.id, r.city_id, v_rules->>'mode', v_slot, v_cutoff, v_test, v_ledger, v_adj, v_gross,
        'held', v_rules->>'feePaidBy')
      returning id into v_payout;

      /* Claim exactly what was counted; a claim another payout made first
         wins, and then this one is put back. */
      insert into public.rider_payout_entry (entry_id, is_test, payout_id)
      select c.entry_id, v_test, v_payout
        from public.fn_rider_payout_candidates(r.id, v_boundary, v_cutoff, v_test) c
       where c.entry_id is not null;
      insert into public.rider_payout_adjustment (adjustment_id, is_test, payout_id)
      select c.adjustment_id, v_test, v_payout
        from public.fn_rider_payout_candidates(r.id, v_boundary, v_cutoff, v_test) c
       where c.adjustment_id is not null;
      if (select coalesce(sum(e.credit - e.debit), 0) from public.rider_payout_entry pe
            join ledger.entry e on e.id = pe.entry_id where pe.payout_id = v_payout) <> v_ledger
         or (select coalesce(sum(ledger.from_kes(a.amount_kes)), 0) from public.rider_payout_adjustment pa
               join public.rider_adjustment a on a.id = pa.adjustment_id where pa.payout_id = v_payout) <> v_adj then
        raise exception 'claimed amount moved';
      end if;

      if (v_rules->>'maxKes') is not null
         and v_gross - v_cash > ledger.from_kes((v_rules->>'maxKes')::numeric) then
        update public.rider_payout
           set hold_reason = 'over the largest automatic payout · Finance releases it'
         where id = v_payout;
        v_held := v_held + 1;
        perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'finance',
          p_action => 'payout.rider_payout_held', p_actor_label => '[System] · Rider payouts',
          p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id, p_severity => 'notice',
          p_after => jsonb_build_object('payout_id', v_payout, 'gross_cents', v_gross, 'test', v_test));
        continue;
      end if;

      v_open := public.fn_rider_payout_send(v_payout, v_mode, null, v_rules);
      if not coalesce((v_open->>'ok')::boolean, false) then
        update public.rider_payout
           set hold_reason = case v_open->>'reason'
                 when 'fee_not_set' then 'the riders'' transfer fee is not set · Finance releases it'
                 when 'too_little' then 'too little left after the fee · Finance releases or cancels it'
                 else coalesce(v_open->>'reason', 'could not be sent') end,
               updated_at = now()
         where id = v_payout;
        v_held := v_held + 1;
        perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'finance',
          p_action => 'payout.rider_payout_held', p_actor_label => '[System] · Rider payouts',
          p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id, p_severity => 'notice',
          p_after => jsonb_build_object('payout_id', v_payout, 'reason', v_open->>'reason', 'test', v_test));
        continue;
      end if;
      v_items := v_items || jsonb_build_array(v_open);
    exception when others then
      /* One rider's trouble never stops the others; it is recorded. */
      perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'finance',
        p_action => 'payout.rider_payout_error', p_actor_label => '[System] · Rider payouts',
        p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id, p_severity => 'high',
        p_reason => left(sqlerrm, 300));
    end;
  end loop;

  return jsonb_build_object('ok', true, 'mode', v_mode, 'items', v_items,
    'held', v_held, 'rolled', v_rolled, 'waiting_phone', v_skipped);
end;
$$;
revoke execute on function public.rpc_rider_payouts_due(text, integer) from public;
grant execute on function public.rpc_rider_payouts_due(text, integer) to anon, authenticated;

/*
 * The worker records Paystack's answers for automatic payouts: 'recipient',
 * 'transfer' or 'verify' (GET /transfer/verify). p_refused: Paystack answered
 * with a 4xx. Only a clear refusal fails a transfer that was never sent; an
 * error, a timeout or an unreadable answer leaves it pending for a check,
 * since the money may have gone.
 */
create function public.rpc_paystack_transfer_answered_worker(
  p_reference text, p_step text, p_answer text, p_refused boolean, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := authz.paystack_mode(p_proof);
  v_body jsonb;
  v_data jsonb;
  x public.paystack_transfer;
  v_code text;
  v_result jsonb;
begin
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  select * into x from public.paystack_transfer where reference = p_reference and kind = 'rider_payout';
  if not found then
    raise exception 'No such payout.' using errcode = '22023';
  end if;
  if x.is_test <> (v_mode = 'test') then
    raise exception 'That payout was opened in the other Paystack mode.' using errcode = '22023';
  end if;
  begin
    v_body := p_answer::jsonb;
  exception when others then
    v_body := null;
  end;
  v_data := v_body->'data';

  if p_step = 'recipient' then
    v_code := v_data->>'recipient_code';
    if (v_body->>'status') is distinct from 'true' or coalesce(v_code, '') !~ '^RCP_[A-Za-z0-9]{4,60}$' then
      if coalesce(p_refused, false) and x.state = 'opened' then
        v_result := public.fn_paystack_transfer_apply(v_mode,
          jsonb_build_object('reference', x.reference, 'status', 'failed',
            'reason', coalesce(nullif(v_body->>'message', ''), 'Paystack did not accept the M-Pesa number.')),
          'worker');
      else
        v_result := jsonb_build_object('ok', false, 'reason', 'no_answer');
      end if;
    else
      insert into public.paystack_recipient (party_type, party_id, is_test, destination, recipient_code)
      values (x.party_type, x.party_id, x.is_test, x.destination, v_code)
      on conflict (party_type, party_id, is_test, destination)
        do update set recipient_code = excluded.recipient_code;
      update public.paystack_transfer set recipient_code = v_code, updated_at = now() where id = x.id;
      v_result := jsonb_build_object('ok', true, 'recipient_code', v_code);
    end if;
  elsif p_step in ('transfer', 'verify') then
    if (v_body->>'status') = 'true' and jsonb_typeof(v_data) = 'object' then
      v_result := public.fn_paystack_transfer_apply(v_mode,
        v_data || jsonb_build_object('reference', x.reference), 'worker');
    elsif p_step = 'verify' then
      /* Paystack has no such transfer: it was never sent, so it may be sent now. */
      if coalesce(p_refused, false) and x.state in ('opened', 'pending') then
        update public.paystack_transfer set state = 'opened', updated_at = now() where id = x.id;
        v_result := jsonb_build_object('ok', true, 'state', 'opened', 'send', true);
      else
        v_result := jsonb_build_object('ok', true, 'state', x.state, 'send', false);
      end if;
    elsif coalesce(v_body->>'message', '') ~* 'duplicate|already' then
      update public.paystack_transfer set state = 'pending', updated_at = now()
       where id = x.id and state = 'opened';
      v_result := jsonb_build_object('ok', true, 'state', 'pending', 'duplicate_reference', true);
    elsif coalesce(p_refused, false) and x.state = 'opened' then
      v_result := public.fn_paystack_transfer_apply(v_mode,
        jsonb_build_object('reference', x.reference, 'status', 'failed',
          'reason', coalesce(nullif(v_body->>'message', ''), 'Paystack refused the transfer.')),
        'worker');
    else
      update public.paystack_transfer set state = 'pending', updated_at = now()
       where id = x.id and state = 'opened';
      v_result := jsonb_build_object('ok', true, 'state', 'pending', 'check', true);
    end if;
  else
    raise exception 'Step is recipient, transfer or verify.' using errcode = '22023';
  end if;

  perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'finance',
    p_action => 'payout.paystack_transfer_answered', p_actor_label => '[System] · Rider payouts',
    p_target_type => 'rider', p_target_id => x.party_id, p_severity => 'info',
    p_after => jsonb_build_object('reference', x.reference, 'step', p_step,
      'refused', coalesce(p_refused, false), 'result', v_result));
  return v_result;
end;
$$;
revoke execute on function public.rpc_paystack_transfer_answered_worker(text, text, text, boolean, text) from public;
grant execute on function public.rpc_paystack_transfer_answered_worker(text, text, text, boolean, text)
  to anon, authenticated;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_rider_payouts_due',
   'The payments worker has no application session; it runs on the database''s Paystack sweep.',
   'Refused unless p_proof is a Paystack secret key held in Vault (authz.paystack_mode); the mode comes from the key, and test keys only reach riders marked accepts_test_payouts.'),
  ('rpc_paystack_transfer_answered_worker',
   'The payments worker has no application session; it records Paystack''s answers for automatic rider payouts.',
   'Refused unless p_proof is a Paystack secret key held in Vault; only rider_payout transfers of the same mode; a payout is paid only on Paystack''s own transfer answer.')
on conflict (function_name) do update set reason = excluded.reason, guarded_by = excluded.guarded_by;

-- ═══════════════════════════════════════════ 7. Finance: release or cancel

/* As 20270225000400, and Finance releases a held automatic payout ('rider_payout'). */
create or replace function public.rpc_paystack_transfer_open(p_kind text, p_source uuid, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_mode text := authz.paystack_mode(p_proof);
  q public.rider_payout_request;
  r public.rider;
  x public.paystack_transfer;
  p public.rider_payout;
  v_name text;
  v_recipient text;
  v_ref text;
  v_txn uuid;
  v_open jsonb;
begin
  if v_staff is null or not authz.has_full_finance() then
    raise exception 'Only finance can send payouts.' using errcode = '42501';
  end if;
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  if p_kind is distinct from 'rider_early' and p_kind is distinct from 'rider_payout' then
    raise exception 'Pay a rider''s early payout request or a held payout.' using errcode = '22023';
  end if;

  if p_kind = 'rider_payout' then
    select * into p from public.rider_payout where id = p_source;
    if p.id is null then
      raise exception 'No such payout.' using errcode = '22023';
    end if;
    perform 1 from public.rider where id = p.rider_id for update;
    select * into p from public.rider_payout where id = p_source for update;
    if p.state not in ('held', 'sending') then
      raise exception 'That payout is not waiting to be paid.' using errcode = '22023';
    end if;
    if (v_mode = 'test') <> p.is_test then
      raise exception 'Paystack is in test mode, which pays nobody: only a test rider can be paid with it.'
        using errcode = '22023', hint = 'test_mode_real_rider';
    end if;
    v_open := public.fn_rider_payout_send(p.id, v_mode, v_staff,
      public.fn_rider_payout_rules((select rd.city_id from public.rider rd where rd.id = p.rider_id)));
    if not coalesce((v_open->>'ok')::boolean, false) then
      raise exception '%', case v_open->>'reason'
        when 'no_payout_phone' then 'The rider has no M-Pesa number to pay.'
        when 'payout_phone_recent' then 'The rider''s M-Pesa number changed less than a day ago.'
        when 'fee_not_set' then 'Riders pay the transfer fee, but the fee is not set on Payout rules.'
        when 'too_little' then 'Too little is left to send after the fee. Cancel it; it is paid with the next payout.'
        else 'That payout cannot be sent now.' end
        using errcode = '22023';
    end if;
    return v_open;
  end if;

  select * into x from public.paystack_transfer
   where kind = p_kind and source_id = p_source and state not in ('failed', 'reversed');
  if x.id is not null then
    return jsonb_build_object('ok', true, 'reused', true, 'sent', x.state <> 'opened',
      'reference', x.reference, 'state', x.state, 'amount_cents', x.amount_cents,
      'destination', x.destination, 'name', x.account_name, 'test', x.is_test,
      'recipient_code', x.recipient_code);
  end if;

  select * into q from public.rider_payout_request where id = p_source for update;
  if not found or q.status <> 'approved' then
    raise exception 'That request is not approved and waiting to be paid.' using errcode = '22023';
  end if;
  /* Pressed twice at once: the second waits here and then answers the first's transfer. */
  select * into x from public.paystack_transfer
   where kind = p_kind and source_id = p_source and state not in ('failed', 'reversed');
  if x.id is not null then
    return jsonb_build_object('ok', true, 'reused', true, 'sent', x.state <> 'opened',
      'reference', x.reference, 'state', x.state, 'amount_cents', x.amount_cents,
      'destination', x.destination, 'name', x.account_name, 'test', x.is_test,
      'recipient_code', x.recipient_code);
  end if;
  select * into r from public.rider where id = q.rider_id;
  if v_mode = 'test' and not r.accepts_test_payouts then
    raise exception 'Paystack is in test mode, which pays nobody: only a test rider can be paid with it. Pay this rider by M-Pesa and record it, or switch Paystack to live.'
      using errcode = '22023', hint = 'test_mode_real_rider';
  end if;
  if public.fn_kenyan_msisdn(q.payout_msisdn) is null then
    raise exception 'The payout number on the request is not a Kenyan M-Pesa number.' using errcode = '22023';
  end if;

  v_name := coalesce(nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
                     'NexG rider');
  select recipient_code into v_recipient from public.paystack_recipient
   where party_type = 'rider' and party_id = r.id and is_test = (v_mode = 'test')
     and destination = public.fn_kenyan_msisdn(q.payout_msisdn);

  v_ref := 'NXT-' || replace(gen_random_uuid()::text, '-', '');

  /* Live money leaves the rider's balance as it is sent, so no run pays it again. */
  if v_mode = 'live' then
    v_txn := ledger.post(
      p_kind => 'payout_sent',
      p_idempotency_key => 'payout_sent:' || v_ref,
      p_entries => jsonb_build_array(
        jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', r.id,
          'debit', ledger.from_kes(q.amount_kes), 'memo', v_ref),
        jsonb_build_object('account', 'clearing.b2c_in_flight', 'credit', ledger.from_kes(q.amount_kes),
          'memo', v_ref)),
      p_city_id => r.city_id,
      p_actor_kind => 'staff',
      p_actor_id => v_staff,
      p_reason_text => 'Early payout through Paystack');
  end if;

  insert into public.paystack_transfer (reference, kind, party_type, party_id, source_id, amount_cents,
    is_test, destination, account_name, recipient_code, sent_txn, created_by)
  values (v_ref, p_kind, 'rider', r.id, q.id, ledger.from_kes(q.amount_kes), v_mode = 'test',
    public.fn_kenyan_msisdn(q.payout_msisdn), v_name, v_recipient, v_txn, v_staff)
  returning * into x;

  perform audit.log('staff'::public.actor_type, 'finance', 'payout.paystack_transfer_opened',
    p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id,
    p_after => jsonb_build_object('reference', v_ref, 'amount_kes', q.amount_kes,
      'request_id', q.id, 'test', v_mode = 'test'));

  return jsonb_build_object('ok', true, 'reused', false, 'sent', false, 'reference', v_ref,
    'state', 'opened', 'amount_cents', x.amount_cents, 'destination', x.destination,
    'name', v_name, 'test', x.is_test, 'recipient_code', v_recipient);
end;
$$;
revoke execute on function public.rpc_paystack_transfer_open(text, uuid, text) from public, anon;
grant execute on function public.rpc_paystack_transfer_open(text, uuid, text) to authenticated;

/*
 * As 20270225000400. For a rider's payout Finance released, an answer from
 * Paystack that is not a transfer leaves it pending instead of failing it:
 * the money may have gone, and the next sweep checks with Paystack. (The
 * console cannot tell a refusal from an error; the worker can.)
 */
create or replace function public.rpc_paystack_transfer_answered(
  p_reference text, p_step text, p_answer text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := authz.paystack_mode(p_proof);
  v_body jsonb;
  v_data jsonb;
  x public.paystack_transfer;
  v_code text;
begin
  if authz.staff_id() is null or not authz.has_full_finance() then
    raise exception 'Only finance can send payouts.' using errcode = '42501';
  end if;
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  select * into x from public.paystack_transfer where reference = p_reference;
  if not found then
    raise exception 'No such payout.' using errcode = '22023';
  end if;
  if x.is_test <> (v_mode = 'test') then
    raise exception 'That payout was opened in the other Paystack mode.' using errcode = '22023';
  end if;
  begin
    v_body := p_answer::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end;
  v_data := v_body->'data';

  if p_step = 'recipient' then
    v_code := v_data->>'recipient_code';
    if (v_body->>'status') is distinct from 'true' or v_code !~ '^RCP_[A-Za-z0-9]{4,60}$' then
      return public.fn_paystack_transfer_apply(v_mode,
        jsonb_build_object('reference', x.reference, 'status', 'failed',
          'reason', coalesce(nullif(v_body->>'message', ''), 'Paystack did not accept the M-Pesa number.')),
        'console');
    end if;
    insert into public.paystack_recipient (party_type, party_id, is_test, destination, recipient_code)
    values (x.party_type, x.party_id, x.is_test, x.destination, v_code)
    on conflict (party_type, party_id, is_test, destination)
      do update set recipient_code = excluded.recipient_code;
    update public.paystack_transfer set recipient_code = v_code, updated_at = now() where id = x.id;
    return jsonb_build_object('ok', true, 'recipient_code', v_code);
  elsif p_step = 'transfer' then
    if (v_body->>'status') is distinct from 'true' or jsonb_typeof(v_data) is distinct from 'object' then
      /* Sent again after an answer that never arrived: the first one may have
         gone through. Not a failure; Paystack's signed word settles it. */
      if coalesce(v_body->>'message', '') ~* 'duplicate|already' or x.kind = 'rider_payout' then
        update public.paystack_transfer set state = 'pending', updated_at = now()
         where id = x.id and state = 'opened';
        return jsonb_build_object('ok', true, 'state', 'pending', 'duplicate_reference', true);
      end if;
      return public.fn_paystack_transfer_apply(v_mode,
        jsonb_build_object('reference', x.reference, 'status', 'failed',
          'reason', coalesce(nullif(v_body->>'message', ''), 'Paystack refused the transfer.')),
        'console');
    end if;
    -- Paystack's transfer names our reference; make sure it is this one.
    return public.fn_paystack_transfer_apply(v_mode, v_data || jsonb_build_object('reference', x.reference),
      'console');
  end if;
  raise exception 'Step is recipient or transfer.' using errcode = '22023';
end;
$$;
revoke execute on function public.rpc_paystack_transfer_answered(text, text, text, text) from public, anon;
grant execute on function public.rpc_paystack_transfer_answered(text, text, text, text) to authenticated;

/* Finance cancels a held payout: what it claimed is free again for the next payout. */
create function public.rpc_finance_rider_payout_cancel(p_payout_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  p public.rider_payout;
begin
  if v_staff is null or not authz.has_full_finance() then
    raise exception 'Only finance can cancel payouts.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why.' using errcode = 'check_violation';
  end if;
  select * into p from public.rider_payout where id = p_payout_id for update;
  if p.id is null or p.state <> 'held' then
    raise exception 'Only a payout waiting for Finance can be cancelled.' using errcode = '22023';
  end if;
  perform public.fn_rider_payout_unclaim(p.id);
  update public.rider_payout
     set state = 'cancelled', hold_reason = left(trim(p_note), 300), decided_by = v_staff,
         decided_at = now(), updated_at = now()
   where id = p.id;
  perform audit.log('staff'::public.actor_type, 'finance', 'payout.rider_payout_cancelled',
    p_actor_id => v_staff, p_target_type => 'rider', p_target_id => p.rider_id, p_city_id => p.city_id,
    p_reason => left(trim(p_note), 300),
    p_after => jsonb_build_object('payout_id', p.id, 'gross_cents', p.gross_cents));
  return jsonb_build_object('ok', true, 'state', 'cancelled');
end;
$$;
revoke execute on function public.rpc_finance_rider_payout_cancel(uuid, text) from public, anon;
grant execute on function public.rpc_finance_rider_payout_cancel(uuid, text) to authenticated;

-- ═══════════════════════════════════════ 8. what Paystack says, applied once

/* As 20270225000400, with automatic payouts, two amounts, late successes, and OTP guarded. */
create or replace function public.fn_paystack_transfer_apply(p_mode text, p_data jsonb, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.paystack_transfer;
  q public.rider_payout_request;
  p public.rider_payout;
  v_status text := lower(coalesce(p_data->>'status', ''));
  v_ref text := nullif(p_data->>'reference', '');
  v_code text := nullif(p_data->>'transfer_code', '');
  v_adj uuid;
  v_amount bigint;
  v_late boolean := false;
begin
  if v_ref is not null then
    select * into x from public.paystack_transfer where reference = v_ref for update;
  elsif v_code is not null then
    select * into x from public.paystack_transfer where transfer_code = v_code for update;
  end if;
  if x.id is null then
    /* Not one NexG opened (one sent by hand from the dashboard): nothing to change. */
    return jsonb_build_object('ok', true, 'ignored', true, 'reason', 'unknown_transfer');
  end if;
  if x.is_test <> (p_mode = 'test') then
    return jsonb_build_object('ok', false, 'reason', 'mode_mismatch');
  end if;
  if x.state in ('success', 'failed', 'reversed') and v_status = x.state then
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', x.state);
  end if;
  /* What left the rider's balance (sent + the rider's fee). */
  v_amount := coalesce(x.ledger_cents, x.amount_cents);

  if x.state = 'failed' and v_status = 'success' then
    /* Marked failed on an answer that was not Paystack's last word, then paid:
       the money did go, so it leaves the rider's balance again. */
    v_late := true;
  elsif x.state in ('failed', 'reversed') then
    /* Finished and given back; a late message changes nothing. */
    return jsonb_build_object('ok', true, 'ignored', true, 'state', x.state);
  end if;
  if v_status = 'success' and jsonb_typeof(p_data->'amount') = 'number'
     and (p_data->>'amount')::numeric <> x.amount_cents then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  if v_status in ('pending', 'received', 'processing', 'queued') then
    update public.paystack_transfer
       set state = 'pending', transfer_code = coalesce(transfer_code, v_code), updated_at = now()
     where id = x.id and state in ('opened', 'otp');
    return jsonb_build_object('ok', true, 'state', 'pending');
  elsif v_status = 'otp' then
    update public.paystack_transfer
       set state = 'otp', transfer_code = coalesce(transfer_code, v_code), updated_at = now()
     where id = x.id and state in ('opened', 'pending');
    return jsonb_build_object('ok', true, 'state', 'otp');
  elsif v_status = 'success' then
    if x.state = 'success' then
      return jsonb_build_object('ok', true, 'duplicate', true, 'state', 'success');
    end if;
    update public.paystack_transfer
       set state = 'success', transfer_code = coalesce(transfer_code, v_code),
           failure_reason = case when v_late then null else failure_reason end,
           completed_at = now(), updated_at = now()
     where id = x.id;

    if not x.is_test then
      if v_late and x.sent_txn is not null then
        perform ledger.post(
          p_kind => 'payout_sent',
          p_idempotency_key => 'payout_resent:' || x.reference,
          p_entries => jsonb_build_array(
            jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', x.party_id,
              'debit', v_amount, 'memo', x.reference),
            jsonb_build_object('account', 'clearing.b2c_in_flight', 'credit', v_amount, 'memo', x.reference)),
          p_actor_label => '[System] · Paystack',
          p_reason_text => 'Paystack paid a transfer recorded as failed');
      end if;
      perform ledger.post(
        p_kind => 'payout_paid',
        p_idempotency_key => case when v_late then 'payout_paid_late:' else 'payout_paid:' end || x.reference,
        p_entries => jsonb_build_array(
          jsonb_build_object('account', 'clearing.b2c_in_flight', 'debit', v_amount, 'memo', x.reference),
          jsonb_build_object('account', 'cash.card_processor_receivable', 'credit', v_amount,
            'memo', x.reference)),
        p_actor_label => '[System] · Paystack',
        p_reason_text => 'Paystack transfer succeeded');
      if x.fee_cents > 0 and x.fee_paid_by = 'nexg' then
        perform ledger.post(
          p_kind => 'payout_fee',
          p_idempotency_key => case when v_late then 'payout_fee_late:' else 'payout_fee:' end || x.reference,
          p_entries => jsonb_build_array(
            jsonb_build_object('account', 'expense.provider_fees', 'debit', x.fee_cents, 'memo', x.reference),
            jsonb_build_object('account', 'cash.card_processor_receivable', 'credit', x.fee_cents,
              'memo', x.reference)),
          p_actor_label => '[System] · Paystack',
          p_reason_text => 'Paystack transfer fee');
      end if;
    end if;

    if x.kind = 'rider_early' then
      select * into q from public.rider_payout_request where id = x.source_id for update;
      if q.status = 'approved' then
        /* As a payment Finance records by hand (20270115000500): the weekly run
           of the old rider tables takes it off through the adjustment. */
        insert into public.rider_adjustment (rider_id, kind, amount_kes, reason, created_by, approved_by)
        values (q.rider_id, 'early_payout', -q.amount_kes,
                'Early payout ' || coalesce(v_code, x.reference) || ' (Paystack)',
                x.created_by, q.decided_by)
        returning id into v_adj;
        update public.rider_payout_request
           set status = 'paid', paid_at = now(), provider_ref = left(coalesce(v_code, x.reference), 64),
               adjustment_id = v_adj
         where id = q.id;
      end if;
    elsif x.kind = 'rider_payout' then
      select * into p from public.rider_payout where id = x.source_id for update;
      if p.state in ('sending', 'failed') then
        /* So the rider's "available" figure (fn_rider_unpaid) counts it as paid;
           test money is not real pay and changes nothing there. */
        v_adj := null;
        if not x.is_test then
          insert into public.rider_adjustment (rider_id, kind, amount_kes, reason, created_by)
          values (p.rider_id, 'scheduled_payout', -ceil((p.gross_cents - p.cash_netted_cents) / 100.0)::bigint,
                  'Payout ' || coalesce(v_code, x.reference) || ' (Paystack)', x.created_by)
          returning id into v_adj;
        end if;
        update public.rider_payout
           set state = 'paid', paid_at = now(), failure_reason = null, adjustment_id = v_adj,
               updated_at = now()
         where id = p.id;
      end if;
    end if;

    perform audit.log('system'::public.actor_type, 'finance',
      case when v_late then 'payout.paystack_transfer_late_success' else 'payout.paystack_transfer_paid' end,
      p_actor_label => '[System] · Paystack', p_target_type => 'rider', p_target_id => x.party_id,
      p_severity => case when v_late then 'high'::public.audit_severity end,
      p_after => jsonb_build_object('reference', x.reference, 'amount_cents', x.amount_cents,
        'test', x.is_test, 'source', p_source));
    return jsonb_build_object('ok', true, 'state', 'success');
  elsif v_status in ('failed', 'reversed', 'abandoned', 'rejected') then
    update public.paystack_transfer
       set state = case when v_status = 'reversed' then 'reversed' else 'failed' end,
           transfer_code = coalesce(transfer_code, v_code),
           failure_reason = left(coalesce(nullif(p_data->>'reason', ''), nullif(p_data->>'gateway_response', ''),
                                          nullif(p_data->>'message', ''), v_status), 300),
           completed_at = now(), updated_at = now()
     where id = x.id;

    /* The money is the rider's again: undo what was taken off when it was sent,
       and after a reversal also what was settled from the Paystack balance. */
    if not x.is_test then
      if x.state = 'success' then
        perform ledger.post(
          p_kind => 'payout_reversed',
          p_idempotency_key => 'payout_reversed:' || x.reference,
          p_entries => jsonb_build_array(
            jsonb_build_object('account', 'cash.card_processor_receivable', 'debit', v_amount,
              'memo', x.reference),
            jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', x.party_id,
              'credit', v_amount, 'memo', x.reference)),
          p_actor_label => '[System] · Paystack',
          p_reason_text => 'Paystack transfer reversed');
      elsif x.sent_txn is not null then
        perform ledger.post(
          p_kind => 'payout_returned',
          p_idempotency_key => 'payout_returned:' || x.reference,
          p_entries => jsonb_build_array(
            jsonb_build_object('account', 'clearing.b2c_in_flight', 'debit', v_amount, 'memo', x.reference),
            jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', x.party_id,
              'credit', v_amount, 'memo', x.reference)),
          p_actor_label => '[System] · Paystack',
          p_reason_text => 'Paystack transfer failed');
      end if;
    end if;

    if x.kind = 'rider_early' then
      select * into q from public.rider_payout_request where id = x.source_id for update;
      if q.status = 'paid' and v_status = 'reversed' then
        /* The rider was told it was paid; it came back. Back to Finance. */
        delete from public.rider_adjustment where id = q.adjustment_id;
        update public.rider_payout_request
           set status = 'approved', paid_at = null, provider_ref = null, adjustment_id = null
         where id = q.id;
      end if;
    elsif x.kind = 'rider_payout' then
      select * into p from public.rider_payout where id = x.source_id for update;
      if p.state in ('sending', 'paid') then
        if p.adjustment_id is not null then
          delete from public.rider_adjustment where id = p.adjustment_id;
        end if;
        /* Live, the money came back to the rider's balance as a new entry, paid
           at the next payout. Test money claimed nothing real: let it go. */
        if x.is_test then
          perform public.fn_rider_payout_unclaim(p.id);
        end if;
        update public.rider_payout
           set state = 'failed', paid_at = null, adjustment_id = null,
               failure_reason = left(coalesce(nullif(p_data->>'reason', ''), nullif(p_data->>'gateway_response', ''),
                                              nullif(p_data->>'message', ''), v_status), 300),
               updated_at = now()
         where id = p.id;
      end if;
    end if;

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'finance',
      p_action => 'payout.paystack_transfer_failed', p_actor_label => '[System] · Paystack',
      p_target_type => 'rider', p_target_id => x.party_id, p_severity => 'high',
      p_reason => 'Paystack could not complete this payout.',
      p_after => jsonb_build_object('reference', x.reference, 'status', v_status, 'source', p_source));
    return jsonb_build_object('ok', true, 'state', case when v_status = 'reversed' then 'reversed' else 'failed' end);
  end if;

  return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
end;
$$;
revoke execute on function public.fn_paystack_transfer_apply(text, jsonb, text)
  from public, anon, authenticated, service_role;

-- ═══════════════════════════════ 9. the payout run leaves them alone

/* As 20270122000100, and entries automatic payouts claimed are not owed again. */
create or replace function public.fn_settlement_owed(
  p_period_start timestamptz, p_period_end timestamptz, p_city_id uuid default null
)
returns table (
  party_type ledger.party_kind,
  party_id uuid,
  gross_cents bigint,
  commission_cents bigint,
  entry_ids bigint[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.party_type,
    e.party_id,
    coalesce(sum(e.credit), 0) - coalesce(sum(e.debit), 0) as gross_cents,
    /* Commission is not on the party's account — it is the
       revenue line of the same transaction, so it is shown for
       context rather than subtracted twice. */
    coalesce((
      select sum(ce.credit) from ledger.entry ce
       where ce.transaction_id in (select t2.id from ledger.entry e2
                                     join ledger.transaction t2 on t2.id = e2.transaction_id
                                    where e2.id = any (array_agg(e.id)))
         and ce.account_code = 'revenue.commission'), 0) as commission_cents,
    array_agg(e.id) as entry_ids
  from ledger.entry e
  join ledger.transaction t on t.id = e.transaction_id
  /* What a stay owes its host is not a payable.* account; see
     20270117000100. It is paid in the run with the host's rewards. */
  where (e.account_code like 'payable.%' or e.account_code like 'stay.host\_share:%')
    and e.effective_at >= p_period_start
    and e.effective_at < p_period_end
    and (p_city_id is null or t.city_id = p_city_id)
    and not exists (select 1 from public.fin_settled_entry s where s.entry_id = e.id)
    and not exists (select 1 from public.rider_payout_entry c where c.entry_id = e.id and not c.is_test)
  group by e.party_type, e.party_id
  having coalesce(sum(e.credit), 0) - coalesce(sum(e.debit), 0) <> 0
$$;
revoke execute on function public.fn_settlement_owed(timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_settlement_owed(timestamptz, timestamptz, uuid) to service_role;

-- As 20270225000300, and riders paid automatically are not in the run.
CREATE OR REPLACE FUNCTION public.rpc_settlement_build(p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_city_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := authz.staff_id();
  v_start timestamptz;
  v_end timestamptz;
  v_run uuid;
  r public.fin_settlement_run;
  owed record;
  v_line uuid;
  v_cash bigint;
  v_net bigint;
  v_state public.settlement_line_state;
  v_hold text;
  v_minimum bigint;
  v_party_min bigint;
  v_label text;
  v_rail public.settlement_rail;
  v_dest text;
  v_partner_status public.partner_status;
  v_payout public.experience_partner_payout;
  v_host_status public.host_status;
  v_host_payout public.host_payout;
  v_lines integer := 0;
  v_held integer := 0;
  v_boundary timestamptz;
  v_sub_gross bigint;
  v_sub_ids bigint[];
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()) then
    raise exception 'Building a run is Finance''s.' using errcode = '42501';
  end if;

  /* Monday 00:00 to Sunday 23:59 of the week just finished. */
  v_start := coalesce(p_period_start,
    date_trunc('week', (now() at time zone 'Africa/Nairobi') - interval '7 days')
      at time zone 'Africa/Nairobi');
  v_end := coalesce(p_period_end, v_start + interval '7 days');

  select * into r from public.fin_settlement_run
   where period_start = v_start and period_end = v_end and state <> 'cancelled';

  if r.id is not null then
    if r.state not in ('draft', 'built') then
      raise exception 'That week is already %. A run is frozen once it has been checked.', r.state;
    end if;
    /* A rebuild is a full rebuild: lines released, then
       reselected. A partial one would leave yesterday's answer
       mixed with today's. */
    delete from public.fin_settled_entry where run_id = r.id;
    delete from public.fin_settlement_line where run_id = r.id;
    v_run := r.id;
  else
    insert into public.fin_settlement_run (
      reference, city_id, period_start, period_end, cutoff_at, pay_date, built_by)
    values (
      'RUN-' || to_char(v_start, 'IYYY-"W"IW'), p_city_id, v_start, v_end,
      v_end - interval '1 day',
      (v_end + interval '5 days')::date, v_me)
    returning id into v_run;
  end if;

  v_minimum := ledger.from_kes(settings.fn_num('settlement.minimum_payout', p_city_id));

  for owed in select * from public.fn_settlement_owed(v_start, v_end, p_city_id) loop
    /* A rider paid automatically (Payout rules) is paid there for everything
       from their start day; what is older stays with this run. Test riders'
       real pay stays here, since test payouts only "pay" with test money. */
    if owed.party_type = 'rider' and public.fn_rider_payout_mode(owed.party_id) <> 'run'
       and not exists (select 1 from public.rider rd where rd.id = owed.party_id and rd.accepts_test_payouts) then
      v_boundary := public.fn_rider_payout_boundary(owed.party_id, public.fn_rider_payout_rules(
        (select rd.city_id from public.rider rd where rd.id = owed.party_id)));
      select coalesce(sum(e.credit - e.debit), 0), array_agg(e.id)
        into v_sub_gross, v_sub_ids
        from ledger.entry e
       where e.id = any (owed.entry_ids) and e.effective_at < v_boundary;
      continue when v_sub_ids is null or v_sub_gross = 0;
      owed.gross_cents := v_sub_gross;
      owed.commission_cents := 0;
      owed.entry_ids := v_sub_ids;
    end if;

    v_state := 'ready';
    v_hold := null;
    v_dest := null;
    v_net := owed.gross_cents;

    if owed.party_type = 'merchant' then
      select coalesce(m.trading_name, m.legal_name),
             case m.payout_rail when 'bank' then 'bank_eft'::public.settlement_rail
                                else 'mpesa_b2b'::public.settlement_rail end
        into v_label, v_rail
        from public.merchant m where m.id = owed.party_id;

      if exists (select 1 from public.merchant m where m.id = owed.party_id
                   and m.status in ('suspended', 'delisted')) then
        v_state := 'held_suspended';
        v_hold := 'the account is suspended';
      end if;

    elsif owed.party_type = 'rider' then
      select nullif(trim(coalesce(rd.first_name,'') || ' ' || coalesce(rd.last_name,'')), ''),
             'mpesa_b2c'::public.settlement_rail
        into v_label, v_rail
        from public.rider rd where rd.id = owed.party_id;

      /*
       * Cash netting. A rider holding NexG's cash is paid the
       * difference, not the gross — and if they are holding more
       * than they earned, nothing goes out and recovery starts.
       */
      select coalesce(balance, 0) into v_cash from ledger.balance_v
       where code = 'cash.rider_on_hand:' || owed.party_id::text;

      if coalesce(v_cash, 0) > 0 then
        v_net := owed.gross_cents - v_cash;
        v_state := 'cash_netted';
        if v_net < 0 then
          v_state := 'held_suspended';
          v_hold := 'holds more of our cash than they earned · recovery';
          v_net := 0;
        end if;
      end if;

      if exists (select 1 from public.rider rd where rd.id = owed.party_id
                   and rd.status in ('suspended', 'offboarded')) then
        v_state := 'held_suspended';
        v_hold := 'the account is suspended';
      end if;

    elsif owed.party_type = 'experience_partner' then
      /*
       * An experience partner: the venue or operator behind a concierge
       * plan's blocks. Paid only to details Finance has verified; held
       * without them, and held while the partner is paused, suspended or
       * delisted.
       */
      select nullif(trim(p.name), ''), p.status
        into v_label, v_partner_status
        from public.experience_partner p where p.id = owed.party_id;

      select * into v_payout from public.experience_partner_payout x
       where x.partner_id = owed.party_id;

      v_rail := case v_payout.rail
                  when 'mpesa_phone' then 'mpesa_b2c'::public.settlement_rail
                  when 'bank' then 'bank_eft'::public.settlement_rail
                  else 'mpesa_b2b'::public.settlement_rail end;

      if v_payout.partner_id is null then
        v_state := 'held_kyc';
        v_hold := 'no payout details on file';
      elsif v_payout.verified_version is distinct from v_payout.version then
        v_state := 'held_kyc';
        v_hold := 'payout details not yet verified by Finance';
      else
        v_dest := public.fn_experience_partner_payout_masked(v_payout.rail, v_payout.account);
      end if;

      if v_partner_status in ('paused', 'suspended', 'delisted') then
        v_state := 'held_suspended';
        v_hold := 'the partner is ' || v_partner_status::text;
      end if;

    elsif owed.party_type = 'host' then
      /*
       * A host: their stay shares and referral rewards, paid together to
       * details Finance has verified (owner, 19 Nov 2026). Held without
       * them, and held while the host is paused or offboarded. Unpaid host
       * invoices are not netted off.
       */
      select nullif(trim(h.display_name), ''), h.status
        into v_label, v_host_status
        from public.host h where h.id = owed.party_id;

      select * into v_host_payout from public.host_payout x
       where x.host_id = owed.party_id;

      v_rail := case v_host_payout.rail
                  when 'mpesa_phone' then 'mpesa_b2c'::public.settlement_rail
                  when 'bank' then 'bank_eft'::public.settlement_rail
                  else 'mpesa_b2b'::public.settlement_rail end;

      if v_host_payout.host_id is null then
        v_state := 'held_kyc';
        v_hold := 'no payout details on file';
      elsif v_host_payout.verified_version is distinct from v_host_payout.version then
        v_state := 'held_kyc';
        v_hold := 'payout details not yet verified by Finance';
      else
        v_dest := public.fn_experience_partner_payout_masked(v_host_payout.rail, v_host_payout.account);
      end if;

      if v_host_status in ('paused', 'offboarded') then
        v_state := 'held_suspended';
        v_hold := 'the host is ' || v_host_status::text;
      end if;

    else
      v_label := '[' || owed.party_type::text || ']';
      v_rail := 'credit_note';
    end if;

    /* Below the minimum, it rolls. A KES 12 payout costs more in
       provider fees than it is worth, and the rider would rather
       have it next week than not at all. */
    /* Each group has its own minimum on the Payout rules screen (riders
       first); without one, the shared settlement minimum applies. */
    v_party_min := coalesce(
      case owed.party_type::text
        when 'rider' then ledger.from_kes(settings.fn_num('payouts.rider.minimum_kes',
          coalesce(p_city_id, (select rd.city_id from public.rider rd where rd.id = owed.party_id))))
      end,
      v_minimum);
    if v_state = 'ready' and v_party_min is not null and v_net < v_party_min and v_net > 0 then
      v_state := 'below_minimum_rolled';
      v_hold := 'under the minimum payout · rolls to next week';
    end if;

    insert into public.fin_settlement_line (
      run_id, party_type, party_id, party_label, rail, destination_masked,
      gross_cents, commission_cents, net_cents, state, hold_reason, ledger_entry_ids)
    values (
      v_run, owed.party_type, owed.party_id, coalesce(v_label, '[—]'), v_rail, v_dest,
      owed.gross_cents, owed.commission_cents, greatest(v_net, 0), v_state, v_hold,
      owed.entry_ids)
    returning id into v_line;

    /*
     * Claim the entries. A line that rolls forward does not
     * claim them — that is what lets the money appear in next
     * week's run instead of vanishing.
     */
    if v_state <> 'below_minimum_rolled' then
      insert into public.fin_settled_entry (entry_id, line_id, run_id)
      select unnest(owed.entry_ids), v_line, v_run;
    else
      delete from public.fin_settlement_line where id = v_line;
      continue;
    end if;

    v_lines := v_lines + 1;
    if v_state::text like 'held%' then v_held := v_held + 1; end if;
  end loop;

  perform public.fn_settlement_recompute(v_run);

  if r.state is null or r.state = 'draft' then
    perform public.fn_settlement_transition(v_run, 'built');
  end if;

  select * into r from public.fin_settlement_run where id = v_run;

  perform audit.log('staff'::public.actor_type, 'finance', 'settlement.built',
    p_target_type => 'settlement_run', p_target_id => v_run,
    p_severity => 'notice');

  return jsonb_build_object('ok', true, 'run_id', v_run, 'reference', r.reference,
    'lines', v_lines, 'held', v_held, 'totals', r.totals, 'hash', r.hash,
    'message', v_lines || ' line' || case when v_lines = 1 then '' else 's' end
      || ' built for ' || to_char(v_start, 'DD Mon') || '–' || to_char(v_end - interval '1 day', 'DD Mon')
      || '. Nothing is approved and nothing has been sent.');
end;
$function$;

revoke execute on function public.rpc_settlement_build(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_settlement_build(timestamptz, timestamptz, uuid) to authenticated;

-- ═══════════════════════════════════════════ 10. what the rider sees and asks

/* As 20270225000300, with the real schedule and the rider's payouts. */
create or replace function public.rpc_rider_payout_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_min integer := coalesce(settings.fn_int('payments.rider_early_payout_min_kes'), 100)::int;
  v_rules jsonb;
  v_mode text;
begin
  select * into r from public.rider
   where user_id = (select auth.uid()) and offboarded_at is null
   order by updated_at desc limit 1;
  if r.id is null then
    raise exception 'No rider account on this login.' using errcode = '42501';
  end if;
  v_rules := public.fn_rider_payout_rules(r.city_id);
  v_mode := public.fn_rider_payout_mode(r.id);

  return public.fn_rider_unpaid(r.id) || jsonb_build_object(
    'contractVersion', '1',
    'currency', 'KES',
    'payoutPhone', r.payout_msisdn,
    'payoutPhoneChangedAt', r.payout_msisdn_changed_at,
    'minimumKes', v_min,
    'earlyCashout', public.fn_rider_early_cashout_on(r.city_id),
    'schedule', case when v_mode = 'run' then 'weekly' else v_mode end,
    'payoutRules', jsonb_build_object(
      'mode', v_mode,
      'weekday', v_rules->'weekday',
      'monthlyDay', v_rules->'monthlyDay',
      'payHour', v_rules->'payHour',
      'holdHours', v_rules->'holdHours',
      'feePaidBy', v_rules->'feePaidBy',
      'feeKes', v_rules->'feeKes',
      'payoutMinimumKes', v_rules->'minimumKes',
      'nextPayoutAt', case when v_mode in ('daily', 'weekly', 'monthly')
                           then public.fn_rider_payout_next(v_rules, now()) end),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'state', p.state, 'mode', p.mode, 'grossKes', round(p.gross_cents / 100.0),
        'cashNettedKes', round(p.cash_netted_cents / 100.0), 'feeKes', round(p.fee_cents / 100.0),
        'feePaidBy', p.fee_paid_by, 'netKes', round(p.net_cents / 100.0),
        'holdReason', p.hold_reason, 'failureReason', p.failure_reason,
        'createdAt', p.created_at, 'paidAt', p.paid_at, 'phone', p.destination)
        order by p.created_at desc)
      from (select * from public.rider_payout
             where rider_id = r.id and is_test = r.accepts_test_payouts
             order by created_at desc limit 20) p), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'amountKes', q.amount_kes, 'status', q.status, 'reason', q.reason,
        'requestedAt', q.requested_at, 'decidedAt', q.decided_at, 'note', q.decision_note,
        'paidAt', q.paid_at, 'providerRef', q.provider_ref, 'phone', q.payout_msisdn)
        order by q.requested_at desc)
      from (select * from public.rider_payout_request
             where rider_id = r.id order by requested_at desc limit 20) q), '[]'::jsonb),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'periodStart', run.period_start, 'periodEnd', run.period_end,
        'netKes', l.net_pay_kes, 'status', l.status::text, 'paidAt', l.paid_at,
        'providerRef', l.provider_ref, 'failureReason', l.failure_reason)
        order by run.period_end desc)
      from (select * from public.rider_settlement_line where rider_id = r.id) l
      join public.rider_settlement_run run on run.id = l.run_id), '[]'::jsonb));
end;
$$;
revoke execute on function public.rpc_rider_payout_overview() from public, anon;
grant execute on function public.rpc_rider_payout_overview() to authenticated;

/* As 20270225000300; a rider paid automatically cannot ask early for money a
   payout is already sending, nor more than that payout would pay. */
create or replace function public.rpc_rider_payout_request(p_amount_kes bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_unpaid jsonb;
  v_min integer := coalesce(settings.fn_int('payments.rider_early_payout_min_kes'), 100)::int;
  v_id uuid;
  v_available bigint;
begin
  select * into r from public.rider
   where user_id = (select auth.uid()) and offboarded_at is null
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
   order by updated_at desc limit 1
   for update;
  if r.id is null then
    raise exception 'No rider account on this login.' using errcode = '42501';
  end if;
  if not public.fn_rider_early_cashout_on(r.city_id) then
    raise exception 'Early payouts are not open right now. You are paid in the next payout run.'
      using errcode = 'check_violation', hint = 'early_cashout_off';
  end if;
  if r.status <> 'active' then
    raise exception 'Early payouts open once your account is active.' using errcode = 'check_violation';
  end if;
  if r.payout_msisdn is null then
    raise exception 'Add your M-Pesa number first.' using errcode = 'check_violation', hint = 'no_payout_phone';
  end if;
  if r.payout_msisdn_changed_at is not null and r.payout_msisdn_changed_at > now() - interval '24 hours' then
    raise exception 'Your M-Pesa number changed less than a day ago. Early payouts open again 24 hours after the change.'
      using errcode = 'check_violation', hint = 'payout_phone_recent';
  end if;
  if exists (select 1 from public.rider_payout_request q
              where q.rider_id = r.id and q.status in ('pending', 'approved')) then
    raise exception 'You already have a request waiting.' using errcode = 'check_violation', hint = 'request_open';
  end if;
  if exists (select 1 from public.rider_payout o
              where o.rider_id = r.id and o.state in ('held', 'sending')) then
    raise exception 'A payout to you is on its way. You can ask again once it is paid.'
      using errcode = 'check_violation', hint = 'payout_open';
  end if;
  if p_amount_kes is null or p_amount_kes < v_min then
    raise exception 'The least you can ask for is KES %.', v_min using errcode = 'check_violation', hint = 'below_minimum';
  end if;

  v_unpaid := public.fn_rider_unpaid(r.id);
  v_available := (v_unpaid ->> 'availableKes')::bigint;
  if public.fn_rider_payout_mode(r.id) <> 'run' then
    v_available := least(v_available, greatest(floor(public.fn_rider_payout_owed(r.id) / 100.0)::bigint, 0));
  end if;
  if p_amount_kes > v_available then
    raise exception 'You can ask for up to KES % now.', v_available
      using errcode = 'check_violation', hint = 'above_available';
  end if;

  insert into public.rider_payout_request (rider_id, amount_kes, reason, payout_msisdn)
  values (r.id, p_amount_kes, left(nullif(trim(coalesce(p_reason, '')), ''), 300), r.payout_msisdn)
  returning id into v_id;

  perform audit.log('rider'::public.actor_type, 'riders', 'rider.early_payout_requested',
    p_actor_id => r.id, p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id,
    p_after => jsonb_build_object('amount_kes', p_amount_kes, 'request_id', v_id));

  return jsonb_build_object('ok', true, 'requestId', v_id, 'status', 'pending',
    'amountKes', p_amount_kes, 'phone', r.payout_msisdn,
    'message', 'Sent to finance. You will see it here when they answer.');
end;
$$;
revoke execute on function public.rpc_rider_payout_request(bigint, text) from public, anon;
grant execute on function public.rpc_rider_payout_request(bigint, text) to authenticated;

/* A rider reads their own payouts; Finance reads all. */
create policy rider_payout_read on public.rider_payout for select to authenticated
  using (authz.is_rider_self(rider_id) or authz.finance_reads());
grant select on public.rider_payout to authenticated;

-- ═══════════════════════════════════════════ 11. the sweep wakes the worker

/* As 20270222000100, and riders paid automatically count as something to do. */
create or replace function public.cron_paystack_sweep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer;
  v_url text;
  v_key text;
  v_minute text := floor(extract(epoch from now()) / 60)::bigint::text;
  v_request bigint;
begin
  select count(*) into v_due
    from public.paystack_attempt a join public.payment p on p.id = a.payment_id
   where a.outcome is null and a.opened_at is not null
     and a.opened_at < now() - interval '2 minutes'
     and a.created_at > now() - interval '24 hours'
     and (a.checked_at is null or a.checked_at < now() - interval '5 minutes')
     and p.state in ('pending', 'authorised');
  v_due := v_due + (select count(*) from public.payment p
                     where p.customer_engine_booking_id is not null and p.state = 'paid'
                       and p.engine_settled_at is null and p.engine_settle_error is null
                       and p.paid_at > now() - interval '7 days'
                       and p.paid_at < now() - interval '1 minute');
  /* A city paying riders automatically, or a rider transfer to finish. */
  v_due := v_due + (select count(*) from public.city c
                     where coalesce(nullif(settings.fn_text('payouts.rider.mode', c.id), ''), 'run') <> 'run'
                       and nullif(settings.fn_text('payouts.rider.automatic_from', c.id), '') is not null);
  v_due := v_due + (select count(*) from public.paystack_transfer t
                     where t.kind = 'rider_payout' and t.state in ('opened', 'pending'));
  if v_due = 0 then
    return jsonb_build_object('ok', true, 'waiting', 0);
  end if;

  select nullif(trim(decrypted_secret), '') into v_url
    from vault.decrypted_secrets where name = 'payments_worker_url';
  select coalesce(
           (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets
             where name = 'paystack_test_secret_key'),
           (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets
             where name = 'paystack_live_secret_key'))
    into v_key;
  if v_url is null or v_key is null then
    return jsonb_build_object('ok', false, 'waiting', v_due,
      'message', 'payments_worker_url or a Paystack secret key is missing from Vault, so late Paystack payments were not checked.');
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-paystack-worker', encode(extensions.hmac(convert_to('paystack-sweep:' || v_minute, 'UTF8'),
                                                  convert_to(v_key, 'UTF8'), 'sha256'), 'hex')),
    body := jsonb_build_object('action', 'paystack_sweep'),
    timeout_milliseconds := 55000
  ) into v_request;

  return jsonb_build_object('ok', true, 'waiting', v_due, 'request_id', v_request);
end;
$$;
revoke execute on function public.cron_paystack_sweep() from public, anon, authenticated;
grant execute on function public.cron_paystack_sweep() to service_role;

-- ═══════════════════════════════════════════════════════ 12. the audit

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('payout.rider_payout_sent', 'finance', 'notice', false, false, true, '{}',
   'A rider''s payout went to Paystack (automatic, or released by Finance)'),
  ('payout.rider_payout_held', 'finance', 'notice', true, false, true, '{}',
   'A rider''s automatic payout waits for Finance'),
  ('payout.rider_payout_rolled', 'finance', 'info', false, false, true, '{}',
   'A rider was owed less than the minimum; carried to the next payout'),
  ('payout.rider_payout_cancelled', 'finance', 'notice', true, false, true, '{}',
   'Finance cancelled a held rider payout; the money is paid with the next one'),
  ('payout.rider_payout_error', 'finance', 'high', true, false, true, '{}',
   'An automatic rider payout could not be decided'),
  ('payout.paystack_transfer_answered', 'finance', 'info', false, false, true, '{}',
   'The payments worker recorded Paystack''s answer about a rider payout'),
  ('payout.paystack_transfer_late_success', 'finance', 'high', true, false, true, '{}',
   'Paystack paid a transfer NexG had recorded as failed; the money left the payee''s balance again'),
  ('rider.payout_number_changed', 'riders', 'notice', false, false, false, '{}',
   'A rider''s payout number changed; payouts wait 24 hours')
on conflict (action) do nothing;
