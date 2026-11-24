-- Hosts paid by Paystack sub-accounts, NexG's stay commission set per host,
-- and the preset cancellation policies edited by NexG (payouts, hosts; owner,
-- 24 Nov 2026: hosts are paid "like merchants", by Paystack sub-accounts;
-- NexG's stay commission is set per host by NexG and the host sees it; NexG
-- edits the flexible, moderate and strict presets; a second person approves
-- each change).
--
-- How it works:
--   * Commission. NexG's share of each stay is a Payout rules setting
--     (payouts.host.commission_pct, 15% by default, per city). NexG can agree
--     a different rate with one host, dated, approved by a second Finance
--     person (host_commission_term). The rate in force on the day the guest
--     held the stay is the one charged (a term counts from when it was
--     approved, the preset as it stood then), so a later change never
--     reprices a held stay. fn_stay_commission_kes is the one place the
--     amount is worked out: the checkout split calls it, and the settle books
--     a split payment as it was sent, so they agree to the cent.
--   * Sub-accounts. Finance records a host's Paystack sub-account (made in
--     the Paystack dashboard) and its schedule: auto (two working days),
--     weekly, monthly, or manual (held in Paystack until NexG releases it,
--     for example after check-in). A second Finance person switches it on,
--     on their own look-up in Paystack. One per host per Paystack mode. A
--     test sub-account only for a host with a test property; a live one only
--     for a host with a real property. Hosts without one stay on the weekly
--     payout run.
--   * Checkout. A stay at such a host is split by Paystack as it is paid:
--     the host's sub-account gets what the guest paid less NexG's commission;
--     NexG keeps the commission and bears Paystack's fee (bearer: account).
--     There is nothing to recover for hosts: Paystack takes a refund on a
--     split payment from the sub-account (owner's earlier rule).
--   * The books. When such a stay is paid and confirmed, what Paystack sent
--     the host leaves their stay.host_share balance at once, so the weekly
--     run never pays it again. When Paystack refunds it, the host's part of
--     the refund comes back off the sub-account, so the host does not also
--     owe it in the weekly run; a refund NexG sends by hand and records is
--     clawed back from the host in the weekly run, as today. The
--     cancellation fee's host part stays the host's, as today. A payment Paystack did not split (the webhook
--     names no sub-account) is left to the weekly run and flagged.
--   * Presets. NexG edits the flexible, moderate and strict tiers on the
--     Payout rules screen; a second Finance person approves. Stays already
--     made keep the tiers copied onto them when they were held.
--
-- Test mode as everywhere: test keys only at test properties; test payments
-- post nothing to the ledger.
--
-- Changes to existing functions (same signatures and grants):
--   tg_payment_stay_settled (20261119000200): the commission from
--     fn_stay_commission_kes (or, for a payment Paystack was asked to split,
--     the split as sent and the rate it was worked out at), stay.commission_pct
--     written, the host told the real rate. fn_stay_commission_rate() stays,
--     unused.
--   fn_receipt_for_stay (20261125000100): the host's receipt names the rate
--     charged (15% for stays settled before this).
--   rpc_payment_paystack_attempt (latest 20270312000100): the split for a
--     stay at a host with an active sub-account in this mode.
--   fn_cancellation_policy (20270222000300): the presets come from
--     cancellation_preset_version. It reads a table now, so it is STABLE, not
--     IMMUTABLE. Nothing depends on it being immutable: no index, generated
--     column or constraint uses it, and the functions that call it
--     (tg_stay_policy_snapshot, rpc_host_set_cancellation_policy,
--     rpc_stay_cancellation_policy) are volatile or stable already.
--     fn_cancellation_policy_text and fn_stay_refund_pct only read the tiers
--     they are given, so they stay immutable.
--   payout_rules_v (latest 20270310000100): every rider row, plus the hosts'
--     commission.
--
-- Rollback: re-run tg_payment_stay_settled from 20261119000200,
--   fn_receipt_for_stay from 20261125000100, rpc_payment_paystack_attempt from
--   20270312000100, fn_cancellation_policy from 20270222000300 (with
--   create or replace) and payout_rules_v from 20270310000100; then
--   drop trigger stay_split_settled on public.stay;
--   drop the functions created below, the tables host_commission_term,
--   host_paystack_subaccount and cancellation_preset_version, and the
--   columns stay.commission_pct, paystack_attempt.split_host_id and
--   paystack_attempt.split_commission_pct; and
--   delete from settings.definition where key = 'payouts.host.commission_pct'.
--   Anything already posted stays: the ledger is append-only.

-- ══════════════════════════════════════════════════════════ 1. the audit

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('host.commission_requested', 'finance', 'notice', false, true, true, '{}',
   'Staff asked for a stay commission agreed with one host, overriding the preset; a second person decides'),
  ('host.commission_approved', 'finance', 'high', false, true, true, '{}',
   'A second Finance person approved a host''s agreed stay commission; it is charged from its start day'),
  ('host.commission_rejected', 'finance', 'notice', false, true, true, '{}',
   'A host''s agreed stay commission request was rejected'),
  ('host.commission_withdrawn', 'finance', 'info', false, false, true, '{}',
   'A host''s agreed stay commission request was withdrawn before anyone decided it'),
  ('host.subaccount_requested', 'finance', 'notice', false, true, true, '{}',
   'Finance recorded a host''s Paystack sub-account, waiting for a second person'),
  ('host.subaccount_activated', 'finance', 'notice', false, true, true, '{}',
   'A second Finance person switched on a host''s Paystack sub-account'),
  ('host.subaccount_rejected', 'finance', 'info', false, true, true, '{}',
   'Finance turned down a host''s Paystack sub-account'),
  ('host.subaccount_paused', 'finance', 'notice', true, false, true, '{}',
   'Finance paused a host''s Paystack sub-account; new stay payments are not split'),
  ('host.subaccount_resumed', 'finance', 'notice', false, false, true, '{}',
   'Finance resumed a host''s Paystack sub-account'),
  ('stay.split_paid_late', 'finance', 'high', true, false, true, '{}',
   'Paystack sent a host''s share for a stay that could not be booked; the full refund comes back from the host''s sub-account'),
  ('stay.cancellation_preset_requested', 'hotels', 'notice', false, true, true, '{}',
   'Staff asked to change a preset cancellation policy; a second Finance person decides'),
  ('stay.cancellation_preset_approved', 'hotels', 'high', false, true, true, '{}',
   'A second Finance person approved a preset cancellation policy; new holds use it'),
  ('stay.cancellation_preset_rejected', 'hotels', 'notice', false, true, true, '{}',
   'A change to a preset cancellation policy was rejected'),
  ('stay.cancellation_preset_withdrawn', 'hotels', 'info', false, false, true, '{}',
   'A change to a preset cancellation policy was withdrawn before anyone decided it')
on conflict (action) do nothing;

-- ═══════════════════════════════════════ 2. the stay commission, per host

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort, constraints)
values
  ('payouts.host.commission_pct', 'payouts', 'city', 'pct', '%',
   'Hosts: NexG stay commission',
   'NexG''s share of each stay a guest pays through NexG. A rate agreed with a host on its own page replaces this for that host. Stays already paid keep the rate they were charged.',
   true, false, 'finance+tech', '{finance,hotels}', '15'::jsonb, 450, '{"min": 0, "max": 100}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.host_commission_term (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host (id) on delete cascade,
  pct numeric(5, 2) not null check (pct >= 0 and pct <= 100),
  /* Nairobi calendar days, both inclusive. No end: until a later term. */
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  terms_ref text check (terms_ref is null or length(terms_ref) <= 200),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by uuid references public.staff_user (id) on delete set null,
  requested_at timestamptz not null default clock_timestamp(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  check (status = 'pending' or decided_at is not null)
);
comment on table public.host_commission_term is
  'NexG''s stay commission agreed with one host, dated, approved by a second Finance person. Without one in force the host pays payouts.host.commission_pct.';
create index if not exists host_commission_term_host_idx
  on public.host_commission_term (host_id, status, starts_on desc);
create unique index if not exists host_commission_term_one_pending
  on public.host_commission_term (host_id) where status = 'pending';
alter table public.host_commission_term enable row level security;
revoke all on public.host_commission_term from public, anon, authenticated;

alter table public.stay
  add column if not exists commission_pct numeric(5, 2)
    check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100));
comment on column public.stay.commission_pct is
  'The commission rate charged on this stay, as a percent: the host''s rate in force when the guest held it. Null for stays settled before rates were set per host (they were charged 15%).';
comment on column public.stay.commission_kes is
  'NexG''s commission on a stay paid through NexG: commission_pct of what the guest paid, rounded to the shilling.';

/* The rate in force for a host at a moment, as it stood at that moment: an
   approved agreed term on that Nairobi day that had been approved by then,
   else the city's preset as it was then, else 15. So a term approved, or a
   preset changed, after a guest held a stay never moves that stay's rate.
   With no moment, the rate right now: clock_timestamp(), not now(), so a
   read in the same transaction as an approval (rpc_host_commission_decide
   answers rpc_host_commission_read) already shows the approved rate. */
create or replace function public.fn_host_commission(p_host_id uuid, p_at timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host public.host;
  v_term public.host_commission_term;
  v_at timestamptz := coalesce(p_at, clock_timestamp());
  v_day date := (coalesce(p_at, clock_timestamp()) at time zone 'Africa/Nairobi')::date;
  v_preset numeric;
begin
  select * into v_host from public.host where id = p_host_id;
  v_preset := coalesce(
    nullif(settings.fn_get('payouts.host.commission_pct', 'city'::settings.scope_kind,
                           v_host.city_id, null, null, v_at) ->> 'value', '')::numeric,
    15);

  select * into v_term from public.host_commission_term x
   where x.host_id = p_host_id and x.status = 'approved'
     and x.decided_at <= v_at
     and x.starts_on <= v_day and (x.ends_on is null or x.ends_on >= v_day)
   order by x.starts_on desc, x.decided_at desc
   limit 1;

  return jsonb_build_object(
    'pct', coalesce(v_term.pct, v_preset),
    'agreed', v_term.id is not null,
    'term_id', v_term.id,
    'preset_pct', v_preset);
end;
$$;
revoke all on function public.fn_host_commission(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_host_commission(uuid, timestamptz) to service_role;

/* NexG's commission on a stay, in whole shillings: the ONE place it is worked
   out. The rate is the host's in force when the guest held the stay. The
   checkout split and the settle both call this with the same paid amount. */
create or replace function public.fn_stay_commission_kes(p_stay_id uuid, p_paid_kes bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select round(p_paid_kes * coalesce(
    (select (public.fn_host_commission(s.host_id, s.created_at) ->> 'pct')::numeric
       from public.stay s where s.id = p_stay_id), 15) / 100.0)::bigint
$$;
revoke all on function public.fn_stay_commission_kes(uuid, bigint) from public, anon, authenticated;
grant execute on function public.fn_stay_commission_kes(uuid, bigint) to service_role;

comment on function public.fn_stay_commission_rate() is
  'Unused since 20270315000100: the stay commission is fn_stay_commission_kes, from the host''s rate. Kept so nothing that names it breaks.';

/*
 * As 20261119000200, with the commission from the host's rate in force when
 * the guest held the stay (fn_stay_commission_kes), the rate written on the
 * stay, and the host told the real rate. Never raises.
 */
create or replace function public.tg_payment_stay_settled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_paid bigint := new.amount_cents / 100;
  v_commission bigint;
  v_pct numeric;
  v_try public.paystack_attempt;
  v_clash boolean;
begin
  perform 1 from public.unit u
    join public.stay s on s.unit_id = u.id
   where s.id = new.stay_id
   for update of u;
  select * into v_stay from public.stay where id = new.stay_id for update;
  if v_stay.id is null or v_stay.status = 'booked' then
    return new;
  end if;

  select exists (
    select 1 from public.stay s
     where s.unit_id = v_stay.unit_id and s.id <> v_stay.id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and s.check_in < v_stay.check_out and s.check_out > v_stay.check_in
  ) into v_clash;

  if v_stay.status in ('held', 'cancelled') and not v_clash then
    v_pct := coalesce((public.fn_host_commission(v_stay.host_id, v_stay.created_at) ->> 'pct')::numeric, 15);
    v_commission := public.fn_stay_commission_kes(v_stay.id, v_paid);

    /* Belt and braces: when Paystack was asked to split this payment, the
       books take the split as it was sent, so what the host got and what
       the stay says the host's share is agree to the cent. The rate is the
       one the split was worked out at. */
    select * into v_try from public.paystack_attempt a
     where a.payment_id = new.id and a.outcome = 'paid'
       and a.split_host_id is not null and a.split_share_cents is not null
     order by a.created_at desc limit 1;
    if v_try.id is not null and v_try.split_share_cents > 0
       and v_try.split_share_cents <= v_paid * 100 then
      v_commission := v_paid - v_try.split_share_cents / 100;
      v_pct := coalesce(v_try.split_commission_pct, v_pct);
    end if;

    update public.stay
       set status = 'booked', confirmed_at = now(), updated_at = now(),
           paid_kes = v_paid, commission_kes = v_commission,
           host_share_kes = v_paid - v_commission,
           commission_pct = v_pct,
           payment_reference = new.reference
     where id = v_stay.id;

    insert into public.host_message (host_id, direction, channel, subject, body)
    values (v_stay.host_id, 'out', 'in_app', 'New NexG booking',
            coalesce(v_stay.guest_first_name, 'A guest') || ' booked '
            || to_char(v_stay.check_in at time zone 'Africa/Nairobi', 'DD Mon') || ' to '
            || to_char(v_stay.check_out at time zone 'Africa/Nairobi', 'DD Mon YYYY')
            || ' and paid KES ' || to_char(v_paid, 'FM999,999,999')
            || '. Your share after NexG''s ' || trim_scale(v_pct)::text || '% is KES '
            || to_char(v_paid - v_commission, 'FM999,999,999') || '.');

    perform audit.log('system'::public.actor_type, 'hotels', 'stay.paid',
      p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => new.city_id,
      p_after => jsonb_build_object('reference', new.reference, 'paid_kes', v_paid,
                                    'commission_kes', v_commission,
                                    'host_share_kes', v_paid - v_commission));
  else
    update public.stay
       set status = 'cancelled', refund_due_at = now(), updated_at = now(),
           paid_kes = v_paid, payment_reference = new.reference
     where id = v_stay.id;

    perform audit.log('system'::public.actor_type, 'hotels', 'stay.payment_refund_due',
      p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => new.city_id,
      p_severity => 'high',
      p_reason => 'The guest paid after the stay''s dates had gone to somebody else.',
      p_after => jsonb_build_object('reference', new.reference, 'paid_kes', v_paid));
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_payment_stay_settled() from public, anon, authenticated;

/* As 20261125000100, with the rate charged on the host's receipt (15% for
   stays settled before rates were set per host). */
create or replace function public.fn_receipt_for_stay(p_stay_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stay;
  v_place text;
begin
  select * into s from public.stay where id = p_stay_id;
  if s.id is null then return; end if;
  select coalesce(pr.name, '') || coalesce(' · ' || coalesce(u.label_public, u.name), '') into v_place
    from public.unit u left join public.property pr on pr.id = u.property_id where u.id = s.unit_id;

  if s.status in ('booked', 'in_stay', 'departed') and s.source = 'nexg' and s.host_share_kes is not null then
    perform public.fn_receipt_issue('host', s.host_id, 'stay', s.id, 'earnings',
      'Booking earnings · ' || coalesce(nullif(v_place, ''), 'NexG stay')
        || ' · ' || to_char(s.check_in at time zone 'Africa/Nairobi', 'DD Mon')
        || ' to ' || to_char(s.check_out at time zone 'Africa/Nairobi', 'DD Mon YYYY'),
      jsonb_build_array(
        jsonb_build_object('label', 'Guest paid', 'amount_cents', s.paid_kes * 100),
        jsonb_build_object('label', 'NexG commission (' || coalesce(trim_scale(s.commission_pct), 15)::text || '%)',
                           'amount_cents', -s.commission_kes * 100)),
      s.host_share_kes * 100, 'NexG booking', s.payment_reference, coalesce(s.confirmed_at, now()), p_email);
  end if;

  if s.refunded_at is not null and s.guest_user_id is not null then
    perform public.fn_receipt_issue('guest', s.guest_user_id, 'stay_refund', s.id, 'refund',
      'Refund · ' || coalesce(nullif(v_place, ''), 'NexG stay'),
      jsonb_build_array(jsonb_build_object('label', 'Refund of stay payment', 'amount_cents', coalesce(s.paid_kes, 0) * 100)),
      coalesce(s.paid_kes, 0) * 100, 'M-Pesa', s.refund_reference, s.refunded_at, p_email);
  end if;
end;
$$;

-- ═══════════════════════════════════ 3. agreeing a rate with one host

/*
 * The commission card for one host: the rate charged now and its source,
 * the preset, and the terms. Hospitality staff for the host's city and
 * Finance see everything, with who asked, who decided and why; the host's
 * own account-wide members see approved terms only.
 */
create or replace function public.rpc_host_commission_read(p_host_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host public.host;
  v_term public.host_commission_term;
  v_me uuid := authz.staff_id();
  v_staff boolean;
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_now jsonb;
  v_terms jsonb;
begin
  select * into v_host from public.host where id = p_host_id;
  if v_host.id is null then
    raise exception 'That host does not exist.' using errcode = 'P0002';
  end if;
  v_staff := v_me is not null and (authz.works_hospitality(v_host.city_id) or authz.has_full_finance());
  if not v_staff and not authz.is_host_member(v_host.id) then
    raise exception 'Not your host account.' using errcode = '42501';
  end if;

  v_now := public.fn_host_commission(v_host.id);
  select * into v_term from public.host_commission_term x
   where x.id = (v_now ->> 'term_id')::uuid;

  select jsonb_agg(jsonb_build_object(
           'id', x.id,
           'pct', x.pct,
           'starts_on', x.starts_on,
           'ends_on', x.ends_on,
           'status', x.status,
           'in_force', x.id is not distinct from v_term.id,
           'terms_ref', x.terms_ref,
           'requested_at', x.requested_at,
           'decided_at', x.decided_at)
         || case when v_staff then jsonb_build_object(
           'reason', x.reason,
           'decision_note', x.decision_note,
           'requested_by_name', r.display_name,
           'decided_by_name', d.display_name,
           'mine', x.requested_by is not distinct from v_me) else '{}'::jsonb end
         order by x.requested_at desc)
    into v_terms
    from (select * from public.host_commission_term
           where host_id = v_host.id and (v_staff or status = 'approved')
           order by requested_at desc limit 50) x
    left join public.staff_user r on r.id = x.requested_by
    left join public.staff_user d on d.id = x.decided_by;

  return jsonb_build_object(
    'host_id', v_host.id,
    'viewer', case when v_staff then 'staff' else 'host' end,
    'charged_now', v_now - 'term_id',
    'preset_pct', v_now -> 'preset_pct',
    'in_force', case when v_term.id is null then null else jsonb_build_object(
      'id', v_term.id, 'starts_on', v_term.starts_on, 'ends_on', v_term.ends_on) end,
    'today', v_day,
    'can_request', v_staff,
    'can_decide', v_staff and authz.has_full_finance(),
    'terms', coalesce(v_terms, '[]'::jsonb));
end;
$$;

comment on function public.rpc_host_commission_read(uuid) is
  'The stay commission card for one host: the rate charged now and why, the preset, and the agreed terms. Hospitality staff and Finance see everything; the host''s own team sees approved terms without staff names or reasons.';

/*
 * Ask for a stay commission agreed with this host, from today or later
 * (stays already held keep the rate they were held at). One request waits
 * at a time.
 */
create or replace function public.rpc_host_commission_request(
  p_host_id uuid,
  p_pct numeric,
  p_starts_on date,
  p_ends_on date,
  p_reason text,
  p_terms_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host public.host;
  v_me uuid := authz.staff_id();
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref text := nullif(btrim(coalesce(p_terms_ref, '')), '');
  v_term public.host_commission_term;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_host from public.host where id = p_host_id;
  if v_host.id is null then
    raise exception 'That host does not exist.' using errcode = 'P0002';
  end if;
  if not (authz.works_hospitality(v_host.city_id) or authz.has_full_finance()) then
    raise exception 'Not your host account.' using errcode = '42501';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 or p_pct <> round(p_pct, 2) then
    raise exception 'A rate is a percentage from 0 to 100, to at most two decimal places.'
      using errcode = '22023';
  end if;
  if p_starts_on is null then
    raise exception 'Say which day the rate starts.' using errcode = '22023';
  end if;
  if p_starts_on < v_day then
    raise exception 'A rate starts today or later. Stays already held keep the rate they were charged.'
      using errcode = '22023';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'The end date is before the start date.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Write what was agreed, so the second person knows what they are approving.'
      using errcode = '22023';
  end if;
  if length(v_reason) > 1000 or length(coalesce(v_ref, '')) > 200 then
    raise exception 'Keep the reason under 1,000 characters and the reference under 200.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.host_commission_term
              where host_id = v_host.id and status = 'pending') then
    raise exception 'A commission request is already waiting for this host. Approve, reject or withdraw it first.'
      using errcode = '23505';
  end if;

  insert into public.host_commission_term
    (host_id, pct, starts_on, ends_on, reason, terms_ref, requested_by)
  values (v_host.id, p_pct, p_starts_on, p_ends_on, v_reason, v_ref, v_me)
  returning * into v_term;

  perform audit.log('staff'::public.actor_type, 'finance', 'host.commission_requested',
    p_actor_id => v_me,
    p_target_type => 'host', p_target_id => v_host.id,
    p_target_label => v_host.display_name,
    p_city_id => v_host.city_id,
    p_reason => v_reason,
    p_before => jsonb_build_object('charged', public.fn_host_commission(v_host.id)),
    p_after => jsonb_build_object('term_id', v_term.id, 'pct', v_term.pct,
      'starts_on', v_term.starts_on, 'ends_on', v_term.ends_on, 'terms_ref', v_term.terms_ref),
    p_severity => 'notice'::public.audit_severity);

  return public.rpc_host_commission_read(v_host.id);
end;
$$;

comment on function public.rpc_host_commission_request(uuid, numeric, date, date, text, text) is
  'Asks for a stay commission agreed with one host, from today or later, with a reason. A second Finance person approves it with rpc_host_commission_decide. Audited as host.commission_requested.';

/* A second Finance person, never the one who asked. Approving puts the term
   in force from its start day (today, if that has passed while it waited). */
create or replace function public.rpc_host_commission_decide(
  p_term_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term public.host_commission_term;
  v_host public.host;
  v_me uuid := authz.staff_id();
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_before jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'Approve or reject.' using errcode = '22023';
  end if;
  select * into v_term from public.host_commission_term where id = p_term_id for update;
  if v_term.id is null then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  select * into v_host from public.host where id = v_term.host_id;
  if not authz.has_full_finance() then
    raise exception 'Approving a host''s commission is Finance''s.' using errcode = '42501';
  end if;
  if v_term.status <> 'pending' then
    raise exception 'That request is already %.', v_term.status using errcode = '22023';
  end if;
  if v_term.requested_by = v_me then
    raise exception 'You asked for this. Somebody else has to approve it.' using errcode = '42501';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;

  v_before := public.fn_host_commission(v_host.id);

  if p_approve then
    if v_term.ends_on is not null and v_term.ends_on < v_day then
      raise exception 'Those dates have already passed. Reject it and ask again with new dates.'
        using errcode = '22023';
    end if;
    update public.host_commission_term
       set status = 'approved', starts_on = greatest(starts_on, v_day),
           decided_by = v_me, decided_at = clock_timestamp(), decision_note = v_note
     where id = v_term.id
    returning * into v_term;

    perform audit.log('staff'::public.actor_type, 'finance', 'host.commission_approved',
      p_actor_id => v_me,
      p_target_type => 'host', p_target_id => v_host.id,
      p_target_label => v_host.display_name,
      p_city_id => v_host.city_id,
      p_reason => coalesce(v_note, v_term.reason),
      p_approved_by => v_me,
      p_before => jsonb_build_object('charged', v_before),
      p_after => jsonb_build_object('charged', public.fn_host_commission(v_host.id),
        'term_id', v_term.id, 'pct', v_term.pct, 'starts_on', v_term.starts_on,
        'ends_on', v_term.ends_on, 'requested_by', v_term.requested_by),
      p_severity => 'high'::public.audit_severity);
  else
    update public.host_commission_term
       set status = 'rejected', decided_by = v_me, decided_at = clock_timestamp(), decision_note = v_note
     where id = v_term.id
    returning * into v_term;

    perform audit.log('staff'::public.actor_type, 'finance', 'host.commission_rejected',
      p_actor_id => v_me,
      p_target_type => 'host', p_target_id => v_host.id,
      p_target_label => v_host.display_name,
      p_city_id => v_host.city_id,
      p_reason => v_note,
      p_before => jsonb_build_object('charged', v_before),
      p_after => jsonb_build_object('term_id', v_term.id, 'status', 'rejected'),
      p_severity => 'notice'::public.audit_severity);
  end if;

  return public.rpc_host_commission_read(v_host.id);
end;
$$;

comment on function public.rpc_host_commission_decide(uuid, boolean, text) is
  'Approves or rejects a waiting host commission request. Full Finance only, never the requester. Audited as host.commission_approved / host.commission_rejected with the rate charged before and after.';

/* The requester (or a Finance decider) takes back a request nobody has decided. */
create or replace function public.rpc_host_commission_withdraw(p_term_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term public.host_commission_term;
  v_host public.host;
  v_me uuid := authz.staff_id();
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_term from public.host_commission_term where id = p_term_id for update;
  if v_term.id is null then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  select * into v_host from public.host where id = v_term.host_id;
  if not (v_term.requested_by = v_me or authz.has_full_finance()) then
    raise exception 'Only the person who asked, or someone who could approve it, can withdraw it.'
      using errcode = '42501';
  end if;
  if v_term.status <> 'pending' then
    raise exception 'That request is already %.', v_term.status using errcode = '22023';
  end if;

  update public.host_commission_term
     set status = 'withdrawn', decided_by = v_me, decided_at = clock_timestamp()
   where id = v_term.id;

  perform audit.log('staff'::public.actor_type, 'finance', 'host.commission_withdrawn',
    p_actor_id => v_me,
    p_target_type => 'host', p_target_id => v_host.id,
    p_target_label => v_host.display_name,
    p_city_id => v_host.city_id,
    p_before => jsonb_build_object('term_id', v_term.id, 'status', 'pending', 'pct', v_term.pct),
    p_after => jsonb_build_object('term_id', v_term.id, 'status', 'withdrawn'),
    p_severity => 'info'::public.audit_severity);

  return public.rpc_host_commission_read(v_host.id);
end;
$$;

comment on function public.rpc_host_commission_withdraw(uuid) is
  'Withdraws a waiting host commission request: the requester, or Finance. Audited as host.commission_withdrawn.';

revoke all on function public.rpc_host_commission_read(uuid),
  public.rpc_host_commission_request(uuid, numeric, date, date, text, text),
  public.rpc_host_commission_decide(uuid, boolean, text),
  public.rpc_host_commission_withdraw(uuid) from public, anon;
grant execute on function public.rpc_host_commission_read(uuid),
  public.rpc_host_commission_request(uuid, numeric, date, date, text, text),
  public.rpc_host_commission_decide(uuid, boolean, text),
  public.rpc_host_commission_withdraw(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════ 4. the host's sub-account

create table public.host_paystack_subaccount (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host (id) on delete cascade,
  is_test boolean not null,
  subaccount_code text not null check (subaccount_code ~ '^ACCT_[A-Za-z0-9]{4,60}$'),
  schedule text not null check (schedule in ('auto', 'weekly', 'monthly', 'manual')),
  /* What Paystack says the sub-account pays out to, as Finance looked it up. */
  paystack_details jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'replaced', 'rejected')),
  note text check (note is null or length(note) <= 500),
  requested_by uuid references public.staff_user (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  updated_at timestamptz not null default now()
);
comment on table public.host_paystack_subaccount is
  'A host''s Paystack sub-account: Paystack pays the host its share of each stay directly, on this schedule. Switched on by a second Finance person.';

create unique index host_paystack_subaccount_one_active
  on public.host_paystack_subaccount (host_id, is_test) where status in ('active', 'paused');
create unique index host_paystack_subaccount_one_pending
  on public.host_paystack_subaccount (host_id, is_test) where status = 'pending';

alter table public.host_paystack_subaccount enable row level security;
revoke all on public.host_paystack_subaccount from public, anon, authenticated;

/* Whose sub-account a stay payment's try was split to, and the commission
   rate the split was worked out at. split_subaccount and split_share_cents
   (20270312000100) carry the code and the host's share; split_merchant_id
   stays null for stays. The settle books the split as sent. */
alter table public.paystack_attempt
  add column if not exists split_host_id uuid references public.host (id) on delete set null,
  add column if not exists split_commission_pct numeric(5, 2)
    check (split_commission_pct is null or (split_commission_pct >= 0 and split_commission_pct <= 100));

/* The active sub-account for a host in a mode, or none. */
create function public.fn_host_subaccount(p_host_id uuid, p_is_test boolean)
returns public.host_paystack_subaccount
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.host_paystack_subaccount
   where host_id = p_host_id and is_test = p_is_test and status = 'active'
$$;
revoke execute on function public.fn_host_subaccount(uuid, boolean) from public, anon, authenticated;

/*
 * Finance records a host's sub-account (looked up in Paystack by the console
 * first, which passes what Paystack says it pays out to). It waits for a
 * second Finance person. Hosts have no test flag of their own: a test
 * sub-account needs a test property, a live one a real property.
 */
create function public.rpc_host_subaccount_request(
  p_host_id uuid, p_is_test boolean, p_subaccount_code text, p_schedule text,
  p_paystack_details jsonb, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_id uuid;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Only Finance records a host''s Paystack sub-account.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.host h where h.id = p_host_id) then
    raise exception 'No such host.' using errcode = '22023';
  end if;
  if coalesce(p_subaccount_code, '') !~ '^ACCT_[A-Za-z0-9]{4,60}$' then
    raise exception 'A Paystack sub-account code starts ACCT_.' using errcode = '22023';
  end if;
  if p_schedule is null or p_schedule not in ('auto', 'weekly', 'monthly', 'manual') then
    raise exception 'Choose how often Paystack pays them.' using errcode = '22023';
  end if;
  if p_is_test is null then
    raise exception 'Say whether this is the test or the live sub-account.' using errcode = '22023';
  end if;
  if p_is_test and not exists (select 1 from public.property pr
                                where pr.host_id = p_host_id and pr.accepts_test_payments) then
    raise exception 'Only a host with a test property has a test sub-account.' using errcode = '22023';
  end if;
  if not p_is_test and not exists (select 1 from public.property pr
                                    where pr.host_id = p_host_id and not pr.accepts_test_payments) then
    raise exception 'This host has only test properties. Record a test sub-account.' using errcode = '22023';
  end if;
  if exists (select 1 from public.host_paystack_subaccount x
              where x.host_id = p_host_id and x.is_test = p_is_test and x.status = 'pending') then
    raise exception 'A sub-account for this host is already waiting to be switched on.'
      using errcode = 'check_violation';
  end if;

  insert into public.host_paystack_subaccount
    (host_id, is_test, subaccount_code, schedule, paystack_details, note, requested_by)
  values (p_host_id, p_is_test, p_subaccount_code, p_schedule,
          coalesce(p_paystack_details, '{}'::jsonb) - 'account_number',
          left(nullif(trim(coalesce(p_note, '')), ''), 500), v_me)
  returning id into v_id;

  perform audit.log('staff'::public.actor_type, 'finance', 'host.subaccount_requested',
    p_actor_id => v_me, p_target_type => 'host', p_target_id => p_host_id,
    p_after => jsonb_build_object('id', v_id, 'code', p_subaccount_code, 'schedule', p_schedule,
      'test', p_is_test));
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending');
end;
$$;
revoke execute on function public.rpc_host_subaccount_request(uuid, boolean, text, text, jsonb, text)
  from public, anon;
grant execute on function public.rpc_host_subaccount_request(uuid, boolean, text, text, jsonb, text)
  to authenticated;

/* A second Finance person switches it on (or turns it down). Never the one who asked. */
create function public.rpc_host_subaccount_decide(
  p_id uuid, p_approve boolean, p_note text default null, p_paystack_details jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_row public.host_paystack_subaccount;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Only Finance switches on a host''s sub-account.' using errcode = '42501';
  end if;
  select * into v_row from public.host_paystack_subaccount where id = p_id for update;
  if v_row.id is null or v_row.status <> 'pending' then
    raise exception 'That sub-account is not waiting for a decision.' using errcode = '22023';
  end if;
  if v_row.requested_by is null or v_row.requested_by = v_me then
    raise exception 'A second Finance person decides; not the one who asked.' using errcode = '42501';
  end if;
  if not coalesce(p_approve, false) and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why it is turned down.' using errcode = 'check_violation';
  end if;
  /* Switched on only on the second person's own look-up in Paystack, of the
     same code, in the same mode: never on what the first person typed. */
  if p_approve and (p_paystack_details is null
       or p_paystack_details->>'subaccount_code' is distinct from v_row.subaccount_code
       or (p_paystack_details->>'test')::boolean is distinct from v_row.is_test) then
    raise exception 'Look the sub-account up in Paystack again before switching it on.'
      using errcode = '22023';
  end if;

  if p_approve then
    update public.host_paystack_subaccount
       set status = 'replaced', updated_at = now()
     where host_id = v_row.host_id and is_test = v_row.is_test and status in ('active', 'paused');
  end if;
  update public.host_paystack_subaccount
     set status = case when p_approve then 'active' else 'rejected' end,
         paystack_details = case when p_approve then p_paystack_details - 'account_number'
                                 else paystack_details end,
         decided_by = v_me, decided_at = now(),
         decision_note = left(nullif(trim(coalesce(p_note, '')), ''), 500), updated_at = now()
   where id = v_row.id;

  perform audit.log('staff'::public.actor_type, 'finance',
    case when p_approve then 'host.subaccount_activated' else 'host.subaccount_rejected' end,
    p_actor_id => v_me, p_target_type => 'host', p_target_id => v_row.host_id,
    p_severity => 'notice',
    p_after => jsonb_build_object('id', v_row.id, 'code', v_row.subaccount_code, 'schedule', v_row.schedule,
      'test', v_row.is_test, 'requested_by', v_row.requested_by,
      'paystack', p_paystack_details - 'account_number'));
  return jsonb_build_object('ok', true, 'status', case when p_approve then 'active' else 'rejected' end);
end;
$$;
revoke execute on function public.rpc_host_subaccount_decide(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.rpc_host_subaccount_decide(uuid, boolean, text, jsonb) to authenticated;

/* Finance pauses a host's sub-account (new stay payments are no longer split) or resumes it. */
create function public.rpc_host_subaccount_pause(p_id uuid, p_pause boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_row public.host_paystack_subaccount;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Only Finance pauses a host''s sub-account.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why.' using errcode = 'check_violation';
  end if;
  select * into v_row from public.host_paystack_subaccount where id = p_id for update;
  if v_row.id is null or v_row.status <> (case when p_pause then 'active' else 'paused' end) then
    raise exception 'That sub-account is not %.', case when p_pause then 'active' else 'paused' end
      using errcode = '22023';
  end if;
  update public.host_paystack_subaccount
     set status = case when p_pause then 'paused' else 'active' end,
         decision_note = left(trim(p_note), 500), updated_at = now()
   where id = v_row.id;
  perform audit.log('staff'::public.actor_type, 'finance',
    case when p_pause then 'host.subaccount_paused' else 'host.subaccount_resumed' end,
    p_actor_id => v_me, p_target_type => 'host', p_target_id => v_row.host_id,
    p_reason => left(trim(p_note), 300), p_after => jsonb_build_object('id', v_row.id, 'test', v_row.is_test));
  return jsonb_build_object('ok', true, 'status', case when p_pause then 'paused' else 'active' end);
end;
$$;
revoke execute on function public.rpc_host_subaccount_pause(uuid, boolean, text) from public, anon;
grant execute on function public.rpc_host_subaccount_pause(uuid, boolean, text) to authenticated;

-- ═════════════════════════════════════ 5. checkout answers the split

/* As 20270312000100, and a stay at a host with an active sub-account in this
   mode is split: the host's share goes to it, NexG keeps its commission and
   bears Paystack's fee. */
create or replace function public.rpc_payment_paystack_attempt(
  p_payment_reference text,
  p_channel text,
  p_phone text,
  p_proof text,
  p_save_card boolean default false,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  a public.paystack_attempt;
  c public.customer_card;
  o public.order;
  v_sub public.merchant_paystack_subaccount;
  v_stay public.stay;
  v_hsub public.host_paystack_subaccount;
  v_uid uuid := (select auth.uid());
  v_mode text;
  v_test boolean;
  v_wait integer;
  v_n integer;
  v_ref text;
  v_save boolean := false;
  v_share bigint;
  v_paid_kes bigint;
  v_pct numeric;
  v_recovery bigint := 0;
  v_split jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  v_mode := authz.paystack_mode(p_proof);
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  v_test := v_mode = 'test';

  if p_channel is null or p_channel not in ('card', 'mpesa', 'airtel', 'saved_card') then
    raise exception 'Choose card, M-Pesa or Airtel Money.' using errcode = '22023';
  end if;
  if p_channel in ('card', 'saved_card') and p_phone is not null then
    raise exception 'A card payment takes no phone number.' using errcode = '22023';
  end if;
  if p_channel in ('mpesa', 'airtel') and (p_phone is null or p_phone !~ '^\+254[17][0-9]{8}$') then
    raise exception 'Enter a Kenyan mobile number like 0712 345 678.' using errcode = '22023';
  end if;
  if (p_channel = 'saved_card') <> (p_card_id is not null) then
    raise exception 'Choose a saved card to pay with it.' using errcode = '22023';
  end if;

  select * into p from public.payment where reference = p_payment_reference for update;
  if not found or p.state not in ('pending', 'authorised')
     or (p.expires_at is not null and p.expires_at <= now()) then
    raise exception 'No payment waiting on that reference.';
  end if;
  if not (p.created_by is not distinct from v_uid or authz.reaches_module('orders')) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;
  if p.intent not in ('order', 'booking', 'stay') then
    raise exception 'Only orders, bookings and stays are paid through Paystack so far.' using errcode = '22023';
  end if;
  if p.provider not in ('unassigned', 'paystack') then
    raise exception 'This payment was started another way. Check its status first.' using errcode = '22023';
  end if;
  if p.provider = 'paystack' and p.is_test <> v_test then
    raise exception 'This payment was started in the other Paystack mode.' using errcode = '22023';
  end if;
  -- Test keys only for test shops, and for stays only at test properties.
  if v_test and p.intent = 'stay' and not coalesce((
       select pr.accepts_test_payments from public.stay s
         join public.property pr on pr.id = s.property_id
        where s.id = p.stay_id), false) then
    raise exception 'Test payments are taken only by test properties.' using errcode = '22023';
  end if;
  if v_test and p.intent <> 'stay' and not coalesce((select m.accepts_test_payments from public.merchant m
                                where m.id = p.merchant_id), false) then
    raise exception 'Test payments are taken only by test shops.' using errcode = '22023';
  end if;
  -- M-Pesa and Airtel Money take up to KES 150,000 a payment through Paystack.
  if p_channel in ('mpesa', 'airtel') and p.amount_cents > 15000000 then
    raise exception 'M-Pesa takes up to KES 150,000 a payment. Pay this by card.' using errcode = '22023';
  end if;

  if p_channel = 'saved_card' then
    select * into c from public.customer_card
     where id = p_card_id and user_id = v_uid and removed_at is null and is_test = v_test;
    if not found then
      raise exception 'That card is not saved here. Choose another way to pay.' using errcode = '22023';
    end if;
    if c.exp_year * 12 + c.exp_month
       < extract(year from now() at time zone 'Africa/Nairobi')::int * 12
         + extract(month from now() at time zone 'Africa/Nairobi')::int then
      raise exception 'That card has expired. Choose another way to pay.' using errcode = '22023';
    end if;

    -- A saved card charged in the last minute: charge nothing more.
    select * into a from public.paystack_attempt
     where payment_id = p.id and channel = 'saved_card' and outcome is null
       and created_at > now() - interval '1 minute'
     order by created_at desc limit 1;
    if a.id is not null then
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', 'saved_card',
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (a.created_at + interval '1 minute' - now())))::integer));
    end if;
  end if;

  if p_channel = 'card' and coalesce(p_save_card, false) then
    v_save := not coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true);
  end if;

  -- A prompt sent in the last minute, to any number: wait, so a double tap
  -- never sends two prompts.
  if p_channel in ('mpesa', 'airtel') then
    select * into a from public.paystack_attempt
     where payment_id = p.id and outcome is null and channel in ('mpesa', 'airtel')
       and opened_at > now() - interval '3 minutes'
     order by opened_at desc limit 1;
    if a.id is not null and (a.opened_at > now() - interval '1 minute'
                             or (a.channel = p_channel and a.phone = p_phone)) then
      v_wait := greatest(1, ceil(extract(epoch from (a.opened_at + case
                  when a.channel = p_channel and a.phone = p_phone then interval '3 minutes'
                  else interval '1 minute' end - now())))::integer);
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', a.channel,
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'retry_after_seconds', v_wait);
    end if;
  end if;

  if p_channel = 'card' then
    select * into a from public.paystack_attempt
     where payment_id = p.id and outcome is null and channel = 'card'
       and authorization_url is not null and opened_at > now() - interval '30 minutes'
       and save_card = v_save
     order by opened_at desc limit 1;
    if a.id is not null then
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', 'card',
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'authorization_url', a.authorization_url);
    end if;
  end if;

  select count(*) + 1 into v_n from public.paystack_attempt where payment_id = p.id;
  if v_n > 20 then
    raise exception 'Too many tries on this payment. Contact NexG support.' using errcode = '22023';
  end if;
  v_ref := p.reference || '-' || v_n;

  /* The split, for an order whose merchant Paystack pays directly. The share
     is the order's items less its commission, as the ledger owes it; NexG's
     part is everything else, plus any refund still to recover. */
  if p.intent = 'order' and p.order_id is not null then
    select * into o from public.order where id = p.order_id;
    v_sub := public.fn_merchant_subaccount(o.merchant_id, v_test);
    if v_sub.id is not null then
      v_share := coalesce(o.subtotal_cents, 0) - coalesce(o.commission_cents, 0);
      if v_share > 0 and v_share < p.amount_cents then
        perform 1 from public.merchant where id = o.merchant_id for update;
        v_recovery := least(public.fn_merchant_recovery_due(o.merchant_id, v_test), greatest(v_share - 100, 0));
        v_split := jsonb_build_object('split', jsonb_build_object(
          'subaccount', v_sub.subaccount_code,
          'transaction_charge', p.amount_cents - v_share + v_recovery,
          'bearer', 'account'));
      else
        v_share := null;
      end if;
    end if;
  /* The split, for a stay whose host Paystack pays directly. The share is
     what the guest pays less NexG's commission, worked out exactly as the
     settle will (tg_payment_stay_settled: the payment's whole shillings,
     through fn_stay_commission_kes), so the share equals host_share_kes.
     rpc_payment_begin_stay opens the payment for quote_total_kes * 100, so
     this is the quoted total. Nothing to recover: Paystack takes a refund
     on a split payment from the host's sub-account. */
  elsif p.intent = 'stay' and p.stay_id is not null then
    select * into v_stay from public.stay where id = p.stay_id;
    v_hsub := public.fn_host_subaccount(v_stay.host_id, v_test);
    if v_hsub.id is not null then
      v_paid_kes := p.amount_cents / 100;
      v_share := (v_paid_kes - public.fn_stay_commission_kes(v_stay.id, v_paid_kes)) * 100;
      v_pct := coalesce((public.fn_host_commission(v_stay.host_id, v_stay.created_at) ->> 'pct')::numeric, 15);
      if v_share > 0 and v_share < p.amount_cents then
        v_split := jsonb_build_object('split', jsonb_build_object(
          'subaccount', v_hsub.subaccount_code,
          'transaction_charge', p.amount_cents - v_share,
          'bearer', 'account'));
      else
        v_share := null;
        v_pct := null;
      end if;
    end if;
  end if;

  insert into public.paystack_attempt
    (payment_id, reference, channel, is_test, phone, created_by, save_card, customer_card_id,
     split_merchant_id, split_host_id, split_subaccount, split_share_cents, split_recovery_cents,
     split_commission_pct)
  values (p.id, v_ref, p_channel, v_test,
          case when p_channel in ('mpesa', 'airtel') then p_phone end, v_uid, v_save, c.id,
          case when v_share is not null then o.merchant_id end,
          case when v_share is not null then v_hsub.host_id end,
          case when v_share is not null then coalesce(v_sub.subaccount_code, v_hsub.subaccount_code) end,
          v_share, case when v_share is not null then v_recovery else 0 end,
          case when v_share is not null then v_pct end);

  update public.payment
     set provider = 'paystack', is_test = v_test, updated_at = now()
   where id = p.id;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'attempt_reference', v_ref, 'channel', p_channel,
    'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', v_test,
    'save_card', v_save)
    || v_split
    || case when c.id is not null
         then jsonb_build_object('authorization_code', c.authorization_code, 'email', c.email)
         else '{}'::jsonb end;
end;
$$;

-- ═══════════════════════════════ 6. the books: Paystack paid the host

/*
 * After the stay is posted (stay_posts_to_ledger, which this trigger follows
 * by name, so stay_paid, stay_refund_due and stay_refunded are already there):
 *
 *   paid      Paystack's own word on the charge must name the same
 *             sub-account; otherwise the money all came to NexG, the try's
 *             split is cleared and the weekly run pays the host as before.
 *             On a match, for a live stay that was confirmed (stay_paid),
 *             what Paystack sent the host leaves stay.host_share at once:
 *               Dr stay.host_share (host)   Cr cash.card_processor_receivable
 *             For a stay that could not be booked (paid late, refunded in
 *             full) nothing is posted; it is flagged.
 *   refund    When Paystack has refunded a split stay (refunded_at set by
 *             fn_paystack_refund_apply on Paystack's processed refund, the
 *             stay's refund_reference being that paystack_refund), the host's
 *             part of the refund (what stay_refund_due took off
 *             stay.host_share when it was cancelled) came back off the
 *             sub-account, not from the weekly run:
 *               Dr cash.card_processor_receivable   Cr stay.host_share (host)
 *             The host's part of any cancellation fee stays theirs. A refund
 *             recorded by hand (rpc_stay_refund_record) posts nothing here:
 *             NexG paid it, so the weekly run claws the host's part back.
 *             What Paystack actually takes from the sub-account on a refund
 *             is to be confirmed with one test-mode refund.
 *
 * Never raises: it runs inside the payment webhook.
 */
create or replace function public.tg_stay_split_settled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payment;
  v_try public.paystack_attempt;
  v_payload jsonb;
  v_kind text;
  v_back bigint;
begin
  if new.payment_reference is null then
    return new;
  end if;
  select * into v_pay from public.payment
   where reference = new.payment_reference and intent = 'stay' and stay_id = new.id;
  if v_pay.id is null or v_pay.provider <> 'paystack' then
    return new;
  end if;

  begin
    if new.payment_reference is distinct from old.payment_reference then
      select * into v_try from public.paystack_attempt
       where payment_id = v_pay.id and outcome = 'paid' and split_host_id is not null
       order by created_at desc limit 1;
      if v_try.id is null then
        return new;
      end if;

      select e.payload into v_payload from public.payment_event e
       where e.provider = 'paystack' and e.reference = v_pay.reference
         and e.payload #>> '{data,reference}' = v_try.reference
       order by e.id desc limit 1;
      if coalesce(v_payload #>> '{data,subaccount,subaccount_code}', '') is distinct from v_try.split_subaccount then
        update public.paystack_attempt
           set split_host_id = null, split_subaccount = null, split_share_cents = null,
               split_commission_pct = null
         where id = v_try.id;
        perform audit.log(
          p_actor_type => 'system'::public.actor_type, p_module => 'finance',
          p_action => 'payment.split_not_made', p_actor_label => '[System] · Paystack split',
          p_target_type => 'host', p_target_id => v_try.split_host_id, p_city_id => v_pay.city_id,
          p_severity => 'high',
          p_reason => 'Paystack took the whole payment, not split to the host''s sub-account; the weekly payout run pays them.',
          p_after => jsonb_build_object('attempt', v_try.reference, 'stay_id', new.id,
            'expected', v_try.split_subaccount,
            'paystack', v_payload #>> '{data,subaccount,subaccount_code}'));
        return new;
      end if;

      if new.confirmed_at is not null and new.host_share_kes is not null then
        if not v_pay.is_test and not v_try.is_test then
          select t.kind into v_kind from ledger.transaction t
           where t.idempotency_key = 'stay_paid:' || v_pay.id::text;
          if v_kind = 'stay_paid' then
            perform ledger.post(
              p_kind => 'host_paid_by_paystack',
              p_idempotency_key => 'host_split:' || v_try.id::text,
              p_entries => jsonb_build_array(
                jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                  'party_id', new.host_id, 'debit', v_try.split_share_cents,
                  'memo', 'Paid to your Paystack sub-account · ' || v_pay.reference),
                jsonb_build_object('account', 'cash.card_processor_receivable',
                  'credit', v_try.split_share_cents,
                  'memo', v_try.reference || ' to ' || v_try.split_subaccount)),
              p_effective_at => coalesce(v_pay.paid_at, now()),
              p_city_id => v_pay.city_id,
              p_actor_kind => 'system',
              p_actor_label => '[System] · Paystack split',
              p_reason_text => 'Paystack paid the host''s share to its sub-account',
              p_related => jsonb_build_object('payment_id', v_pay.id, 'stay_id', new.id,
                'host_id', new.host_id, 'reference', v_pay.reference, 'attempt', v_try.reference));
          end if;
        end if;
      else
        perform audit.log(
          p_actor_type => 'system'::public.actor_type, p_module => 'finance',
          p_action => 'stay.split_paid_late', p_actor_label => '[System] · Paystack split',
          p_target_type => 'host', p_target_id => new.host_id, p_city_id => v_pay.city_id,
          p_severity => 'high',
          p_reason => 'Paystack sent the host''s share for a stay that could not be booked; the full refund comes back from the host''s sub-account.',
          p_after => jsonb_build_object('attempt', v_try.reference, 'stay_id', new.id,
            'share_cents', v_try.split_share_cents, 'test', v_try.is_test));
      end if;

    /* Only when Paystack actually refunded it: fn_paystack_refund_apply
       sets refunded_at and refund_reference to the processed
       paystack_refund. A refund recorded by hand (rpc_stay_refund_record,
       sent by M-Pesa or bank from NexG's own money) posts no credit-back,
       so the host's part stays taken off stay.host_share by
       stay_refund_due and the weekly run claws it back, as before. */
    elsif old.refunded_at is null and new.refunded_at is not null and not v_pay.is_test
          and exists (select 1 from public.paystack_refund r
                       where r.kind = 'stay' and r.stay_id = new.id
                         and r.reference = new.refund_reference
                         and r.state = 'processed') then
      select * into v_try from public.paystack_attempt
       where payment_id = v_pay.id and outcome = 'paid' and split_host_id is not null
       order by created_at desc limit 1;
      if v_try.id is null or not exists (
           select 1 from ledger.transaction t
            where t.idempotency_key = 'host_split:' || v_try.id::text
              and t.kind = 'host_paid_by_paystack') then
        return new;
      end if;
      select coalesce(sum(e.debit), 0)::bigint into v_back
        from ledger.entry e join ledger.transaction t on t.id = e.transaction_id
       where t.idempotency_key = 'stay_refund_due:' || v_pay.id::text
         and e.account_code = 'stay.host_share:' || new.host_id::text;
      if v_back > 0 then
        perform ledger.post(
          p_kind => 'host_refund_by_paystack',
          p_idempotency_key => 'host_split_refund:' || v_pay.id::text,
          p_entries => jsonb_build_array(
            jsonb_build_object('account', 'cash.card_processor_receivable', 'debit', v_back,
              'memo', v_pay.reference),
            jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
              'party_id', new.host_id, 'credit', v_back,
              'memo', 'Refund taken from your Paystack sub-account · ' || v_pay.reference)),
          p_effective_at => new.refunded_at,
          p_city_id => v_pay.city_id,
          p_actor_kind => 'system',
          p_actor_label => '[System] · Paystack split',
          p_reason_text => 'Paystack takes the host''s part of the refund from its sub-account',
          p_related => jsonb_build_object('payment_id', v_pay.id, 'stay_id', new.id,
            'host_id', new.host_id, 'reference', v_pay.reference, 'attempt', v_try.reference,
            'refund_reference', new.refund_reference));
      end if;
    end if;
  exception when others then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'finance',
      p_action => 'ledger.posting_failed', p_actor_label => '[System] · Paystack split',
      p_target_type => 'stay', p_target_id => new.id, p_city_id => v_pay.city_id,
      p_severity => 'high',
      p_reason => 'A host''s Paystack split could not be posted to the ledger.',
      p_after => jsonb_build_object('payment_id', v_pay.id, 'reference', v_pay.reference,
                                    'error', sqlerrm, 'sqlstate', sqlstate));
  end;
  return new;
end;
$$;
revoke execute on function public.tg_stay_split_settled() from public, anon, authenticated;

drop trigger if exists stay_split_settled on public.stay;
create trigger stay_split_settled
  after update of payment_reference, refunded_at on public.stay
  for each row
  when (old.payment_reference is distinct from new.payment_reference
        or old.refunded_at is distinct from new.refunded_at)
  execute function public.tg_stay_split_settled();

-- ══════════════════════════════════════════════════ 7. what people see

/*
 * One host's Paystack payouts, for staff (hospitality for the host's city,
 * or Finance: everything) and the host's own account-wide members (their
 * sub-accounts in use, in the modes their properties take, and their split
 * stays; no staff names or notes).
 */
create function public.rpc_host_split_overview(p_host_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host public.host;
  v_staff boolean;
  v_member boolean := authz.is_host_member(p_host_id);
  v_has_test boolean;
  v_has_live boolean;
begin
  select * into v_host from public.host where id = p_host_id;
  v_staff := authz.staff_id() is not null
             and (authz.works_hospitality(v_host.city_id) or authz.finance_reads() or authz.has_full_finance());
  if v_host.id is null or not (v_staff or v_member) then
    raise exception 'Not your host account.' using errcode = '42501';
  end if;
  v_has_test := exists (select 1 from public.property pr where pr.host_id = p_host_id and pr.accepts_test_payments);
  v_has_live := exists (select 1 from public.property pr where pr.host_id = p_host_id and not pr.accepts_test_payments);

  return jsonb_build_object(
    'viewer', case when v_staff then 'staff' else 'host' end,
    'canRecord', authz.has_full_finance(),
    'subaccounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'code', x.subaccount_code, 'test', x.is_test, 'schedule', x.schedule,
        'status', x.status,
        'details', jsonb_build_object(
          'business_name', x.paystack_details ->> 'business_name',
          'settlement_bank', x.paystack_details ->> 'settlement_bank',
          'account_last4', x.paystack_details ->> 'account_last4',
          'paystack_schedule', x.paystack_details ->> 'paystack_schedule',
          'active', x.paystack_details -> 'active'),
        'requestedAt', x.requested_at, 'decidedAt', x.decided_at)
        || case when v_staff then jsonb_build_object(
             'requestedByName', (select u.display_name from public.staff_user u where u.id = x.requested_by),
             'decidedByName', (select u.display_name from public.staff_user u where u.id = x.decided_by),
             'note', x.note, 'decisionNote', x.decision_note,
             'canDecide', x.status = 'pending' and authz.has_full_finance()
                          and x.requested_by is distinct from authz.staff_id()
                          and x.requested_by is not null)
           else '{}'::jsonb end
        order by x.requested_at desc)
      from public.host_paystack_subaccount x
      where x.host_id = p_host_id
        and (v_staff or (x.status in ('active', 'paused')
                         and ((x.is_test and v_has_test) or (not x.is_test and v_has_live))))), '[]'::jsonb),
    'stays', coalesce((select jsonb_agg(y.j order by y.paid_at desc) from (
        select jsonb_build_object(
          'stayId', s.id, 'reference', pm.reference, 'checkIn', s.check_in, 'paidAt', pm.paid_at,
          'totalCents', pm.amount_cents, 'commissionCents', s.commission_kes * 100,
          'toHostCents', a.split_share_cents, 'test', a.is_test,
          'refunded', s.refunded_at is not null) as j, pm.paid_at
          from public.paystack_attempt a
          join public.payment pm on pm.id = a.payment_id
          join public.stay s on s.id = pm.stay_id
         where a.split_host_id = p_host_id and a.outcome = 'paid'
           and (v_staff or (a.is_test and v_has_test) or (not a.is_test and v_has_live))
         order by pm.paid_at desc limit 30) y), '[]'::jsonb));
end;
$$;
revoke execute on function public.rpc_host_split_overview(uuid) from public, anon;
grant execute on function public.rpc_host_split_overview(uuid) to authenticated;

-- ═══════════════════════════════════════════ 8. the Payout rules screen

/* As 20270310000100, with the hosts' stay commission. */
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
    ('rider', 'payouts.rider.automatic_live', 40),
    ('host', 'payouts.host.commission_pct', 10)
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

-- ═══════════════════════ 9. the preset cancellation policies, by NexG

create table public.cancellation_preset_version (
  id uuid primary key default gen_random_uuid(),
  preset text not null check (preset in ('flexible', 'moderate', 'strict')),
  tiers jsonb not null check (jsonb_typeof(tiers) = 'array'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reason text check (reason is null or length(reason) <= 1000),
  requested_by uuid references public.staff_user (id) on delete set null,
  requested_at timestamptz not null default clock_timestamp(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  check (status = 'pending' or decided_at is not null)
);
comment on table public.cancellation_preset_version is
  'The tiers of the flexible, moderate and strict cancellation policies, as NexG set them. The latest approved row per preset is in force for new holds; stays keep the tiers copied onto them.';
create unique index cancellation_preset_version_one_pending
  on public.cancellation_preset_version (preset) where status = 'pending';
create index cancellation_preset_version_preset_idx
  on public.cancellation_preset_version (preset, status, decided_at desc);
alter table public.cancellation_preset_version enable row level security;
revoke all on public.cancellation_preset_version from public, anon, authenticated;

/* Today's tiers, exactly as 20270222000300 hard-coded them. */
insert into public.cancellation_preset_version (preset, tiers, status, reason, decided_at)
values
  ('flexible', '[{"days_before":1,"refund_pct":100},{"days_before":0,"refund_pct":0}]'::jsonb,
   'approved', 'The preset as it was before NexG could edit it.', now()),
  ('moderate', '[{"days_before":5,"refund_pct":100},{"days_before":1,"refund_pct":50},{"days_before":0,"refund_pct":0}]'::jsonb,
   'approved', 'The preset as it was before NexG could edit it.', now()),
  ('strict', '[{"days_before":14,"refund_pct":100},{"days_before":7,"refund_pct":50},{"days_before":0,"refund_pct":0}]'::jsonb,
   'approved', 'The preset as it was before NexG could edit it.', now());

/* A preset's tiers in force: the latest approved version, or the original. */
create function public.fn_cancellation_preset_tiers(p_preset text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select v.tiers from public.cancellation_preset_version v
      where v.preset = p_preset and v.status = 'approved'
      order by v.decided_at desc, v.requested_at desc limit 1),
    case p_preset
      when 'flexible' then '[{"days_before":1,"refund_pct":100},{"days_before":0,"refund_pct":0}]'::jsonb
      when 'moderate' then '[{"days_before":5,"refund_pct":100},{"days_before":1,"refund_pct":50},{"days_before":0,"refund_pct":0}]'::jsonb
      when 'strict' then '[{"days_before":14,"refund_pct":100},{"days_before":7,"refund_pct":50},{"days_before":0,"refund_pct":0}]'::jsonb
    end)
$$;
revoke all on function public.fn_cancellation_preset_tiers(text) from public, anon, authenticated;
grant execute on function public.fn_cancellation_preset_tiers(text) to service_role;

/*
 * As 20270222000300, with the presets' tiers from fn_cancellation_preset_tiers
 * (so STABLE now, not IMMUTABLE). Everything else is unchanged.
 * {"preset":"flexible"|"moderate"|"strict"} or {"preset":"custom","tiers":[
 *   {"days_before":N,"refund_pct":P}, ...]} → the same, with the tiers spelled
 * out, most days first. Custom: 1 to 5 tiers, days 0 to 365 each different,
 * percent 0 to 100, never more back for cancelling later. Raises 22023 for
 * anything else.
 */
create or replace function public.fn_cancellation_policy(p_policy jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_preset text := p_policy->>'preset';
  v_tiers jsonb;
  v_prev_days integer;
  v_prev_pct integer;
  t jsonb;
begin
  if p_policy is null or jsonb_typeof(p_policy) <> 'object' then
    raise exception 'Choose a cancellation policy.' using errcode = '22023';
  end if;
  if v_preset = 'flexible' then
    v_tiers := public.fn_cancellation_preset_tiers(v_preset);
  elsif v_preset = 'moderate' then
    v_tiers := public.fn_cancellation_preset_tiers(v_preset);
  elsif v_preset = 'strict' then
    v_tiers := public.fn_cancellation_preset_tiers(v_preset);
  elsif v_preset = 'custom' then
    if coalesce(jsonb_typeof(p_policy->'tiers'), '') <> 'array' or jsonb_array_length(p_policy->'tiers') not between 1 and 5 then
      raise exception 'A policy has one to five steps.' using errcode = '22023';
    end if;
    select jsonb_agg(jsonb_build_object('days_before', (x->>'days_before')::integer,
                                        'refund_pct', (x->>'refund_pct')::integer)
                     order by (x->>'days_before')::integer desc)
      into v_tiers
      from jsonb_array_elements(p_policy->'tiers') x
     where coalesce(x->>'days_before', '') ~ '^[0-9]{1,3}$'
       and coalesce(x->>'refund_pct', '') ~ '^[0-9]{1,3}$';
    if v_tiers is null or jsonb_array_length(v_tiers) <> jsonb_array_length(p_policy->'tiers') then
      raise exception 'Each step needs whole days before check-in and a percent back.' using errcode = '22023';
    end if;
    for t in select * from jsonb_array_elements(v_tiers) loop
      if (t->>'days_before')::integer > 365 or (t->>'refund_pct')::integer > 100 then
        raise exception 'Days go up to 365 and the percent up to 100.' using errcode = '22023';
      end if;
      if v_prev_days is not null and ((t->>'days_before')::integer = v_prev_days
                                      or (t->>'refund_pct')::integer > v_prev_pct) then
        raise exception 'Each step needs its own number of days, and never more back for cancelling later.'
          using errcode = '22023';
      end if;
      v_prev_days := (t->>'days_before')::integer;
      v_prev_pct := (t->>'refund_pct')::integer;
    end loop;
  else
    raise exception 'Choose flexible, moderate, strict or your own steps.' using errcode = '22023';
  end if;
  return jsonb_build_object('preset', v_preset, 'tiers', v_tiers);
end;
$$;

/*
 * The three presets for the Payout rules screen: each one's tiers in force,
 * in plain words, and any change waiting for a second person.
 */
create function public.rpc_cancellation_presets()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
begin
  if v_me is null or not (authz.finance_reads() or authz.has_full_finance() or authz.works_hospitality(null)) then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'canRequest', authz.has_full_finance() or authz.works_hospitality(null),
    'canDecide', authz.has_full_finance(),
    'presets', (select jsonb_agg(jsonb_build_object(
        'preset', k.preset,
        'tiers', public.fn_cancellation_preset_tiers(k.preset),
        'text', public.fn_cancellation_policy_text(jsonb_build_object(
                  'preset', k.preset, 'tiers', public.fn_cancellation_preset_tiers(k.preset))),
        'approvedAt', (select max(v.decided_at) from public.cancellation_preset_version v
                        where v.preset = k.preset and v.status = 'approved'),
        'pending', (select jsonb_build_object(
            'id', v.id, 'tiers', v.tiers,
            'text', public.fn_cancellation_policy_text(jsonb_build_object('preset', v.preset, 'tiers', v.tiers)),
            'reason', v.reason, 'requestedAt', v.requested_at,
            'requestedByName', (select u.display_name from public.staff_user u where u.id = v.requested_by),
            'mine', v.requested_by is not distinct from v_me)
            from public.cancellation_preset_version v
           where v.preset = k.preset and v.status = 'pending'))
        order by k.n)
      from (values ('flexible', 1), ('moderate', 2), ('strict', 3)) k (preset, n)));
end;
$$;

/* Ask to change a preset's tiers. The last step must be the day of check-in,
   so every day has an answer. One change waits per preset. */
create function public.rpc_cancellation_preset_request(p_preset text, p_tiers jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_tiers jsonb;
  v_id uuid;
begin
  if v_me is null or not (authz.has_full_finance() or authz.works_hospitality(null)) then
    raise exception 'Only Finance or hospitality staff change a preset policy.' using errcode = '42501';
  end if;
  if p_preset is null or p_preset not in ('flexible', 'moderate', 'strict') then
    raise exception 'Choose flexible, moderate or strict.' using errcode = '22023';
  end if;
  v_tiers := public.fn_cancellation_policy(jsonb_build_object('preset', 'custom', 'tiers', p_tiers)) -> 'tiers';
  if (v_tiers -> -1 ->> 'days_before')::integer <> 0 then
    raise exception 'The last step must be 0 days before check-in, so every day has an answer.'
      using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) > 1000 then
    raise exception 'Say why, in under 1,000 characters, so the second person knows what they are approving.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.cancellation_preset_version
              where preset = p_preset and status = 'pending') then
    raise exception 'A change to this preset is already waiting. Approve, reject or withdraw it first.'
      using errcode = '23505';
  end if;

  insert into public.cancellation_preset_version (preset, tiers, reason, requested_by)
  values (p_preset, v_tiers, v_reason, v_me)
  returning id into v_id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.cancellation_preset_requested',
    p_actor_id => v_me, p_target_type => 'cancellation_preset', p_target_id => v_id,
    p_target_label => p_preset, p_reason => v_reason,
    p_before => jsonb_build_object('tiers', public.fn_cancellation_preset_tiers(p_preset)),
    p_after => jsonb_build_object('preset', p_preset, 'tiers', v_tiers),
    p_severity => 'notice'::public.audit_severity);

  return public.rpc_cancellation_presets();
end;
$$;

/* A second Finance person approves or rejects it; never the one who asked. */
create function public.rpc_cancellation_preset_decide(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_row public.cancellation_preset_version;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_before jsonb;
begin
  if v_me is null or not authz.has_full_finance() then
    raise exception 'Approving a preset policy is Finance''s.' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'Approve or reject.' using errcode = '22023';
  end if;
  select * into v_row from public.cancellation_preset_version where id = p_id for update;
  if v_row.id is null then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'That request is already %.', v_row.status using errcode = '22023';
  end if;
  if v_row.requested_by = v_me then
    raise exception 'You asked for this. Somebody else has to approve it.' using errcode = '42501';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;
  v_before := public.fn_cancellation_preset_tiers(v_row.preset);

  update public.cancellation_preset_version
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v_me, decided_at = clock_timestamp(), decision_note = v_note
   where id = v_row.id;

  perform audit.log('staff'::public.actor_type, 'hotels',
    case when p_approve then 'stay.cancellation_preset_approved' else 'stay.cancellation_preset_rejected' end,
    p_actor_id => v_me, p_target_type => 'cancellation_preset', p_target_id => v_row.id,
    p_target_label => v_row.preset, p_reason => coalesce(v_note, v_row.reason),
    p_approved_by => case when p_approve then v_me end,
    p_before => jsonb_build_object('tiers', v_before),
    p_after => jsonb_build_object('preset', v_row.preset, 'tiers', v_row.tiers,
      'status', case when p_approve then 'approved' else 'rejected' end, 'requested_by', v_row.requested_by),
    p_severity => case when p_approve then 'high' else 'notice' end::public.audit_severity);

  return public.rpc_cancellation_presets();
end;
$$;

/* The requester (or Finance) takes back a change nobody has decided. */
create function public.rpc_cancellation_preset_withdraw(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_row public.cancellation_preset_version;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_row from public.cancellation_preset_version where id = p_id for update;
  if v_row.id is null then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  if not (v_row.requested_by = v_me or authz.has_full_finance()) then
    raise exception 'Only the person who asked, or someone who could approve it, can withdraw it.'
      using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'That request is already %.', v_row.status using errcode = '22023';
  end if;

  update public.cancellation_preset_version
     set status = 'withdrawn', decided_by = v_me, decided_at = clock_timestamp()
   where id = v_row.id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.cancellation_preset_withdrawn',
    p_actor_id => v_me, p_target_type => 'cancellation_preset', p_target_id => v_row.id,
    p_target_label => v_row.preset,
    p_after => jsonb_build_object('preset', v_row.preset, 'status', 'withdrawn'),
    p_severity => 'info'::public.audit_severity);

  return public.rpc_cancellation_presets();
end;
$$;

revoke all on function public.rpc_cancellation_presets(),
  public.rpc_cancellation_preset_request(text, jsonb, text),
  public.rpc_cancellation_preset_decide(uuid, boolean, text),
  public.rpc_cancellation_preset_withdraw(uuid) from public, anon;
grant execute on function public.rpc_cancellation_presets(),
  public.rpc_cancellation_preset_request(text, jsonb, text),
  public.rpc_cancellation_preset_decide(uuid, boolean, text),
  public.rpc_cancellation_preset_withdraw(uuid) to authenticated, service_role;
