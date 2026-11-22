-- Stay cancellation policies, set by each host (owner, 22 Nov 2026: "NEXG
-- cancels and then we deduct cancelation fee depending on hosts cancellation
-- policies, they should be configuravle"). Paystack slice 4b.
--
--   * A host sets a policy on a property, and may override it on a unit: a
--     preset (flexible, moderate, strict) or their own tiers, "cancelled N or
--     more days before check-in: P% back". Validated and stored normalised.
--   * The policy in force is copied onto the stay when it is created (the
--     hold), so the guest is held to what they were shown before paying, and a
--     later change by the host does not touch stays already made.
--   * When NexG cancels a paid stay (rpc_stay_cancel), the refund is the paid
--     amount times the tier's percentage for the days left before check-in;
--     the rest is the cancellation fee, which stays with the host less NexG's
--     commission. Staff can still give a full refund (p_full_refund), for
--     example when the host caused the cancellation. A late payment for dates
--     already taken is still refunded in full (tg_payment_stay_settled).
--   * The ledger takes back only the refunded share of the stay posting
--     (fn_post_stay_refund_due), so the host keeps their share of the fee.
-- A stay with no policy copied (made before this migration) refunds in full,
-- as before. A host who sets nothing gets the flexible policy.
--
-- Builds on 20270215000300 (stays through Paystack).

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('stay.cancellation_policy_set', 'hotels', 'info', false, 'A host set a cancellation policy')
on conflict (action) do nothing;

alter table public.property add column if not exists cancellation_policy jsonb;
alter table public.unit add column if not exists cancellation_policy jsonb;
alter table public.stay
  add column if not exists cancellation_policy jsonb,
  add column if not exists refund_amount_kes bigint check (refund_amount_kes is null or refund_amount_kes >= 0),
  add column if not exists cancellation_fee_kes bigint check (cancellation_fee_kes is null or cancellation_fee_kes >= 0);

comment on column public.property.cancellation_policy is
  'The host''s cancellation policy for this property (fn_cancellation_policy). Null: flexible.';
comment on column public.unit.cancellation_policy is
  'A unit''s own cancellation policy, overriding the property''s. Null: the property''s.';
comment on column public.stay.cancellation_policy is
  'The policy in force when the stay was made, copied so later changes do not apply to it.';
comment on column public.stay.refund_amount_kes is
  'On cancellation: what the guest gets back under the policy.';
comment on column public.stay.cancellation_fee_kes is
  'On cancellation: what the policy keeps (the host''s, less NexG''s commission).';

-- ──────────────────────────────────────────────── a policy, normalised

/*
 * {"preset":"flexible"|"moderate"|"strict"} or {"preset":"custom","tiers":[
 *   {"days_before":N,"refund_pct":P}, ...]} → the same, with the tiers spelled
 * out, most days first. Custom: 1 to 5 tiers, days 0 to 365 each different,
 * percent 0 to 100, never more back for cancelling later. Raises 22023 for
 * anything else.
 */
create function public.fn_cancellation_policy(p_policy jsonb)
returns jsonb
language plpgsql
immutable
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
    v_tiers := '[{"days_before":1,"refund_pct":100},{"days_before":0,"refund_pct":0}]';
  elsif v_preset = 'moderate' then
    v_tiers := '[{"days_before":5,"refund_pct":100},{"days_before":1,"refund_pct":50},{"days_before":0,"refund_pct":0}]';
  elsif v_preset = 'strict' then
    v_tiers := '[{"days_before":14,"refund_pct":100},{"days_before":7,"refund_pct":50},{"days_before":0,"refund_pct":0}]';
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

-- The percent back for cancelling at p_at, before check-in on p_check_in
-- (Nairobi days). No policy: everything back (stays made before policies).
create function public.fn_stay_refund_pct(p_policy jsonb, p_check_in timestamptz, p_at timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_policy is null then 100
    else coalesce((
      select (t->>'refund_pct')::integer
        from jsonb_array_elements(p_policy->'tiers') t
       where ((p_check_in at time zone 'Africa/Nairobi')::date - (p_at at time zone 'Africa/Nairobi')::date)
             >= (t->>'days_before')::integer
       order by (t->>'days_before')::integer desc
       limit 1), 0)
  end
$$;

-- The policy in plain words, for the guest before paying.
create function public.fn_cancellation_policy_text(p_policy jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(
    case
      when (t->>'refund_pct')::integer = 0 and (t->>'days_before')::integer = 0
        then 'no refund after that'
      when (t->>'refund_pct')::integer = 0
        then 'no refund from ' || (t->>'days_before') || ' days before check-in'
      when (t->>'days_before')::integer = 0
        then (t->>'refund_pct') || '% back up to check-in'
      else (case when (t->>'refund_pct')::integer = 100 then 'a full refund'
                 else (t->>'refund_pct') || '% back' end)
           || ' if you cancel ' || (t->>'days_before') || ' or more days before check-in'
    end, '; ' order by (t->>'days_before')::integer desc) || '.', 'A full refund if you cancel.')
  from jsonb_array_elements(p_policy->'tiers') t
$$;

-- ───────────────────────── the policy in force is copied onto the stay

create function public.tg_stay_policy_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cancellation_policy is null then
    new.cancellation_policy := public.fn_cancellation_policy(coalesce(
      (select u.cancellation_policy from public.unit u where u.id = new.unit_id),
      (select p.cancellation_policy from public.property p where p.id = new.property_id),
      '{"preset":"flexible"}'::jsonb));
  end if;
  return new;
end;
$$;

drop trigger if exists stay_policy_snapshot on public.stay;
create trigger stay_policy_snapshot
  before insert on public.stay
  for each row execute function public.tg_stay_policy_snapshot();

-- ─────────────────────────────────────────── the host sets the policy

/*
 * A property's policy, or one unit's (p_unit_id). For a unit, null clears its
 * own policy so the property's applies. Only the host's own people.
 */
create function public.rpc_host_set_cancellation_policy(
  p_property_id uuid,
  p_unit_id uuid,
  p_policy jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_policy jsonb;
begin
  select host_id into v_host from public.property where id = p_property_id;
  if v_host is null then
    raise exception 'No such property.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_host) then
    raise exception 'Not your property.' using errcode = '42501';
  end if;
  if p_unit_id is not null and not exists (select 1 from public.unit
                                            where id = p_unit_id and property_id = p_property_id) then
    raise exception 'That unit is not in this property.' using errcode = '22023';
  end if;
  if p_policy is null and p_unit_id is null then
    raise exception 'Choose a cancellation policy.' using errcode = '22023';
  end if;
  v_policy := case when p_policy is null then null else public.fn_cancellation_policy(p_policy) end;

  if p_unit_id is null then
    update public.property set cancellation_policy = v_policy where id = p_property_id;
  else
    update public.unit set cancellation_policy = v_policy where id = p_unit_id;
  end if;

  perform audit.log(
    p_actor_type => 'host_user'::public.actor_type, p_module => 'hotels',
    p_action => 'stay.cancellation_policy_set',
    p_target_type => case when p_unit_id is null then 'property' else 'unit' end,
    p_target_id => coalesce(p_unit_id, p_property_id),
    p_after => jsonb_build_object('policy', v_policy));

  return jsonb_build_object('ok', true, 'policy', v_policy,
    'text', case when v_policy is null then null else public.fn_cancellation_policy_text(v_policy) end);
end;
$$;

revoke execute on function public.rpc_host_set_cancellation_policy(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rpc_host_set_cancellation_policy(uuid, uuid, jsonb) to authenticated;

-- What a guest would be held to on this unit, before paying. Read-only.
create function public.rpc_stay_cancellation_policy(p_unit_id uuid)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select jsonb_build_object('policy', x.policy, 'text', public.fn_cancellation_policy_text(x.policy))
    from (select public.fn_cancellation_policy(coalesce(u.cancellation_policy, p.cancellation_policy,
                                                        '{"preset":"flexible"}'::jsonb)) as policy
            from public.unit u join public.property p on p.id = u.property_id
           where u.id = p_unit_id) x
$$;

revoke execute on function public.rpc_stay_cancellation_policy(uuid) from public;
grant execute on function public.rpc_stay_cancellation_policy(uuid) to anon, authenticated;

-- ──────────────────────────── NexG cancels: the fee comes off the refund

drop function public.rpc_stay_cancel(uuid, text);

-- As 20261120000100, plus the refund by the stay's policy, or in full when
-- staff choose so (p_full_refund).
create function public.rpc_stay_cancel(p_stay_id uuid, p_reason text default null, p_full_refund boolean default false)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_staff boolean := authz.works_hospitality(null);
  v_paid boolean;
  v_pct integer;
  v_refund bigint;
begin
  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null then
    raise exception 'No such booking.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_stay.host_id) and not v_staff then
    raise exception 'Not your booking.' using errcode = 'insufficient_privilege';
  end if;
  if v_stay.source = 'nexg' and v_stay.status in ('booked', 'in_stay') and not v_staff then
    raise exception 'This guest paid through NexG. Contact NexG to cancel it.' using errcode = '22023';
  end if;
  v_paid := v_stay.source = 'nexg' and v_stay.status in ('booked', 'in_stay')
            and coalesce(v_stay.paid_kes, 0) > 0;

  if v_paid then
    v_pct := case when coalesce(p_full_refund, false) then 100
                  else public.fn_stay_refund_pct(v_stay.cancellation_policy, v_stay.check_in, now()) end;
    v_refund := floor(v_stay.paid_kes * v_pct / 100.0)::bigint;
  end if;

  update public.stay set status = 'cancelled', updated_at = now(),
         refund_amount_kes = case when v_paid then v_refund else refund_amount_kes end,
         cancellation_fee_kes = case when v_paid then v_stay.paid_kes - v_refund else cancellation_fee_kes end,
         refund_due_at = case when v_paid and v_refund > 0 then coalesce(refund_due_at, now()) else refund_due_at end
   where id = p_stay_id returning * into v_stay;

  /* A cancellation can clear somebody else's conflict flag, and
     leaving it set would keep a red row on the page forever. */
  update public.stay s set conflict_flagged = exists (
    select 1 from public.stay o
     where o.unit_id = s.unit_id and o.id <> s.id
       and public.fn_stay_occupies(o.status, o.hold_expires_at)
       and o.check_in < s.check_out and o.check_out > s.check_in)
   where s.unit_id = v_stay.unit_id and s.status in ('booked', 'in_stay');

  perform audit.log(
    case when v_staff and not authz.is_host_member(v_stay.host_id) then 'staff' else 'host_user' end::public.actor_type,
    'hotels', 'stay.cancelled',
    p_target_type => 'stay', p_target_id => p_stay_id,
    p_after => jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''),
                                  'was', v_stay.notes, 'refund_due', v_paid and v_refund > 0,
                                  'refund_kes', v_refund, 'fee_kes', case when v_paid then v_stay.cancellation_fee_kes end,
                                  'full_refund', coalesce(p_full_refund, false)));

  return v_stay;
end;
$$;

revoke execute on function public.rpc_stay_cancel(uuid, text, boolean) from public, anon;
grant execute on function public.rpc_stay_cancel(uuid, text, boolean) to authenticated;

-- ─────────────── the ledger takes back only the refunded share

/*
 * As 20270117000100, but for a stay cancelled under its policy only the
 * refunded share of each credit (host share, commission, VAT) is taken back
 * into refunds_pending; the rest, the cancellation fee, stays where it was
 * posted, so the host keeps their share of it. With no refund amount recorded
 * (a late payment, or a stay from before policies) everything is taken back.
 */
create or replace function ledger.fn_post_stay_refund_due(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid ledger.transaction;
  s public.stay;
  v_entries jsonb := '[]'::jsonb;
  v_total bigint;
  v_refund bigint;
  v_taken bigint := 0;
  v_part bigint;
  e record;
begin
  select * into v_paid from ledger.transaction
   where idempotency_key = 'stay_paid:' || p_payment_id::text;
  if v_paid.id is null or v_paid.kind <> 'stay_paid' then
    return null;
  end if;
  select x.* into s from public.stay x
    join public.payment p on p.stay_id = x.id
   where p.id = p_payment_id;
  if s.refund_due_at is null then
    return null;
  end if;

  select sum(credit)::bigint into v_total
    from ledger.entry where transaction_id = v_paid.id and credit > 0;
  v_refund := case when s.refund_amount_kes is null then v_total
                   else least(ledger.from_kes(s.refund_amount_kes), v_total) end;
  if coalesce(v_refund, 0) <= 0 then
    return null;
  end if;

  -- Each credit in proportion; the rounding left over goes on the first line
  -- (the host's share), so the lines add up to exactly the refund.
  for e in select account_code, credit, memo, id from ledger.entry
            where transaction_id = v_paid.id and credit > 0 order by id loop
    v_part := floor(e.credit::numeric * v_refund / v_total)::bigint;
    v_taken := v_taken + v_part;
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', e.account_code, 'debit', v_part, 'memo', 'Stay cancelled · ' || coalesce(e.memo, '')));
  end loop;
  if v_taken <> v_refund then
    v_entries := jsonb_set(v_entries, '{0,debit}',
      to_jsonb((v_entries #>> '{0,debit}')::bigint + (v_refund - v_taken)));
  end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_entries
    from jsonb_array_elements(v_entries) x where (x->>'debit')::bigint > 0;

  return ledger.post(
    p_kind => 'stay_cancelled_refund_due',
    p_idempotency_key => 'stay_refund_due:' || p_payment_id::text,
    p_entries => v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'refunds_pending', 'credit', v_refund, 'memo', 'Stay cancelled · refund due')),
    p_effective_at => s.refund_due_at,
    p_city_id => v_paid.city_id,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'stay_cancelled',
    p_related => v_paid.related);
end;
$$;

-- ───────────── the refund queue: what to send back, not what was paid

-- As 20261120000100, plus refund_kes (what the policy gives back; the whole
-- payment for a late payment or a stay from before policies) and the fee kept.
drop function public.rpc_stay_refunds(text);

create function public.rpc_stay_refunds(p_show text default 'due')
returns table (
  stay_id uuid,
  reason text,
  property text,
  unit text,
  host text,
  check_in date,
  check_out date,
  paid_kes bigint,
  payment_reference text,
  mpesa_receipt text,
  payer_phone text,
  guest_email text,
  guest_name text,
  refund_due_at timestamptz,
  refunded_at timestamptz,
  refund_reference text,
  refund_note text,
  refunded_by text,
  refund_kes bigint,
  cancellation_fee_kes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := authz.handles_guest_data();
begin
  if not authz.works_hospitality(null) then
    raise exception 'Hospitality staff only.' using errcode = 'insufficient_privilege';
  end if;
  if p_show not in ('due', 'refunded', 'all') then
    raise exception 'Show due, refunded or all.' using errcode = '22023';
  end if;

  return query
    select
      s.id,
      case when s.status = 'cancelled' and s.confirmed_at is null then 'late_payment'
           else 'cancelled' end,
      p.name,
      coalesce(u.label_public, u.name),
      h.display_name,
      (s.check_in at time zone coalesce(h.time_zone, 'Africa/Nairobi'))::date,
      (s.check_out at time zone coalesce(h.time_zone, 'Africa/Nairobi'))::date,
      s.paid_kes,
      s.payment_reference,
      pay.provider_receipt,
      case when pay.payer_phone is null then null
           when v_full then pay.payer_phone
           else left(pay.payer_phone, 5) || '•••' || right(pay.payer_phone, 2) end,
      case when gu.email is null then null
           when v_full then gu.email::text
           else left(gu.email::text, 2) || '•••@' || split_part(gu.email::text, '@', 2) end,
      s.guest_first_name,
      s.refund_due_at,
      s.refunded_at,
      s.refund_reference,
      s.refund_note,
      su.display_name,
      coalesce(s.refund_amount_kes, s.paid_kes),
      s.cancellation_fee_kes
    from public.stay s
    join public.host h on h.id = s.host_id
    left join public.unit u on u.id = s.unit_id
    left join public.property p on p.id = s.property_id
    left join auth.users gu on gu.id = s.guest_user_id
    left join public.staff_user su on su.id = s.refunded_by
    left join lateral (
      select x.provider_receipt, x.payer_phone from public.payment x
       where x.stay_id = s.id and x.state in ('paid', 'reversed')
       order by x.paid_at desc nulls last limit 1
    ) pay on true
    where s.refund_due_at is not null
      and (p_show = 'all'
           or (p_show = 'due' and s.refunded_at is null)
           or (p_show = 'refunded' and s.refunded_at is not null))
    order by s.refunded_at is not null, s.refund_due_at desc;
end;
$$;

revoke execute on function public.rpc_stay_refunds(text) from public, anon;
grant execute on function public.rpc_stay_refunds(text) to authenticated;
