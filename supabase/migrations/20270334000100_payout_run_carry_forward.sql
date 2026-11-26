-- Payout-run fixes: money that did not go out in a week's run is carried to a
-- later run, exactly once (26 Nov 2026). Four old faults, plus one found with them:
--
--   1. Under the minimum, a line "rolls to next week" without claiming its
--      ledger entries, but fn_settlement_owed only counted entries dated inside
--      the run's own week, so next week's run never saw them. It now counts
--      every unclaimed entry dated before the run's end. Claims
--      (fin_settled_entry, one row per entry, primary key on the entry) still
--      stop anything being paid twice. Production had no payable entries and no
--      claims when this was written, so nothing old is swept in.
--   2. A party whose balance is below zero (a clawback larger than what they
--      earned) got a zero line that claimed the negative entries, and the
--      clawback was lost. Now such a party gets no line and claims nothing:
--      the balance waits and comes off their next positive week.
--   3. A held line (no or unverified payout details, host paused or
--      offboarded, merchant suspended, partner paused, rider holding more cash
--      than earned) claimed its entries for good, so the money was never paid
--      when the hold lifted. Held lines still claim while the run is open (the
--      run re-sums them, and a line can be held mid-run by the in-flight rule
--      in 20270315000200), and give them back once the run's payment files are
--      made (files_generated onwards), when nothing more can change for them.
--      The next run picks them up again. A management fee booked against a
--      held line (claimed for that line at approved_2) is given back with it,
--      so the next run pays the share less the fee already taken, and the
--      fee invoice, already paid, is not taken again.
--   4. Found with 3: a cancelled run kept its claims, so a rebuilt week lost
--      them, and the week could not be built again at all (its reference,
--      RUN-YYYY-Www, is unique and the cancelled run kept it). A cancelled run
--      (only possible up to approved_1, before any fee is booked) now gives
--      back every claim, and the week is built again as RUN-YYYY-Www-2.
--   5. fn_receipt_for_host_invoice multiplied host_invoice.total and line
--      amounts by 100 for invoices that are not management fees. Like the
--      ledger and the host workspace, it now reads them as cents.
--
-- REDEFINES (each from its newest definition):
--   fn_settlement_owed            20270310000100: no lower date bound
--   rpc_settlement_build          20270332000600: skips a party below zero;
--                                 a rebuilt cancelled week gets a -2 reference
--   fn_receipt_for_host_invoice   20270332000600: other invoices in cents
-- NEW: fn_settlement_release_claims + trigger settlement_release_claims on
--   fin_settlement_run; a one-off release for runs already past their files
--   or cancelled (none in production when written).
--
-- Rollback: re-run the three functions from the files above and
--   drop trigger if exists settlement_release_claims on public.fin_settlement_run;
--   drop function if exists public.fn_settlement_release_claims();
-- (Claims already given back stay given back; the entries are simply owed again.)

-- ═══════════════════════════════════════════ 1. what is owed, by party

/* As 20270310000100, without the lower date bound: an entry no run has
   claimed is still owed, however old. p_period_start is kept for callers. */
create or replace function public.fn_settlement_owed(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_city_id uuid default null
)
returns table (party_type ledger.party_kind, party_id uuid, gross_cents bigint,
               commission_cents bigint, entry_ids bigint[])
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

-- ═══════════════════════════════════════════ 2. the run skips a party below zero

-- As 20270332000600, and a party whose balance is below zero gets no line and
-- claims nothing: the clawback waits for their next positive week. A week
-- whose run was cancelled is built again under a new reference.
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
  v_fee record;
  v_fee_taken bigint;
  v_take bigint;
  v_fee_list jsonb;
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
      /* A week whose run was cancelled is built again as RUN-…-2, -3: the
         cancelled run keeps its reference (it is unique). */
      'RUN-' || to_char(v_start, 'IYYY-"W"IW') || coalesce('-' || nullif((
        select count(*) + 1 from public.fin_settlement_run x
         where x.reference = 'RUN-' || to_char(v_start, 'IYYY-"W"IW')
            or x.reference like 'RUN-' || to_char(v_start, 'IYYY-"W"IW') || '-%'), 1)::text, ''),
      p_city_id, v_start, v_end,
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

    /* Below zero, the party owes NexG (a clawback larger than the week's
       earnings). A zero line would claim those entries and lose the clawback;
       with no line they stay owed and come off the next positive week. */
    continue when owed.gross_cents < 0;

    v_state := 'ready';
    v_hold := null;
    v_dest := null;
    v_net := owed.gross_cents;
    v_fee_taken := 0;
    v_fee_list := '[]'::jsonb;

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
       * invoices are not netted off, except management fees (below).
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

      /*
       * Management fees (owner, 26 Nov 2026; 20270332000600): what is still
       * owed on the host's fee invoices, oldest first, comes off this line,
       * never below zero. The line keeps its gross (it still re-sums to the
       * entries it claims); the fee is an adjustment. Deductions already
       * waiting in another run that is not cancelled are not taken twice. A
       * held line is netted too: the share is still NexG's to hold.
       */
      if v_net > 0 then
        for v_fee in
          select i.id, i.period, i.total - a.applied_cents - a.pending_cents as left_cents
            from public.host_invoice i
            cross join lateral public.fn_stays_fee_amounts(i.id) a
           where i.host_id = owed.party_id
             and public.fn_host_invoice_is_management_fee(i.lines)
             and i.status in ('sent', 'due', 'overdue')
           order by i.period, i.created_at, i.id
        loop
          exit when v_net - v_fee_taken <= 0;
          continue when v_fee.left_cents <= 0;
          v_take := least(v_fee.left_cents, v_net - v_fee_taken);
          v_fee_taken := v_fee_taken + v_take;
          v_fee_list := v_fee_list || jsonb_build_array(jsonb_build_object(
            'kind', 'management_fee', 'invoice_id', v_fee.id,
            'label', 'Management fee · ' || to_char(v_fee.period, 'Mon YYYY'),
            'amount_cents', -v_take));
        end loop;
        v_net := v_net - v_fee_taken;
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
    /* A line a management fee was taken from does not roll: the fee would
       roll with it and be taken again. */
    if v_state = 'ready' and v_party_min is not null and v_net < v_party_min and v_net > 0
       and v_fee_taken = 0 then
      v_state := 'below_minimum_rolled';
      v_hold := 'under the minimum payout · rolls to next week';
    end if;

    insert into public.fin_settlement_line (
      run_id, party_type, party_id, party_label, rail, destination_masked,
      gross_cents, commission_cents, adjustments, adjustment_cents, net_cents, state, hold_reason,
      ledger_entry_ids)
    values (
      v_run, owed.party_type, owed.party_id, coalesce(v_label, '[—]'), v_rail, v_dest,
      owed.gross_cents, owed.commission_cents, v_fee_list, -v_fee_taken, greatest(v_net, 0),
      v_state, v_hold, owed.entry_ids)
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

    /* The fees taken, waiting on the run's approval (fn_stays_fee_apply_run). */
    insert into public.stays_fee_settlement (invoice_id, host_id, kind, amount_cents, line_id, run_id)
    select (x ->> 'invoice_id')::uuid, owed.party_id, 'deduction', -(x ->> 'amount_cents')::bigint,
           v_line, v_run
      from jsonb_array_elements(v_fee_list) x;

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

-- ═══════════════════════════════════════════ 3. held and cancelled claims given back

/*
 * A run gives back claims it will not pay:
 *   - from files_generated on, every held line's (held_kyc, held_suspended):
 *     those lines are not in the payment files, and no line can be held or
 *     released after this point (20270315000200 holds only up to approved_2).
 *     A management fee booked for the line at approved_2 is given back with
 *     it, so the next run pays the share less the fee already taken.
 *   - when the run is cancelled (up to approved_1, before any fee is booked),
 *     every claim, so the week can be built again with its money.
 * The lines themselves are kept, unchanged: they still re-sum to the entries
 * they list (ledger_entry_ids), so the run's checks and hash do not move.
 */
create or replace function public.fn_settlement_release_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state is not distinct from old.state then
    return new;
  end if;

  if new.state = 'cancelled' then
    delete from public.fin_settled_entry where run_id = new.id;
  elsif new.state in ('files_generated', 'sending', 'sent', 'reconciled', 'closed') then
    delete from public.fin_settled_entry s
     using public.fin_settlement_line l
     where l.id = s.line_id
       and l.run_id = new.id
       and l.state in ('held_kyc', 'held_suspended');
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_settlement_release_claims() from public, anon, authenticated;

drop trigger if exists settlement_release_claims on public.fin_settlement_run;
create trigger settlement_release_claims after update of state on public.fin_settlement_run
  for each row execute function public.fn_settlement_release_claims();

/* Runs already past their files, or cancelled, before this trigger existed
   (none in production when written). */
delete from public.fin_settled_entry s
 using public.fin_settlement_line l, public.fin_settlement_run r
 where l.id = s.line_id
   and r.id = l.run_id
   and r.state in ('files_generated', 'sending', 'sent', 'reconciled', 'closed')
   and l.state in ('held_kyc', 'held_suspended');

delete from public.fin_settled_entry s
 using public.fin_settlement_run r
 where r.id = s.run_id
   and r.state = 'cancelled';

-- ═══════════════════════════════════════════ 4. host invoice receipts in cents

/* As 20270332000600. Every host invoice keeps its amounts in cents, as the
   ledger (ledger.fn_post_host_invoice) and the host workspace read
   host_invoice.total; a line reads amount_cents, then amount, then total. */
create or replace function public.fn_receipt_for_host_invoice(p_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.host_invoice;
  a record;
begin
  select * into i from public.host_invoice where id = p_id;
  if i.id is null or i.status <> 'paid' then return; end if;

  if public.fn_host_invoice_is_management_fee(i.lines) then
    select * into a from public.fn_stays_fee_amounts(i.id);
    perform public.fn_receipt_issue('host', i.host_id, 'host_invoice', i.id, 'payment',
      'NexG management fee · ' || to_char(i.period, 'Mon YYYY'),
      coalesce((select jsonb_agg(jsonb_build_object(
                  'label', coalesce(x ->> 'label', 'Property') || ' · management fee',
                  'amount_cents', coalesce((x ->> 'amount_cents')::bigint, 0)))
                  from jsonb_array_elements(i.lines) x), '[]'::jsonb),
      i.total,
      case when a.deducted_cents > 0 and a.mpesa_cents > 0 then 'Payout deduction and M-Pesa'
           when a.deducted_cents > 0 then 'Deducted from your payout'
           else 'M-Pesa' end,
      i.provider_ref, i.paid_at, p_email);
    return;
  end if;

  perform public.fn_receipt_issue('host', i.host_id, 'host_invoice', i.id, 'payment',
    'NexG invoice · ' || to_char(i.period, 'Mon YYYY'),
    coalesce((select jsonb_agg(jsonb_build_object(
                'label', coalesce(x ->> 'label', x ->> 'description', 'NexG services'),
                'amount_cents', coalesce((x ->> 'amount_cents')::numeric, (x ->> 'amount')::numeric,
                                         (x ->> 'total')::numeric, 0)::bigint))
                from jsonb_array_elements(i.lines) x),
             jsonb_build_array(jsonb_build_object('label', 'NexG services', 'amount_cents', i.total))),
    i.total, 'Payment', i.provider_ref, i.paid_at, p_email);
end;
$$;
