-- UNAPPLIED ARCHITECTURE/REGRESSION CANDIDATE, NOT A MIGRATION.
-- No cutover command is provided; all inventory writers still need a coordinated protocol.
-- Missing authority row deliberately retains existing legacy behavior.
-- The payment ledger is authoritative for money; receipt is reconciliation metadata, not a second charge.

create table public.stay_unit_authority_candidate (
 unit_id uuid primary key references public.unit(id),
 authority text not null check(authority in ('legacy','vps')),
 epoch bigint not null check(epoch>0), changed_at timestamptz not null default clock_timestamp()
);
create table public.stay_settlement_fence_candidate (
 payment_id uuid primary key references public.payment(id), stay_id uuid not null references public.stay(id),
 unit_id uuid not null references public.unit(id), authority_epoch bigint not null,
 amount_cents bigint not null, reference text not null, recorded_at timestamptz not null default clock_timestamp()
);
alter table public.stay_unit_authority_candidate enable row level security;
alter table public.stay_settlement_fence_candidate enable row level security;
revoke all on public.stay_unit_authority_candidate,public.stay_settlement_fence_candidate from public;
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
  v_authority_epoch bigint;
begin
  perform 1 from public.unit u
    join public.stay s on s.unit_id = u.id
   where s.id = new.stay_id
   for update of u;
  select * into v_stay from public.stay where id = new.stay_id for update;
  if v_stay.id is null then return new; end if;

  -- The unit lock above is the shared serialization point for a proposed cutover.
  -- Replay receipt remains binding even if someone later changes authority back.
  if exists(select 1 from public.stay_settlement_fence_candidate where payment_id = new.id) then
    return new;
  end if;
  select epoch into v_authority_epoch from public.stay_unit_authority_candidate
   where unit_id = v_stay.unit_id and authority = 'vps';
  if found then
    insert into public.stay_settlement_fence_candidate(payment_id,stay_id,unit_id,authority_epoch,amount_cents,reference)
    values(new.id,v_stay.id,v_stay.unit_id,v_authority_epoch,new.amount_cents,new.reference)
    on conflict(payment_id) do nothing;
    if not found then return new; end if;
    -- Keep pre-existing confirmed history; never create a new legacy confirmation.
    update public.stay set
      status = case when status in ('held','cancelled') then 'cancelled' else status end,
      refund_due_at = coalesce(refund_due_at,clock_timestamp()), updated_at = clock_timestamp(),
      paid_kes = coalesce(paid_kes,v_paid), payment_reference = coalesce(payment_reference,new.reference)
    where id = v_stay.id;
    perform audit.log('system'::public.actor_type,'hotels','stay.payment_refund_due',
      p_target_type=>'stay',p_target_id=>v_stay.id,p_city_id=>new.city_id,p_severity=>'high',
      p_reason=>'Legacy payment retained for reconciliation; unit reservation authority is VPS.',
      p_after=>jsonb_build_object('payment_id',new.id,'reference',new.reference,'paid_kes',v_paid,'authority_epoch',v_authority_epoch));
    return new;
  end if;

  if v_stay.status = 'booked' then
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
