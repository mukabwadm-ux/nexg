-- UNAPPLIED REVIEW CANDIDATE, NOT A DEPLOYMENT MIGRATION.
-- Delayed pre-expiry payment callbacks may be refunded. No trusted paid-at policy yet.
-- Still needs per-inventory ownership/cutover fencing; active legacy holds remain unsafe.
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

  if v_stay.status = 'held'
     and v_stay.hold_expires_at > clock_timestamp()
     and v_stay.refund_due_at is null
     and not v_clash then
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
       set status = 'cancelled', refund_due_at = coalesce(refund_due_at, clock_timestamp()), updated_at = now(),
           paid_kes = v_paid, payment_reference = new.reference
     where id = v_stay.id;

    perform audit.log('system'::public.actor_type, 'hotels', 'stay.payment_refund_due',
      p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => new.city_id,
      p_severity => 'high',
      p_reason => 'Legacy settlement could not safely confirm unexpired held inventory; review payment and reservation authority.',
      p_after => jsonb_build_object('reference', new.reference, 'paid_kes', v_paid));
  end if;
  return new;
end;
$$;
