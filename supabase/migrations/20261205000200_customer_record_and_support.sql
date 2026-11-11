-- A guest record from the first sign-in, and support tickets linked to the signed-in customer.
--
-- From the Consumer app's proposal docs/backend-proposals/2026-11-11-customer-record-and-support.sql
-- (langs4u/nexg-app), approved by the owner on 11 Nov 2026 to go in as a PR.
--   * rpc_guest_ensure never claims an existing guest by phone (the phone-linking issue in
--     rpc_order_place_web is a separate security fix).
--   * rpc_my_support_ticket_create reuses rpc_support_ticket_create, then links the ticket to the account.

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


-- App side (NEXG APP), once this lands:
--   * after sign-in / sign-up: call rpc_guest_ensure once, so addresses save before a first order;
--   * `src/providers/supabase/support.ts`: rpc_my_support_ticket_create -> SupportConnector submit,
--     rpc_my_support_tickets -> the request list; Activity "Get help" passes the order reference.
