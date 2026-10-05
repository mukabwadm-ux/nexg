-- Bringing the history across.
--
-- The ledger starts empty, and the system does not. There are
-- orders that took money, refunds that went out and riders who
-- earned before any of this existed — and `orders_without_fee_
-- recognition` found four of them within a minute of being
-- switched on, which is the invariant doing exactly its job.
--
-- There are two honest ways to handle that. Post an opening
-- balance and treat everything before a date as out of scope, or
-- replay the history. Replaying is better here because the
-- history is small and because a statement for a week that
-- straddles the cutover has to be right — an opening balance
-- would make that week unexplainable.
--
-- The replay is idempotent by the same keys as the live path, so
-- running it twice changes nothing and an order that has already
-- posted is skipped rather than doubled.

create or replace function fn_ledger_backfill(p_limit integer default 10000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  e record;
  r record;
  v_orders integer := 0;
  v_pay integer := 0;
  v_refunds integer := 0;
  v_skipped integer := 0;
  v_failed jsonb := '[]'::jsonb;
begin
  /* Sales: every order that took money and has no transaction. */
  for o in
    select * from public.order ord
     where ord.payment_status in ('paid', 'collected')
       and not exists (select 1 from ledger.transaction t
                        where t.order_id = ord.id and t.kind = 'order_sale_recognised')
     order by ord.placed_at
     limit p_limit
  loop
    begin
      perform ledger.fn_post_sale(
        o.id,
        case when o.payment_method = 'cash_on_delivery' and o.rider_id is not null
             then ledger.fn_account('cash.rider_on_hand', 'rider', o.rider_id) end);
      v_orders := v_orders + 1;
    exception when others then
      /*
       * One order that will not post must not stop the rest. A
       * backfill that aborts halfway leaves the ledger in a
       * state nobody can reason about — worse than a list of
       * four things to look at by hand.
       */
      v_failed := v_failed || jsonb_build_object(
        'order', o.reference, 'why', sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;

  /* Rider pay, from the earnings already recorded. */
  for e in
    select re.*, ord.id as order_id from public.rider_earning re
     join public.order ord on ord.reference = re.order_reference
     where not re.is_test
       and not exists (select 1 from ledger.transaction t
                        where t.order_id = ord.id and t.kind = 'rider_pay_recognised')
     limit p_limit
  loop
    begin
      perform ledger.fn_post_rider_pay(
        e.order_id,
        ledger.from_kes(e.total_kes - coalesce(e.tip_kes, 0)
                        - coalesce(e.pickup_bonus_kes, 0) - coalesce(e.peak_bonus_kes, 0)),
        ledger.from_kes(coalesce(e.pickup_bonus_kes, 0) + coalesce(e.peak_bonus_kes, 0)));
      v_pay := v_pay + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_object('earning', e.order_reference, 'why', sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;

  /* Refunds, in whichever state they reached. */
  for r in
    select * from public.refund rf
     where rf.status in ('approved', 'issued')
     limit p_limit
  loop
    begin
      perform ledger.fn_post_refund_approved(r.id);
      if r.status = 'issued' then
        perform ledger.fn_post_refund_issued(r.id);
      end if;
      v_refunds := v_refunds + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_object('refund', r.id, 'why', sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_skipped = 0,
    'orders', v_orders, 'rider_pay', v_pay, 'refunds', v_refunds,
    'skipped', v_skipped, 'failed', v_failed,
    'message', case when v_skipped = 0
      then v_orders || ' orders, ' || v_pay || ' rider payments and ' || v_refunds
           || ' refunds brought across.'
      else v_skipped || ' could not be posted and are listed — they need a person.' end);
end;
$$;

comment on function fn_ledger_backfill is
  'Replays money that happened before the ledger existed. Idempotent by the same keys as the live path, and it keeps going past a failure rather than leaving half a ledger.';

revoke execute on function fn_ledger_backfill(integer) from public, anon;
grant execute on function fn_ledger_backfill(integer) to service_role;

do $$
declare v_result jsonb;
begin
  v_result := public.fn_ledger_backfill();
  raise notice 'Ledger backfill: %', v_result ->> 'message';
  if not (v_result ->> 'ok')::boolean then
    raise notice 'Could not post: %', v_result -> 'failed';
  end if;
end
$$;

/*
 * And from here on the clock runs.
 *
 * `cron_finance_invariants` every five minutes, because the
 * answer to "is the ledger sound" must be minutes old, not hours
 * — it is what gates every payout.
 */
create or replace function cron_finance_invariants()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select public.fn_run_invariants() $$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; the invariants are not scheduled.';
    return;
  end if;
  perform cron.schedule('finance-invariants', '*/5 * * * *',
    $cron$select public.cron_finance_invariants()$cron$);
end
$$;

revoke execute on function cron_finance_invariants() from public, anon, authenticated;
grant execute on function cron_finance_invariants() to service_role;
