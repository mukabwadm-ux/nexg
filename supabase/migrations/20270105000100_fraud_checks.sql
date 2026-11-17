-- Fraud checks: one queue for every kind of flag, filled by checks that run
-- on their own.
--
-- Before this, fraud_rule listed seven rider rules and fraud_signal could hold
-- rider flags, with a review function that gave a strike. Nothing ever raised a
-- flag, so the rules were a list. Payments, office expenses, staff and
-- customers had no checks at all.
--
-- Now:
--   1. One queue. fraud_signal holds flags about riders, customers, staff,
--      payments and office expenses: what the flag is about (subject_type,
--      subject_id, a readable label), a one-line summary, and the facts behind
--      it in details. A dedupe key raises each finding once, however often the
--      checks run. Rule kinds are text, so a new check is a row in fraud_rule,
--      not an enum change.
--   2. Checks. fn_fraud_sweep runs them every five minutes (pg_cron
--      'fraud-checks') and when someone presses "Run checks now":
--        payments   one M-Pesa code on two records (payments, prompts, rider
--                   deposits, refunds, payouts, rider kits, experiences,
--                   office expenses); a typed M-Pesa code that is not one;
--                   a cash order confirmed delivered by staff by hand
--        riders     delivered within minutes of pickup on a longer trip;
--                   delivered but never paid or collected; taken off jobs
--                   after accepting them; one phone on two rider accounts
--        customers  many refunds; cash orders turned away after pickup, also
--                   kept as guest.refusal_count (it only ever goes up)
--        expenses   the same receipt twice; the same payee and amount twice
--                   within days; approved by whoever recorded it
--      Two rider checks need the moment itself, so triggers run them: a GPS
--      jump (rider.last_location) and a delivery confirmed far from the
--      drop-off pin (order.delivered_at). Both wait for the rider app to send
--      positions, which nothing sends yet. The plate photo check needs a
--      photo reader, so it stays a rule people apply by hand.
--   3. Review. rpc_fraud_flag_decide confirms or dismisses a flag; dismissing
--      needs a reason. Rider flags can be reviewed by whoever works that
--      rider, or full Finance, and a confirmed rider flag still gives the
--      90-day strike. Everything else needs full Finance. Nobody reviews a flag
--      about themselves or about an expense they recorded, approved or paid.
--      rpc_fraud_rule_set turns a check on or off or changes its limits (full
--      Finance), rpc_fraud_checks_run runs the checks now, and
--      rpc_fraud_overview feeds the console.
--   4. Nothing here blocks money or people by itself: a flag waits for a
--      person. A check that fails is written to fraud_check_state and the
--      others still run. Locations, phone numbers and device tokens are never
--      copied into a flag: distances, masked numbers and hashes only.
--
-- Rollback (in this order):
--   select cron.unschedule('fraud-checks');
--   drop trigger rider_fraud_gps_jump on public.rider;
--   drop trigger order_fraud_delivered_far on public.order;
--   drop the functions created below and public.fraud_check_state;
--   re-run console_rider_badges_v from 20260101007700;
--   remove the flags and rules whose kind is not one of the seven rider kinds,
--   drop the columns, constraints and indexes added to fraud_rule and
--   fraud_signal, recreate public.fraud_signal_kind from 20260101007600 and
--   alter both kind columns back to it, then re-run rpc_fraud_signal_review
--   from 20260101007800.

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('fraud.flag_confirmed', 'finance', 'high', false, false, false, '{}', 'A fraud flag was confirmed after review'),
  ('fraud.flag_dismissed', 'finance', 'notice', false, false, false, '{}', 'A fraud flag was dismissed, with a reason'),
  ('fraud.rule_changed', 'finance', 'high', true, false, false, '{}', 'A fraud check was turned on or off, or its limits changed'),
  ('fraud.checks_run', 'finance', 'info', false, false, false, '{}', 'The fraud checks were run by hand')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════ one queue

/* Replaced by rpc_fraud_flag_decide. Nothing in the apps called it. */
drop function if exists public.rpc_fraud_signal_review(uuid, text);

alter table public.fraud_rule alter column kind type text using kind::text;
alter table public.fraud_signal alter column kind type text using kind::text;
drop type if exists public.fraud_signal_kind;

alter table public.fraud_rule
  add column if not exists subject_type text not null default 'rider'
    check (subject_type in ('rider', 'customer', 'merchant', 'staff', 'payment', 'expense')),
  add column if not exists description text,
  add column if not exists severity text not null default 'medium'
    check (severity in ('high', 'medium', 'low')),
  /* False for a rule people apply by hand: no check raises it. */
  add column if not exists automated boolean not null default true,
  add column if not exists sort integer not null default 100,
  add column if not exists updated_at timestamptz;

alter table public.fraud_signal
  alter column rider_id drop not null,
  add column if not exists subject_type text not null default 'rider'
    check (subject_type in ('rider', 'customer', 'merchant', 'staff', 'payment', 'expense')),
  add column if not exists subject_id uuid,
  add column if not exists subject_label text,
  add column if not exists summary text,
  add column if not exists severity text not null default 'medium'
    check (severity in ('high', 'medium', 'low')),
  add column if not exists amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  add column if not exists dedupe_key text,
  add column if not exists review_note text
    check (review_note is null or length(review_note) <= 1000);

update public.fraud_signal
   set dedupe_key = coalesce(dedupe_key, 'signal:' || id::text),
       subject_id = coalesce(subject_id, rider_id)
 where dedupe_key is null or subject_id is null;

alter table public.fraud_signal alter column dedupe_key set not null;

create unique index if not exists fraud_signal_dedupe on public.fraud_signal (dedupe_key);
create index if not exists fraud_signal_subject_idx
  on public.fraud_signal (subject_type, subject_id, detected_at desc);
create index if not exists fraud_signal_kind_idx on public.fraud_signal (kind, detected_at desc);

alter table public.fraud_signal
  drop constraint if exists fraud_signal_rider_flag_names_rider,
  add constraint fraud_signal_rider_flag_names_rider
    check (subject_type <> 'rider' or rider_id is not null),
  drop constraint if exists fraud_signal_review_is_timed,
  add constraint fraud_signal_review_is_timed
    check (status = 'open' or reviewed_at is not null),
  drop constraint if exists fraud_signal_kind_fkey,
  add constraint fraud_signal_kind_fkey
    foreign key (kind) references public.fraud_rule (kind) on update cascade;

comment on table public.fraud_signal is
  'One queue of fraud flags about riders, customers, staff, payments and office expenses. Raised by the checks in fn_fraud_sweep and two triggers, once per dedupe_key; a person confirms or dismisses each one.';

/* Finance reads the whole queue. Rider ops keep fraud_signal_read, which
   shows the flags about riders they work. */
drop policy if exists fraud_signal_finance_read on public.fraud_signal;
create policy fraud_signal_finance_read on public.fraud_signal
  for select to authenticated using ((select authz.finance_reads()));

drop policy if exists fraud_rule_finance_read on public.fraud_rule;
create policy fraud_rule_finance_read on public.fraud_rule
  for select to authenticated using ((select authz.finance_reads()));

/* When the checks last ran, what they raised and which failed. One row. */
create table if not exists public.fraud_check_state (
  id smallint primary key default 1 check (id = 1),
  last_run_at timestamptz,
  last_duration_ms integer,
  last_raised jsonb not null default '{}'::jsonb,
  last_errors jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.fraud_check_state enable row level security;
revoke all on table public.fraud_check_state from anon, authenticated;
grant select on table public.fraud_check_state to authenticated;

drop policy if exists fraud_check_state_read on public.fraud_check_state;
create policy fraud_check_state_read on public.fraud_check_state
  for select to authenticated
  using ((select authz.finance_reads()) or (select authz.reaches_module('riders')));

-- ═══════════════════════════════════════════════════════════ the rules

insert into public.fraud_rule as r (kind, subject_type, label, description, severity, automated, params, sort) values
  ('mpesa_code_reused', 'payment', 'One M-Pesa code on two records',
   'The same M-Pesa transaction code is on two different payments, deposits, refunds, payouts or payments recorded by hand. M-Pesa never reuses a code, so one payment is being counted twice.',
   'high', true, '{}', 10),
  ('mpesa_code_malformed', 'staff', 'Typed M-Pesa code is not a real code',
   'A payment recorded by hand as M-Pesa has a reference that is not 10 letters and digits. It cannot be found on the M-Pesa statement.',
   'low', true, '{}', 20),
  ('cash_confirmed_by_hand', 'staff', 'Cash order confirmed delivered by staff',
   'Staff marked a cash-on-delivery order delivered by hand, which records the cash as collected. Check that a rider really holds that cash.',
   'medium', true, '{}', 30),

  ('gps_jump', 'rider', 'GPS jump: too far, too fast',
   'The rider''s phone reported two positions too far apart to ride between in the time, usually a location-faking app. Runs as positions arrive; the rider app does not send them yet.',
   'high', true, '{"km": 2, "seconds": 60}', 40),
  ('delivered_far_from_pin', 'rider', 'Delivered far from the drop-off pin',
   'Marked delivered while the rider''s latest position was well away from the pin. Runs at the moment of delivery; the rider app does not send positions yet.',
   'medium', true, '{"metres": 300, "fix_minutes": 2}', 50),
  ('delivered_too_fast', 'rider', 'Delivered too soon after pickup',
   'Marked delivered within minutes of pickup on a longer trip: the order was probably closed without being carried.',
   'medium', true, '{"minutes": 3, "min_km": 1}', 60),
  ('shared_device', 'rider', 'Same phone on two rider accounts',
   'Two rider accounts use the same phone: one person working two accounts, or an account lent to someone who was never checked.',
   'high', true, '{}', 70),
  ('plate_photo_mismatch', 'rider', 'Plate on the hand-off photo is not the registered plate',
   'Needs a photo reader, so no check raises it. Compare hand-off photos with the registered plate by hand.',
   'medium', false, '{}', 80),
  ('cash_marked_mpesa', 'rider', 'Delivered, but never paid or collected',
   'An order was marked delivered and, after the wait below, the cash is still not recorded as collected or the M-Pesa or card payment never arrived.',
   'high', true, '{"grace_minutes": 30}', 90),
  ('offer_farming', 'rider', 'Accepts jobs, then is taken off them',
   'Accepted jobs and was then moved off them by dispatch, again and again in a short time: holding jobs they do not intend to ride.',
   'medium', true, '{"times": 3, "days": 7}', 100),

  ('refund_heavy', 'customer', 'Many refunds',
   'A customer had several refunds approved or paid in a short time.',
   'medium', true, '{"refunds": 3, "days": 30}', 110),
  ('pod_refusals', 'customer', 'Cash orders turned away after pickup',
   'A customer cancelled, or could not be reached, for cash-on-delivery orders the rider had already collected, more than once in a short time.',
   'medium', true, '{"times": 2, "days": 60}', 120),

  ('expense_same_receipt', 'expense', 'Same receipt on two expenses',
   'Two office expenses carry the same receipt: the same stored file, or the same file uploaded twice.',
   'high', true, '{}', 130),
  ('expense_repeat', 'expense', 'Same payee and amount twice',
   'Two office expenses to the same payee for the same amount, spent within days of each other: often one bill claimed twice.',
   'medium', true, '{"days": 7}', 140),
  ('expense_self_approved', 'expense', 'Approved by the person who recorded it',
   'A super admin approved an office expense they recorded themselves. Someone else should look at it.',
   'medium', true, '{}', 150)
on conflict (kind) do update
set subject_type = excluded.subject_type,
    label = excluded.label,
    description = excluded.description,
    severity = excluded.severity,
    automated = excluded.automated,
    sort = excluded.sort,
    /* Limits someone already set win; new limits are added. */
    params = excluded.params || r.params;

-- ═════════════════════════════════════════════════════════════ helpers

/* A rule's limit, or the default when the rule or the limit is missing. */
create or replace function public.fn_fraud_param(p_kind text, p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(r.params -> p_key) = 'number' then (r.params ->> p_key)::numeric end
       from public.fraud_rule r where r.kind = p_kind),
    p_default);
$$;

/* Whether a check should run: the rule exists, is on and is automated. */
create or replace function public.fn_fraud_on(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.enabled and r.automated from public.fraud_rule r where r.kind = p_kind), false);
$$;

create or replace function public.fn_fraud_kes(p_cents bigint)
returns text
language sql
stable
set search_path = ''
as $$
  select 'KES ' || case
    when p_cents is null then '0'
    when p_cents % 100 = 0 then to_char(p_cents / 100, 'FM999,999,999,990')
    else to_char(p_cents / 100.0, 'FM999,999,999,990.00') end;
$$;

create or replace function public.fn_fraud_rider_label(p_rider_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '')
       from public.rider r where r.id = p_rider_id),
    'Rider');
$$;

create or replace function public.fn_fraud_staff_label(p_staff_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(btrim(s.display_name), ''), split_part(s.email, '@', 1))
       from public.staff_user s where s.id = p_staff_id),
    'Staff member');
$$;

/* Customers appear as "Customer ···123", as everywhere in Finance. */
create or replace function public.fn_fraud_customer_label(p_guest_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'Customer' || coalesce(
    (select ' ···' || nullif(right(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), 3), '')
       from public.guest g where g.id = p_guest_id),
    '');
$$;

/*
 * Raises one flag, once. Returns its id, or null when the rule is off or the
 * same finding was raised before (whatever became of it).
 */
create or replace function public.fn_fraud_raise(
  p_kind text,
  p_dedupe_key text,
  p_subject_type text,
  p_subject_id uuid,
  p_subject_label text,
  p_summary text,
  p_details jsonb default '{}'::jsonb,
  p_rider_id uuid default null,
  p_order_reference text default null,
  p_amount_cents bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.fraud_rule;
  v_id uuid;
begin
  select * into v_rule from public.fraud_rule where kind = p_kind;
  if v_rule.kind is null or not v_rule.enabled then
    return null;
  end if;

  insert into public.fraud_signal (
    kind, dedupe_key, subject_type, subject_id, subject_label, summary, details,
    rider_id, order_reference, amount_cents, severity)
  values (
    p_kind, p_dedupe_key, p_subject_type, p_subject_id, left(p_subject_label, 200),
    left(p_summary, 300), coalesce(p_details, '{}'::jsonb), p_rider_id, p_order_reference,
    case when p_amount_cents >= 0 then p_amount_cents end, v_rule.severity)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════ payments

create or replace function public.fn_fraud_check_payments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_n integer;
begin
  /*
   * One M-Pesa code on two records. A payment and the prompts answered for it
   * share a code, and so do a refund and the payout that sent it, so codes are
   * compared between records, not rows. A payout's source_ref names money
   * already counted elsewhere and is left out.
   */
  if public.fn_fraud_on('mpesa_code_reused') then
    with codes as (
      select regexp_replace(upper(p.provider_receipt), '\s', '', 'g') as code,
             'payment:' || p.id as grp, 'payment' as source, p.id as record_id,
             'Payment ' || p.reference as label, p.amount_cents as cents,
             coalesce(p.paid_at, p.updated_at) as at
        from public.payment p
       where p.provider_receipt is not null
      union all
      select regexp_replace(upper(pr.receipt), '\s', '', 'g'), 'payment:' || p.id, 'payment', p.id,
             'Payment ' || p.reference, p.amount_cents, coalesce(pr.resolved_at, pr.sent_at)
        from public.payment_prompt pr
        join public.payment p on p.id = pr.payment_id
       where pr.receipt is not null
      union all
      select regexp_replace(upper(d.provider_ref), '\s', '', 'g'), 'cash_deposit:' || d.id,
             'cash_deposit', d.id, 'Rider cash deposit', d.amount_kes * 100, d.paid_at
        from public.cash_deposit d
      union all
      select regexp_replace(upper(r.provider_ref), '\s', '', 'g'), 'refund:' || r.id, 'refund', r.id,
             'Refund on ' || coalesce(o.reference, 'an order'), r.amount_cents,
             coalesce(r.issued_at, r.requested_at)
        from public.refund r
        left join public.order o on o.id = r.order_id
       where r.provider_ref is not null
      union all
      select regexp_replace(upper(m.receipt), '\s', '', 'g'),
             coalesce('refund:' || m.refund_id::text, 'payout:' || m.id::text),
             'mpesa_payout', m.id, 'M-Pesa payout', m.amount_cents,
             coalesce(m.finished_at, m.answered_at, m.created_at)
        from public.mpesa_payout m
       where m.receipt is not null
      union all
      select regexp_replace(upper(k.paid_reference), '\s', '', 'g'), 'rider_kit:' || k.rider_id,
             'rider_kit', k.rider_id, 'Rider kit payment', k.paid_amount_kes * 100, k.paid_at
        from public.rider_kit_order k
       where k.paid_reference is not null
      union all
      select regexp_replace(upper(pl.payment_reference), '\s', '', 'g'), 'plan:' || pl.id, 'plan',
             pl.id, 'Experience ' || pl.reference, pl.quote_total_kes * 100, pl.paid_at
        from public.plan pl
       where pl.payment_reference is not null
      union all
      select regexp_replace(upper(e.payment_reference), '\s', '', 'g'), 'expense:' || e.id,
             'office_expense', e.id, 'Office expense ' || e.number, e.amount_cents,
             e.paid_on::timestamptz
        from public.fin_office_expense e
       where e.payment_reference is not null and e.status <> 'cancelled'
    ),
    one_per_record as (
      select distinct on (c.code, c.grp) c.*
        from codes c
       where c.code ~ '^[A-Z0-9]{10}$'
       order by c.code, c.grp, c.at nulls last
    ),
    reused as (
      select c.code, count(*) as records, max(c.cents) as cents,
             jsonb_agg(jsonb_build_object('source', c.source, 'id', c.record_id, 'label', c.label,
                                          'amount_cents', c.cents, 'at', c.at)
                       order by c.at nulls last, c.label) as list,
             string_agg(c.label, ', ' order by c.at nulls last, c.label) as labels
        from one_per_record c
       group by c.code
      having count(*) > 1
    )
    select count(*) filter (where public.fn_fraud_raise(
             'mpesa_code_reused', 'mpesa_code_reused:' || u.code || ':' || u.records,
             'payment', null, 'M-Pesa ' || u.code,
             'M-Pesa code ' || u.code || ' is on ' || u.records || ' records: ' || u.labels,
             jsonb_build_object('code', u.code, 'records', u.list),
             p_amount_cents => u.cents) is not null)
      into v_n
      from reused u;
    v_total := v_total + v_n;
  end if;

  /* A typed M-Pesa code that is not one: M-Pesa codes are 10 letters and digits. */
  if public.fn_fraud_on('mpesa_code_malformed') then
    select count(*) filter (where public.fn_fraud_raise(
             'mpesa_code_malformed',
             'mpesa_code_malformed:' || t.source || ':' || t.record_id || ':' || md5(t.typed),
             'staff', t.staff_id, public.fn_fraud_staff_label(t.staff_id),
             '"' || left(t.typed, 40) || '" was recorded as the M-Pesa code for ' || t.label,
             jsonb_build_object('source', t.source, 'id', t.record_id, 'label', t.label,
                                'typed', left(t.typed, 80)),
             p_amount_cents => t.cents) is not null)
      into v_n
      from (
        select 'rider_kit' as source, k.rider_id as record_id, k.paid_reference as typed,
               k.paid_recorded_by as staff_id,
               'a rider kit (' || public.fn_fraud_rider_label(k.rider_id) || ')' as label,
               k.paid_amount_kes * 100 as cents
          from public.rider_kit_order k
         where k.paid_method = 'mpesa' and k.paid_reference is not null
        union all
        select 'office_expense', e.id, e.payment_reference, e.paid_by,
               'office expense ' || e.number, e.amount_cents
          from public.fin_office_expense e
         where e.payment_method = 'mpesa' and e.payment_reference is not null and e.status = 'paid'
      ) t
     where t.staff_id is not null
       and regexp_replace(upper(t.typed), '\s', '', 'g') !~ '^[A-Z0-9]{10}$';
    v_total := v_total + v_n;
  end if;

  /*
   * Staff confirming a cash order delivered also records the cash as
   * collected (rpc_order_mark). Somebody should see that a rider holds it.
   */
  if public.fn_fraud_on('cash_confirmed_by_hand') then
    select count(*) filter (where public.fn_fraud_raise(
             'cash_confirmed_by_hand', 'cash_confirmed_by_hand:' || o.id,
             'staff', e.actor_id, public.fn_fraud_staff_label(e.actor_id),
             'Cash order ' || o.reference || ' (' || public.fn_fraud_kes(o.total_cents)
               || ') was marked delivered by hand'
               || case when o.rider_id is null then ', with no rider holding the cash' else '' end,
             jsonb_build_object('order_id', o.id, 'reference', o.reference,
                                'total_cents', o.total_cents,
                                'rider', case when o.rider_id is not null
                                              then public.fn_fraud_rider_label(o.rider_id) end,
                                'reason', e.detail, 'at', e.at),
             p_order_reference => o.reference, p_amount_cents => o.total_cents) is not null)
      into v_n
      from public.order_event e
      join public.order o on o.id = e.order_id
     where e.kind = 'delivered'
       and e.actor_type = 'staff'
       and e.actor_id is not null
       and o.payment_method = 'cash_on_delivery'
       and e.at > now() - interval '30 days';
    v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

-- ═════════════════════════════════════════════════════════════ riders

create or replace function public.fn_fraud_check_riders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_n integer;
  v_minutes numeric;
  v_min_km numeric;
  v_grace numeric;
  v_times numeric;
  v_days numeric;
begin
  /* Closed within minutes of pickup on a trip that takes longer than that. */
  if public.fn_fraud_on('delivered_too_fast') then
    v_minutes := public.fn_fraud_param('delivered_too_fast', 'minutes', 3);
    v_min_km := public.fn_fraud_param('delivered_too_fast', 'min_km', 1);
    select count(*) filter (where public.fn_fraud_raise(
             'delivered_too_fast', 'delivered_too_fast:' || x.id,
             'rider', x.rider_id, public.fn_fraud_rider_label(x.rider_id),
             'Order ' || x.reference || ' was delivered '
               || greatest(0, round(extract(epoch from x.delivered_at - x.picked_up_at) / 60.0))::int
               || ' min after pickup'
               || coalesce(' on a ' || round(x.km, 1) || ' km trip', ''),
             jsonb_build_object('order_id', x.id, 'reference', x.reference,
                                'picked_up_at', x.picked_up_at, 'delivered_at', x.delivered_at,
                                'trip_km', x.km),
             p_rider_id => x.rider_id, p_order_reference => x.reference) is not null)
      into v_n
      from (
        select o.id, o.reference, o.rider_id, o.picked_up_at, o.delivered_at,
               (select j.distance_km from dispatch.job j
                 where j.order_id = o.id order by j.started_at desc limit 1) as km
          from public.order o
         where o.rider_id is not null
           and o.picked_up_at is not null
           and o.delivered_at is not null
           and o.delivered_at > now() - interval '30 days'
           and o.delivered_at - o.picked_up_at < make_interval(secs => v_minutes * 60)
      ) x
     where x.km is null or x.km > v_min_km;
    v_total := v_total + v_n;
  end if;

  /* Delivered, and the money never followed. */
  if public.fn_fraud_on('cash_marked_mpesa') then
    v_grace := public.fn_fraud_param('cash_marked_mpesa', 'grace_minutes', 30);
    select count(*) filter (where public.fn_fraud_raise(
             'cash_marked_mpesa', 'cash_marked_mpesa:' || o.id,
             'rider', o.rider_id, public.fn_fraud_rider_label(o.rider_id),
             'Order ' || o.reference || ' (' || public.fn_fraud_kes(o.total_cents) || ') was delivered but '
               || case when o.payment_method = 'cash_on_delivery'
                       then 'the cash was never recorded as collected'
                       else 'never paid (' || replace(o.payment_method::text, '_', ' ') || ')' end,
             jsonb_build_object('order_id', o.id, 'reference', o.reference,
                                'payment_method', o.payment_method, 'payment_status', o.payment_status,
                                'delivered_at', o.delivered_at, 'total_cents', o.total_cents),
             p_rider_id => o.rider_id, p_order_reference => o.reference,
             p_amount_cents => o.total_cents) is not null)
      into v_n
      from public.order o
     where o.rider_id is not null
       and o.stage = 'delivered'
       and o.payment_method in ('cash_on_delivery', 'mpesa_stk', 'card')
       and o.payment_status not in ('paid', 'collected', 'refunded', 'partially_refunded')
       and o.delivered_at < now() - make_interval(secs => v_grace * 60)
       and o.delivered_at > now() - interval '30 days';
    v_total := v_total + v_n;
  end if;

  /* Accepted, then moved off the job by dispatch. One flag a week at most. */
  if public.fn_fraud_on('offer_farming') then
    v_times := public.fn_fraud_param('offer_farming', 'times', 3);
    v_days := public.fn_fraud_param('offer_farming', 'days', 7);
    select count(*) filter (where public.fn_fraud_raise(
             'offer_farming',
             'offer_farming:' || x.rider_id || ':'
               || to_char(now() at time zone 'Africa/Nairobi', 'IYYY-IW'),
             'rider', x.rider_id, public.fn_fraud_rider_label(x.rider_id),
             'Moved off ' || x.n || ' job' || case when x.n = 1 then '' else 's' end
               || ' after accepting ' || case when x.n = 1 then 'it' else 'them' end
               || ', in ' || round(v_days)::int || ' day' || case when round(v_days) = 1 then '' else 's' end,
             jsonb_build_object('jobs', x.jobs, 'days', v_days),
             p_rider_id => x.rider_id) is not null)
      into v_n
      from (
        select m.rider_id,
               count(distinct m.job_id) as n,
               jsonb_agg(jsonb_build_object('reference', o.reference, 'at', m.at, 'reason', m.reason)
                         order by m.at) as jobs
          from (
            select a.job_id, a.at, a.reason,
                   case when coalesce(a.params ->> 'from_rider_id', '')
                             ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then (a.params ->> 'from_rider_id')::uuid end as rider_id
              from dispatch.action a
             where a.kind = 'reassign'
               and a.at > now() - make_interval(secs => v_days * 86400)
          ) m
          join dispatch.job j on j.id = m.job_id
          join public.order o on o.id = j.order_id
         where m.rider_id is not null
           and exists (select 1 from dispatch.offer f
                        where f.job_id = m.job_id
                          and f.rider_id = m.rider_id
                          and f.outcome = 'accepted')
         group by m.rider_id
        having count(distinct m.job_id) >= v_times
      ) x
     where exists (select 1 from public.rider r where r.id = x.rider_id);
    v_total := v_total + v_n;
  end if;

  /*
   * One phone, two rider accounts: the same push token on two bound devices,
   * or the same device fingerprint on two riders. Only hashes leave here.
   */
  if public.fn_fraud_on('shared_device') then
    with phones as (
      select 'push:' || md5(d.push_token) as phone_key, d.rider_id
        from public.rider_device d
       where d.push_token is not null and btrim(d.push_token) <> '' and d.unbound_at is null
      union
      select 'device:' || md5(r.device_fingerprint), r.id
        from public.rider r
       where r.device_fingerprint is not null and btrim(r.device_fingerprint) <> ''
         and r.offboarded_at is null
    ),
    shared as (
      select p.phone_key, array_agg(distinct p.rider_id) as riders
        from phones p
       group by p.phone_key
      having count(distinct p.rider_id) > 1
    )
    select count(*) filter (where public.fn_fraud_raise(
             'shared_device', 'shared_device:' || s.phone_key || ':' || r.id,
             'rider', r.id, public.fn_fraud_rider_label(r.id),
             'Same phone as ' || (cardinality(s.riders) - 1) || ' other rider account'
               || case when cardinality(s.riders) > 2 then 's' else '' end || ': '
               || (select string_agg(public.fn_fraud_rider_label(o), ', ')
                     from unnest(s.riders) o where o <> r.id),
             jsonb_build_object(
               'phone', left(s.phone_key, 16),
               'other_riders', (select jsonb_agg(jsonb_build_object('id', o, 'name', public.fn_fraud_rider_label(o)))
                                  from unnest(s.riders) o where o <> r.id)),
             p_rider_id => r.id) is not null)
      into v_n
      from shared s
      join public.rider r on r.id = any (s.riders);
    v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

-- ═══════════════════════════════════════════════════════════ customers

create or replace function public.fn_fraud_check_customers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_n integer;
  v_times numeric;
  v_days numeric;
begin
  /*
   * guest.refusal_count is shown on the guest record. A refusal is a cash
   * order the customer cancelled, or could not be reached for, after the
   * rider had collected it. The count only rises, so a figure somebody set
   * by hand is never lowered.
   */
  update public.guest g
     set refusal_count = x.n
    from (
      select o.guest_id, count(*)::integer as n
        from public.order o
       where o.payment_method = 'cash_on_delivery'
         and o.stage = 'cancelled'
         and o.picked_up_at is not null
         and o.guest_id is not null
         and o.cancel_reason_code in ('guest_unreachable', 'guest_cancelled')
       group by o.guest_id
    ) x
   where g.id = x.guest_id and g.refusal_count < x.n;

  if public.fn_fraud_on('pod_refusals') then
    v_times := public.fn_fraud_param('pod_refusals', 'times', 2);
    v_days := public.fn_fraud_param('pod_refusals', 'days', 60);
    select count(*) filter (where public.fn_fraud_raise(
             'pod_refusals', 'pod_refusals:' || x.guest_id || ':' || x.last_epoch,
             'customer', x.guest_id, public.fn_fraud_customer_label(x.guest_id),
             x.n || ' cash order' || case when x.n = 1 then '' else 's' end
               || ' turned away after pickup in ' || round(v_days)::int || ' day'
               || case when round(v_days) = 1 then '' else 's' end || ', '
               || public.fn_fraud_kes(x.cents),
             jsonb_build_object('orders', x.orders, 'days', v_days),
             p_amount_cents => x.cents) is not null)
      into v_n
      from (
        select o.guest_id, count(*) as n, sum(o.total_cents)::bigint as cents,
               floor(extract(epoch from max(o.cancelled_at)))::bigint as last_epoch,
               jsonb_agg(jsonb_build_object('reference', o.reference, 'at', o.cancelled_at,
                                            'reason', o.cancel_reason_code,
                                            'total_cents', o.total_cents)
                         order by o.cancelled_at) as orders
          from public.order o
         where o.payment_method = 'cash_on_delivery'
           and o.stage = 'cancelled'
           and o.picked_up_at is not null
           and o.guest_id is not null
           and o.cancel_reason_code in ('guest_unreachable', 'guest_cancelled')
           and o.cancelled_at > now() - make_interval(secs => v_days * 86400)
         group by o.guest_id
        having count(*) >= v_times
      ) x;
    v_total := v_total + v_n;
  end if;

  if public.fn_fraud_on('refund_heavy') then
    v_times := public.fn_fraud_param('refund_heavy', 'refunds', 3);
    v_days := public.fn_fraud_param('refund_heavy', 'days', 30);
    select count(*) filter (where public.fn_fraud_raise(
             'refund_heavy', 'refund_heavy:' || x.guest_id || ':' || x.last_epoch,
             'customer', x.guest_id, public.fn_fraud_customer_label(x.guest_id),
             x.n || ' refund' || case when x.n = 1 then '' else 's' end || ' in '
               || round(v_days)::int || ' day' || case when round(v_days) = 1 then '' else 's' end
               || ', ' || public.fn_fraud_kes(x.cents),
             jsonb_build_object('refunds', x.refunds, 'days', v_days),
             p_amount_cents => x.cents) is not null)
      into v_n
      from (
        select o.guest_id, count(*) as n, sum(r.amount_cents)::bigint as cents,
               floor(extract(epoch from max(r.requested_at)))::bigint as last_epoch,
               jsonb_agg(jsonb_build_object('reference', o.reference, 'amount_cents', r.amount_cents,
                                            'reason', r.reason_code, 'at', r.requested_at)
                         order by r.requested_at) as refunds
          from public.refund r
          join public.order o on o.id = r.order_id
         where r.status in ('approved', 'issued')
           and o.guest_id is not null
           and r.requested_at > now() - make_interval(secs => v_days * 86400)
         group by o.guest_id
        having count(*) >= v_times
      ) x;
    v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

-- ════════════════════════════════════════════════════ office expenses

create or replace function public.fn_fraud_check_expenses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_n integer;
  v_days numeric;
begin
  /* The same stored receipt, or the same file uploaded twice (same checksum and size). */
  if public.fn_fraud_on('expense_same_receipt') then
    with live as (
      select e.id, e.number, e.payee, e.amount_cents, e.receipt_path, e.submitted_at,
             o.metadata ->> 'eTag' as etag, o.metadata ->> 'size' as size
        from public.fin_office_expense e
        left join storage.objects o
          on o.bucket_id = 'office-receipts' and o.name = e.receipt_path
       where e.receipt_path is not null and e.status not in ('cancelled', 'rejected')
    )
    select count(*) filter (where public.fn_fraud_raise(
             'expense_same_receipt', 'expense_same_receipt:' || later.id || ':' || earlier.id,
             'expense', later.id, later.number || ' · ' || later.payee,
             later.number || ' has the same receipt as ' || earlier.number,
             jsonb_build_object('expense', later.number, 'earlier', earlier.number,
                                'same_file', later.receipt_path = earlier.receipt_path),
             p_amount_cents => later.amount_cents) is not null)
      into v_n
      from live later
      join live earlier
        on (earlier.submitted_at, earlier.id) < (later.submitted_at, later.id)
       and (earlier.receipt_path = later.receipt_path
            or (later.etag is not null and earlier.etag = later.etag and earlier.size = later.size));
    v_total := v_total + v_n;
  end if;

  /* One bill claimed twice: same payee, same amount, days apart. */
  if public.fn_fraud_on('expense_repeat') then
    v_days := public.fn_fraud_param('expense_repeat', 'days', 7);
    select count(*) filter (where public.fn_fraud_raise(
             'expense_repeat', 'expense_repeat:' || l.id,
             'expense', l.id, l.number || ' · ' || l.payee,
             l.number || ': ' || public.fn_fraud_kes(l.amount_cents) || ' to ' || l.payee
               || ' again (' || e.number || ', '
               || case when l.spent_on = e.spent_on then 'the same day'
                       else abs(l.spent_on - e.spent_on) || ' day'
                            || case when abs(l.spent_on - e.spent_on) = 1 then '' else 's' end
                            || ' apart' end || ')',
             jsonb_build_object('expense', l.number, 'earlier', e.number,
                                'days_apart', abs(l.spent_on - e.spent_on)),
             p_amount_cents => l.amount_cents) is not null)
      into v_n
      from public.fin_office_expense l
      join lateral (
        select e.number, e.spent_on
          from public.fin_office_expense e
         where e.id <> l.id
           and e.status not in ('cancelled', 'rejected')
           and lower(btrim(e.payee)) = lower(btrim(l.payee))
           and e.amount_cents = l.amount_cents
           and abs(e.spent_on - l.spent_on) <= v_days
           and (e.submitted_at, e.id) < (l.submitted_at, l.id)
         order by e.submitted_at desc
         limit 1
      ) e on true
     where l.status not in ('cancelled', 'rejected');
    v_total := v_total + v_n;
  end if;

  /* rpc_office_expense_decide lets a super admin approve their own expense, and logs it. */
  if public.fn_fraud_on('expense_self_approved') then
    select count(*) filter (where public.fn_fraud_raise(
             'expense_self_approved', 'expense_self_approved:' || e.id,
             'expense', e.id, e.number || ' · ' || e.payee,
             e.number || ' (' || public.fn_fraud_kes(e.amount_cents) || ') was approved by '
               || public.fn_fraud_staff_label(e.decided_by) || ', who recorded it',
             jsonb_build_object('expense', e.number, 'staff', public.fn_fraud_staff_label(e.decided_by),
                                'decided_at', e.decided_at),
             p_amount_cents => e.amount_cents) is not null)
      into v_n
      from public.fin_office_expense e
     where e.status in ('approved', 'paid')
       and e.decided_by is not null
       and e.decided_by = e.submitted_by;
    v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

-- ═══════════════════════════════════════════════════════════ the sweep

/*
 * Runs every check. One that fails is written down and the rest still run.
 * A second caller waits for the first, so "Run checks now" during the
 * scheduled run does not race it.
 */
create or replace function public.fn_fraud_sweep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_raised jsonb := '{}'::jsonb;
  v_errors jsonb := '{}'::jsonb;
  v_n integer;
  v_ms integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.fn_fraud_sweep'));

  begin
    v_n := public.fn_fraud_check_payments();
    v_raised := v_raised || jsonb_build_object('payments', v_n);
  exception when others then
    v_errors := v_errors || jsonb_build_object('payments', sqlerrm);
    raise warning 'fraud checks (payments) failed: %', sqlerrm;
  end;

  begin
    v_n := public.fn_fraud_check_riders();
    v_raised := v_raised || jsonb_build_object('riders', v_n);
  exception when others then
    v_errors := v_errors || jsonb_build_object('riders', sqlerrm);
    raise warning 'fraud checks (riders) failed: %', sqlerrm;
  end;

  begin
    v_n := public.fn_fraud_check_customers();
    v_raised := v_raised || jsonb_build_object('customers', v_n);
  exception when others then
    v_errors := v_errors || jsonb_build_object('customers', sqlerrm);
    raise warning 'fraud checks (customers) failed: %', sqlerrm;
  end;

  begin
    v_n := public.fn_fraud_check_expenses();
    v_raised := v_raised || jsonb_build_object('expenses', v_n);
  exception when others then
    v_errors := v_errors || jsonb_build_object('expenses', sqlerrm);
    raise warning 'fraud checks (expenses) failed: %', sqlerrm;
  end;

  v_ms := floor(extract(epoch from clock_timestamp() - v_started) * 1000)::integer;

  insert into public.fraud_check_state as s
    (id, last_run_at, last_duration_ms, last_raised, last_errors, updated_at)
  values (1, v_started, v_ms, v_raised, v_errors, now())
  on conflict (id) do update
  set last_run_at = excluded.last_run_at,
      last_duration_ms = excluded.last_duration_ms,
      last_raised = excluded.last_raised,
      last_errors = excluded.last_errors,
      updated_at = excluded.updated_at;

  return jsonb_build_object('ran_at', v_started, 'duration_ms', v_ms,
                            'raised', v_raised, 'errors', v_errors);
end;
$$;

-- ════════════════════════════════════════ checks that need the moment

/*
 * Two positions too far apart to ride between. Runs as the rider app sends
 * positions; it never stops a position being saved.
 */
create or replace function public.tg_fraud_gps_jump()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seconds numeric;
  v_metres numeric;
begin
  begin
    if old.last_location is not null and new.last_location is not null
       and old.last_location_at is not null and new.last_location_at is not null
       and public.fn_fraud_on('gps_jump') then
      v_seconds := extract(epoch from new.last_location_at - old.last_location_at);
      v_metres := extensions.st_distance(old.last_location, new.last_location);
      if v_seconds > 0
         and v_seconds < public.fn_fraud_param('gps_jump', 'seconds', 60)
         and v_metres > public.fn_fraud_param('gps_jump', 'km', 2) * 1000 then
        perform public.fn_fraud_raise(
          'gps_jump',
          'gps_jump:' || new.id || ':' || floor(extract(epoch from new.last_location_at))::bigint,
          'rider', new.id, public.fn_fraud_rider_label(new.id),
          round(v_metres / 1000.0, 1) || ' km in ' || round(v_seconds)::int || ' seconds',
          jsonb_build_object('km', round(v_metres / 1000.0, 2), 'seconds', round(v_seconds),
                             'from_at', old.last_location_at, 'to_at', new.last_location_at),
          p_rider_id => new.id, p_order_reference => new.current_order_reference);
      end if;
    end if;
  exception when others then
    raise warning 'fraud check gps_jump failed for rider %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists rider_fraud_gps_jump on public.rider;
create trigger rider_fraud_gps_jump
  after update of last_location, last_location_at on public.rider
  for each row
  when (old.last_location_at is distinct from new.last_location_at)
  execute function public.tg_fraud_gps_jump();

/*
 * Marked delivered while the rider's latest position, taken within a couple
 * of minutes of it, was well away from the pin. Never stops the delivery.
 */
create or replace function public.tg_fraud_delivered_far()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location extensions.geography;
  v_at timestamptz;
  v_metres numeric;
begin
  begin
    if public.fn_fraud_on('delivered_far_from_pin') then
      select r.last_location, r.last_location_at into v_location, v_at
        from public.rider r where r.id = new.rider_id;
      if v_location is not null and v_at is not null
         and abs(extract(epoch from new.delivered_at - v_at))
             <= public.fn_fraud_param('delivered_far_from_pin', 'fix_minutes', 2) * 60 then
        v_metres := extensions.st_distance(v_location, new.dropoff_point);
        if v_metres > public.fn_fraud_param('delivered_far_from_pin', 'metres', 300) then
          perform public.fn_fraud_raise(
            'delivered_far_from_pin', 'delivered_far_from_pin:' || new.id,
            'rider', new.rider_id, public.fn_fraud_rider_label(new.rider_id),
            'Order ' || new.reference || ' was marked delivered '
              || case when v_metres >= 1000 then round(v_metres / 1000.0, 1) || ' km'
                      else round(v_metres)::int || ' m' end
              || ' from the drop-off pin',
            jsonb_build_object('order_id', new.id, 'reference', new.reference,
                               'metres', round(v_metres), 'position_at', v_at,
                               'delivered_at', new.delivered_at),
            p_rider_id => new.rider_id, p_order_reference => new.reference);
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'fraud check delivered_far_from_pin failed for order %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists order_fraud_delivered_far on public.order;
create trigger order_fraud_delivered_far
  after update of delivered_at on public.order
  for each row
  when (old.delivered_at is null and new.delivered_at is not null
        and new.rider_id is not null and new.dropoff_point is not null)
  execute function public.tg_fraud_delivered_far();

-- ══════════════════════════════════════════════════════════════ review

/*
 * Whether the caller may confirm or dismiss this flag. Nobody reviews a flag
 * about themselves, or about an expense they recorded, approved or paid.
 */
create or replace function public.fn_fraud_may_review(p_signal public.fraud_signal)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
begin
  if v_staff is null or p_signal.id is null then
    return false;
  end if;
  if p_signal.subject_type = 'staff' and p_signal.subject_id = v_staff then
    return false;
  end if;
  if p_signal.subject_type = 'expense' and exists (
       select 1 from public.fin_office_expense e
        where e.id = p_signal.subject_id
          and v_staff in (e.submitted_by, e.decided_by, e.paid_by)) then
    return false;
  end if;
  if p_signal.kind = 'cash_confirmed_by_hand' and p_signal.subject_id = v_staff then
    return false;
  end if;
  if authz.is_super_admin() or authz.has_full_finance() then
    return true;
  end if;
  return p_signal.subject_type = 'rider'
     and p_signal.rider_id is not null
     and authz.works_rider(p_signal.rider_id);
end;
$$;

/*
 * Confirm or dismiss one open flag. Dismissing needs a reason. A confirmed
 * rider flag gives the rider a level-2 strike for 90 days, as the riders
 * screen has always said it would.
 */
create or replace function public.rpc_fraud_flag_decide(
  p_id uuid,
  p_confirm boolean,
  p_note text default null
)
returns public.fraud_signal
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_old public.fraud_signal;
  v_new public.fraud_signal;
  v_label text;
begin
  if v_staff is null then
    raise exception 'Sign in as staff first.' using errcode = '42501';
  end if;
  if p_confirm is null then
    raise exception 'Confirm the flag or dismiss it.' using errcode = '22023';
  end if;

  select * into v_old from public.fraud_signal where id = p_id for update;
  if v_old.id is null then
    raise exception 'That flag no longer exists.' using errcode = 'P0002';
  end if;
  if not public.fn_fraud_may_review(v_old) then
    raise exception 'Someone else has to review this flag.' using errcode = '42501';
  end if;
  if v_old.status <> 'open' then
    raise exception 'This flag has already been reviewed.' using errcode = '23514';
  end if;
  if not p_confirm and v_note is null then
    raise exception 'Say why this is not a problem.' using errcode = '22023';
  end if;
  if length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;

  update public.fraud_signal
     set status = case when p_confirm then 'confirmed' else 'dismissed' end,
         reviewed_by = v_staff,
         reviewed_at = now(),
         review_note = v_note
   where id = p_id
  returning * into v_new;

  select r.label into v_label from public.fraud_rule r where r.kind = v_old.kind;

  if p_confirm and v_old.subject_type = 'rider' and v_old.rider_id is not null then
    insert into public.rider_strike (rider_id, level, reason, issued_by, expires_at)
    values (v_old.rider_id, 2, 'Fraud flag confirmed · ' || coalesce(v_label, v_old.kind),
            v_staff, now() + interval '90 days');

    update public.rider set strike_count = strike_count + 1 where id = v_old.rider_id;

    insert into public.notification (kind, rider_id, status)
    values ('strike_issued', v_old.rider_id, 'pending');
  end if;

  perform audit.log(
    p_actor_type => 'staff',
    p_module => case when v_old.subject_type = 'rider' then 'riders' else 'finance' end,
    p_action => case
      when v_old.subject_type = 'rider' and p_confirm then 'fraud.signal_confirmed'
      when v_old.subject_type = 'rider' then 'fraud.signal_dismissed'
      when p_confirm then 'fraud.flag_confirmed'
      else 'fraud.flag_dismissed' end,
    p_actor_id => v_staff,
    p_target_type => 'fraud_signal', p_target_id => v_new.id,
    p_target_label => coalesce(v_label, v_old.kind) || ' · ' || coalesce(v_old.subject_label, ''),
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', v_new.status, 'kind', v_old.kind,
                                  'subject_type', v_old.subject_type,
                                  'subject_id', v_old.subject_id, 'summary', v_old.summary),
    p_reason => v_note,
    p_severity => (case when p_confirm then 'high' else 'notice' end)::public.audit_severity);

  return v_new;
end;
$$;

/* Turn a check on or off, or change its limits. Only limits the rule has. */
create or replace function public.rpc_fraud_rule_set(
  p_kind text,
  p_enabled boolean,
  p_params jsonb default null
)
returns public.fraud_rule
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_old public.fraud_rule;
  v_new public.fraud_rule;
  v_key text;
  v_value jsonb;
begin
  if v_staff is null or not (authz.is_super_admin() or authz.has_full_finance()) then
    raise exception 'Only people with full Finance access can change the fraud checks.'
      using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Say whether the check is on or off.' using errcode = '22023';
  end if;

  select * into v_old from public.fraud_rule where kind = p_kind for update;
  if v_old.kind is null then
    raise exception 'There is no such check.' using errcode = 'P0002';
  end if;

  if p_params is not null then
    if jsonb_typeof(p_params) <> 'object' then
      raise exception 'Send the limits as named numbers.' using errcode = '22023';
    end if;
    for v_key, v_value in select key, value from jsonb_each(p_params) loop
      if not (v_old.params ? v_key) then
        raise exception '"%" has no limit called %.', v_old.label, v_key using errcode = '22023';
      end if;
      if jsonb_typeof(v_value) <> 'number'
         or (v_value #>> '{}')::numeric <= 0
         or (v_value #>> '{}')::numeric > 100000 then
        raise exception 'Each limit must be a number above zero.' using errcode = '22023';
      end if;
    end loop;
  end if;

  update public.fraud_rule
     set enabled = p_enabled,
         params = case when p_params is null then params else params || p_params end,
         updated_by = v_staff,
         updated_at = now()
   where kind = p_kind
  returning * into v_new;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'fraud.rule_changed',
    p_actor_id => v_staff,
    p_target_type => 'fraud_rule', p_target_label => v_new.label,
    p_before => jsonb_build_object('kind', v_old.kind, 'enabled', v_old.enabled, 'params', v_old.params),
    p_after => jsonb_build_object('kind', v_new.kind, 'enabled', v_new.enabled, 'params', v_new.params),
    p_severity => 'high');

  return v_new;
end;
$$;

/* "Run checks now". */
create or replace function public.rpc_fraud_checks_run()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_result jsonb;
begin
  if v_staff is null or not (authz.finance_reads() or authz.reaches_module('riders')) then
    raise exception 'Only people who reach Finance or Riders can run the fraud checks.'
      using errcode = '42501';
  end if;

  v_result := public.fn_fraud_sweep();

  perform audit.log(
    p_actor_type => 'staff', p_module => 'finance', p_action => 'fraud.checks_run',
    p_actor_id => v_staff, p_after => v_result, p_severity => 'info');

  return v_result;
end;
$$;

/*
 * The console's read: the rules, open flags and those reviewed or found in
 * the last p_days days, and when the checks last ran. Finance sees every
 * flag; rider ops see the flags about riders they work.
 */
create or replace function public.rpc_fraud_overview(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_finance boolean := authz.finance_reads();
  v_riders boolean := authz.reaches_module('riders');
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 400));
begin
  if authz.staff_id() is null or not (v_finance or v_riders) then
    raise exception 'Only people who reach Finance or Riders can see the fraud checks.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'scope', case when v_finance then 'all' else 'riders' end,
    'can_change_rules', authz.is_super_admin() or authz.has_full_finance(),
    'days', least(greatest(coalesce(p_days, 90), 1), 400),
    'last_run', (
      select jsonb_build_object('at', s.last_run_at, 'duration_ms', s.last_duration_ms,
                                'raised', s.last_raised, 'errors', s.last_errors)
        from public.fraud_check_state s where s.id = 1),
    'rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'kind', r.kind, 'subject_type', r.subject_type, 'label', r.label,
               'description', r.description, 'severity', r.severity, 'enabled', r.enabled,
               'automated', r.automated, 'params', r.params, 'sort', r.sort,
               'updated_at', r.updated_at,
               'updated_by', case when r.updated_by is not null
                                  then public.fn_fraud_staff_label(r.updated_by) end,
               'open', (select count(*) from public.fraud_signal f
                         where f.kind = r.kind and f.status = 'open'
                           and (v_finance or (f.rider_id is not null and authz.works_rider(f.rider_id)))),
               'last_found_at', (select max(f.detected_at) from public.fraud_signal f
                                  where f.kind = r.kind
                                    and (v_finance or (f.rider_id is not null and authz.works_rider(f.rider_id)))))
             order by r.sort, r.kind), '[]'::jsonb)
        from public.fraud_rule r
       where v_finance or r.subject_type = 'rider'),
    'flags', (
      select coalesce(jsonb_agg(x.flag order by x.is_open desc, x.detected_at desc), '[]'::jsonb)
        from (
          select f.detected_at, (f.status = 'open') as is_open,
                 jsonb_build_object(
                   'id', f.id, 'kind', f.kind, 'rule_label', r.label,
                   'subject_type', f.subject_type, 'subject_id', f.subject_id,
                   'subject_label', f.subject_label, 'summary', f.summary,
                   'severity', f.severity, 'details', f.details,
                   'order_reference', f.order_reference, 'rider_id', f.rider_id,
                   'amount_cents', f.amount_cents, 'status', f.status,
                   'detected_at', f.detected_at, 'reviewed_at', f.reviewed_at,
                   'reviewed_by', case when f.reviewed_by is not null
                                       then public.fn_fraud_staff_label(f.reviewed_by) end,
                   'review_note', f.review_note,
                   'may_review', f.status = 'open' and public.fn_fraud_may_review(f)) as flag
            from public.fraud_signal f
            left join public.fraud_rule r on r.kind = f.kind
           where (v_finance or (f.subject_type = 'rider' and f.rider_id is not null
                                and authz.works_rider(f.rider_id)))
             and (f.status = 'open' or f.detected_at >= v_since or f.reviewed_at >= v_since)
           order by (f.status = 'open') desc, f.detected_at desc
           limit 1000
        ) x)
  );
end;
$$;

-- ════════════════════════════════════════════ the riders screen's count

/* Rider flags only: the riders screen counts what its people review. */
create or replace view public.console_rider_badges_v
with (security_invoker = true) as
select
  count(*) filter (where status = 'active') as active,
  count(*) filter (where status in ('applied', 'documents_pending', 'under_review')) as onboarding,
  count(*) filter (where cooldown_until is not null and cooldown_until > now()) as on_cooldown,
  count(*) filter (where status = 'suspended') as suspended,
  count(*) filter (where status = 'active' and presence = 'online') as online_now,
  count(*) filter (where status = 'active' and presence = 'on_trip') as on_trip,
  count(*) filter (where source = 'merchant_fleet') as fleet,
  (select count(*) from public.incident
    where kind = 'sos' and acknowledged_at is null) as sos_open,
  (select count(*) from public.incident
    where status in ('open', 'investigating')) as incidents_open,
  (select count(*) from public.cash_deposit
    where match_status = 'unmatched') as unmatched_deposits,
  (select count(*) from public.rider_settlement_line
    where status = 'failed') as failed_payouts,
  (select count(*) from public.fraud_signal
    where status = 'open' and subject_type = 'rider') as fraud_open,
  (select coalesce(sum(cash_on_hand), 0) from public.rider where cash_on_hand > 0) as cash_all,
  (select count(*) from public.rider where cash_on_hand > 0) as riders_holding_cash
from public.rider;

-- ═════════════════════════════════════════════════════════════ access

revoke execute on function
  public.fn_fraud_param(text, text, numeric),
  public.fn_fraud_on(text),
  public.fn_fraud_kes(bigint),
  public.fn_fraud_rider_label(uuid),
  public.fn_fraud_staff_label(uuid),
  public.fn_fraud_customer_label(uuid),
  public.fn_fraud_raise(text, text, text, uuid, text, text, jsonb, uuid, text, bigint),
  public.fn_fraud_check_payments(),
  public.fn_fraud_check_riders(),
  public.fn_fraud_check_customers(),
  public.fn_fraud_check_expenses(),
  public.fn_fraud_sweep(),
  public.fn_fraud_may_review(public.fraud_signal),
  public.tg_fraud_gps_jump(),
  public.tg_fraud_delivered_far()
  from public, anon, authenticated;

grant execute on function public.fn_fraud_sweep() to service_role;

revoke execute on function
  public.rpc_fraud_flag_decide(uuid, boolean, text),
  public.rpc_fraud_rule_set(text, boolean, jsonb),
  public.rpc_fraud_checks_run(),
  public.rpc_fraud_overview(integer)
  from public, anon;

grant execute on function
  public.rpc_fraud_flag_decide(uuid, boolean, text),
  public.rpc_fraud_rule_set(text, boolean, jsonb),
  public.rpc_fraud_checks_run(),
  public.rpc_fraud_overview(integer)
  to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════ schedule

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; the fraud checks are not scheduled.';
    return;
  end if;
  perform cron.schedule('fraud-checks', '*/5 * * * *', $cron$select public.fn_fraud_sweep()$cron$);
end
$$;

/* The first run, so the queue starts from what is already there. */
select public.fn_fraud_sweep();
