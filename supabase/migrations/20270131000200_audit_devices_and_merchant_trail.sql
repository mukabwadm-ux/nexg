-- Which device did what, and a merchant trail only staff can read.
--
-- Two asks from the owner, one mechanism:
--
--  1. The admin account may be shared between people. Every sign-in
--     and every admin action should say which device and which IP it
--     came from, so one account's actions can be told apart.
--  2. Everything a merchant user does in the merchant portal should be
--     on that merchant's page in the admin console, with who, what,
--     when, IP and device. Nothing new appears on the merchant's own
--     dashboard.
--
-- How the request reaches the database
-- ------------------------------------
-- PostgREST hands every request's headers to Postgres as the
-- `request.headers` setting and the JWT as `request.jwt.claims`. Both
-- apps' server-side Supabase clients now send four headers on every
-- call: x-nexg-client-ip and x-nexg-client-ua (read by Next from the
-- incoming request), x-nexg-device (a random id in a long-lived
-- httpOnly cookie, one per browser) and x-nexg-surface. A call made
-- straight from a browser has no x-nexg-* headers; for those the
-- gateway's own x-forwarded-for and user-agent are used instead. The
-- session is the JWT's `session_id` claim: one per sign-in, and not
-- something a caller can make up.
--
-- So `audit.log` learns the origin of the call itself, and not one of
-- the hundreds of call sites changes.
--
-- Where IP addresses live
-- -----------------------
-- Not in the hash chain. `audit.audit_event` is append-only and
-- hashed; an address written there could never be removed without
-- breaking every hash after it. IPs are personal data and need a
-- retention period, so the origin of each event goes in a side table,
-- `audit.event_origin`, keyed by event id. Only the pseudonymous
-- session id goes on the chained row. A daily job clears IPs and user
-- agents older than 365 days from both the side table and the
-- sign-in table. Only staff with full access to the audit log can
-- read either; a merchant's own trail is also readable by the staff
-- who manage merchants.
--
-- Limitation, stated rather than hidden: x-nexg-client-ip is what our
-- server says the visitor's address was. Somebody calling the API
-- directly with their own token could send a made-up value. The
-- gateway-seen address is kept beside it (`proxy_ip`) for that case.
-- The session and the user come from the signed JWT and cannot be
-- made up.

-- ═══════════════════════════════════════ reading the request

/* A text that may or may not be an address. Never raises. */
create or replace function audit.fn_inet(p_value text)
returns inet
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return btrim(p_value)::inet;
exception when others then
  return null;
end;
$$;

/* Same, for a uuid. */
create or replace function audit.fn_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

/* "Chrome · Windows". Coarse on purpose: a label for people to read,
   not a fingerprint. The device id is what tells two devices apart. */
create or replace function audit.fn_device_label(p_ua text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_ua, '') = '' then null else
    (case
       when p_ua ~* 'Edg' then 'Edge'
       when p_ua ~* 'OPR|Opera' then 'Opera'
       when p_ua ~* 'SamsungBrowser' then 'Samsung Internet'
       when p_ua ~* 'Firefox|FxiOS' then 'Firefox'
       when p_ua ~* 'Chrome|CriOS' then 'Chrome'
       when p_ua ~* 'Safari' then 'Safari'
       when p_ua ~* 'node|undici|curl|python|Go-http' then 'Script'
       else 'Other browser'
     end)
    || ' · ' ||
    (case
       when p_ua ~* 'Android' then 'Android'
       when p_ua ~* 'iPhone' then 'iPhone'
       when p_ua ~* 'iPad' then 'iPad'
       when p_ua ~* 'Windows' then 'Windows'
       when p_ua ~* 'Mac OS|Macintosh' then 'macOS'
       when p_ua ~* 'CrOS' then 'ChromeOS'
       when p_ua ~* 'Linux' then 'Linux'
       else 'Other'
     end)
  end
$$;

/*
 * Where the current call came from. Every field may be null: a cron
 * job, a migration or psql has no request at all.
 */
create or replace function audit.fn_request_context()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_claims jsonb;
  v_ip text;
  v_proxy text;
  v_ua text;
  v_device text;
  v_surface text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  v_headers := coalesce(v_headers, '{}'::jsonb);
  v_claims := coalesce(v_claims, '{}'::jsonb);

  v_proxy := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for',
                                       v_headers ->> 'x-real-ip', ''), ',', 1));
  v_ip := coalesce(
    nullif(current_setting('app.ip', true), ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-nexg-client-ip', ''), ',', 1)), ''),
    nullif(v_proxy, ''));
  v_ua := left(coalesce(
    nullif(current_setting('app.user_agent', true), ''),
    nullif(v_headers ->> 'x-nexg-client-ua', ''),
    nullif(v_headers ->> 'user-agent', '')), 400);
  v_device := v_headers ->> 'x-nexg-device';
  if v_device !~ '^[A-Za-z0-9_-]{8,64}$' then
    v_device := null;
  end if;
  v_surface := v_headers ->> 'x-nexg-surface';
  if v_surface not in ('admin', 'merchant', 'web') then
    v_surface := null;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ip', host(audit.fn_inet(v_ip)),
    'proxy_ip', host(audit.fn_inet(v_proxy)),
    'user_agent', v_ua,
    'device_id', v_device,
    'device_label', audit.fn_device_label(v_ua),
    'surface', v_surface,
    'session_id', coalesce(
      nullif(current_setting('app.session_id', true), ''),
      nullif(v_claims ->> 'session_id', '')),
    'user_id', nullif(v_claims ->> 'sub', '')));
end;
$$;

comment on function audit.fn_request_context is
  'Where the current API call came from: IP, user agent, device id, sign-in session and user. Read from the headers PostgREST passes in; empty for cron and psql.';

-- ═══════════════════════════════════ the origin of each event

create table if not exists audit.event_origin (
  event_id bigint primary key references audit.audit_event (id) on delete restrict,
  at timestamptz not null default now(),
  user_id uuid,
  session_id text,
  device_id text,
  device_label text,
  surface text,
  ip inet,
  proxy_ip inet,
  user_agent text,
  /* Which merchant the event belongs to, when it was a merchant
     user's. Duplicated from the event so the merchant trail is one
     index scan. */
  merchant_id uuid,
  /* The transaction it was written in. A portal action that both
     changes a table and logs its own named event writes two rows in
     one transaction; the merchant trail shows the named one. */
  tx bigint default txid_current()
);

create index if not exists event_origin_device_idx on audit.event_origin (device_id, event_id desc)
  where device_id is not null;
create index if not exists event_origin_session_idx on audit.event_origin (session_id)
  where session_id is not null;
create index if not exists event_origin_user_idx on audit.event_origin (user_id, event_id desc);
create index if not exists event_origin_merchant_idx on audit.event_origin (merchant_id, event_id desc)
  where merchant_id is not null;
create index if not exists event_origin_tx_idx on audit.event_origin (tx);
create index if not exists event_origin_ip_idx on audit.event_origin (ip)
  where ip is not null;
create index if not exists event_origin_purge_idx on audit.event_origin (at)
  where ip is not null or user_agent is not null;

comment on table audit.event_origin is
  'Where each audit event came from. Kept out of the hash chain so that IP addresses can be cleared after the retention period without breaking it.';

alter table audit.event_origin enable row level security;

drop policy if exists event_origin_read on audit.event_origin;
create policy event_origin_read on audit.event_origin
  for select to authenticated
  using (authz.audit_level() = 'full');

revoke all on audit.event_origin from public, anon, authenticated;
grant select on audit.event_origin to authenticated;
grant select, insert, update on audit.event_origin to service_role;

/* The sign-in table gets the device id it was missing (the old
   "fingerprint" was a hash of browser + OS + language, which two
   laptops share). */
create index if not exists sign_in_device_idx on audit.sign_in (device_fingerprint, at desc)
  where device_fingerprint is not null;
create index if not exists sign_in_session_idx on audit.sign_in (session_id)
  where session_id is not null;

-- ═══════════════════════════════════════ the vocabulary

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('auth.signed_out', 'staff', 'info', false, false, false, '{}', 'Signed out'),
  ('merchant.record_created', 'merchants', 'info', false, false, false, '{}',
   'Added in the merchant portal'),
  ('merchant.record_changed', 'merchants', 'info', false, false, false, '{}',
   'Changed in the merchant portal'),
  ('merchant.record_removed', 'merchants', 'notice', false, false, false, '{}',
   'Removed in the merchant portal'),
  /* Logged since 20270130009700 but never registered, so each one raised
     an unknown-action alert. */
  ('merchant.logo_changed', 'merchants', 'info', false, false, false, '{}',
   'Changed the logo'),
  ('merchant.banner_changed', 'merchants', 'info', false, false, false, '{}',
   'Changed the banner')
on conflict (action) do nothing;

-- ═══════════════════════════════ audit.log, now with an origin

/*
 * The body is 20260101012200's, with three additions:
 *  - the chained row's session_id falls back to the JWT session;
 *  - a merchant user's event names its merchant in `related`;
 *  - the origin is written to audit.event_origin.
 * Same signature, so not one call site changes.
 */
create or replace function audit.log(
  p_actor_type public.actor_type,
  p_module text,
  p_action text,
  p_actor_id uuid default null,
  p_actor_role text default null,
  p_target_type text default null,
  p_target_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null,
  p_approved_by uuid default null,
  p_severity public.audit_severity default null,
  p_city_id uuid default null,
  p_actor_label text default null,
  p_target_label text default null,
  p_approver_label text default null,
  p_on_behalf_of uuid default null,
  p_context jsonb default null,
  p_related jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registry audit.action_registry;
  v_id bigint;
  v_severity public.audit_severity;
  v_before jsonb;
  v_after jsonb;
  v_version smallint;
  v_actor_label text;
  v_actor_id uuid;
  v_drift_id bigint;
  v_origin jsonb := audit.fn_request_context();
  v_related jsonb := p_related;
  v_merchant uuid;
begin
  select * into v_registry from audit.action_registry where action = p_action;

  v_severity := greatest(
    coalesce(p_severity, 'info'::public.audit_severity),
    coalesce(v_registry.default_severity, 'info'::public.audit_severity));

  v_actor_id := coalesce(
    p_actor_id,
    case when p_actor_type = 'staff' then authz.staff_id() end);

  /*
   * A merchant user's event belongs to a merchant. Named by the
   * caller when it was passed, else the target when that is the
   * merchant, else the one merchant this user belongs to.
   */
  if p_actor_type = 'merchant_user' then
    v_merchant := coalesce(
      audit.fn_uuid(p_related ->> 'merchant_id'),
      case when p_target_type = 'merchant' then p_target_id end,
      (select min(mu.merchant_id::text)::uuid
         from public.merchant_user mu
        where mu.user_id = audit.fn_uuid(v_origin ->> 'user_id')
       having count(*) = 1));
    if v_merchant is not null and (p_related ->> 'merchant_id') is null then
      v_related := coalesce(p_related, '{}'::jsonb)
                   || jsonb_build_object('merchant_id', v_merchant);
    end if;
  end if;

  v_before := audit.fn_mask_payload(p_before, coalesce(v_registry.pii_fields, '{}'));
  v_after := audit.fn_mask_payload(p_after, coalesce(v_registry.pii_fields, '{}'));

  v_actor_label := coalesce(
    p_actor_label,
    (select su.email from public.staff_user su where su.id = v_actor_id),
    case p_actor_type
      when 'system' then '[System]'
      when 'guest' then '[Guest]'
      when 'rider' then '[Rider]'
      when 'merchant_user' then '[Merchant]'
      else null
    end);

  v_version := case
    when p_actor_label is not null or p_target_label is not null
      or p_approver_label is not null or p_on_behalf_of is not null
      or p_context is not null or v_related is not null
      or v_actor_label is not null
    then 2 else 1 end;

  insert into audit.audit_event (
    actor_type, actor_id, actor_role, module, action,
    target_type, target_id, before, after, reason, approved_by,
    severity, city_id, hash_version,
    actor_label, target_label, approver_label, on_behalf_of,
    diff, context, related,
    session_id, ip, user_agent
  )
  values (
    p_actor_type, v_actor_id, p_actor_role, p_module, p_action,
    p_target_type, p_target_id, v_before, v_after, p_reason, p_approved_by,
    v_severity, p_city_id, v_version,
    v_actor_label, p_target_label,
    coalesce(p_approver_label,
             (select su.email from public.staff_user su where su.id = p_approved_by)),
    p_on_behalf_of,
    audit.fn_diff(v_before, v_after),
    coalesce(p_context, '{}'::jsonb),
    coalesce(v_related, '{}'::jsonb),
    /* Pseudonymous, so it may sit in the chain. The address may not:
       see the header of 20270131000200. */
    v_origin ->> 'session_id',
    nullif(current_setting('app.ip', true), '')::inet,
    nullif(current_setting('app.user_agent', true), '')
  )
  returning id into v_id;

  /* The origin, when there was a request at all. A failure here must
     not lose the event, so it is caught. */
  if v_origin <> '{}'::jsonb or v_merchant is not null then
    begin
      insert into audit.event_origin (
        event_id, user_id, session_id, device_id, device_label, surface,
        ip, proxy_ip, user_agent, merchant_id)
      values (
        v_id,
        audit.fn_uuid(v_origin ->> 'user_id'),
        v_origin ->> 'session_id',
        v_origin ->> 'device_id',
        v_origin ->> 'device_label',
        v_origin ->> 'surface',
        audit.fn_inet(v_origin ->> 'ip'),
        audit.fn_inet(v_origin ->> 'proxy_ip'),
        v_origin ->> 'user_agent',
        v_merchant);
    exception when others then
      raise warning 'audit.event_origin not written for event %: %', v_id, sqlerrm;
    end;
  end if;

  if coalesce(v_registry.needs_review, v_registry.action is null) then
    insert into audit.event_meta (event_id, review_state)
    values (v_id, 'needs_review')
    on conflict (event_id) do nothing;
  end if;

  if v_registry.action is null and p_action <> 'audit.unknown_action' then
    insert into audit.audit_event (
      actor_type, module, action, severity, target_type, target_id,
      after, hash_version, actor_label
    )
    values ('system', 'audit', 'audit.unknown_action', 'high',
            'audit_event', null,
            jsonb_build_object('action', p_action, 'module', p_module, 'event_id', v_id),
            2, '[System] · registry')
    returning id into v_drift_id;

    insert into audit.event_meta (event_id, review_state)
    values (v_drift_id, 'needs_review')
    on conflict (event_id) do nothing;
  end if;

  return v_id;
end;
$$;

-- ═══════════════════════════════════ sign-ins, with the address

/*
 * The public wrapper used to pass a null address, on purpose: the
 * sign-in log was not meant to place anyone. The owner now needs to
 * tell apart the people sharing one admin account, which is exactly
 * what an address and a device id are for — so they are recorded,
 * readable only at full audit access, and cleared after 365 days.
 *
 * The parameters stay as they were so the old sign-in code keeps
 * working until the new one deploys. The address, user agent,
 * session and device come from the request, not from parameters.
 */
create or replace function public.rpc_record_sign_in(
  p_email text,
  p_outcome text,
  p_auth_method text default 'password',
  p_mfa_used boolean default false,
  p_ip_country text default null,
  p_device_fingerprint text default null,
  p_device_label text default null,
  p_user_agent text default null,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx jsonb := audit.fn_request_context();
begin
  return audit.rpc_sign_in_record(
    p_email, p_outcome, p_auth_method, p_mfa_used,
    audit.fn_inet(v_ctx ->> 'ip'),
    p_ip_country,
    coalesce(v_ctx ->> 'device_id', p_device_fingerprint),
    coalesce(v_ctx ->> 'device_label', p_device_label),
    coalesce(v_ctx ->> 'user_agent', p_user_agent),
    /* Only a successful sign-in has a session. */
    case when p_outcome = 'success' then coalesce(v_ctx ->> 'session_id', p_session_id) end);
end;
$$;

grant execute on function public.rpc_record_sign_in(
  text, text, text, boolean, text, text, text, text, text) to anon, authenticated;

/*
 * Signing out closes the sign-in row of this session. It used to
 * write a second "success" row instead, so a sign-out read as
 * another sign-in.
 */
create or replace function public.rpc_record_sign_out(p_reason text default 'signed_out')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_session text := audit.fn_request_context() ->> 'session_id';
  v_count integer;
begin
  if v_staff is null or v_session is null then
    return jsonb_build_object('ok', false);
  end if;
  if p_reason not in ('signed_out', 'expired') then
    raise exception 'Unknown sign-out reason: %', p_reason;
  end if;

  update audit.sign_in
     set ended_at = now(), ended_reason = p_reason
   where session_id = v_session
     and staff_user_id = v_staff
     and ended_at is null;
  get diagnostics v_count = row_count;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => case when p_reason = 'expired' then 'auth.session_expired' else 'auth.signed_out' end,
    p_actor_id => v_staff,
    p_target_type => 'sign_in',
    p_after => jsonb_build_object('reason', p_reason, 'sessions_closed', v_count));

  return jsonb_build_object('ok', true, 'closed', v_count);
end;
$$;

revoke execute on function public.rpc_record_sign_out(text) from public, anon;
grant execute on function public.rpc_record_sign_out(text) to authenticated;

-- ═══════════════════════ everything a merchant user changes

/*
 * Many merchant actions already call audit.log. Many more write
 * straight to their tables (catalogue items, sections, messages,
 * hours) through RLS, and those left no trace at all. Rather than
 * thread audit.log through every one, the merchant-owned tables get
 * one statement-level trigger each: one event per statement per
 * merchant, only when the caller is a member of that merchant, and
 * only the fields that changed.
 *
 * Staff, customers, riders, cron and the service role are ignored
 * here — staff are logged by their own actions, and a customer's
 * order is not something the merchant did.
 *
 * A failure in here is caught and raised as a warning. A merchant
 * must never be unable to save their menu because the trail could not
 * be written.
 */

/* Long values are cut, so one product description cannot bloat the log. */
create or replace function audit.fn_trim_payload(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null else (
    select coalesce(jsonb_object_agg(k,
      case when length(v::text) > 240 then to_jsonb(left(v::text, 237) || '…') else v end),
      '{}'::jsonb)
    from jsonb_each(p) as e(k, v)
    where k not in ('updated_at', 'created_at', 'search', 'search_vector', 'fts', 'embedding'))
  end
$$;

create or replace function audit.tg_merchant_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_col text := coalesce(tg_argv[0], 'merchant_id');
  v_has_id boolean;
  v_join text;
  v_action text;
  r record;
  v_label text;
begin
  if v_uid is null or authz.staff_id() is not null then
    return null;
  end if;
  if not exists (select 1 from public.merchant_user mu where mu.user_id = v_uid) then
    return null;
  end if;

  begin
    v_has_id := exists (
      select 1 from pg_attribute
       where attrelid = tg_relid and attname = 'id' and not attisdropped);
    /* Old and new rows are paired on the primary key. */
    v_join := (
      select string_agg(format('o.%1$I is not distinct from n.%1$I', a.attname), ' and ')
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
       where i.indrelid = tg_relid and i.indisprimary);

    v_action := case tg_op
      when 'INSERT' then 'merchant.record_created'
      when 'UPDATE' then 'merchant.record_changed'
      else 'merchant.record_removed' end;

    for r in execute format(
      case tg_op
        when 'UPDATE' then $q$
          with pairs as (
            select (to_jsonb(n) ->> %1$L)::uuid as merchant_id,
                   to_jsonb(o) as o, to_jsonb(n) as n
              from old_rows o join new_rows n on %2$s
          ),
          changed as (
            select merchant_id, o, n,
                   (select coalesce(jsonb_object_agg(k, null), '{}'::jsonb)
                      from jsonb_object_keys(n) k
                     where (o -> k) is distinct from (n -> k)
                       and k not in ('updated_at', 'search', 'search_vector', 'fts')) as keys
              from pairs
          )
          select merchant_id, count(*) as n_rows,
                 (array_agg(n))[1] as one_row,
                 (array_agg(o))[1] as one_before,
                 jsonb_agg(n -> 'id') filter (where n ? 'id') as ids,
                 (select coalesce(jsonb_agg(distinct k), '[]'::jsonb)
                    from changed c2, jsonb_object_keys(c2.keys) k
                   where c2.merchant_id is not distinct from changed.merchant_id) as fields
            from changed
           where keys <> '{}'::jsonb
           group by merchant_id
        $q$
        when 'INSERT' then $q$
          select (to_jsonb(n) ->> %1$L)::uuid as merchant_id, count(*) as n_rows,
                 (array_agg(to_jsonb(n)))[1] as one_row, null::jsonb as one_before,
                 jsonb_agg(to_jsonb(n) -> 'id') as ids, null::jsonb as fields
            from new_rows n group by 1
        $q$
        else $q$
          select (to_jsonb(o) ->> %1$L)::uuid as merchant_id, count(*) as n_rows,
                 null::jsonb as one_row, (array_agg(to_jsonb(o)))[1] as one_before,
                 jsonb_agg(to_jsonb(o) -> 'id') as ids, null::jsonb as fields
            from old_rows o group by 1
        $q$
      end,
      v_col,
      coalesce(v_join, 'false'))
    loop
      continue when r.merchant_id is null;
      continue when not exists (
        select 1 from public.merchant_user mu
         where mu.merchant_id = r.merchant_id and mu.user_id = v_uid);

      v_label := coalesce(
        r.one_row ->> 'name', r.one_row ->> 'title', r.one_row ->> 'label',
        r.one_row ->> 'trading_name',
        r.one_before ->> 'name', r.one_before ->> 'title', r.one_before ->> 'label',
        r.one_before ->> 'trading_name');

      perform audit.log(
        p_actor_type => 'merchant_user'::public.actor_type,
        p_module => 'merchants',
        p_action => v_action,
        p_target_type => tg_table_name,
        p_target_id => case when r.n_rows = 1 and v_has_id then
          audit.fn_uuid(coalesce(r.one_row, r.one_before) ->> 'id') end,
        p_target_label => case when r.n_rows = 1 then left(v_label, 120)
                               else r.n_rows || ' rows' end,
        p_before => case
          when r.n_rows = 1 and tg_op = 'UPDATE' then
            audit.fn_trim_payload((select jsonb_object_agg(f, r.one_before -> f)
                                     from jsonb_array_elements_text(r.fields) f))
          when r.n_rows = 1 and tg_op = 'DELETE' then audit.fn_trim_payload(r.one_before) end,
        p_after => case
          when r.n_rows = 1 and tg_op = 'UPDATE' then
            audit.fn_trim_payload((select jsonb_object_agg(f, r.one_row -> f)
                                     from jsonb_array_elements_text(r.fields) f))
          when r.n_rows = 1 and tg_op = 'INSERT' then audit.fn_trim_payload(r.one_row)
          else jsonb_strip_nulls(jsonb_build_object(
            'rows', r.n_rows,
            'fields', r.fields,
            'ids', (select jsonb_agg(x) from (
                      select x from jsonb_array_elements(r.ids) x limit 20) s))) end,
        p_related => jsonb_build_object('merchant_id', r.merchant_id));
    end loop;
  exception when others then
    raise warning 'merchant activity on % not logged: %', tg_table_name, sqlerrm;
  end;

  return null;
end;
$$;

comment on function audit.tg_merchant_activity is
  'One audit event per statement per merchant when a member of that merchant changes one of its tables. Changed fields only; long values cut; never blocks the write.';

/*
 * The tables. Every public table with a merchant_id that a merchant
 * user can write through the portal, plus the merchant row itself.
 * Listed by hand so production and local get the same set; a table
 * missing here is skipped, not an error.
 */
do $attach$
declare
  v_table text;
  v_col text;
  v_spec text;
begin
  foreach v_spec in array array[
    -- the business
    'merchant:id', 'merchant_branch', 'merchant_hours', 'merchant_hours_override',
    'merchant_holiday_hours', 'merchant_device', 'merchant_fleet_rider',
    'document:owner_id',
    -- onboarding and agreements
    'merchant_application', 'merchant_application_payout', 'merchant_onboarding_answer',
    'merchant_setup_offering_detail', 'merchant_agreement_acceptance',
    'merchant_terms_acceptance',
    -- what they sell
    'catalogue_item', 'catalogue_section', 'modifier_group', 'merchant_item_extra',
    'catalogue_edit_request', 'catalogue_import', 'catalogue_setup_review',
    'merchant_import_batch', 'bookable_resource',
    -- orders, bookings and customers
    'order', 'booking', 'dispute', 'merchant_review', 'merchant_message',
    -- team, promotion, hiring, integrations
    'merchant_user', 'merchant_invite', 'merchant_promotion', 'merchant_promotion_creative',
    'featured_booking', 'featured_creative', 'vacancy',
    'api_key', 'api_webhook_endpoint', 'api_connection', 'connector_connection'
  ]
  loop
    v_table := split_part(v_spec, ':', 1);
    v_col := coalesce(nullif(split_part(v_spec, ':', 2), ''), 'merchant_id');
    if to_regclass(format('public.%I', v_table)) is null then
      raise notice 'merchant trail: % does not exist here, skipped', v_table;
      continue;
    end if;
    execute format('drop trigger if exists merchant_activity_ins on public.%I', v_table);
    execute format('drop trigger if exists merchant_activity_upd on public.%I', v_table);
    execute format('drop trigger if exists merchant_activity_del on public.%I', v_table);
    execute format($t$create trigger merchant_activity_ins after insert on public.%I
      referencing new table as new_rows for each statement
      execute function audit.tg_merchant_activity(%L)$t$, v_table, v_col);
    execute format($t$create trigger merchant_activity_upd after update on public.%I
      referencing old table as old_rows new table as new_rows for each statement
      execute function audit.tg_merchant_activity(%L)$t$, v_table, v_col);
    execute format($t$create trigger merchant_activity_del after delete on public.%I
      referencing old table as old_rows for each statement
      execute function audit.tg_merchant_activity(%L)$t$, v_table, v_col);
  end loop;
end
$attach$;

-- ═══════════════════════════════════ the Activity tab, filterable

/*
 * The view is 20260101012200's with the origin appended (CREATE OR
 * REPLACE VIEW can only add columns at the end). The origin table's
 * own policy decides who sees it: full audit access only, everybody
 * else gets nulls.
 */
create or replace view audit.console_activity_v as
select
  e.id,
  e.at,
  audit.fn_ago(e.at) as ago,
  e.hash_version,
  e.actor_type,
  e.actor_id,
  audit.fn_actor_name(e) as actor_label,
  e.actor_role,
  e.on_behalf_of,
  e.module,
  e.action,
  coalesce(r.description, e.action) as action_label,
  e.target_type,
  e.target_id,
  e.target_label,
  e.severity,
  e.city_id,
  c.name as city_name,
  e.reason,
  e.approved_by,
  audit.fn_approver_name(e) as approver_label,
  e.before,
  e.after,
  e.diff,
  e.context,
  e.related,
  audit.fn_actor_name(e)
    || ' '
    || coalesce(lower(r.description), replace(e.action, '.', ' '))
    || coalesce(' · ' || e.target_label, '')
    || coalesce(' · ' || nullif(trim(e.reason), ''), '') as sentence,
  coalesce(jsonb_array_length(
    case when e.diff is null then '[]'::jsonb
    else (select jsonb_agg(k) from jsonb_object_keys(e.diff) k) end), 0) as changed_fields,
  coalesce(r.money, false) as is_money,
  coalesce(array_length(r.pii_fields, 1), 0) > 0 as touches_pii,
  coalesce(r.two_person, false) as needs_two_people,
  r.action is null as unregistered,
  coalesce(m.review_state, 'none') as review_state,
  m.reviewed_by,
  m.reviewed_at,
  m.review_note,
  su.display_name as reviewed_by_name,
  e.hash,
  e.prev_hash,
  coalesce(o.session_id, e.session_id) as session_id,
  o.device_id,
  o.device_label,
  host(o.ip) as ip,
  o.surface
from audit.audit_event e
left join audit.action_registry r on r.action = e.action
left join audit.event_meta m on m.event_id = e.id
left join public.city c on c.id = e.city_id
left join public.staff_user su on su.id = m.reviewed_by
left join audit.event_origin o on o.event_id = e.id;

create or replace view public.audit_activity_v
with (security_invoker = true) as select * from audit.console_activity_v;

grant select on public.audit_activity_v to authenticated;

/*
 * A hole found while adding the origin: every audit.console_* view
 * ran as its owner, so the row-level security on the tables under
 * them never applied. The public wrappers are security_invoker, but
 * the views they wrap were not, and `authenticated` may select them.
 * Any signed-in user, a customer included, could read the whole
 * audit log and the staff sign-in list through the API.
 *
 * Each view now runs as the caller, so audit.fn_visible and the
 * sign-in policy decide again, as the console's comments always said
 * they did.
 */
do $invoker$
declare
  v text;
begin
  for v in
    select c.relname from pg_class c
     where c.relnamespace = 'audit'::regnamespace and c.relkind = 'v'
       and c.relname like 'console\_%'
  loop
    execute format('alter view audit.%I set (security_invoker = true)', v);
  end loop;
end
$invoker$;

-- ═══════════════════════════════════════ devices, for the console

/*
 * One row per device per staff account: the answer to "who on this
 * shared account did what". A device is the browser's device cookie;
 * sign-ins from before this migration carried a coarse hash instead,
 * and show up as their own rows labelled by that hash.
 */
create or replace function public.rpc_audit_devices()
returns table (
  staff_user_id uuid,
  staff_email text,
  device_id text,
  device_label text,
  first_seen timestamptz,
  last_seen timestamptz,
  last_ip text,
  ip_count bigint,
  sign_ins bigint,
  failed_sign_ins bigint,
  actions bigint,
  live_sessions bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform audit.fn_require('full');

  return query
  with seen as (
    select s.staff_user_id, s.device_fingerprint as device_id, s.device_label,
           s.at, s.ip, 1 as sign_in, (s.outcome <> 'success')::int as failed, 0 as action,
           (s.outcome = 'success' and s.ended_at is null)::int as live
      from audit.sign_in s
     where s.device_fingerprint is not null and s.staff_user_id is not null
    union all
    select su.id, o.device_id, o.device_label, o.at, o.ip, 0, 0, 1, 0
      from audit.event_origin o
      join public.staff_user su on su.user_id = o.user_id
     where o.device_id is not null
  )
  select
    seen.staff_user_id,
    su.email,
    seen.device_id,
    (array_agg(seen.device_label order by seen.at desc)
       filter (where seen.device_label is not null))[1],
    min(seen.at),
    max(seen.at),
    host((array_agg(seen.ip order by seen.at desc) filter (where seen.ip is not null))[1]),
    count(distinct seen.ip),
    sum(seen.sign_in)::bigint,
    sum(seen.failed)::bigint,
    sum(seen.action)::bigint,
    sum(seen.live)::bigint
  from seen
  left join public.staff_user su on su.id = seen.staff_user_id
  group by seen.staff_user_id, su.email, seen.device_id
  order by max(seen.at) desc;
end;
$$;

revoke execute on function public.rpc_audit_devices() from public, anon;
grant execute on function public.rpc_audit_devices() to authenticated;

/* One device: its sign-ins and what was done from it. */
create or replace function public.rpc_audit_device_detail(p_device_id text, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  perform audit.fn_require('full');

  return jsonb_build_object(
    'sign_ins', coalesce((
      select jsonb_agg(x order by x.at desc) from (
        select s.id, s.at, s.outcome, coalesce(su.email, s.email_attempted) as who,
               host(s.ip) as ip, s.ip_country, s.device_label, s.user_agent,
               s.session_id, s.ended_at, s.ended_reason,
               s.outcome = 'success' and s.ended_at is null as live
          from audit.sign_in s
          left join public.staff_user su on su.id = s.staff_user_id
         where s.device_fingerprint = p_device_id
         order by s.at desc
         limit v_limit) x), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(x order by x.id desc) from (
        select a.id, a.at, a.module, a.action, a.action_label, a.sentence,
               a.severity, a.target_type, a.target_label, a.ip, a.session_id
          from audit.console_activity_v a
         where a.device_id = p_device_id
         order by a.id desc
         limit v_limit) x), '[]'::jsonb));
end;
$$;

revoke execute on function public.rpc_audit_device_detail(text, integer) from public, anon;
grant execute on function public.rpc_audit_device_detail(text, integer) to authenticated;

-- ═══════════════════════════════════ a merchant's trail, for staff

/*
 * What this merchant's own people did, newest first. Staff who
 * manage merchants and staff with full audit access may read it; the
 * merchant may not, and nothing in the portal calls it.
 */
create or replace function public.rpc_admin_merchant_activity(
  p_merchant_id uuid,
  p_limit integer default 100,
  p_before_id bigint default null
)
returns table (
  id bigint,
  at timestamptz,
  who text,
  who_role text,
  action text,
  action_label text,
  sentence text,
  target_type text,
  target_label text,
  reason text,
  before jsonb,
  after jsonb,
  ip text,
  device_id text,
  device_label text,
  session_id text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_city uuid;
begin
  select m.city_id into v_city from public.merchant m where m.id = p_merchant_id;

  if authz.staff_id() is null
     or not (authz.audit_level() = 'full'
             or authz.can_manage_merchants(v_city)
             or authz.can_manage_merchants(null)) then
    raise exception 'You do not have access to this merchant''s activity.' using errcode = '42501';
  end if;

  return query
  with ids as (
    select o.event_id
      from audit.event_origin o
     where o.merchant_id = p_merchant_id
       and (p_before_id is null or o.event_id < p_before_id)
    union
    /* Events from before the origin table, and any written by an RPC
       that named the merchant itself. */
    select e.id
      from audit.audit_event e
     where e.actor_type = 'merchant_user'
       and (e.related @> jsonb_build_object('merchant_id', p_merchant_id)
            or (e.target_type = 'merchant' and e.target_id = p_merchant_id))
       and (p_before_id is null or e.id < p_before_id)
  )
  select
    e.id,
    e.at,
    coalesce(u.email::text, audit.fn_actor_name(e)),
    mu.role::text,
    e.action,
    coalesce(r.description, e.action),
    coalesce(u.email::text, audit.fn_actor_name(e))
      || ' ' || coalesce(lower(r.description), replace(e.action, '.', ' '))
      || coalesce(' · ' || replace(e.target_type, '_', ' '), '')
      || coalesce(' · ' || e.target_label, ''),
    e.target_type,
    e.target_label,
    e.reason,
    e.before,
    e.after,
    host(o.ip),
    o.device_id,
    o.device_label,
    coalesce(o.session_id, e.session_id)
  from ids
  join audit.audit_event e on e.id = ids.event_id
  left join audit.event_origin o on o.event_id = e.id
  left join audit.action_registry r on r.action = e.action
  left join auth.users u on u.id = o.user_id
  left join public.merchant_user mu on mu.user_id = o.user_id and mu.merchant_id = p_merchant_id
  where e.actor_type = 'merchant_user'
    /* A generic row change is dropped when the same transaction also
       wrote a named event for this merchant: that one says it better. */
    and not (
      e.action in ('merchant.record_created', 'merchant.record_changed', 'merchant.record_removed')
      and o.tx is not null
      and exists (
        select 1 from audit.event_origin o2
          join audit.audit_event e2 on e2.id = o2.event_id
         where o2.tx = o.tx and o2.merchant_id = p_merchant_id
           and e2.action not in ('merchant.record_created', 'merchant.record_changed',
                                 'merchant.record_removed')))
  order by e.id desc
  limit v_limit;
end;
$$;

revoke execute on function public.rpc_admin_merchant_activity(uuid, integer, bigint) from public, anon;
grant execute on function public.rpc_admin_merchant_activity(uuid, integer, bigint) to authenticated;

-- ═══════════════════════════════════════════ retention

/*
 * 365 days. Long enough to answer "who on the shared account did
 * this" about anything in the last year; after that the address and
 * user agent are cleared and the device label, session and user stay.
 */
create or replace function public.cron_purge_audit_ips()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a integer;
  v_b integer;
begin
  update audit.event_origin
     set ip = null, proxy_ip = null, user_agent = null
   where at < now() - interval '365 days'
     and (ip is not null or proxy_ip is not null or user_agent is not null);
  get diagnostics v_a = row_count;

  update audit.sign_in
     set ip = null, user_agent = null
   where at < now() - interval '365 days'
     and (ip is not null or user_agent is not null);
  get diagnostics v_b = row_count;

  return v_a + v_b;
end;
$$;

revoke execute on function public.cron_purge_audit_ips() from public, anon, authenticated;
grant execute on function public.cron_purge_audit_ips() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; audit IPs are not purged on a schedule.';
    return;
  end if;
  perform cron.schedule('purge-audit-ips', '43 3 * * *',
    $sched$select public.cron_purge_audit_ips()$sched$);
end
$cron$;

grant execute on function audit.fn_request_context() to authenticated, service_role;
grant execute on function audit.fn_device_label(text) to authenticated, service_role;
grant execute on function audit.fn_inet(text) to authenticated, service_role;
grant execute on function audit.fn_uuid(text) to authenticated, service_role;
grant execute on function audit.fn_trim_payload(jsonb) to authenticated, service_role;
