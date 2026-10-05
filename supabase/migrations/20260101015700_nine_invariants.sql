-- The nine invariants.
--
-- Each one is a question that must always answer zero. They run
-- on a schedule, and any non-zero answer blocks money leaving
-- the building until a person clears it — which is the only
-- version of "we check" that survives a bad Friday.
--
-- They are written as a single table of named queries rather
-- than nine functions, because the thing that matters is that
-- the *set* is complete and visible. Nine functions scattered
-- across a schema is nine things somebody can quietly stop
-- calling.

create table if not exists fin_invariant (
  key text primary key,
  label text not null,
  question text not null,
  /* A query returning (count bigint, value bigint, detail jsonb).
     Zero count means healthy. */
  sql text not null,
  severity text not null default 'critical'
    check (severity in ('critical', 'warning')),
  /* Whether a non-zero answer stops payouts. Not every breach
     should: an aged clearing entry wants a person, a negative
     rider float wants the Friday run stopped. */
  blocks_outbound boolean not null default true,
  enabled boolean not null default true,
  sort integer not null default 100
);

/* Every query below is schema-qualified. `fn_run_invariants`
   executes them with an empty search_path — an unqualified name
   does not resolve, the monitor records itself as failed, and a
   failed monitor blocks payouts. Correct behaviour, maddening
   cause. */
comment on table fin_invariant is
  'Nine questions that must answer zero. Kept as one table so the set is visible — nine functions scattered across a schema is nine things somebody can quietly stop calling.';

create table if not exists fin_invariant_check (
  id bigint generated always as identity primary key,
  key text not null references fin_invariant (key) on delete cascade,
  ran_at timestamptz not null default now(),
  breaches bigint not null,
  value bigint,
  detail jsonb,
  duration_ms integer
);

create index if not exists invariant_check_idx on fin_invariant_check (key, ran_at desc);

insert into fin_invariant (key, label, question, sql, severity, blocks_outbound, sort) values

('unbalanced_transactions', 'Every transaction balances',
 'A ledger transaction whose debits and credits differ.',
 $q$select count(*)::bigint, coalesce(sum(abs(d - c)), 0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('transaction', id, 'out_by', d - c)), '[]'::jsonb)
    from (select t.id, coalesce(sum(e.debit),0) d, coalesce(sum(e.credit),0) c
            from ledger.transaction t join ledger.entry e on e.transaction_id = t.id
           group by t.id having coalesce(sum(e.debit),0) <> coalesce(sum(e.credit),0)) x$q$,
 'critical', true, 10),

('refund_exceeds_collected', 'No refund exceeds what was collected',
 'An order refunded for more than it ever took.',
 $q$select count(*)::bigint, coalesce(sum(refunded - total), 0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('order', reference, 'over_by', refunded - total)), '[]'::jsonb)
    from (select o.reference, o.total_cents total,
                 coalesce(sum(r.amount_cents), 0) refunded
            from public.order o
            join public.refund r on r.order_id = o.id
           where r.status in ('approved', 'issued')
           group by o.id, o.reference, o.total_cents
          having coalesce(sum(r.amount_cents), 0) > o.total_cents) x$q$,
 'critical', true, 20),

('clearing_aged', 'Nothing sits in clearing',
 'Money stuck mid-flight: an STK with no callback, a refund sent and never confirmed.',
 $q$select count(*)::bigint, coalesce(sum(abs(balance)), 0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('account', code, 'balance', balance,
                                            'since', last_movement_at)), '[]'::jsonb)
    from ledger.balance_v
   where kind = 'clearing' and balance <> 0
     and last_movement_at < now() - interval '24 hours'$q$,
 'critical', true, 30),

('unapplied_receipts_aged', 'No money without an order for long',
 'Provider money we have taken and not matched to anything.',
 $q$select count(*)::bigint, coalesce(sum(balance), 0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('account', code, 'balance', balance)), '[]'::jsonb)
    from ledger.balance_v
   where base = 'unapplied_receipts' and balance > 0
     and last_movement_at < now() - interval '48 hours'$q$,
 'critical', false, 40),

('statement_line_duplicates', 'No ledger line is settled twice',
 'A ledger entry that appears in more than one settlement line.',
 $q$select count(*)::bigint, 0::bigint,
      coalesce(jsonb_agg(jsonb_build_object('entry', entry_id, 'lines', lines)), '[]'::jsonb)
    from (select unnest(ledger_entry_ids) entry_id, count(*) lines
            from public.fin_settlement_line group by 1 having count(*) > 1) x$q$,
 'critical', true, 50),

('orders_without_fee_recognition', 'Every paid order is in the ledger',
 'An order that took money and left no ledger transaction behind it.',
 $q$select count(*)::bigint, coalesce(sum(o.total_cents), 0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('order', o.reference, 'total', o.total_cents)), '[]'::jsonb)
    from public.order o
   where o.payment_status in ('paid', 'collected')
     and o.placed_at < now() - interval '1 hour'
     and not exists (select 1 from ledger.transaction t
                      where t.order_id = o.id and t.kind = 'order_sale_recognised')$q$,
 'critical', true, 60),

('cash_on_hand_negative', 'No rider holds negative cash',
 'A rider account that has banked more than it ever collected.',
 $q$select count(*)::bigint, coalesce(sum(abs(balance)), 0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('rider', party_id, 'balance', balance)), '[]'::jsonb)
    from ledger.balance_v where base = 'cash.rider_on_hand' and balance < 0$q$,
 'critical', true, 70),

('provider_ref_duplicates', 'One provider reference, one record',
 'The same provider reference recorded twice — the shape of a double payment.',
 $q$select count(*)::bigint, 0::bigint,
      coalesce(jsonb_agg(jsonb_build_object('ref', provider_ref, 'times', n)), '[]'::jsonb)
    from (select provider_ref, count(*) n from public.payment
           where provider_ref is not null group by 1 having count(*) > 1) x$q$,
 'critical', true, 80),

('money_state_mismatch', 'The order agrees with the ledger',
 'An order whose cached payment status disagrees with what the ledger says happened.',
 $q$select count(*)::bigint, 0::bigint,
      coalesce(jsonb_agg(jsonb_build_object('order', reference, 'says', payment_status,
                                            'ledger_says', money_state)), '[]'::jsonb)
    from public.order_money_v
   where (payment_status = 'paid' and money_state not in
            ('paid', 'partially_refunded', 'refunded', 'void'))
      or (payment_status = 'pending' and money_state in ('paid', 'cash_collected'))$q$,
 'critical', true, 90)

on conflict (key) do update set
  label = excluded.label, question = excluded.question, sql = excluded.sql,
  severity = excluded.severity, blocks_outbound = excluded.blocks_outbound,
  sort = excluded.sort;

-- ════════════════════════════════════ running them

create or replace function fn_run_invariants()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
  v_count bigint;
  v_value bigint;
  v_detail jsonb;
  v_started timestamptz;
  v_breaches integer := 0;
  v_blocking integer := 0;
begin
  for inv in select * from public.fin_invariant where enabled order by sort loop
    v_started := clock_timestamp();
    begin
      execute inv.sql into v_count, v_value, v_detail;
    exception when others then
      /*
       * A monitor that cannot run is a breach. The alternative —
       * treating an error as "nothing wrong" — is how a check
       * silently stops checking.
       */
      v_count := 1;
      v_value := null;
      v_detail := jsonb_build_object('monitor_failed', sqlerrm);
    end;

    insert into public.fin_invariant_check (key, breaches, value, detail, duration_ms)
    values (inv.key, v_count, v_value, v_detail,
            (extract(epoch from clock_timestamp() - v_started) * 1000)::int);

    if v_count > 0 then
      v_breaches := v_breaches + 1;
      if inv.blocks_outbound then v_blocking := v_blocking + 1; end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', v_breaches = 0,
    'breaches', v_breaches,
    'blocking', v_blocking,
    'outbound_blocked', v_blocking > 0,
    'ran_at', now());
end;
$$;

/* The latest answer to each question. */
create or replace view fin_invariant_v
with (security_invoker = true) as
select
  i.key,
  i.label,
  i.question,
  i.severity,
  i.blocks_outbound,
  c.breaches,
  c.value,
  c.detail,
  c.ran_at,
  c.duration_ms,
  c.breaches = 0 as healthy,
  c.ran_at < now() - interval '15 minutes' as stale
from public.fin_invariant i
left join lateral (
  select * from public.fin_invariant_check ch
   where ch.key = i.key order by ch.ran_at desc limit 1
) c on true
where i.enabled;

/*
 * Whether money may leave.
 *
 * Read by the settlement run before generating files and before
 * sending. An invariant in breach stops payouts — not because
 * the breach is necessarily about the payout, but because a
 * ledger we cannot trust is not a ledger we should pay from.
 */
create or replace function fn_outbound_blocked()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'blocked', count(*) > 0,
    'reasons', coalesce(jsonb_agg(jsonb_build_object(
      'key', key, 'label', label, 'breaches', breaches, 'value', value)), '[]'::jsonb),
    'never_run', (select count(*) from public.fin_invariant i
                   where i.enabled and not exists (
                     select 1 from public.fin_invariant_check c where c.key = i.key)))
  from public.fin_invariant_v
  where blocks_outbound and (breaches > 0 or breaches is null or stale)
$$;

comment on function fn_outbound_blocked is
  'Money does not leave while a question is unanswered. A stale monitor counts as unanswered — a check that has not run is not a check that passed.';

alter table fin_invariant enable row level security;
alter table fin_invariant_check enable row level security;

drop policy if exists invariant_read on fin_invariant;
create policy invariant_read on fin_invariant
  for select to authenticated using (authz.reads_ledger() or authz.reaches_module('finance'));
drop policy if exists invariant_check_read on fin_invariant_check;
create policy invariant_check_read on fin_invariant_check
  for select to authenticated using (authz.reads_ledger() or authz.reaches_module('finance'));

revoke all on fin_invariant, fin_invariant_check from anon, authenticated;
grant select on fin_invariant, fin_invariant_check to authenticated;
grant select on fin_invariant_v to authenticated;
revoke execute on function fn_run_invariants() from public, anon, authenticated;
grant execute on function fn_run_invariants() to service_role;
revoke execute on function fn_outbound_blocked() from public, anon;
grant execute on function fn_outbound_blocked() to authenticated;
