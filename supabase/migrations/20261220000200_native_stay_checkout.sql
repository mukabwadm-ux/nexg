-- Native checkout uses the same dated inventory, reservation, and settlement as web checkout.
-- An expiring quote ID is also the idempotent operation ID for its one hold.
create table public.native_stay_checkout (
  id uuid primary key default gen_random_uuid(),
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  check_in date not null,
  check_out date not null,
  adults integer not null,
  children integer not null,
  nightly_minor bigint not null check (nightly_minor > 0),
  total_minor bigint not null check (total_minor > 0),
  expires_at timestamptz not null,
  stay_id uuid unique references public.stay(id) on delete cascade,
  guest_name_hash text
);

alter table public.native_stay_checkout enable row level security;
revoke all on public.native_stay_checkout from public, anon, authenticated;

create function public.fn_native_stay_customer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from auth.users
     where id = v_uid and email is not null and not coalesce(is_anonymous, false)
  ) then
    raise exception 'Sign in with your email to book.' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function public.fn_native_stay_checkout_view(p_checkout_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'operationId', c.id,
    'stayId', s.id,
    'holdExpiresAt', s.hold_expires_at,
    'currency', 'KES',
    'totalMinor', c.total_minor,
    'status', case when s.status = 'held' and s.hold_expires_at <= clock_timestamp()
                   then 'expired' else s.status::text end,
    'paymentStatus', case
      when s.paid_kes is not null and s.paid_kes > 0 then 'paid'
      when p.state = 'pending' and p.mpesa_dispatch_claimed_at is null
           and p.provider_ref is null and p.expires_at <= clock_timestamp() then 'failed'
      when p.state in ('pending', 'authorised') then 'pending'
      when p.state = 'paid' then 'paid'
      when p.id is not null then 'failed'
      else 'unpaid'
    end,
    'refundDue', s.refund_due_at is not null,
    'reference', coalesce(s.payment_reference, p.reference),
    'providerPending', p.state = 'authorised' and p.provider = 'mpesa'))
  from public.native_stay_checkout c
  join public.stay s on s.id = c.stay_id and s.guest_user_id = c.guest_user_id
  left join lateral (
    select id, state, provider, provider_ref, reference, expires_at, mpesa_dispatch_claimed_at from public.payment
     where stay_id = s.id order by created_at desc, id desc limit 1
  ) p on true
  where c.id = p_checkout_id;
$$;

create function public.rpc_native_stay_quote(
  p_property_id uuid, p_unit_id uuid, p_check_in date, p_check_out date,
  p_adults integer, p_children integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.fn_native_stay_customer();
  v_price record;
  v_checkout public.native_stay_checkout;
begin
  if p_property_id is null or p_unit_id is null or p_adults is null or p_children is null
     or p_adults not between 1 and 20 or p_children not between 0 and 20 then
    raise exception 'Choose a property, unit and guests.' using errcode = '22023';
  end if;

  select n.nightly_rate_kes, n.total_kes into v_price
    from public.rpc_stay_search(p_check_in, p_check_out, p_adults + p_children, p_property_id) n
    where n.unit_id = p_unit_id and n.property_id = p_property_id
      and n.nightly_rate_kes > 0 and n.total_kes > 0;
  if not found then
    raise exception 'This stay is unavailable for these dates and guests.' using errcode = 'NX001';
  end if;

  insert into public.native_stay_checkout (
    guest_user_id, property_id, unit_id, check_in, check_out, adults, children,
    nightly_minor, total_minor, expires_at
  ) values (
    v_uid, p_property_id, p_unit_id, p_check_in, p_check_out, p_adults, p_children,
    v_price.nightly_rate_kes * 100, v_price.total_kes * 100, clock_timestamp() + interval '10 minutes'
  ) returning * into v_checkout;

  return jsonb_build_object(
    'quoteId', v_checkout.id, 'propertyId', v_checkout.property_id, 'unitId', v_checkout.unit_id,
    'checkIn', v_checkout.check_in, 'checkOut', v_checkout.check_out,
    'adults', v_checkout.adults, 'children', v_checkout.children,
    'nights', v_checkout.check_out - v_checkout.check_in, 'expiresAt', v_checkout.expires_at,
    'currency', 'KES', 'nightlyMinor', v_checkout.nightly_minor,
    'roomSubtotalMinor', v_checkout.total_minor, 'taxesMinor', 0, 'totalMinor', v_checkout.total_minor);
end;
$$;

create function public.rpc_native_stay_hold(p_quote_id uuid, p_first_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.fn_native_stay_customer();
  v_checkout public.native_stay_checkout;
  v_first_name text := nullif(btrim(p_first_name), '');
  v_price record;
  v_hold jsonb;
begin
  if v_first_name is null or char_length(v_first_name) > 80 then
    raise exception 'Enter the first name of the staying guest.' using errcode = '22023';
  end if;
  select * into v_checkout from public.native_stay_checkout
   where id = p_quote_id and guest_user_id = v_uid for update;
  if not found then
    raise exception 'The quote was not found.' using errcode = 'NX004';
  end if;
  if v_checkout.stay_id is not null then
    if v_checkout.guest_name_hash is distinct from encode(sha256(convert_to(v_first_name, 'UTF8')), 'hex') then
      raise exception 'This operation is already in use.' using errcode = 'NX005';
    end if;
    return public.fn_native_stay_checkout_view(v_checkout.id);
  end if;

  if v_checkout.expires_at <= clock_timestamp() then
    raise exception 'The quote expired. Request a fresh price.' using errcode = 'NX002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('native-stay-hold:' || v_uid::text, 0));
  perform 1 from public.unit where id = v_checkout.unit_id for update;
  if v_checkout.expires_at <= clock_timestamp() then
    raise exception 'The quote expired. Request a fresh price.' using errcode = 'NX002';
  end if;

  select n.nightly_rate_kes, n.total_kes into v_price from public.rpc_stay_search(
    v_checkout.check_in, v_checkout.check_out, v_checkout.adults + v_checkout.children,
    v_checkout.property_id
  ) n where n.unit_id = v_checkout.unit_id and n.property_id = v_checkout.property_id;
  if not found then
    raise exception 'This stay is unavailable for these dates and guests.' using errcode = 'NX001';
  end if;
  if v_price.nightly_rate_kes * 100 is distinct from v_checkout.nightly_minor
     or v_price.total_kes * 100 is distinct from v_checkout.total_minor then
    raise exception 'The price changed. Request a fresh quote.' using errcode = 'NX003';
  end if;

  v_hold := public.rpc_stay_hold(
    v_checkout.unit_id, v_checkout.check_in, v_checkout.check_out,
    jsonb_build_object('first_name', v_first_name, 'adults', v_checkout.adults, 'children', v_checkout.children));
  if (v_hold ->> 'total_kes')::bigint * 100 is distinct from v_checkout.total_minor then
    raise exception 'The price changed. Request a fresh quote.' using errcode = 'NX003';
  end if;
  update public.native_stay_checkout
     set stay_id = (v_hold ->> 'stay_id')::uuid, guest_name_hash = encode(sha256(convert_to(v_first_name, 'UTF8')), 'hex')
   where id = p_quote_id returning * into v_checkout;

  return public.fn_native_stay_checkout_view(v_checkout.id);
end;
$$;

create function public.rpc_native_stay_status(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.fn_native_stay_customer();
  v_checkout public.native_stay_checkout;
begin
  -- Serialize the absence of a hold against a late retry before declaring quote expiry.
  select * into v_checkout from public.native_stay_checkout
    where id = p_operation_id and guest_user_id = v_uid for update;
  if not found then
    raise exception 'No hold was found.' using errcode = 'NX004';
  end if;
  if v_checkout.stay_id is null then
    if v_checkout.expires_at <= clock_timestamp() then
      raise exception 'The quote expired before a hold was created.' using errcode = 'NX002';
    end if;
    raise exception 'No hold was found.' using errcode = 'NX004';
  end if;
  -- Wait for any in-flight dispatch claim before treating an expired,
  -- unclaimed provider attempt as one that was never sent.
  perform 1 from public.payment
   where stay_id = v_checkout.stay_id and state = 'pending' for share;
  return public.fn_native_stay_checkout_view(v_checkout.id);
end;
$$;

create function public.rpc_native_stay_payment_begin(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.fn_native_stay_customer();
  v_checkout public.native_stay_checkout;
  v_stay public.stay;
  v_current jsonb;
  v_payment jsonb;
begin
  select * into v_checkout from public.native_stay_checkout
   where id = p_operation_id and guest_user_id = v_uid and stay_id is not null for update;
  if not found then
    raise exception 'No hold was found.' using errcode = 'NX004';
  end if;

  -- The same lock order as settlement and the web payment command.
  perform 1 from public.unit where id = v_checkout.unit_id for update;
  select * into v_stay from public.stay
    where id = v_checkout.stay_id and guest_user_id = v_uid for update;
  if not found then
    raise exception 'No hold was found.' using errcode = 'NX004';
  end if;
  v_current := public.fn_native_stay_checkout_view(v_checkout.id);
  if v_current ->> 'paymentStatus' in ('paid', 'pending') then
    return jsonb_build_object('checkout', v_current);
  end if;
  if v_stay.status <> 'held' or v_stay.hold_expires_at <= clock_timestamp()
     or coalesce(v_stay.quote_total_kes, 0) * 100 <> v_checkout.total_minor then
    raise exception 'This stay cannot be paid now.' using errcode = 'NX006';
  end if;

  v_payment := public.rpc_payment_begin_stay(v_stay.id);
  v_current := public.fn_native_stay_checkout_view(v_checkout.id);
  return jsonb_build_object('checkout', v_current,
    'dispatch', not (v_payment ->> 'reused')::boolean, 'reference', v_payment ->> 'reference',
    'amountMinor', (v_payment ->> 'amount_cents')::bigint);
end;
$$;

revoke execute on function public.fn_native_stay_customer(),
  public.fn_native_stay_checkout_view(uuid)
from public, anon, authenticated;
revoke execute on function public.rpc_native_stay_quote(uuid, uuid, date, date, integer, integer),
  public.rpc_native_stay_hold(uuid, text),
  public.rpc_native_stay_status(uuid),
  public.rpc_native_stay_payment_begin(uuid)
from public, anon;
grant execute on function public.rpc_native_stay_quote(uuid, uuid, date, date, integer, integer),
  public.rpc_native_stay_hold(uuid, text),
  public.rpc_native_stay_status(uuid),
  public.rpc_native_stay_payment_begin(uuid)
to authenticated;
