-- Customer account deletion from the Consumer app (Apple guideline 5.1.1(v); Google Play account deletion).
--
-- From the Consumer app's proposal docs/backend-proposals/2026-11-11-account-deletion.sql (langs4u/nexg-app),
-- approved by the owner on 11 Nov 2026 to go in as a PR. Choices made with the defaults:
--   * deletion is immediate once nothing is open (no 7-day grace period);
--   * receipts and payment records stay 7 years, anonymised; counsel to confirm the wording.
--
-- Builds on the existing data_request / fn_data_request_blockers / fn_anonymise_guest flow, adding a
-- signed-in path. Blocks while an order, payment, refund, booking, stay or dispute is open, and refuses
-- sign-ins that are also staff or merchant applicants (those have auth.users links with no delete rule).

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('account.deleted_by_customer', 'support', 'high', false, 'Customer deleted their own account from the app')
on conflict (action) do nothing;

-- 1. A request from inside the signed-in account needs no OTP or document.
do $$
declare v_name text;
begin
  -- The original check is inline (unnamed), so find it rather than assume its generated name.
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

-- 2. What has to finish before an account can go. Computed, never stored, like fn_data_request_blockers.
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
      ) then 'You have an order in progress. You can delete your account once it is delivered or cancelled.' end,
    'unsettled_payment', case when exists (
        select 1 from public."order" o join me on o.guest_id = me.guest_id
         where o.payment_status in ('pending', 'authorised')
           and o.stage not in ('cancelled', 'refunded')
      ) then 'A payment on one of your orders is still being processed.' end,
    'pending_refund', case when exists (
        select 1 from public.refund r join public."order" o on o.id = r.order_id join me on o.guest_id = me.guest_id
         where r.status in ('requested', 'awaiting_approval', 'approved')
      ) then 'A refund to you is still on its way. You can delete your account once it has been paid.' end,
    -- REVIEW: a wallet credit balance, if NexG keeps one, should also block (or be refunded) first.
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
    -- REVIEW: business and staff accounts are deleted by NexG support, because they own merchant
    -- records and have links to auth.users with no delete rule.
    'business_account', case when exists (select 1 from public.staff_user s where s.user_id = p_user_id)
        or exists (select 1 from public.merchant_application_submission a where a.submitted_by = p_user_id)
        or exists (select 1 from public.merchant_application_operation a where a.actor_id = p_user_id)
        or exists (select 1 from public.merchant_application_payout a where a.declared_by = p_user_id)
        or exists (select 1 from public.merchant_user mu where mu.user_id = p_user_id)
        or exists (select 1 from public.connector_connection_consent cc where cc.agreed_by = p_user_id)
      then 'This sign-in is also used for a business or staff account. Contact NexG support to close it.' end
  ))
$$;
revoke execute on function public.fn_customer_deletion_blockers(uuid) from public, anon, authenticated;

-- 3. The customer's view: may I delete, what stops me, what is kept, and my latest request.
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
   where dr.kind = 'erasure' and (g.user_id = v_me or dr.requester_email = (select u.email from auth.users u where u.id = v_me))
   order by dr.received_at desc limit 1;
  return jsonb_build_object(
    'eligible', v_blockers = '{}'::jsonb,
    'blockers', v_blockers,
    -- REVIEW (counsel): wording of what is kept, and for how long.
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
  ('rpc_my_account_deletion', 'A customer reading whether their own account can be deleted', 'nothing changes')
on conflict (function_name) do nothing;

-- 4. Delete my account.
-- REVIEW: this deletes immediately. The alternative is a 7-day grace period (status 'in_progress',
-- a nightly cron finishes it, signing in again within 7 days withdraws it). Apple accepts either,
-- as long as the app says which; immediate is simpler and leaves nothing half-done.
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
    -- Saved places are not finance records: deleted. REVIEW (counsel): the 90-day `location` rule.
    delete from public.guest_place where guest_id = v_guest;
    -- Orders stay (finance), without the customer's own words about the drop-off.
    update public."order" set dropoff_note = null where guest_id = v_guest;
    perform public.fn_anonymise_guest(v_guest);
  end if;

  update public.data_request set status = 'fulfilled', fulfilled_at = now(), requester_email = null
   where id = v_request.id returning * into v_request;

  perform audit.log('guest'::public.actor_type, 'support', 'account.deleted_by_customer',
    p_actor_id => v_me, p_target_type => 'data_request', p_target_id => v_request.id,
    p_after => jsonb_build_object('guest_anonymised', v_guest is not null),
    p_severity => 'high'::public.audit_severity);

  -- Last: the sign-in itself. Notifications and push subscriptions cascade; bookings, disputes and the
  -- guest row keep their history with the link set to null.
  delete from auth.users where id = v_me;

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'fulfilled');
end;
$$;
revoke execute on function public.rpc_my_account_deletion_request() from public, anon;
grant execute on function public.rpc_my_account_deletion_request() to authenticated;


-- App side (NEXG APP), once this lands: `src/providers/supabase/account-deletion.ts` maps
--   rpc_my_account_deletion          -> AccountDeletionConnector.loadAssessment
--   rpc_my_account_deletion_request  -> requestDeletion (then the app signs out locally)
-- into the existing screen `src/screens/account/account-deletion.tsx` (Account > Settings > Privacy).
