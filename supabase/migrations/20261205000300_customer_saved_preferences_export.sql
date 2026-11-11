-- Saved merchants and items, notification choices, and "download my data" for signed-in customers.
--
-- From the Consumer app's proposal docs/backend-proposals/2026-11-11-saved-preferences-export.sql
-- (langs4u/nexg-app), approved by the owner on 11 Nov 2026 to go in as a PR. Export reuses the existing
-- data_request 'access' flow; the bundle link is sent by email (default). Depends on the 'signed_in'
-- identity method from 20261205000100_customer_account_deletion.sql.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('data_request.received', 'support', 'high', false, 'Data request received')
on conflict (action) do nothing;

-- 1. Saved: one row per thing a customer keeps. Points at public catalogue ids, never copies them.
create table if not exists public.customer_saved (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('merchant', 'item')),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  item_id uuid references public.catalogue_item (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_item_has_item check ((kind = 'item') = (item_id is not null))
);
create unique index if not exists customer_saved_once on public.customer_saved
  (user_id, kind, merchant_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists customer_saved_recent on public.customer_saved (user_id, created_at desc);
alter table public.customer_saved enable row level security;
-- Own rows only, through PostgREST: list with a select, remove with a delete. Saving goes through the RPC.
create policy customer_saved_own_read on public.customer_saved for select to authenticated using (user_id = (select auth.uid()));
create policy customer_saved_own_delete on public.customer_saved for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.customer_saved from anon;
grant select, delete on public.customer_saved to authenticated;

-- Save a merchant, or an item of a merchant. Only what the public can see can be saved.
create or replace function public.rpc_saved_add(p_merchant_id uuid, p_item_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Sign in to save places.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.merchant_public m where m.id = p_merchant_id) then
    raise exception 'That place isn''t available to save.' using errcode = 'P0002';
  end if;
  if p_item_id is not null and not exists (
      select 1 from public.catalogue_public c where c.id = p_item_id and c.merchant_id = p_merchant_id) then
    raise exception 'That item isn''t available to save.' using errcode = 'P0002';
  end if;
  -- REVIEW: a cap per customer (e.g. 500) to keep the table bounded.
  insert into public.customer_saved (user_id, kind, merchant_id, item_id)
  values (v_me, case when p_item_id is null then 'merchant' else 'item' end, p_merchant_id, p_item_id)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select s.id into v_id from public.customer_saved s
     where s.user_id = v_me and s.merchant_id = p_merchant_id and s.item_id is not distinct from p_item_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke execute on function public.rpc_saved_add(uuid, uuid) from public, anon;
grant execute on function public.rpc_saved_add(uuid, uuid) to authenticated;
insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_saved_add', 'A customer saving a public place for themselves is not an action over somebody', 'customer_saved')
on conflict (function_name) do nothing;

-- 2. Notification choices: one row per customer, a category -> {channel: on/off} map.
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

-- 3. Download my data: an 'access' request from the signed-in account, prepared by the existing DPO flow.
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
    -- Needs the identity_method 'signed_in' value from 2026-11-11-account-deletion.sql.
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


-- App side (NEXG APP), once this lands:
--   * `src/providers/supabase/saved.ts`: customer_saved (select/delete) + rpc_saved_add, joined to
--     merchant_public / catalogue_public for display; save buttons on MerchantCard and item rows;
--   * `src/providers/supabase/settings.ts`: customer_notification_pref + rpc_notification_pref_set;
--   * privacy export: rpc_my_data_export_request + rpc_my_data_requests.
--
-- Remove: drop function public.rpc_my_data_requests(); drop function public.rpc_my_data_export_request();
--         drop function public.rpc_notification_pref_set(text, text, boolean); drop table public.customer_notification_pref;
--         drop function public.rpc_saved_add(uuid, uuid); drop table public.customer_saved;
--         delete from public.wiring_audit_exempt where function_name in
--           ('rpc_saved_add', 'rpc_notification_pref_set', 'rpc_my_data_requests');
