-- Stay refunds: the queue staff work from, and the record of each refund.
--
-- A stay owes the guest their money back in two cases:
--   late payment   the M-Pesa payment settled after the hold ran out and the
--                  nights had gone to somebody else (tg_payment_stay_settled)
--   cancelled      NexG staff cancelled a paid NexG booking (rpc_stay_cancel)
-- Both set stay.refund_due_at. Staff send the money back outside NexG (an
-- M-Pesa reversal or B2C payment) and record it here with its reference.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('stay.refunded', 'hotels', 'notice', true, 'Stay payment refunded to the guest')
on conflict (action) do nothing;

alter table public.stay
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reference text,
  add column if not exists refund_note text,
  add column if not exists refunded_by uuid references public.staff_user (id) on delete set null;

alter table public.stay drop constraint if exists stay_refund_follows_due;
alter table public.stay add constraint stay_refund_follows_due
  check (refunded_at is null or (refund_due_at is not null and refund_reference is not null));

create index if not exists stay_refund_queue on public.stay (refund_due_at desc)
  where refund_due_at is not null;

/*
 * The queue. Hospitality staff only. The payer's phone and the guest's
 * email are masked unless the viewer also handles guest data (support and
 * the DPO): the M-Pesa receipt is enough to reverse a payment, and
 * partnerships staff have no other reason to read a guest's contacts.
 */
create or replace function public.rpc_stay_refunds(p_show text default 'due')
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
  refunded_by text
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
      su.display_name
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

/* Record that the money has gone back, with the M-Pesa reference. */
create or replace function public.rpc_stay_refund_record(
  p_stay_id uuid,
  p_reference text,
  p_note text default null
)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
  v_staff uuid := authz.staff_id();
begin
  if not authz.works_hospitality(null) or v_staff is null then
    raise exception 'Hospitality staff only.' using errcode = 'insufficient_privilege';
  end if;
  if v_ref is null or length(v_ref) > 64 then
    raise exception 'Enter the M-Pesa reference of the refund.' using errcode = '22023';
  end if;

  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.id is null or v_stay.refund_due_at is null then
    raise exception 'That stay has no refund due.' using errcode = '22023';
  end if;
  if v_stay.refunded_at is not null then
    raise exception 'That refund is already recorded (%).', v_stay.refund_reference
      using errcode = '22023';
  end if;

  update public.stay
     set refunded_at = now(), refund_reference = upper(v_ref),
         refund_note = left(nullif(trim(coalesce(p_note, '')), ''), 500),
         refunded_by = v_staff, updated_at = now()
   where id = p_stay_id
  returning * into v_stay;

  update public.payment set state = 'reversed', updated_at = now()
   where stay_id = p_stay_id and state = 'paid';

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.refunded',
    p_actor_id => v_staff, p_target_type => 'stay', p_target_id => p_stay_id,
    p_after => jsonb_build_object('reference', v_stay.refund_reference,
                                  'paid_kes', v_stay.paid_kes,
                                  'note', v_stay.refund_note));
  return v_stay;
end;
$$;

revoke execute on function public.rpc_stay_refunds(text), public.rpc_stay_refund_record(uuid, text, text)
from public, anon;
grant execute on function public.rpc_stay_refunds(text), public.rpc_stay_refund_record(uuid, text, text)
to authenticated;

/*
 * Cancel a stay, release a hold or lift a block. A paid NexG booking is
 * cancelled only by hospitality staff, and cancelling it puts it in the
 * refund queue.
 */
create or replace function public.rpc_stay_cancel(p_stay_id uuid, p_reason text default null)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_staff boolean := authz.works_hospitality(null);
  v_paid boolean;
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

  update public.stay set status = 'cancelled', updated_at = now(),
         refund_due_at = case when v_paid then coalesce(refund_due_at, now()) else refund_due_at end
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
                                  'was', v_stay.notes, 'refund_due', v_paid));

  return v_stay;
end;
$$;
