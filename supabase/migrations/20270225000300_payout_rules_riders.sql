-- Payout rules, riders first (owner, 23 Nov 2026: "PAYOUTS SHOULD HAVE A
-- SINGLE RULES SCREEN ... CONFIGURABLE FOR EACH"; "START WITH RIDERS").
--
-- One screen in the console (Finance › Payout rules) shows every group's
-- payout rules, each one a key in the settings registry, so a change is
-- drafted, approved by a second person (payouts: finance + tech) and
-- takes effect on the registry's own schedule, with history and rollback.
--
-- This slice: the riders' rules that take effect today.
--   payouts.rider.minimum_kes     riders' own minimum in the payout run;
--                                 empty = the shared settlement minimum.
--   payouts.rider.early_cashout   whether riders may ask to be paid early.
--   payments.rider_early_payout_min_kes (20270115000500) the least an
--                                 early cash-out can be; shown on the same
--                                 screen, not duplicated.
-- How often and on which day riders are paid, the hold period and who
-- pays the transfer fee arrive with Paystack transfers (next slice).
--
-- Changes to existing functions:
--   rpc_rider_payout_overview, rpc_rider_payout_request (20270115000500):
--     early cash-out can be switched off; the overview says so.
--   rpc_settlement_build (20270122000100): a rider line rolls below the
--     riders' minimum instead of the shared one. Nothing else changes.

-- ═══════════════════════════════════════════════════════ 1. the rules

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort, constraints)
values
  ('payouts.rider.minimum_kes', 'payouts', 'city', 'money', 'KES',
   'Riders: minimum payout',
   'A rider owed less than this is not paid this run; it rolls to the next one. Empty uses the shared settlement minimum.',
   true, false, 'finance+tech', '{finance,riders}', null, 410, '{}'::jsonb),
  ('payouts.rider.early_cashout', 'payouts', 'city', 'bool', null,
   'Riders: early cash-out',
   'Riders may ask to be paid what they have earned before the next run. Finance approves each request.',
   true, false, 'finance+tech', '{finance,riders}', 'true'::jsonb, 411, '{}'::jsonb)
on conflict (key) do nothing;

/*
 * The Payout rules screen: one row per rule and city (a global rule has
 * no city), with its live value. Which rules belong to which group is
 * this list; later slices add merchants, hosts and partners here.
 */
create or replace view public.payout_rules_v
with (security_invoker = true) as
with rule (party, key, sort) as (
  values
    ('rider', 'payouts.rider.minimum_kes', 10),
    ('rider', 'payouts.rider.early_cashout', 20),
    ('rider', 'payments.rider_early_payout_min_kes', 30)
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

-- ═══════════════════════════════════════════════ 2. early cash-out switch

create or replace function public.fn_rider_early_cashout_on(p_city_id uuid)
returns boolean
language sql stable set search_path = ''
as $$ select coalesce(settings.fn_bool('payouts.rider.early_cashout', p_city_id), true) $$;
revoke execute on function public.fn_rider_early_cashout_on(uuid) from public, anon;
grant execute on function public.fn_rider_early_cashout_on(uuid) to authenticated, service_role;

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
begin
  select * into r from public.rider
   where user_id = (select auth.uid()) and offboarded_at is null
   order by updated_at desc limit 1;
  if r.id is null then
    raise exception 'No rider account on this login.' using errcode = '42501';
  end if;

  return public.fn_rider_unpaid(r.id) || jsonb_build_object(
    'contractVersion', '1',
    'currency', 'KES',
    'payoutPhone', r.payout_msisdn,
    'payoutPhoneChangedAt', r.payout_msisdn_changed_at,
    'minimumKes', v_min,
    'earlyCashout', public.fn_rider_early_cashout_on(r.city_id),
    'schedule', 'weekly',
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
  if p_amount_kes is null or p_amount_kes < v_min then
    raise exception 'The least you can ask for is KES %.', v_min using errcode = 'check_violation', hint = 'below_minimum';
  end if;

  v_unpaid := public.fn_rider_unpaid(r.id);
  if p_amount_kes > (v_unpaid ->> 'availableKes')::bigint then
    raise exception 'You can ask for up to KES % now.', v_unpaid ->> 'availableKes'
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

-- ═══════════════════════════════ 3. the run: riders' own minimum

-- As 20270122000100, with the riders' minimum from Payout rules.

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
