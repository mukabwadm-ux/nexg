-- Customer account deletion from the Consumer app (Apple guideline 5.1.1(v);
-- Google Play account deletion).
--
-- From PR #132 (20261205000100_customer_account_deletion, approved by the
-- owner on 11 Nov 2026 to go in as a PR), brought up to date with main:
--   * deletion is immediate once nothing is open (no grace period);
--   * receipts and payment records stay 7 years with the customer's name,
--     phone and addresses removed (counsel to confirm the wording).
-- Changes from PR #132:
--   * Guests (temporary sessions, 20270109000100) can delete too.
--   * An unpaid order waiting at 'placed' no longer blocks deletion forever
--     (card and bank orders never lapse on their own): it is cancelled with
--     the account, unless a payment for it is still in progress.
--   * Delivery addresses on kept orders are removed as well as drop-off notes.
--   * Sign-ins that are also riders, hosts, hotel staff or experience partners
--     are sent to support, like staff and merchant team members, because those
--     records would lose their owner.
--   * rpc_my_account_deletion also lists what will be deleted and what kept.
--
-- Rollback: drop function public.rpc_my_account_deletion_request(),
--   public.rpc_my_account_deletion(), public.fn_customer_deletion_blockers(uuid);
--   and restore data_request's identity_method check to ('otp', 'document').

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('account.deleted_by_customer', 'support', 'high', false, 'Customer deleted their own account from the app')
on conflict (action) do nothing;

-- 1. A request from inside the signed-in account needs no OTP or document.
do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.data_request'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%identity_method%'
  loop
    execute format('alter table public.data_request drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.data_request add constraint data_request_identity_method_check
  check (identity_method in ('otp', 'document', 'signed_in'));

-- 2. What has to finish before an account can go. Computed, never stored.
create or replace function public.fn_customer_deletion_blockers(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select g.id as guest_id from public.guest g where g.user_id = p_user_id and g.anonymised_at is null
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'active_order', case when exists (
        select 1 from public."order" o join me on o.guest_id = me.guest_id
         where o.stage in ('placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving', 'disputed')
           /* An order never paid for, still waiting at 'placed', is cancelled with the account. */
           and not (o.stage = 'placed' and o.payment_status in ('pending', 'failed'))
      ) then 'You have an order in progress. You can delete your account once it is delivered or cancelled.' end,
    'unsettled_payment', case when exists (
        select 1 from public."order" o join me on o.guest_id = me.guest_id
         where o.payment_status = 'authorised' and o.stage not in ('cancelled', 'refunded')
      ) or exists (
        select 1 from public.payment p join me on p.guest_id = me.guest_id
         where p.state in ('pending', 'authorised') and p.created_at > now() - interval '30 minutes'
      ) then 'A payment is still being processed. Try again in a few minutes.' end,
    'pending_refund', case when exists (
        select 1 from public.refund r join public."order" o on o.id = r.order_id join me on o.guest_id = me.guest_id
         where r.status in ('requested', 'awaiting_approval', 'approved')
      ) then 'A refund to you is still on its way. You can delete your account once it has been paid.' end,
    'upcoming_booking', case when exists (
        select 1 from public.booking b
         where b.guest_user_id = p_user_id and b.status in ('pending', 'confirmed') and b.ends_at > now()
      ) then 'You have an upcoming booking. Cancel it or wait until it has passed.' end,
    'upcoming_stay', case when exists (
        select 1 from public.stay st
         where st.guest_user_id = p_user_id and st.status in ('held', 'booked', 'in_stay') and st.check_out > now()
      ) then 'You have an upcoming stay. Cancel it or wait until you have checked out.' end,
    'open_dispute', case when exists (
        select 1 from public.dispute d
         where d.guest_user_id = p_user_id and d.status in ('open', 'awaiting_merchant')
      ) then 'An open dispute or refund must close first.' end,
    /* These sign-ins own business records, or records with no delete rule. */
    'business_account', case when exists (select 1 from public.staff_user s where s.user_id = p_user_id)
        or exists (select 1 from public.merchant_user mu where mu.user_id = p_user_id)
        or exists (select 1 from public.rider r where r.user_id = p_user_id)
        or exists (select 1 from public.host_user h where h.user_id = p_user_id)
        or exists (select 1 from public.hotel_user h where h.user_id = p_user_id)
        or exists (select 1 from public.experience_partner e where e.portal_user_id = p_user_id)
        or exists (select 1 from public.merchant_application_submission a where a.submitted_by = p_user_id)
        or exists (select 1 from public.merchant_application_operation a where a.actor_id = p_user_id)
        or exists (select 1 from public.merchant_application_payout a where a.declared_by = p_user_id)
        or exists (select 1 from public.connector_connection_consent cc where cc.agreed_by = p_user_id)
        or exists (select 1 from public.feature_flag f where f.updated_by = p_user_id)
      then 'This sign-in is also used for a business, rider, host or staff account. Contact NexG support to close it.' end
  ))
$$;
revoke execute on function public.fn_customer_deletion_blockers(uuid) from public, anon, authenticated;

-- 3. The customer's view: may I delete, what stops me, what goes, what stays.
create or replace function public.rpc_my_account_deletion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_blockers jsonb;
  v_request public.data_request;
begin
  if v_me is null then
    raise exception 'Sign in to manage your account.' using errcode = '42501';
  end if;
  v_blockers := public.fn_customer_deletion_blockers(v_me);
  select dr.* into v_request from public.data_request dr
    left join public.guest g on g.id = dr.guest_id
   where dr.kind = 'erasure'
     and (g.user_id = v_me or dr.requester_email = (select u.email from auth.users u where u.id = v_me))
   order by dr.received_at desc limit 1;
  return jsonb_build_object(
    'eligible', v_blockers = '{}'::jsonb,
    'blockers', v_blockers,
    'deleted', jsonb_build_array(
      'Your sign-in, so you can no longer sign in with it',
      'Your name and phone number on your customer record',
      'Your saved places and delivery addresses',
      'Your saved items, preferences and notifications',
      'Delivery addresses and notes on your past orders',
      'Orders you placed but never paid for'),
    'kept', jsonb_build_array(
      'Receipts and payment records, for 7 years as Kenyan tax law requires, with your name, phone and addresses removed',
      'Reviews you wrote, shown without your name',
      'Support conversations, without your sign-in'),
    'retention', 'Receipts and payment records are kept for 7 years, as Kenyan tax law requires, with your name, phone and addresses removed. Everything else is deleted.',
    'request', case when v_request.id is null then null else jsonb_build_object(
      'id', v_request.id, 'status', v_request.status, 'received_at', v_request.received_at,
      'fulfilled_at', v_request.fulfilled_at) end
  );
end;
$$;
revoke execute on function public.rpc_my_account_deletion() from public, anon;
grant execute on function public.rpc_my_account_deletion() to authenticated;
insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_my_account_deletion', 'A customer reading whether their own account can be deleted; nothing changes',
   '20270116000200_customer_account_deletion')
on conflict (function_name) do nothing;

-- 4. Delete my account, now.
create or replace function public.rpc_my_account_deletion_request()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_email text;
  v_guest uuid;
  v_blockers jsonb;
  v_request public.data_request;
  v_cancelled integer := 0;
begin
  if v_me is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_me;
  select g.id into v_guest from public.guest g where g.user_id = v_me and g.anonymised_at is null;

  v_blockers := public.fn_customer_deletion_blockers(v_me);
  if v_blockers <> '{}'::jsonb then
    raise exception '%', (select string_agg(value #>> '{}', ' ') from jsonb_each(v_blockers))
      using errcode = 'check_violation';
  end if;

  insert into public.data_request (guest_id, requester_email, kind, status, channel,
    identity_verified_at, identity_method, blocking_reasons)
  values (v_guest, v_email, 'erasure', 'in_progress', 'app', now(), 'signed_in', '{}'::jsonb)
  returning * into v_request;

  if v_guest is not null then
    /* Orders never paid for go with the account. */
    with gone as (
      update public."order"
         set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'account_deleted'
       where guest_id = v_guest and stage = 'placed' and payment_status in ('pending', 'failed')
      returning id)
    insert into public.order_event (order_id, kind, title, actor_type)
    select id, 'cancelled', 'Cancelled: the customer deleted their account', 'system' from gone;
    get diagnostics v_cancelled = row_count;

    delete from public.guest_place where guest_id = v_guest;
    /* Orders stay (finance), without where they went or the customer's words about it. */
    update public."order"
       set dropoff_note = null, dropoff_point = null,
           dropoff_label = 'Removed at the customer''s request'
     where guest_id = v_guest;
    perform public.fn_anonymise_guest(v_guest);
  end if;

  update public.data_request set status = 'fulfilled', fulfilled_at = now(), requester_email = null
   where id = v_request.id returning * into v_request;

  perform audit.log('guest'::public.actor_type, 'support', 'account.deleted_by_customer',
    p_actor_id => v_me, p_target_type => 'data_request', p_target_id => v_request.id,
    p_after => jsonb_build_object('guest_anonymised', v_guest is not null,
                                  'unpaid_orders_cancelled', v_cancelled),
    p_severity => 'high'::public.audit_severity);

  /* Last: the sign-in itself. Saved items, preferences, notifications and push
     subscriptions cascade; bookings, disputes, reviews and tickets keep their
     history with the link set to null. */
  delete from auth.users where id = v_me;

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'fulfilled');
end;
$$;
revoke execute on function public.rpc_my_account_deletion_request() from public, anon;
grant execute on function public.rpc_my_account_deletion_request() to authenticated;
