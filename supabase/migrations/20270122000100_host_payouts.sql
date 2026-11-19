-- Hosts are paid in the weekly settlement run.
--
-- A stay paid through NexG owes the host their share (stay.host_share, from
-- 20270117000100), and referral rewards are owed on payable.host_credit.
-- Until now the run settled a host as a credit note against their next
-- invoice, and NexG held no payout details for hosts, so no host was ever
-- paid. Decided with the owner on 19 Nov 2026:
--
--   * a host is paid their stay shares and referral rewards together, on one
--     line, to payout details Finance has verified;
--   * unpaid host invoices are not netted off; they are collected as before;
--   * a host is paid by M-PESA number, till, paybill or bank, as experience
--     partners are;
--   * hospitality staff declare the details on the host's panel, and someone
--     with full Finance other than whoever declared them verifies them on
--     Settlements (a super admin may verify their own, logged for review).
--
-- What changes:
--   1. host_payout holds where a host is paid, closed to everyone but the
--      functions below. Declaring again clears the verification.
--   2. rpc_host_payout_declare, rpc_host_payout_verify and rpc_host_payouts
--      work exactly like the experience-partner ones, and reuse
--      fn_experience_partner_payout_masked.
--   3. fn_settlement_owed also counts stay.host_share, so the run picks up
--      what stays owe hosts and claims those entries through
--      fin_settled_entry like any other.
--   4. rpc_settlement_build gains a host branch: the host's name, and the
--      rail and masked destination from verified details. A host without
--      them is held_kyc; a paused or offboarded host is held_suspended.
--   5. The Settings note on how host credits are paid says how hosts are
--      paid now, unless staff have already changed it.
--
-- fn_settlement_recompute is unchanged: host lines were already totalled as
-- host_credits_cents, which now holds stay shares as well as rewards.
--
-- Bodies copied from their latest definitions, with only the changes above:
--   fn_settlement_owed    20260101015600_the_settlement_run.sql
--   rpc_settlement_build  20270108300600_experience_partner_payouts.sql
-- Run after 20270108300600 and 20270117000100.
--
-- Rollback, in this order:
--   re-run fn_settlement_owed from 20260101015600 and rpc_settlement_build
--     from 20270108300600 (hosts go back to credit-note lines);
--   drop function public.rpc_host_payouts(),
--     public.rpc_host_payout_verify(uuid, integer),
--     public.rpc_host_payout_declare(uuid, jsonb);
--   drop table public.host_payout;
--   update public.payout_rail set rail = 'credit_note',
--     note = 'Credit note against the next host invoice.' where party = 'host_credits';
--   delete the three audit.action_registry rows added below.

-- ═════════════════════════════════════════════════════ 1. payout details

create table if not exists public.host_payout (
  host_id uuid primary key references public.host (id) on delete cascade,
  rail text not null check (rail in ('mpesa_phone', 'mpesa_till', 'mpesa_paybill', 'bank')),
  /* The fields of the rail, checked by rpc_host_payout_declare:
     mpesa_phone {phoneNumber, accountName}, mpesa_till {tillNumber},
     mpesa_paybill {paybillNumber, accountReference},
     bank {bankName, accountName, accountNumber}. */
  account jsonb not null check (jsonb_typeof(account) = 'object'),
  version integer not null default 1 check (version > 0),
  declared_by uuid references public.staff_user (id) on delete set null,
  declared_at timestamptz not null default now(),
  verified_by uuid references public.staff_user (id) on delete set null,
  verified_at timestamptz,
  /* The version Finance checked. Details are verified while it equals
     version; declaring again moves version on and clears it. */
  verified_version integer,
  constraint host_payout_verified_together check (
    (verified_at is null) = (verified_version is null)),
  constraint host_payout_verified_known check (
    verified_version is null or verified_version <= version)
);

comment on table public.host_payout is
  'Where a host is paid their stay shares and referral rewards. Declared by hospitality staff, verified by someone else with full Finance; the settlement run pays only verified details. Closed: read and written through the rpc_host_payout* functions.';

alter table public.host_payout enable row level security;
/* No policies on purpose: nobody reads or writes the rows directly. */
revoke all on table public.host_payout from anon, authenticated;

-- ═════════════════════════════════════════════════════════ 2. the functions

/*
 * Declares, or changes, where a host is paid. Hospitality staff (ops
 * managers, partnerships, city leads) and super admins. Declaring again
 * clears the verification, so a run holds the host until Finance has
 * checked the new details. The account itself is not written to the audit
 * log; its masked form is.
 */
create or replace function public.rpc_host_payout_declare(
  p_host_id uuid,
  p_payout jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_host public.host;
  v_old public.host_payout;
  v_new public.host_payout;
  v_rail text;
  v_keys text[];
  v_key text;
  v_payout jsonb := p_payout;
  v_phone text;
begin
  if v_staff is null or not authz.works_hospitality(null) then
    raise exception 'Only hospitality staff can declare payout details.' using errcode = '42501';
  end if;

  select * into v_host from public.host where id = p_host_id;
  if v_host.id is null then
    raise exception 'That host no longer exists.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_payout) is distinct from 'object' or octet_length(p_payout::text) > 4096 then
    raise exception 'Enter the payout details.' using errcode = '22023';
  end if;

  v_rail := p_payout ->> 'rail';
  v_keys := case v_rail
    when 'mpesa_phone' then array['rail', 'phoneNumber', 'accountName']
    when 'mpesa_till' then array['rail', 'tillNumber']
    when 'mpesa_paybill' then array['rail', 'paybillNumber', 'accountReference']
    when 'bank' then array['rail', 'bankName', 'accountName', 'accountNumber']
  end;
  if v_keys is null then
    raise exception 'Choose how the host is paid (M-PESA number, till, paybill or bank).'
      using errcode = '22023';
  end if;
  if not (p_payout ?& v_keys)
     or exists (select 1 from jsonb_object_keys(p_payout) k where k <> all (v_keys)) then
    raise exception 'Fill in the fields for that payout method, and only those.' using errcode = '22023';
  end if;

  foreach v_key in array v_keys loop
    if jsonb_typeof(p_payout -> v_key) is distinct from 'string'
       or length(btrim(p_payout ->> v_key)) not between 1 and
          (case v_key when 'accountName' then 200
                      when 'rail' then 20
                      when 'phoneNumber' then 20
                      when 'tillNumber' then 20
                      when 'paybillNumber' then 20
                      else 100 end) then
      raise exception 'Complete every payout field.' using errcode = '22023';
    end if;
    v_payout := jsonb_set(v_payout, array[v_key], to_jsonb(btrim(p_payout ->> v_key)));
  end loop;

  if v_rail = 'mpesa_phone' then
    v_phone := regexp_replace(v_payout ->> 'phoneNumber', '[\s()-]', '', 'g');
    v_phone := case
      when v_phone ~ '^0[17][0-9]{8}$' then '+254' || substr(v_phone, 2)
      when v_phone ~ '^254[17][0-9]{8}$' then '+' || v_phone
      else v_phone end;
    if v_phone !~ '^\+254[17][0-9]{8}$' then
      raise exception 'Enter a Kenyan M-PESA number, such as 0712 345 678.' using errcode = '22023';
    end if;
    v_payout := jsonb_set(v_payout, '{phoneNumber}', to_jsonb(v_phone));
  elsif (v_rail = 'mpesa_till' and v_payout ->> 'tillNumber' !~ '^[0-9]{1,20}$')
     or (v_rail = 'mpesa_paybill' and v_payout ->> 'paybillNumber' !~ '^[0-9]{1,20}$') then
    raise exception 'A till or paybill number is digits only.' using errcode = '22023';
  end if;

  select * into v_old from public.host_payout where host_id = p_host_id for update;

  insert into public.host_payout as x
    (host_id, rail, account, version, declared_by, declared_at)
  values (p_host_id, v_rail, v_payout - 'rail', 1, v_staff, now())
  on conflict (host_id) do update set
    rail = excluded.rail,
    account = excluded.account,
    version = x.version + 1,
    declared_by = excluded.declared_by,
    declared_at = excluded.declared_at,
    verified_by = null,
    verified_at = null,
    verified_version = null
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'hotels', p_action => 'host.payout_declared',
    p_actor_id => v_staff,
    p_target_type => 'host', p_target_id => p_host_id,
    p_target_label => v_host.display_name,
    p_city_id => v_host.city_id,
    p_severity => 'notice',
    p_before => case when v_old.host_id is null then null else jsonb_build_object(
      'rail', v_old.rail, 'version', v_old.version,
      'destination', public.fn_experience_partner_payout_masked(v_old.rail, v_old.account),
      'verified', v_old.verified_version is not distinct from v_old.version) end,
    p_after => jsonb_build_object(
      'rail', v_new.rail, 'version', v_new.version,
      'destination', public.fn_experience_partner_payout_masked(v_new.rail, v_new.account)));

  return jsonb_build_object(
    'ok', true,
    'host_id', p_host_id,
    'version', v_new.version,
    'rail', v_new.rail,
    'destination_masked', public.fn_experience_partner_payout_masked(v_new.rail, v_new.account),
    'message', 'Saved. Finance verifies the details before a payout run pays the host.');
end;
$$;

comment on function public.rpc_host_payout_declare(uuid, jsonb) is
  'Hospitality: declares or changes where a host is paid. Clears any verification; Finance verifies again before a run pays.';

/*
 * Finance verifies the version it looked at. Full Finance only, and not
 * whoever declared the details, except a super admin, which is logged for
 * review.
 */
create or replace function public.rpc_host_payout_verify(
  p_host_id uuid,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.office_finance_require();
  v_row public.host_payout;
  v_host public.host;
  v_self boolean;
begin
  select * into v_row from public.host_payout where host_id = p_host_id for update;
  if v_row.host_id is null then
    raise exception 'No payout details have been declared for that host.' using errcode = 'P0002';
  end if;
  if p_version is distinct from v_row.version then
    raise exception 'The payout details changed after you opened them. Check the new details, then verify.'
      using errcode = '40001';
  end if;
  if v_row.verified_version is not distinct from v_row.version then
    raise exception 'These payout details are already verified.' using errcode = '23514';
  end if;

  v_self := coalesce(v_row.declared_by = v_staff, false);
  if v_self and not authz.is_super_admin() then
    raise exception 'Someone other than whoever declared these payout details has to verify them.'
      using errcode = '42501';
  end if;

  update public.host_payout
     set verified_by = v_staff, verified_at = now(), verified_version = version
   where host_id = p_host_id
  returning * into v_row;

  select * into v_host from public.host where id = p_host_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance',
    p_action => case when v_self then 'finance.host_payout_self_verified'
                     else 'finance.host_payout_verified' end,
    p_actor_id => v_staff,
    p_target_type => 'host', p_target_id => p_host_id,
    p_target_label => v_host.display_name,
    p_city_id => v_host.city_id,
    p_severity => case when v_self then 'high' else 'notice' end::public.audit_severity,
    p_after => jsonb_build_object(
      'rail', v_row.rail, 'version', v_row.version,
      'destination', public.fn_experience_partner_payout_masked(v_row.rail, v_row.account)));

  return jsonb_build_object(
    'ok', true,
    'host_id', p_host_id,
    'version', v_row.version,
    'destination_masked', public.fn_experience_partner_payout_masked(v_row.rail, v_row.account),
    'message', 'Verified. The next payout run pays ' || coalesce(v_host.display_name, 'the host')
               || ' there.');
end;
$$;

comment on function public.rpc_host_payout_verify(uuid, integer) is
  'Finance: verifies a host''s declared payout details, by version. Not the person who declared them (a super admin may, logged for review).';

/*
 * Every host with payout details declared, those waiting on Finance first.
 * People who reach Finance or Hotels & Airbnb see the destination masked;
 * people with full Finance, who verify and pay, also get the details
 * themselves.
 */
create or replace function public.rpc_host_payouts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := authz.has_full_finance();
begin
  if not (authz.is_super_admin() or authz.finance_reads() or authz.reaches_module('hotels')
          or authz.works_hospitality(null)) then
    raise exception 'Only people who reach Finance or Hotels & Airbnb can see host payout details.'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'host_id', h.id,
             'host_name', h.display_name,
             'host_status', h.status,
             'city', c.name,
             'rail', x.rail,
             'destination_masked', public.fn_experience_partner_payout_masked(x.rail, x.account),
             'account_name', x.account ->> 'accountName',
             'bank_name', x.account ->> 'bankName',
             'account', case when v_full then x.account end,
             'version', x.version,
             'declared_by', x.declared_by,
             'declared_by_name', coalesce(d.display_name, d.email),
             'declared_at', x.declared_at,
             'verified', x.verified_version is not distinct from x.version,
             'verified_by_name', coalesce(v.display_name, v.email),
             'verified_at', x.verified_at)
           order by (x.verified_version is not distinct from x.version), x.declared_at desc)
    from public.host_payout x
    join public.host h on h.id = x.host_id
    left join public.city c on c.id = h.city_id
    left join public.staff_user d on d.id = x.declared_by
    left join public.staff_user v on v.id = x.verified_by), '[]'::jsonb);
end;
$$;

comment on function public.rpc_host_payouts() is
  'Finance and Hotels & Airbnb: host payout details, masked, with who declared and verified them. Full Finance also gets the account itself. Reads only.';

-- ═══════════════════════════════════════ 3. what the run owes, stays included

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
  group by e.party_type, e.party_id
  having coalesce(sum(e.credit), 0) - coalesce(sum(e.debit), 0) <> 0
$$;

-- ═════════════════════════════════════════════════════ 4. the weekly run

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
    if v_state = 'ready' and v_minimum is not null and v_net < v_minimum and v_net > 0 then
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

-- ═══════════════════════════════════════════ 5. the note in Settings

update public.payout_rail
   set rail = 'mpesa_b2b_bank',
       note = 'Stay shares and referral rewards together · M-Pesa number, till, paybill or bank, chosen per host and verified by Finance.'
 where party = 'host_credits'
   and rail = 'credit_note'
   and note = 'Credit note against the next host invoice.';

-- ═════════════════════════════════════════════════ 6. registry and grants

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('host.payout_declared', 'hotels', 'notice', false, false, true, '{}',
   'Payout details for a host were declared or changed; Finance verifies them before a run pays the host'),
  ('finance.host_payout_verified', 'finance', 'notice', false, true, true, '{}',
   'Finance verified a host''s payout details, declared by someone else'),
  ('finance.host_payout_self_verified', 'finance', 'high', true, false, true, '{}',
   'A super admin verified host payout details they declared themselves')
on conflict (action) do nothing;

/* Each checks its caller itself. */
revoke execute on function
  public.rpc_host_payout_declare(uuid, jsonb),
  public.rpc_host_payout_verify(uuid, integer),
  public.rpc_host_payouts()
  from public, anon;
grant execute on function
  public.rpc_host_payout_declare(uuid, jsonb),
  public.rpc_host_payout_verify(uuid, integer),
  public.rpc_host_payouts()
  to authenticated, service_role;

/* Unchanged by create or replace, restated so this file stands on its own. */
revoke execute on function public.fn_settlement_owed(timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_settlement_owed(timestamptz, timestamptz, uuid) to service_role;
revoke execute on function public.rpc_settlement_build(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_settlement_build(timestamptz, timestamptz, uuid) to authenticated;

notify pgrst, 'reload schema';
