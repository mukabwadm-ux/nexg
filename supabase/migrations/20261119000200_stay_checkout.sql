-- Stay booking, phase 2: a guest pays for a held stay with M-Pesa.
--
--   1. The guest holds dates (rpc_stay_hold, phase 1).
--   2. rpc_payment_begin_stay opens a payment for exactly the quoted total.
--      The amount comes from the hold, never from the browser.
--   3. The existing M-Pesa route sends the PIN prompt; the existing callback
--      settles the payment after checking the amount.
--   4. tg_payment_stay_settled, on the payment turning paid, confirms the stay
--      and splits the money: 15% NexG commission, the rest the host's.
--      A payment that lands after somebody else took the dates is kept as
--      paid and the stay is marked refund due, for staff to refund.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.stay_begun', 'hotels', 'info', true, 'Payment opened for a stay'),
  ('stay.paid', 'hotels', 'notice', true, 'Stay paid and confirmed'),
  ('stay.payment_refund_due', 'hotels', 'high', true, 'Stay paid after its dates were taken; refund due')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════ payment → stay

alter table public.payment
  add column if not exists stay_id uuid references public.stay (id) on delete restrict;

alter table public.payment drop constraint if exists payment_points_at_one_thing;
alter table public.payment add constraint payment_points_at_one_thing check (
  (intent = 'order' and order_id is not null and booking_id is null and stay_id is null)
  or (intent = 'featured_slot' and booking_id is not null and order_id is null and stay_id is null)
  or (intent = 'rider_float' and order_id is null and booking_id is null and stay_id is null)
  or (intent = 'stay' and stay_id is not null and order_id is null and booking_id is null));

create index if not exists payment_stay_idx on public.payment (stay_id) where stay_id is not null;

/* One live attempt per stay, for the same reason as orders: two open
   payments on one stay is how a guest pays twice. */
create unique index if not exists payment_one_live_per_stay on public.payment (stay_id)
  where stay_id is not null and state in ('pending', 'authorised');

-- ═══════════════════════════════════════════════════ the money on a stay

alter table public.stay
  add column if not exists paid_kes bigint check (paid_kes is null or paid_kes >= 0),
  add column if not exists commission_kes bigint check (commission_kes is null or commission_kes >= 0),
  add column if not exists host_share_kes bigint check (host_share_kes is null or host_share_kes >= 0),
  add column if not exists payment_reference text,
  add column if not exists refund_due_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz;

comment on column public.stay.commission_kes is
  'NexG''s commission on a stay paid through NexG: 15% of what the guest paid, rounded to the shilling.';
comment on column public.stay.host_share_kes is
  'What the guest paid less the commission: the host''s share to pay out.';
comment on column public.stay.refund_due_at is
  'Set when a payment settled after the stay''s dates had gone to somebody else. Staff refund it.';

/* The rate, in one place. */
create or replace function public.fn_stay_commission_rate()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.15::numeric $$;

-- ═══════════════════════════════════════════════════ opening a payment

/*
 * Open (or reopen) the payment for a guest's own held stay.
 *
 * The guest must have signed in with an email, so there is somebody to
 * send the confirmation to. The hold is stretched to ten minutes from now
 * if it had less, so a guest typing their M-Pesa PIN is not beaten by the
 * clock; the stretch is under the unit lock and the dates are already
 * theirs, so it takes nothing from anybody.
 */
create or replace function public.rpc_payment_begin_stay(p_stay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_stay public.stay;
  v_unit public.unit;
  v_existing public.payment;
  v_id uuid;
  v_ref text;
  v_amount bigint;
begin
  if v_uid is null then
    raise exception 'Sign in to pay for your stay.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u
                  where u.id = v_uid and u.email is not null and not coalesce(u.is_anonymous, false)) then
    raise exception 'Sign in with your email to book, so we can send your confirmation.'
      using errcode = '42501';
  end if;

  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null or v_stay.guest_user_id is distinct from v_uid then
    raise exception 'That stay is not yours.' using errcode = '42501';
  end if;
  if v_stay.status = 'booked' then
    raise exception 'That stay is already paid and confirmed.' using errcode = '22023';
  end if;
  if v_stay.status <> 'held' or v_stay.hold_expires_at <= now() then
    raise exception 'Your hold ran out. Choose your dates again.' using errcode = '22023';
  end if;
  if coalesce(v_stay.quote_total_kes, 0) <= 0 then
    raise exception 'This stay has no price to pay.' using errcode = '22023';
  end if;

  select * into v_unit from public.unit where id = v_stay.unit_id for update;
  select * into v_stay from public.stay where id = p_stay_id for update;

  update public.stay
     set hold_expires_at = greatest(hold_expires_at, now() + interval '10 minutes'),
         updated_at = now()
   where id = p_stay_id
  returning * into v_stay;

  v_amount := v_stay.quote_total_kes * 100;

  select * into v_existing from public.payment
   where stay_id = p_stay_id and state in ('pending', 'authorised')
   limit 1;
  if v_existing.id is not null then
    update public.payment set expires_at = v_stay.hold_expires_at, updated_at = now()
     where id = v_existing.id;
    return jsonb_build_object(
      'ok', true, 'payment_id', v_existing.id, 'reference', v_existing.reference,
      'amount_cents', v_existing.amount_cents, 'currency', v_existing.currency,
      'expires_at', v_stay.hold_expires_at, 'reused', true);
  end if;

  v_ref := public.fn_payment_reference();
  insert into public.payment (
    reference, intent, stay_id, city_id, amount_cents, currency,
    created_by, created_via, expires_at)
  values (
    v_ref, 'stay', p_stay_id, v_unit.city_id, v_amount, 'KES',
    v_uid, 'guest_checkout', v_stay.hold_expires_at)
  returning id into v_id;

  perform audit.log('guest'::public.actor_type, 'hotels', 'payment.stay_begun',
    p_actor_id => v_uid, p_target_type => 'payment', p_target_id => v_id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('stay', p_stay_id, 'amount_cents', v_amount, 'reference', v_ref));

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_amount, 'currency', 'KES',
    'expires_at', v_stay.hold_expires_at, 'reused', false);
end;
$$;

-- ═══════════════════════════════════════════════════ settled → booked

/*
 * The payment has settled. Confirm the stay if its nights are still the
 * guest's, and split the money. Never raises: this runs inside the payment
 * webhook, and an error here would roll back the record that the guest
 * paid. Anything that cannot be confirmed is marked refund due instead.
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
  v_commission bigint := round((new.amount_cents / 100) * public.fn_stay_commission_rate())::bigint;
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
    update public.stay
       set status = 'booked', confirmed_at = now(), updated_at = now(),
           paid_kes = v_paid, commission_kes = v_commission,
           host_share_kes = v_paid - v_commission,
           payment_reference = new.reference
     where id = v_stay.id;

    insert into public.host_message (host_id, direction, channel, subject, body)
    values (v_stay.host_id, 'out', 'in_app', 'New NexG booking',
            coalesce(v_stay.guest_first_name, 'A guest') || ' booked '
            || to_char(v_stay.check_in at time zone 'Africa/Nairobi', 'DD Mon') || ' to '
            || to_char(v_stay.check_out at time zone 'Africa/Nairobi', 'DD Mon YYYY')
            || ' and paid KES ' || to_char(v_paid, 'FM999,999,999')
            || '. Your share after NexG''s 15% is KES '
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

drop trigger if exists payment_stay_settled on public.payment;
create trigger payment_stay_settled
  after update of state on public.payment
  for each row
  when (new.intent = 'stay' and new.state = 'paid' and old.state is distinct from 'paid')
  execute function public.tg_payment_stay_settled();

revoke execute on function public.tg_payment_stay_settled() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ what the guest sees

/* Where a guest's checkout stands. Their own stay only. */
create or replace function public.rpc_stay_checkout_status(p_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_zone text;
  v_result jsonb;
begin
  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null or v_stay.guest_user_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'That stay is not yours.' using errcode = '42501';
  end if;
  select coalesce(h.time_zone, 'Africa/Nairobi') into v_zone from public.host h where h.id = v_stay.host_id;

  select jsonb_build_object(
    'stay_id', v_stay.id,
    'status', case when v_stay.status = 'held' and v_stay.hold_expires_at <= now()
                   then 'expired' else v_stay.status end,
    'hold_expires_at', v_stay.hold_expires_at,
    'check_in', (v_stay.check_in at time zone v_zone)::date,
    'check_out', (v_stay.check_out at time zone v_zone)::date,
    'nights', (v_stay.check_out at time zone v_zone)::date - (v_stay.check_in at time zone v_zone)::date,
    'adults', v_stay.party_adults,
    'children', v_stay.party_children,
    'total_kes', v_stay.quote_total_kes,
    'paid_kes', v_stay.paid_kes,
    'refund_due', v_stay.refund_due_at is not null,
    'unit', coalesce(u.label_public, u.name),
    'property', p.name,
    'property_slug', p.slug,
    'payment_state', (select pay.state::text from public.payment pay
                       where pay.stay_id = v_stay.id order by pay.created_at desc limit 1),
    'payment_failure', (select pay.failure_reason from public.payment pay
                         where pay.stay_id = v_stay.id order by pay.created_at desc limit 1),
    'payment_reference', v_stay.payment_reference)
  into v_result
  from public.unit u
  left join public.property p on p.id = u.property_id
  where u.id = v_stay.unit_id;

  return v_result;
end;
$$;

/*
 * The confirmation email is sent once. Returns true to the one caller that
 * gets to send it, false to every later one.
 */
create or replace function public.rpc_stay_confirmation_sent(p_stay_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.stay set confirmation_sent_at = now()
   where id = p_stay_id and guest_user_id = auth.uid() and auth.uid() is not null
     and status = 'booked' and confirmation_sent_at is null
  returning id into v_id;
  return v_id is not null;
end;
$$;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_stay_confirmation_sent', 'A delivery marker on the guest''s own booking, not a decision',
   'stay.confirmation_sent_at')
on conflict (function_name) do nothing;

revoke execute on function public.rpc_payment_begin_stay(uuid),
  public.rpc_stay_checkout_status(uuid),
  public.rpc_stay_confirmation_sent(uuid)
from public, anon;
grant execute on function public.rpc_payment_begin_stay(uuid),
  public.rpc_stay_checkout_status(uuid),
  public.rpc_stay_confirmation_sent(uuid)
to authenticated;

-- ═══════════════════════════════════════════════════ what the host sees

/* Paid amounts on the host's own stays, beside the hold fields. */
create or replace view host_stay_v
with (security_invoker = false) as
select
  s.id,
  s.host_id,
  s.unit_id,
  u.name as unit_name,
  p.name as property_name,
  s.guest_first_name,
  s.party_adults,
  s.party_children,
  s.check_in,
  s.check_out,
  s.source,
  s.status,
  s.conflict_flagged,
  s.rate_kes,
  s.qr_link_sent_at,
  case
    when s.phone is null then null
    when length(s.phone) > 6
      then left(s.phone, 4) || repeat('•', greatest(0, length(s.phone) - 7))
           || right(s.phone, 2)
    else '•••'
  end as phone_masked,
  r.rating as stay_rating,
  r.text as stay_review,
  r.answered_at as reviewed_at,
  (select count(*) from public.qr_scan sc
    where sc.owner_id = s.unit_id
      and sc.scanned_at between s.check_in and s.check_out)::int as scans,
  (select count(*) from public.qr_scan sc
    join public."order" o on o.qr_scan_id = sc.id
   where sc.owner_id = s.unit_id
     and sc.scanned_at between s.check_in and s.check_out)::int as orders,
  (now() >= s.check_in and now() < s.check_out) as in_stay,
  s.hold_expires_at,
  s.notes,
  s.quote_total_kes,
  (s.status = 'held' and s.hold_expires_at <= now()) as hold_expired,
  s.paid_kes,
  s.commission_kes,
  s.host_share_kes
from public.stay s
left join public.unit u on u.id = s.unit_id
left join public.property p on p.id = s.property_id
left join public.stay_review r on r.stay_id = s.id
where authz.is_host_member(s.host_id);
