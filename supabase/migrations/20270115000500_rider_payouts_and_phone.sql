-- Rider money and phone, by the owner's rules (19 Nov 2026):
--  * Riders are paid in the weekly run, and may also ask for a special early
--    payout, which finance approves and pays.
--  * Changing the payout phone or account phone after joining is confirmed
--    by an SMS code.
--
-- 1. rpc_rider_payout_overview(): what is earned and not yet paid, cash held,
--    open requests, what can be asked for now, the payout phone, the last
--    weekly lines.
-- 2. rpc_rider_payout_request(amount, reason): one open request at a time,
--    within what is available, at least payments.rider_early_payout_min_kes,
--    and not within 24 hours of a payout phone change. rpc_rider_payout_cancel.
-- 3. Finance: rider_payout_request_queue_v and
--    rpc_finance_rider_payout_decide(id, 'approve'|'reject'|'paid', note, ref).
--    Paid writes a negative rider_adjustment ('early_payout'), so the next
--    weekly run (rpc_settlement_build adds adjustments) takes it off. Nothing
--    here sends money: finance pays by M-Pesa and records the reference.
-- 4. rpc_rider_phone_change_start(kind, phone) and
--    rpc_rider_phone_change_verify(challenge, code). The code goes by SMS to
--    the new number; the old number is told. Unlike the applicant code, the
--    code is never returned when no SMS sender is set: it moves money.
--    The account phone here is the rider record's phone; the sign-in phone
--    belongs to the sign-in work and is not changed.
--
-- Rollback: drop the functions, views and tables added here, and columns
-- rider.payout_msisdn_changed_at; delete the settings and registry rows.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('rider.early_payout_requested', 'riders', 'notice', true, 'A rider asked for an early payout'),
  ('rider.early_payout_cancelled', 'riders', 'info', true, 'A rider cancelled an early payout request'),
  ('finance.early_payout_decided', 'finance', 'notice', true, 'Finance decided on an early payout'),
  ('rider.phone_change_started', 'riders', 'notice', false, 'A rider asked to change a phone number'),
  ('rider.phone_changed', 'riders', 'high', true, 'A rider changed their payout or account phone')
on conflict (action) do nothing;

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('payments.rider_early_payout_min_kes', 'payments', 'global', 'int', 'KES',
   'Smallest early payout',
   'The least a rider can ask for outside the weekly run.',
   true, false, 'finance+ops_manager', '{riders,finance}', '100'::jsonb, 402)
on conflict (key) do nothing;

alter table public.rider add column if not exists payout_msisdn_changed_at timestamptz;

-- ═══════════════════════════════════════════════ 1. what is owed

create or replace function public.fn_rider_unpaid(p_rider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_since date;
  v_earned bigint;
  v_adjust bigint;
  v_cash bigint;
  v_open bigint;
begin
  select * into r from public.rider where id = p_rider_id;
  /* Since the end of the last weekly run that was approved or paid. */
  select max(run.period_end) + 1 into v_since
    from public.rider_settlement_run run
   where (run.city_id = r.city_id or run.city_id is null)
     and run.status in ('approved', 'sent', 'reconciled');
  v_since := coalesce(v_since, '2000-01-01'::date);

  select coalesce(sum(e.total_kes), 0) into v_earned from public.rider_earning e
   where e.rider_id = r.id and not e.is_test and e.earned_at >= v_since;
  select coalesce(sum(a.amount_kes), 0) into v_adjust from public.rider_adjustment a
   where a.rider_id = r.id and a.created_at >= v_since;
  select greatest(
           coalesce(sum(ce.amount_kes) filter (where ce.kind = 'collected'), 0)
           + coalesce(sum(ce.amount_kes) filter (where ce.kind in ('deposit', 'write_off')), 0), 0)
    into v_cash
    from public.cash_event ce
   where ce.rider_id = r.id and ce.created_at >= v_since;
  select coalesce(sum(q.amount_kes), 0) into v_open from public.rider_payout_request q
   where q.rider_id = r.id and q.status in ('pending', 'approved');

  return jsonb_build_object(
    'since', v_since,
    'earnedKes', v_earned,
    'adjustmentsKes', v_adjust,
    'cashHeldKes', v_cash,
    'openRequestsKes', v_open,
    'availableKes', greatest(v_earned + v_adjust - v_cash - v_open, 0));
end;
$$;
revoke execute on function public.fn_rider_unpaid(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════ 2. the rider asks

create table if not exists public.rider_payout_request (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  amount_kes bigint not null check (amount_kes > 0),
  reason text,
  payout_msisdn text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  paid_at timestamptz,
  provider_ref text,
  adjustment_id uuid references public.rider_adjustment (id) on delete set null
);

create unique index if not exists rider_payout_request_one_open
  on public.rider_payout_request (rider_id) where status in ('pending', 'approved');

alter table public.rider_payout_request enable row level security;
revoke all on public.rider_payout_request from public, anon, authenticated;
grant select on public.rider_payout_request to authenticated;

drop policy if exists rider_payout_request_read on public.rider_payout_request;
create policy rider_payout_request_read on public.rider_payout_request
  for select to authenticated
  using (authz.is_rider_self(rider_id) or authz.finance_reads());

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

create or replace function public.rpc_rider_payout_cancel(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.rider_payout_request;
begin
  select * into q from public.rider_payout_request
   where id = p_request_id and authz.is_rider_self(rider_id) for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if q.status <> 'pending' then
    raise exception 'Only a request finance has not answered can be cancelled.'
      using errcode = 'check_violation', hint = 'not_pending';
  end if;
  update public.rider_payout_request set status = 'cancelled', decided_at = now() where id = q.id;
  perform audit.log('rider'::public.actor_type, 'riders', 'rider.early_payout_cancelled',
    p_actor_id => q.rider_id, p_target_type => 'rider', p_target_id => q.rider_id,
    p_after => jsonb_build_object('request_id', q.id));
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;
revoke execute on function public.rpc_rider_payout_cancel(uuid) from public, anon;
grant execute on function public.rpc_rider_payout_cancel(uuid) to authenticated;

-- ═══════════════════════════════════════════════ 3. finance answers

create or replace view public.rider_payout_request_queue_v
with (security_invoker = false) as
  select q.id, q.rider_id,
         nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '') as rider_name,
         r.phone as rider_phone, r.city_id,
         q.amount_kes, q.reason, q.payout_msisdn, q.status, q.requested_at,
         q.decided_at, q.decision_note, q.paid_at, q.provider_ref,
         r.payout_msisdn_changed_at
    from public.rider_payout_request q
    join public.rider r on r.id = q.rider_id
   where authz.finance_reads();

revoke all on public.rider_payout_request_queue_v from public, anon;
grant select on public.rider_payout_request_queue_v to authenticated;

create or replace function public.rpc_finance_rider_payout_decide(
  p_request_id uuid, p_decision text, p_note text default null, p_provider_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.rider_payout_request;
  v_adj uuid;
begin
  if not authz.has_full_finance() then
    raise exception 'Only finance can decide early payouts.' using errcode = '42501';
  end if;
  select * into q from public.rider_payout_request where id = p_request_id for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;

  if p_decision = 'approve' then
    if q.status <> 'pending' then
      raise exception 'It is already %.', q.status using errcode = 'check_violation';
    end if;
    update public.rider_payout_request
       set status = 'approved', decided_by = authz.staff_id(), decided_at = now(),
           decision_note = nullif(trim(coalesce(p_note, '')), '')
     where id = q.id;
  elsif p_decision = 'reject' then
    if q.status not in ('pending', 'approved') then
      raise exception 'It is already %.', q.status using errcode = 'check_violation';
    end if;
    if coalesce(trim(p_note), '') = '' then
      raise exception 'Tell the rider why.' using errcode = 'check_violation';
    end if;
    update public.rider_payout_request
       set status = 'rejected', decided_by = authz.staff_id(), decided_at = now(),
           decision_note = trim(p_note)
     where id = q.id;
  elsif p_decision = 'paid' then
    if q.status <> 'approved' then
      raise exception 'Approve it before recording the payment.' using errcode = 'check_violation';
    end if;
    if coalesce(trim(p_provider_ref), '') = '' then
      raise exception 'Enter the M-Pesa reference.' using errcode = 'check_violation';
    end if;
    /* Taken off the next weekly run, which adds adjustments. */
    insert into public.rider_adjustment (rider_id, kind, amount_kes, reason, created_by, approved_by)
    values (q.rider_id, 'early_payout', -q.amount_kes,
            'Early payout ' || trim(p_provider_ref), authz.staff_id(), q.decided_by)
    returning id into v_adj;
    update public.rider_payout_request
       set status = 'paid', paid_at = now(), provider_ref = trim(p_provider_ref),
           adjustment_id = v_adj
     where id = q.id;
  else
    raise exception 'Decision is approve, reject or paid.' using errcode = '22023';
  end if;

  perform audit.log('staff'::public.actor_type, 'finance', 'finance.early_payout_decided',
    p_target_type => 'rider', p_target_id => q.rider_id,
    p_reason => nullif(trim(coalesce(p_note, '')), ''),
    p_after => jsonb_build_object('request_id', q.id, 'decision', p_decision,
                                  'amount_kes', q.amount_kes, 'ref', p_provider_ref));

  return jsonb_build_object('ok', true, 'status',
    case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'paid' end);
end;
$$;
revoke execute on function public.rpc_finance_rider_payout_decide(uuid, text, text, text) from public, anon;
grant execute on function public.rpc_finance_rider_payout_decide(uuid, text, text, text) to authenticated;

-- ═══════════════════════════════════════════════ 4. a new phone, by SMS code

create table if not exists public.rider_phone_change (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  kind text not null check (kind in ('payout', 'account')),
  new_phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rider_phone_change_by_rider on public.rider_phone_change (rider_id, created_at desc);
alter table public.rider_phone_change enable row level security;
revoke all on public.rider_phone_change from public, anon, authenticated;

create or replace function public.fn_kenyan_msisdn(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^254[17][0-9]{8}$' then '+' || d
    when d ~ '^0[17][0-9]{8}$' then '+254' || substr(d, 2)
    when d ~ '^[17][0-9]{8}$' then '+254' || d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) x
$$;

create or replace function public.rpc_rider_phone_change_start(p_kind text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_phone text := public.fn_kenyan_msisdn(p_phone);
  v_code text;
  v_bytes bytea;
  v_id uuid;
  v_sender text;
  v_old text;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  select * into r from public.rider
   where user_id = (select auth.uid()) and offboarded_at is null
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
   order by updated_at desc limit 1;
  if r.id is null then
    raise exception 'No rider account on this login.' using errcode = '42501';
  end if;
  if p_kind not in ('payout', 'account') then
    raise exception 'Change the payout or the account phone.' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'Enter a Kenyan mobile number, like 0712 345 678.' using errcode = '22023',
      hint = 'bad_phone';
  end if;
  v_old := case when p_kind = 'payout' then r.payout_msisdn else r.phone end;
  if v_phone = v_old then
    raise exception 'That is already your number.' using errcode = 'check_violation', hint = 'same_phone';
  end if;
  if p_kind = 'account' and exists (select 1 from public.rider x where x.phone = v_phone and x.id <> r.id) then
    raise exception 'That number belongs to another rider account.' using errcode = 'check_violation',
      hint = 'phone_taken';
  end if;
  if (select count(*) from public.rider_phone_change c
       where c.rider_id = r.id and c.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Too many codes in the last hour. Try again later.' using errcode = 'check_violation',
      hint = 'rate_limited';
  end if;
  if exists (select 1 from public.rider_phone_change c
              where c.rider_id = r.id and c.created_at > now() - interval '60 seconds') then
    raise exception 'Wait a minute before asking for another code.' using errcode = 'check_violation',
      hint = 'resend_wait';
  end if;

  v_bytes := extensions.gen_random_bytes(4);
  v_code := lpad(((  (get_byte(v_bytes, 0)::bigint << 24) | (get_byte(v_bytes, 1)::bigint << 16)
                   | (get_byte(v_bytes, 2)::bigint << 8) | get_byte(v_bytes, 3)::bigint) % 1000000)::text,
                 6, '0');

  insert into public.rider_phone_change (rider_id, kind, new_phone, code_hash, expires_at)
  values (r.id, p_kind, v_phone, encode(extensions.digest(v_code, 'sha256'), 'hex'), v_expires)
  returning id into v_id;

  select value #>> '{}' into v_sender from public.setting where key = 'sms_provider' and scope = 'global';

  perform public.fn_notify_enqueue('sms', v_phone, 'rider_phone_change',
    v_code || ' is your NexG code to make this your ' ||
      case when p_kind = 'payout' then 'M-Pesa payout' else 'rider account' end ||
      ' number. It expires in 10 minutes.',
    null, jsonb_build_object('rider_id', r.id, 'change_id', v_id), true, v_expires);

  if v_old is not null then
    perform public.fn_notify_enqueue('sms', v_old, 'rider_phone_change_alert',
      'NexG: someone asked to change your rider ' ||
        case when p_kind = 'payout' then 'M-Pesa payout' else 'account' end ||
        ' number. If this was not you, call NexG support now.',
      null, jsonb_build_object('rider_id', r.id, 'change_id', v_id), false, now() + interval '1 day');
  end if;

  perform audit.log('rider'::public.actor_type, 'riders', 'rider.phone_change_started',
    p_actor_id => r.id, p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id,
    p_after => jsonb_build_object('kind', p_kind));

  return jsonb_build_object('ok', true, 'challengeId', v_id,
    'maskedPhone', left(v_phone, 4) || ' ••• ••' || right(v_phone, 3),
    'codeLength', 6, 'expiresAt', v_expires, 'resendAt', now() + interval '60 seconds',
    'delivered', v_sender is not null,
    'message', case when v_sender is null
      then 'Text messages are not switched on yet, so the code cannot be sent. Contact support.'
      else 'We sent a code to the new number.' end);
end;
$$;
revoke execute on function public.rpc_rider_phone_change_start(text, text) from public, anon;
grant execute on function public.rpc_rider_phone_change_start(text, text) to authenticated;

create or replace function public.rpc_rider_phone_change_verify(p_challenge_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rider_phone_change;
  r public.rider;
begin
  select * into c from public.rider_phone_change where id = p_challenge_id for update;
  if not found or not authz.is_rider_self(c.rider_id) then
    raise exception 'Code request not found.' using errcode = 'P0002';
  end if;
  if c.verified_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'kind', c.kind);
  end if;
  if c.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired', 'message', 'That code expired. Ask for a new one.');
  end if;
  if c.attempts >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'message', 'Too many tries. Ask for a new code.');
  end if;
  if encode(extensions.digest(trim(coalesce(p_code, '')), 'sha256'), 'hex') <> c.code_hash then
    update public.rider_phone_change set attempts = attempts + 1 where id = c.id;
    return jsonb_build_object('ok', false, 'reason', 'wrong_code', 'attemptsLeft', greatest(0, 4 - c.attempts));
  end if;

  update public.rider_phone_change set verified_at = now(), attempts = attempts + 1 where id = c.id;
  select * into r from public.rider where id = c.rider_id for update;

  if c.kind = 'payout' then
    update public.rider
       set payout_msisdn = c.new_phone, payout_msisdn_changed_at = now(),
           payout_name_lookup = null
     where id = r.id;
  else
    begin
      update public.rider set phone = c.new_phone, phone_verified_at = now() where id = r.id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'phone_taken',
        'message', 'That number belongs to another rider account.');
    end;
  end if;

  perform audit.log('rider'::public.actor_type, 'riders', 'rider.phone_changed',
    p_actor_id => r.id, p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id,
    p_after => jsonb_build_object('kind', c.kind));

  return jsonb_build_object('ok', true, 'kind', c.kind, 'phone', c.new_phone,
    'message', case when c.kind = 'payout'
      then 'Your M-Pesa number is changed. Early payouts open again in 24 hours.'
      else 'Your account number is changed.' end);
end;
$$;
revoke execute on function public.rpc_rider_phone_change_verify(uuid, text) from public, anon;
grant execute on function public.rpc_rider_phone_change_verify(uuid, text) to authenticated;
