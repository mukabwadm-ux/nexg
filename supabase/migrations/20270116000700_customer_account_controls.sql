-- Customer account controls carried forward from PR #132 (consumer/account-controls,
-- by langs4u, design approved by the owner on 11 Nov 2026), with a new id.
--
-- #132's account deletion part went into 20270116000200 (#159). Its saved-items
-- part (customer_saved, rpc_saved_add) is already on main in
-- 20261220000300_saved_places, with a stricter "real account" policy, so it is
-- not repeated here. What #132 added that main still lacks:
--   1. rpc_guest_ensure: the signed-in customer's own guest record, made if missing.
--   2-4. Support tickets linked to the account: support_ticket.user_id,
--        rpc_my_support_ticket_create, rpc_my_support_tickets.
--   5. Notification choices: customer_notification_pref, rpc_notification_pref_set.
--   6. Download my data: rpc_my_data_export_request, rpc_my_data_requests.
--
-- Rollback: drop the six functions and customer_notification_pref, drop
-- support_ticket.user_id, and delete their wiring_audit_exempt rows.

-- 1. The signed-in customer's own guest row, created if missing. Never claims a row by phone.
create or replace function public.rpc_guest_ensure()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_guest public.guest;
  v_name text;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_guest from public.guest where user_id = v_me and anonymised_at is null;
  if found then
    return jsonb_build_object('ok', true, 'guest_id', v_guest.id, 'created', false);
  end if;
  select nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), '')
    into v_name from auth.users u where u.id = v_me;
  -- Phone stays empty: the first order (or a later verified-phone step) supplies it.
  -- REVIEW: rpc_order_place_web then sets `phone = coalesce(phone, v_phone)` on this row. If another,
  -- unlinked guest already holds that phone (an earlier signed-out web order), the unique constraint
  -- refuses the order. Decide with the phone-linking security fix: merge after an OTP, or keep separate.
  insert into public.guest (user_id, name) values (v_me, v_name) returning * into v_guest;
  return jsonb_build_object('ok', true, 'guest_id', v_guest.id, 'created', true);
end;
$$;
revoke execute on function public.rpc_guest_ensure() from public, anon;
grant execute on function public.rpc_guest_ensure() to authenticated;
insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_guest_ensure', 'A customer creating their own empty guest record is not an action over somebody', 'guest.created_at')
on conflict (function_name) do nothing;

-- 2. Tickets know which account raised them.
alter table public.support_ticket add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists support_ticket_user_idx on public.support_ticket (user_id, created_at desc) where user_id is not null;

-- 3. Raise a ticket as the signed-in customer: the reply address comes from the account, not the form.
create or replace function public.rpc_my_support_ticket_create(
  p_body text,
  p_topic public.ticket_topic default 'something_else',
  p_order_reference text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_user auth.users;
  v_result jsonb;
begin
  if v_me is null then
    raise exception 'Sign in to contact support from your account.' using errcode = '42501';
  end if;
  if p_topic in ('partner_rider', 'partner_merchant', 'hotel_partnership') then
    raise exception 'Use the partner forms on nexgapp.com for that.' using errcode = 'check_violation';
  end if;
  -- An order reference must be one of this customer's own orders.
  if nullif(trim(coalesce(p_order_reference, '')), '') is not null and not exists (
      select 1 from public."order" o join public.guest g on g.id = o.guest_id
       where g.user_id = v_me and o.reference = trim(p_order_reference)) then
    raise exception 'That order reference isn''t on your account.' using errcode = 'check_violation';
  end if;
  select * into v_user from auth.users where id = v_me;
  -- Reuses the one ticket creator (rate limit, reference, notification, audit), then links the account.
  v_result := public.rpc_support_ticket_create(
    p_body, 'guest', p_topic,
    nullif(trim(concat_ws(' ', v_user.raw_user_meta_data ->> 'first_name', v_user.raw_user_meta_data ->> 'last_name')), ''),
    v_user.email, nullif(v_user.raw_user_meta_data ->> 'phone', ''),
    p_order_reference, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('channel', 'app'), 'consumer_app');
  update public.support_ticket set user_id = v_me where reference = v_result ->> 'reference';
  return jsonb_build_object('reference', v_result ->> 'reference');
end;
$$;
revoke execute on function public.rpc_my_support_ticket_create(text, public.ticket_topic, text, jsonb) from public, anon;
grant execute on function public.rpc_my_support_ticket_create(text, public.ticket_topic, text, jsonb) to authenticated;
insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_my_support_ticket_create', 'The ticket is created and audited by rpc_support_ticket_create; this only links it to the signed-in account',
   'audit_event support.ticket_created, support_ticket.user_id')
on conflict (function_name) do nothing;

-- 4. The customer's own tickets. No staff notes; only what the customer wrote, status and timing.
-- REVIEW: add the staff reply text once the support desk marks which replies are customer-facing.
create or replace function public.rpc_my_support_tickets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'reference', t.reference, 'topic', t.topic, 'status', t.status,
      'order_reference', t.order_reference, 'body', left(t.body, 2000),
      'created_at', t.created_at, 'updated_at', t.updated_at, 'resolved_at', t.resolved_at)
    order by t.created_at desc), '[]'::jsonb)
  from (select * from public.support_ticket where user_id = (select auth.uid()) order by created_at desc limit 50) t
$$;
revoke execute on function public.rpc_my_support_tickets() from public, anon;
grant execute on function public.rpc_my_support_tickets() to authenticated;
insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_my_support_tickets', 'A customer reading their own tickets is not an action over somebody', 'support_ticket')
on conflict (function_name) do nothing;

-- 5. Notification choices: one row per customer, a category -> {channel: on/off} map.
-- REVIEW: which categories exist server-side. The app's are in src/settings/account-preferences.ts
-- (order_confirmations, delivery_updates, booking_reminders, …); the sender must read this before sending.
-- Transactional messages (receipts, a delivery arriving) stay on regardless, as the app explains.
create table if not exists public.customer_notification_pref (
  user_id uuid primary key references auth.users (id) on delete cascade,
  choices jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pref_choices_is_object check (jsonb_typeof(choices) = 'object')
);
alter table public.customer_notification_pref enable row level security;
create policy customer_notification_pref_own on public.customer_notification_pref
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.customer_notification_pref from anon;
grant select on public.customer_notification_pref to authenticated;

create or replace function public.rpc_notification_pref_set(p_category text, p_channel text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_choices jsonb;
begin
  if v_me is null then
    raise exception 'Sign in to change notifications.' using errcode = '42501';
  end if;
  if p_category !~ '^[a-z_]{3,40}$' or p_channel not in ('all', 'push', 'email', 'sms', 'whatsapp') or p_enabled is null then
    raise exception 'That isn''t a notification setting.' using errcode = '22023';
  end if;
  insert into public.customer_notification_pref (user_id, choices)
  values (v_me, jsonb_build_object(p_category, jsonb_build_object(p_channel, p_enabled)))
  on conflict (user_id) do update set
    choices = public.customer_notification_pref.choices
      || jsonb_build_object(p_category, coalesce(public.customer_notification_pref.choices -> p_category, '{}'::jsonb)
                                         || jsonb_build_object(p_channel, p_enabled)),
    updated_at = now()
  returning choices into v_choices;
  return jsonb_build_object('ok', true, 'choices', v_choices);
end;
$$;
revoke execute on function public.rpc_notification_pref_set(text, text, boolean) from public, anon;
grant execute on function public.rpc_notification_pref_set(text, text, boolean) to authenticated;
insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_notification_pref_set', 'A customer changing their own notification choices', 'customer_notification_pref')
on conflict (function_name) do nothing;

-- 6. Download my data: an 'access' request from the signed-in account, prepared by the existing DPO flow.
create or replace function public.rpc_my_data_export_request()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_email text;
  v_guest uuid;
  v_request public.data_request;
begin
  if v_me is null then
    raise exception 'Sign in to request your data.' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_me;
  select g.id into v_guest from public.guest g where g.user_id = v_me and g.anonymised_at is null;
  -- One open request at a time.
  select dr.* into v_request from public.data_request dr
   where dr.kind = 'access' and dr.status in ('received', 'in_progress', 'bundle_ready')
     and (dr.guest_id = v_guest or dr.requester_email = v_email)
   order by dr.received_at desc limit 1;
  if v_request.id is null then
    -- identity_method 'signed_in' comes from 20270116000200_customer_account_deletion.
    insert into public.data_request (guest_id, requester_email, kind, status, channel, identity_verified_at, identity_method)
    values (v_guest, v_email, 'access', 'in_progress', 'app', now(), 'signed_in')
    returning * into v_request;
    perform audit.log('guest'::public.actor_type, 'support', 'data_request.received',
      p_actor_id => v_me, p_target_type => 'data_request', p_target_id => v_request.id,
      p_after => jsonb_build_object('kind', 'access', 'channel', 'app', 'due_at', v_request.due_at),
      p_severity => 'high'::public.audit_severity);
  end if;
  return jsonb_build_object('id', v_request.id, 'status', v_request.status, 'received_at', v_request.received_at,
    'due_at', v_request.due_at);
end;
$$;
revoke execute on function public.rpc_my_data_export_request() from public, anon;
grant execute on function public.rpc_my_data_export_request() to authenticated;

-- The customer's own export requests. The bundle link itself is sent by email by the DPO flow.
-- REVIEW: whether the app may also show a signed, expiring download link while bundle_expires_at is in the future.
create or replace function public.rpc_my_data_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', dr.id, 'kind', dr.kind, 'status', dr.status,
      'received_at', dr.received_at, 'due_at', dr.due_at, 'fulfilled_at', dr.fulfilled_at,
      'bundle_expires_at', dr.bundle_expires_at) order by dr.received_at desc), '[]'::jsonb)
  from public.data_request dr
  left join public.guest g on g.id = dr.guest_id
  where g.user_id = (select auth.uid())
     or dr.requester_email = (select u.email from auth.users u where u.id = (select auth.uid()))
$$;
revoke execute on function public.rpc_my_data_requests() from public, anon;
grant execute on function public.rpc_my_data_requests() to authenticated;
insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_my_data_requests', 'A customer reading their own data requests', 'nothing changes')
on conflict (function_name) do nothing;
