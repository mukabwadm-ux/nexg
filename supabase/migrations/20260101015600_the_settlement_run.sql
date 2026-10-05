-- The settlement run.
--
-- Every Friday, in one run: merchants, riders, host credits. It
-- is the heart of the module and the place a mistake costs the
-- most, so almost all of this file is about what cannot happen
-- rather than what does.
--
--   * A ledger line cannot be settled twice. Not "should not" —
--     a unique index across every run refuses it.
--   * A status cannot be set by hand. One transition function,
--     one table of allowed moves, and a trigger that refuses a
--     direct write. There is no side door.
--   * Files cannot be generated before two different people have
--     approved, and approvals do not survive the run changing —
--     they sign a hash.
--   * Nothing leaves while an invariant is in breach.
--   * A failed line never disappears. It reappears in the next
--     run until somebody fixes it or writes it off on purpose.
--
-- On naming: these live in `public` as `fin_*` rather than in a
-- `fin` schema. PostgREST only serves schemas listed in a
-- Supabase dashboard setting, and a schema that is not listed
-- returns *nothing* rather than an error — a failure that reads
-- as a quiet month. That has cost this project three debugging
-- sessions already. The Finance screens read a dozen projections
-- directly, and twelve wrapper views to work around a setting
-- nobody can see from the code is a worse trade than a prefix.

create type settlement_state as enum (
  'draft', 'built', 'checked', 'approved_1', 'approved_2',
  'files_generated', 'sending', 'sent', 'reconciled', 'closed', 'cancelled');

create type settlement_line_state as enum (
  'ready', 'cash_netted', 'held_suspended', 'held_kyc', 'name_mismatch',
  'below_minimum_rolled', 'mismatch', 'approved', 'queued', 'sent',
  'paid', 'failed', 'rolled_forward');

create type settlement_rail as enum (
  'mpesa_b2b', 'bank_eft', 'mpesa_b2c', 'credit_note', 'invoice_credit');

-- ════════════════════════════════════════ the run

create table fin_settlement_run (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  city_id uuid references public.city (id) on delete restrict,

  period_start timestamptz not null,
  period_end timestamptz not null,
  cutoff_at timestamptz not null,
  pay_date date not null,

  state settlement_state not null default 'draft',

  built_at timestamptz,
  built_by uuid references public.staff_user (id) on delete set null,
  totals jsonb not null default '{}'::jsonb,
  checks jsonb not null default '[]'::jsonb,

  /*
   * The hash is what the approvers sign. Rebuilding the run
   * changes it, which invalidates both signatures — so a run
   * cannot be approved, quietly altered, and then paid.
   */
  hash text,

  approved_1_by uuid references public.staff_user (id) on delete set null,
  approved_1_at timestamptz,
  approved_1_hash text,
  approved_2_by uuid references public.staff_user (id) on delete set null,
  approved_2_at timestamptz,
  approved_2_hash text,

  files jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  reconciled_at timestamptz,
  closed_at timestamptz,
  cancelled_reason text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint run_period_is_a_week check (period_end > period_start),
  constraint run_two_different_people check (
    approved_1_by is null or approved_2_by is null or approved_1_by <> approved_2_by)
);

create index run_state_idx on fin_settlement_run (state, pay_date desc);
create unique index run_one_open_per_period on fin_settlement_run (period_start, period_end)
  where state not in ('cancelled');

create table fin_settlement_line (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references fin_settlement_run (id) on delete cascade,

  party_type ledger.party_kind not null,
  party_id uuid not null,
  party_label text not null,

  rail settlement_rail not null,
  destination_masked text,

  gross_cents bigint not null default 0,
  commission_cents bigint not null default 0,
  adjustments jsonb not null default '[]'::jsonb,
  adjustment_cents bigint not null default 0,
  net_cents bigint not null,

  state settlement_line_state not null default 'ready',
  hold_reason text,

  /*
   * Every ledger entry this line pays for.
   *
   * The unique index below is the single most important
   * constraint in this module: it makes paying the same money
   * twice impossible rather than unlikely.
   */
  ledger_entry_ids bigint[] not null default '{}',

  batch_id uuid,
  provider_ref text,
  paid_at timestamptz,
  failure_reason text,
  retry_count integer not null default 0,
  name_lookup jsonb,
  hash text,

  created_at timestamptz not null default now()
);

create index line_run_idx on fin_settlement_line (run_id, state);
create index line_party_idx on fin_settlement_line (party_type, party_id);

/*
 * One ledger entry, one settlement line, ever.
 *
 * An expression index over the unnested array, so the database
 * refuses a second run that includes an entry the first already
 * paid. Cancelled runs are excluded, because a run that never
 * paid should not lock its lines away forever.
 */
create table fin_settled_entry (
  entry_id bigint primary key,
  line_id uuid not null references fin_settlement_line (id) on delete cascade,
  run_id uuid not null references fin_settlement_run (id) on delete cascade
);

comment on table fin_settled_entry is
  'One row per ledger entry that a settlement line has claimed. The primary key is the guarantee: a second run cannot include money the first already paid.';

-- ════════════════════════════ the state machine

create table fin_transition (
  entity text not null,
  from_state text not null,
  to_state text not null,
  roles text[] not null,
  requires text[] not null default '{}',
  primary key (entity, from_state, to_state)
);

insert into fin_transition (entity, from_state, to_state, roles, requires) values
  ('run', 'draft', 'built', array['finance','finance_lead','super_admin'], '{}'),
  ('run', 'built', 'built', array['finance','finance_lead','super_admin'], '{}'),
  ('run', 'built', 'checked', array['finance','finance_lead','super_admin'], array['checks_pass']),
  ('run', 'checked', 'built', array['finance','finance_lead','super_admin'], '{}'),
  ('run', 'checked', 'approved_1', array['finance','finance_lead','super_admin'], array['checks_pass']),
  ('run', 'approved_1', 'approved_2', array['ops_manager','super_admin'],
     array['checks_pass','different_person','hash_unchanged']),
  ('run', 'approved_2', 'files_generated', array['finance','finance_lead','super_admin'],
     array['hash_unchanged','outbound_allowed']),
  ('run', 'files_generated', 'sending', array['finance','finance_lead','super_admin'],
     array['outbound_allowed']),
  ('run', 'sending', 'sent', array['finance','finance_lead','super_admin'], '{}'),
  ('run', 'sent', 'reconciled', array['finance','finance_lead','super_admin'], array['all_lines_resolved']),
  ('run', 'reconciled', 'closed', array['finance_lead','super_admin'], '{}'),
  ('run', 'draft', 'cancelled', array['finance_lead','super_admin'], '{}'),
  ('run', 'built', 'cancelled', array['finance_lead','super_admin'], '{}'),
  ('run', 'checked', 'cancelled', array['finance_lead','super_admin'], '{}'),
  ('run', 'approved_1', 'cancelled', array['finance_lead','super_admin'], '{}')
on conflict do nothing;

/*
 * No side doors.
 *
 * A trigger refuses any write that changes `state` unless the
 * transition function set a flag first. Every other module in
 * this project updates status columns directly somewhere; this
 * one cannot, because a run that advanced without its checks is
 * a run that paid without them.
 */
create or replace function tg_run_state_has_one_door()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state is distinct from old.state
     and coalesce(current_setting('nexg.settlement_transition', true), '') <> new.id::text then
    raise exception 'A settlement run state is changed by fn_settlement_transition, not by an update. Tried % → %.',
      old.state, new.state using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger run_state_has_one_door
  before update on fin_settlement_run
  for each row execute function tg_run_state_has_one_door();

create or replace function fn_settlement_transition(
  p_run_id uuid,
  p_to settlement_state,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.fin_settlement_run;
  v_me uuid := authz.staff_id();
  v_rule public.fin_transition;
  v_roles text[];
  v_blocked jsonb;
  v_unresolved integer;
begin
  select * into r from public.fin_settlement_run where id = p_run_id;
  if not found then raise exception 'No such run.'; end if;
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;

  select * into v_rule from public.fin_transition
   where entity = 'run' and from_state = r.state::text and to_state = p_to::text;

  if v_rule.entity is null then
    raise exception 'A run cannot go from % to %.', r.state, p_to
      using errcode = 'check_violation';
  end if;

  select array_agg(distinct ro.key) into v_roles
    from public.role_grant g join public.role ro on ro.id = g.role_id
   where g.staff_user_id = v_me;

  if not (v_roles && v_rule.roles) and not authz.is_super_admin() then
    raise exception 'Moving a run from % to % is for %.',
      r.state, p_to, array_to_string(v_rule.roles, ' or ')
      using errcode = '42501';
  end if;

  -- ── the requirements, each one a thing that has gone wrong before

  if 'checks_pass' = any (v_rule.requires) then
    if exists (select 1 from jsonb_array_elements(r.checks) c
                where not (c ->> 'ok')::boolean) then
      raise exception 'Some checks on this run have not passed. Fix them first — they are there because each one has been wrong before.'
        using errcode = 'check_violation';
    end if;
  end if;

  if 'different_person' = any (v_rule.requires) then
    if r.approved_1_by = v_me then
      raise exception 'You approved this run already. The second approval is somebody else''s — that is the whole point of it.'
        using errcode = '42501';
    end if;
  end if;

  if 'hash_unchanged' = any (v_rule.requires) then
    if r.approved_1_hash is distinct from r.hash then
      raise exception 'This run has changed since it was approved. The approvals no longer apply to what is in front of you, so it has to go round again.'
        using errcode = 'check_violation';
    end if;
  end if;

  if 'outbound_allowed' = any (v_rule.requires) then
    v_blocked := public.fn_outbound_blocked();
    if (v_blocked ->> 'blocked')::boolean then
      raise exception 'Money cannot leave while the ledger has an open question: %.',
        (select string_agg(x ->> 'label', '; ')
           from jsonb_array_elements(v_blocked -> 'reasons') x)
        using errcode = 'check_violation';
    end if;
  end if;

  if 'all_lines_resolved' = any (v_rule.requires) then
    select count(*) into v_unresolved from public.fin_settlement_line
     where run_id = p_run_id
       and state not in ('paid', 'failed', 'rolled_forward', 'below_minimum_rolled',
                         'held_suspended', 'held_kyc', 'cash_netted');
    if v_unresolved > 0 then
      raise exception '% line(s) on this run are neither paid nor explained.', v_unresolved
        using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('nexg.settlement_transition', p_run_id::text, true);

  update public.fin_settlement_run set
    state = p_to,
    approved_1_by = case when p_to = 'approved_1' then v_me else approved_1_by end,
    approved_1_at = case when p_to = 'approved_1' then now() else approved_1_at end,
    approved_1_hash = case when p_to = 'approved_1' then hash else approved_1_hash end,
    approved_2_by = case when p_to = 'approved_2' then v_me else approved_2_by end,
    approved_2_at = case when p_to = 'approved_2' then now() else approved_2_at end,
    approved_2_hash = case when p_to = 'approved_2' then hash else approved_2_hash end,
    sent_at = case when p_to = 'sent' then now() else sent_at end,
    reconciled_at = case when p_to = 'reconciled' then now() else reconciled_at end,
    closed_at = case when p_to = 'closed' then now() else closed_at end,
    cancelled_reason = case when p_to = 'cancelled' then p_reason else cancelled_reason end,
    updated_at = now()
  where id = p_run_id;

  perform set_config('nexg.settlement_transition', '', true);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'finance',
    p_action => 'settlement.' || p_to::text, p_actor_id => v_me,
    p_target_type => 'settlement_run', p_target_id => p_run_id,
    p_target_label => r.reference,
    p_city_id => r.city_id, p_severity => 'high', p_reason => p_reason,
    p_before => jsonb_build_object('state', r.state),
    p_after => jsonb_build_object('state', p_to, 'hash', r.hash)
               || coalesce(r.totals, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'state', p_to,
    'message', case p_to
      when 'approved_1' then 'Signed. It still needs an ops manager, and they cannot be you.'
      when 'approved_2' then 'Both signatures in. Files can be generated now.'
      when 'files_generated' then 'Files generated. Nothing has been sent yet.'
      when 'sending' then 'Sending.'
      when 'closed' then 'Closed. The evidence pack is the record from here.'
      else 'Moved to ' || p_to::text || '.' end);
end;
$$;

-- ═══════════════════════════════════════ building a run

/*
 * What a party is owed for a period.
 *
 * Read straight from the ledger: every credit on their payable
 * account, less every debit, for entries whose economic moment
 * falls in the period and that no run has claimed. "Not yet
 * claimed" is the join to `fin_settled_entry` — the same table
 * whose primary key makes double payment impossible.
 */
create or replace function fn_settlement_owed(
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
  where e.account_code like 'payable.%'
    and e.effective_at >= p_period_start
    and e.effective_at < p_period_end
    and (p_city_id is null or t.city_id = p_city_id)
    and not exists (select 1 from public.fin_settled_entry s where s.entry_id = e.id)
  group by e.party_type, e.party_id
  having coalesce(sum(e.credit), 0) - coalesce(sum(e.debit), 0) <> 0
$$;

create or replace function rpc_settlement_build(
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_city_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      run_id, party_type, party_id, party_label, rail,
      gross_cents, commission_cents, net_cents, state, hold_reason, ledger_entry_ids)
    values (
      v_run, owed.party_type, owed.party_id, coalesce(v_label, '[—]'), v_rail,
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

  return jsonb_build_object('ok', true, 'run_id', v_run, 'reference', r.reference,
    'lines', v_lines, 'held', v_held, 'totals', r.totals, 'hash', r.hash,
    'message', v_lines || ' line' || case when v_lines = 1 then '' else 's' end
      || ' built for ' || to_char(v_start, 'DD Mon') || '–' || to_char(v_end - interval '1 day', 'DD Mon')
      || '. Nothing is approved and nothing has been sent.');
end;
$$;

/*
 * Totals, checks and the hash, recomputed together.
 *
 * Together on purpose: a hash that did not cover the checks
 * would let a run be approved, re-checked differently, and paid.
 */
create or replace function fn_settlement_recompute(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.fin_settlement_run;
  v_totals jsonb;
  v_checks jsonb;
  v_hash text;
  v_blocked jsonb;
begin
  select * into r from public.fin_settlement_run where id = p_run_id;

  select jsonb_build_object(
    'merchants_cents', coalesce(sum(net_cents) filter (where party_type = 'merchant'), 0),
    'riders_cents', coalesce(sum(net_cents) filter (where party_type = 'rider'), 0),
    'host_credits_cents', coalesce(sum(net_cents) filter (where party_type = 'host'), 0),
    'held_cents', coalesce(sum(net_cents) filter (where state::text like 'held%'), 0),
    'adjustments_cents', coalesce(sum(adjustment_cents), 0),
    'leaving_cents', coalesce(sum(net_cents) filter (
        where state not in ('held_suspended','held_kyc','name_mismatch','mismatch')), 0),
    'lines', count(*),
    'held_lines', count(*) filter (where state::text like 'held%'),
    'merchants', count(*) filter (where party_type = 'merchant'),
    'riders', count(*) filter (where party_type = 'rider'))
  into v_totals
  from public.fin_settlement_line where run_id = p_run_id;

  v_blocked := public.fn_outbound_blocked();

  v_checks := jsonb_build_array(
    jsonb_build_object('key', 'ledger_equality',
      'label', 'Totals equal the ledger',
      'ok', not exists (
        select 1 from public.fin_settlement_line l
         where l.run_id = p_run_id
           and l.gross_cents <> coalesce((
             select sum(e.credit) - sum(e.debit) from ledger.entry e
              where e.id = any (l.ledger_entry_ids)), 0)),
      'detail', 'Every line re-summed from the entries it claims.'),

    jsonb_build_object('key', 'no_double_settlement',
      'label', 'No ledger line is in two runs',
      'ok', not exists (
        select 1 from public.fin_settled_entry s
         join public.fin_settlement_line l on l.id = s.line_id
         where s.run_id = p_run_id
           and exists (select 1 from public.fin_settled_entry s2
                        where s2.entry_id = s.entry_id and s2.run_id <> p_run_id)),
      'detail', 'Enforced by a primary key; checked again here so the screen can say so.'),

    jsonb_build_object('key', 'no_unconfirmed_refunds',
      'label', 'No unconfirmed refund is included',
      'ok', not exists (
        select 1 from public.refund rf
         where rf.status in ('requested', 'awaiting_approval')
           and rf.requested_at < r.period_end),
      'detail', 'A refund still being decided rolls to next week.'),

    jsonb_build_object('key', 'names_checked',
      'label', 'Every destination name has been looked up',
      'ok', not exists (
        select 1 from public.fin_settlement_line l
         where l.run_id = p_run_id and l.state = 'name_mismatch'),
      'detail', 'A payout to the wrong name is not recoverable.'),

    jsonb_build_object('key', 'invariants_clear',
      'label', 'The ledger has no open questions',
      'ok', not (v_blocked ->> 'blocked')::boolean,
      'detail', coalesce((select string_agg(x ->> 'label', '; ')
                            from jsonb_array_elements(v_blocked -> 'reasons') x),
                         'All nine answer zero.')),

    jsonb_build_object('key', 'nothing_negative',
      'label', 'No line pays a negative amount',
      'ok', not exists (select 1 from public.fin_settlement_line
                         where run_id = p_run_id and net_cents < 0),
      'detail', 'A negative net is a netting mistake, not a payout.')
  );

  v_hash := encode(extensions.digest(
    coalesce(v_totals::text, '') || '|' || coalesce(v_checks::text, '') || '|' ||
    coalesce((select string_agg(l.id::text || ':' || l.net_cents::text, ',' order by l.id)
                from public.fin_settlement_line l where l.run_id = p_run_id), ''),
    'sha256'), 'hex');

  update public.fin_settlement_run
     set totals = v_totals, checks = v_checks, hash = v_hash,
         built_at = coalesce(built_at, now()), updated_at = now()
   where id = p_run_id;
end;
$$;

-- ═══════════════════════════════════════════ reading it

create or replace view fin_run_v
with (security_invoker = true) as
select
  r.*,
  c.name as city,
  s1.email as approved_1_email,
  s2.email as approved_2_email,
  (select count(*) from public.fin_settlement_line l where l.run_id = r.id) as line_count,
  not exists (select 1 from jsonb_array_elements(r.checks) ch where not (ch ->> 'ok')::boolean)
    as checks_pass,
  r.approved_1_hash is not distinct from r.hash as approval_still_valid
from public.fin_settlement_run r
left join public.city c on c.id = r.city_id
left join public.staff_user s1 on s1.id = r.approved_1_by
left join public.staff_user s2 on s2.id = r.approved_2_by;

create or replace view fin_run_line_v
with (security_invoker = true) as
select
  l.*,
  r.reference as run_reference,
  r.state as run_state,
  r.pay_date,
  array_length(l.ledger_entry_ids, 1) as entries_claimed,
  coalesce((select sum(e.credit) - sum(e.debit) from ledger.entry e
             where e.id = any (l.ledger_entry_ids)), 0) as recomputed_cents,
  l.gross_cents = coalesce((select sum(e.credit) - sum(e.debit) from ledger.entry e
                             where e.id = any (l.ledger_entry_ids)), 0) as verifies
from public.fin_settlement_line l
join public.fin_settlement_run r on r.id = l.run_id;

alter table fin_settlement_run enable row level security;
alter table fin_settlement_line enable row level security;
alter table fin_settled_entry enable row level security;
alter table fin_transition enable row level security;

create policy run_read on fin_settlement_run for select to authenticated
  using (authz.reaches_module('finance') or authz.reads_ledger());
create policy line_read on fin_settlement_line for select to authenticated
  using (authz.reaches_module('finance') or authz.reads_ledger()
         or (party_type = 'merchant' and authz.is_merchant_member(party_id))
         or (party_type = 'rider' and authz.is_rider_self(party_id)));
create policy settled_entry_read on fin_settled_entry for select to authenticated
  using (authz.reads_ledger());
create policy transition_read on fin_transition for select to authenticated
  using (authz.staff_id() is not null);

revoke all on fin_settlement_run, fin_settlement_line, fin_settled_entry, fin_transition
  from anon, authenticated;
grant select on fin_settlement_run, fin_settlement_line, fin_settled_entry, fin_transition
  to authenticated;
grant select on fin_run_v, fin_run_line_v to authenticated;

revoke execute on function fn_settlement_recompute(uuid) from public, anon, authenticated;
revoke execute on function fn_settlement_owed(timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function rpc_settlement_build(timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function fn_settlement_transition(uuid, settlement_state, text) from public, anon;
grant execute on function rpc_settlement_build(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function fn_settlement_transition(uuid, settlement_state, text) to authenticated;

insert into audit.action_registry (action, module, default_severity, needs_review, two_person, money, description)
select 'settlement.' || to_state, 'finance', 'high',
       to_state in ('approved_2', 'sending'), to_state = 'approved_2', true,
       'A settlement run moved to ' || to_state
  from (select distinct to_state from public.fin_transition where entity = 'run') x
on conflict (action) do nothing;
