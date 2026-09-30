-- Hotels & Airbnb · row level security, and the secrets.
--
-- Reads are a policy, writes are an RPC. The blanket grants Supabase
-- hands `anon` on new tables are revoked, so a policy somebody forgets
-- to write can never read as permission.
--
-- Two things here are stricter than the rest of the schema:
--
--   `guest` and `data_request` are visible to support and the DPO and
--   to nobody else — not to partnerships, who have no business reading
--   a guest's order history to sign up a hotel.
--
--   Gate codes and caretaker numbers are not in any view and are not
--   readable through any policy. They come out of two functions, both
--   of which log who asked and why.

-- ═══════════════════════════════════════════════ authz helpers

create or replace function authz.is_host_member(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.host_user hu
    where hu.host_id = p_host_id and hu.user_id = (select auth.uid())
  )
$$;

/* A manager may be scoped to some units. Null means all of them. */
create or replace function authz.can_see_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unit u
    join public.host_user hu on hu.host_id = u.host_id
    where u.id = p_unit_id
      and hu.user_id = (select auth.uid())
      and (hu.units is null or p_unit_id = any (hu.units))
  )
$$;

create or replace function authz.works_hospitality(p_city_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin()
      or authz.has_role('ops_manager', p_city_id)
      or authz.has_role('partnerships', p_city_id)
      or authz.has_role('city_lead', p_city_id)
$$;

/* Guest records, consent and data requests. Deliberately narrow. */
create or replace function authz.handles_guest_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin()
      or authz.has_role('dpo', null)
      or authz.has_role('concierge_agent', null)
      or authz.has_role('concierge_lead', null)
$$;

comment on function authz.handles_guest_data() is
  'Support and the DPO. Partnerships is deliberately absent — signing up a hotel is not a reason to read a guest''s order history.';

create or replace function authz.is_hotel_member(p_hotel_id uuid, p_role text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hotel_user hu
    where hu.hotel_id = p_hotel_id
      and hu.user_id = (select auth.uid())
      and (p_role is null or hu.role = p_role)
  )
$$;

grant execute on function authz.is_host_member(uuid) to authenticated, service_role;
grant execute on function authz.can_see_unit(uuid) to authenticated, service_role;
grant execute on function authz.works_hospitality(uuid) to authenticated, service_role;
grant execute on function authz.handles_guest_data() to authenticated, service_role;
grant execute on function authz.is_hotel_member(uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════ privileges

do $$
declare
  t text;
begin
  foreach t in array array[
    'host', 'host_user', 'unit', 'unit_qr', 'qr_scan', 'welcome_package',
    'package_order', 'host_invoice', 'host_billing_event', 'host_message',
    'hotel', 'hotel_user', 'hotel_contact', 'hotel_program_setting',
    'hotel_access_rule', 'hotel_room', 'folio_posting', 'folio_cap_usage',
    'hotel_statement', 'folio_reconciliation', 'hotel_prospect_activity',
    'guest', 'guest_consent', 'guest_block', 'data_request', 'retention_rule'
  ]
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════ hosts

create policy host_read on public.host
  for select to authenticated
  using (authz.is_host_member(id) or authz.works_hospitality(city_id));

create policy host_user_read on public.host_user
  for select to authenticated
  using (user_id = (select auth.uid()) or authz.is_host_member(host_id)
         or authz.works_hospitality(null));

create policy unit_read on public.unit
  for select to authenticated
  using (authz.can_see_unit(id) or authz.works_hospitality(city_id));

create policy unit_qr_read on public.unit_qr
  for select to authenticated
  using (
    (unit_id is not null and authz.can_see_unit(unit_id))
    or (room_id is not null and exists (
      select 1 from public.hotel_room r
      where r.id = unit_qr.room_id and authz.is_hotel_member(r.hotel_id)))
    or authz.works_hospitality(null)
  );

create policy qr_scan_read on public.qr_scan
  for select to authenticated using (authz.works_hospitality(null));

create policy package_order_read on public.package_order
  for select to authenticated
  using (authz.is_host_member(host_id) or authz.works_hospitality(null));

create policy host_invoice_read on public.host_invoice
  for select to authenticated
  using (authz.is_host_member(host_id) or authz.works_hospitality(null));

create policy host_billing_read on public.host_billing_event
  for select to authenticated
  using (authz.is_host_member(host_id) or authz.works_hospitality(null));

create policy host_message_read on public.host_message
  for select to authenticated
  using (authz.is_host_member(host_id) or authz.works_hospitality(null));

/*
 * The package catalogue is the one thing here a guest-facing page needs
 * before anybody has signed in: the public /hosts page prices the
 * welcome packages. Live rows only.
 */
grant select on public.welcome_package to anon;

create policy welcome_package_read_live on public.welcome_package
  for select to anon, authenticated using (status = 'live');

create policy welcome_package_read_staff on public.welcome_package
  for select to authenticated using (authz.works_hospitality(city_id));

-- ═══════════════════════════════════════════════════ hotels

create policy hotel_read on public.hotel
  for select to authenticated
  using (authz.is_hotel_member(id) or authz.works_hospitality(city_id));

create policy hotel_user_read on public.hotel_user
  for select to authenticated
  using (user_id = (select auth.uid()) or authz.is_hotel_member(hotel_id, 'admin')
         or authz.works_hospitality(null));

create policy hotel_contact_read on public.hotel_contact
  for select to authenticated
  using (authz.is_hotel_member(hotel_id) or authz.works_hospitality(null));

create policy hotel_setting_read on public.hotel_program_setting
  for select to authenticated
  using (authz.is_hotel_member(hotel_id) or authz.works_hospitality(null));

/* Every hotel member reads the access rule — the desk has to be able
   to tell security what a rider was told. */
create policy hotel_access_rule_read on public.hotel_access_rule
  for select to authenticated
  using (authz.is_hotel_member(hotel_id) or authz.works_hospitality(null));

create policy hotel_room_read on public.hotel_room
  for select to authenticated
  using (authz.is_hotel_member(hotel_id) or authz.works_hospitality(null));

create policy folio_posting_read on public.folio_posting
  for select to authenticated
  using (authz.is_hotel_member(hotel_id) or authz.works_hospitality(null)
         or authz.handles_guest_data());

create policy folio_cap_read on public.folio_cap_usage
  for select to authenticated
  using (authz.is_hotel_member(hotel_id) or authz.works_hospitality(null));

/* Money. The hotel's own finance users and NexG finance, not the desk. */
create policy hotel_statement_read on public.hotel_statement
  for select to authenticated
  using (
    authz.is_hotel_member(hotel_id, 'finance')
    or authz.is_hotel_member(hotel_id, 'admin')
    or authz.works_hospitality(null)
    or authz.has_role('finance', null)
  );

create policy folio_recon_read on public.folio_reconciliation
  for select to authenticated
  using (exists (
    select 1 from public.hotel_statement s
    where s.id = folio_reconciliation.statement_id
      and (authz.is_hotel_member(s.hotel_id, 'finance')
           or authz.works_hospitality(null)
           or authz.has_role('finance', null))
  ));

/* A prospect's pipeline is NexG's, not the hotel's. */
create policy hotel_activity_read on public.hotel_prospect_activity
  for select to authenticated using (authz.works_hospitality(null));

-- ═══════════════════════════════════ guests and data requests

create policy guest_read_own on public.guest
  for select to authenticated using (user_id = (select auth.uid()));

create policy guest_read_staff on public.guest
  for select to authenticated using (authz.handles_guest_data());

create policy guest_consent_read on public.guest_consent
  for select to authenticated
  using (
    authz.handles_guest_data()
    or exists (select 1 from public.guest g
               where g.id = guest_consent.guest_id and g.user_id = (select auth.uid()))
  );

create policy guest_block_read on public.guest_block
  for select to authenticated using (authz.handles_guest_data());

/*
 * The DPO's queue. Support can see that a request exists — they field
 * the calls about them — but the bundle and the decision are the DPO's.
 */
create policy data_request_read on public.data_request
  for select to authenticated using (authz.handles_guest_data());

create policy retention_rule_read on public.retention_rule
  for select to authenticated using (authz.reaches_module('hotels'));

-- ═════════════════════════════════════ secrets: gate codes

/*
 * App-level encryption with a key held outside the database, so that a
 * dump of this table is not a list of gate codes.
 *
 * The key lives in the `app.secret_key` setting, set from the
 * environment at deploy time. When it is absent these functions refuse
 * rather than falling back to storing the value in the clear — a
 * silent downgrade here would be the worst possible failure, because
 * everything would appear to work.
 */
create or replace function public.fn_encrypt_secret(p_plain text)
returns bytea
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := nullif(current_setting('app.secret_key', true), '');
begin
  if p_plain is null or trim(p_plain) = '' then
    return null;
  end if;
  if v_key is null then
    raise exception 'No encryption key is configured, so this cannot be stored safely. Set app.secret_key.'
      using errcode = 'config_file_error';
  end if;
  return extensions.pgp_sym_encrypt(p_plain, v_key);
end;
$$;

create or replace function public.fn_decrypt_secret(p_cipher bytea)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := nullif(current_setting('app.secret_key', true), '');
begin
  if p_cipher is null then
    return null;
  end if;
  if v_key is null then
    raise exception 'No encryption key is configured.' using errcode = 'config_file_error';
  end if;
  return extensions.pgp_sym_decrypt(p_cipher, v_key);
end;
$$;

revoke all on function public.fn_encrypt_secret(text) from public, anon, authenticated;
revoke all on function public.fn_decrypt_secret(bytea) from public, anon, authenticated;

comment on function public.fn_decrypt_secret(bytea) is
  'Not callable by anyone. The only callers are rpc_rider_reveal_gate_code and rpc_unit_secret_reveal, which are SECURITY DEFINER and audit every call.';
