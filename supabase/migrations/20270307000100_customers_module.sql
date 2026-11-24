-- Customers: the admin console's customer module.
--
-- A customer is a guest row (phone, name, orders, saved places) and, when
-- they signed up, the sign-in account it belongs to. Someone who signed up
-- but never ordered has an account and no guest row yet; they are listed
-- too. Orders placed signed out stay under their phone number until a
-- confirmed phone links them (20270225000100).
--
--   1. The `customers` console module, and two roles the admin can assign:
--      customer_care (sees and acts) and customer_viewer (sees only).
--      Super admin reaches it. Nobody else does until a role is assigned.
--   2. authz.customers_level(): 'full', 'limited', 'view' or null.
--   3. customer_note: staff notes, one row per note, with who wrote it.
--   4. rpc_customer_list: KPIs and a page of customers, searchable.
--   5. rpc_customer_profile: one customer, everything they bought, booked
--      and paid, with refunds and failures. Every opening is recorded
--      (customer.profile_viewed) because contact details show in full.
--   6. Actions, each with a reason and in the audit log: add a note,
--      suspend or reactivate, mark VIP, resend the verification email
--      (the console sends it; the RPC checks and records the request).
--
-- Money: orders and bookings are in cents, stays in whole KES (converted
-- here). Spend counts what was paid, refunds are taken off.
--
-- Rollback:
--   drop function if exists public.rpc_customer_verification_resend(uuid, text);
--   drop function if exists public.rpc_customer_set_vip(uuid, boolean, text);
--   drop function if exists public.rpc_customer_set_suspended(uuid, boolean, text);
--   drop function if exists public.rpc_customer_note_add(uuid, text);
--   drop function if exists public.rpc_customer_profile(uuid);
--   drop function if exists public.rpc_customer_list(text, text, text, text, integer, integer);
--   drop function if exists public.fn_customer_guest_ensure(uuid);
--   drop function if exists public.fn_customer_resolve(uuid);
--   drop function if exists public.fn_customer_is_partner(uuid);
--   drop function if exists authz.customers_level();
--   drop table if exists public.customer_note;
--   delete from audit.action_registry where module = 'customers';
--   delete from public.role_module_access where module_key = 'customers';
--   delete from public.role_grant where role_id in (select id from public.role where key in ('customer_care', 'customer_viewer'));
--   delete from public.role where key in ('customer_care', 'customer_viewer');
--   delete from public.console_module where key = 'customers';

-- ═════════════════════════════════════════════════════════════ 1. the module

insert into public.console_module (key, label, section, href, sort, icon)
values ('customers', 'Customers', 'Operate', '/customers', 45, 'Users')
on conflict (key) do update
set label = excluded.label,
    section = excluded.section,
    href = excluded.href,
    sort = excluded.sort,
    icon = excluded.icon;

insert into public.role (key, label, description)
values
  ('customer_care', 'Customer care',
   'Customers: sees every customer, what they bought, booked and paid; adds notes, suspends and reactivates, marks VIP and resends the verification email.'),
  ('customer_viewer', 'Customers (view only)',
   'Customers: sees every customer, what they bought, booked and paid. Changes nothing.')
on conflict (key) do nothing;

update public.role set landing_module = 'customers'
where key in ('customer_care', 'customer_viewer') and landing_module is null;

insert into public.role_module_access (role_key, module_key, level, note)
values
  ('super_admin', 'customers', 'full', null),
  ('customer_care', 'customers', 'full', 'Every customer; notes, suspend, VIP, verification email'),
  ('customer_viewer', 'customers', 'view', 'Reads every customer; changes nothing')
on conflict (role_key, module_key) do update
set level = excluded.level,
    note = excluded.note;

-- ═══════════════════════════════════════════════════════════ 2. who may act

/* The best level the caller's live grants give on Customers: 'full',
   'limited', 'view', or null for no access at all. */
create or replace function authz.customers_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when authz.is_super_admin() then 'full'
    else (
      select case
        when bool_or(a.level = 'full') then 'full'
        when bool_or(a.level = 'limited') then 'limited'
        when bool_or(a.level is not null and a.level <> 'none') then 'view'
      end
      from public.staff_user su
      join public.role_grant rg on rg.staff_user_id = su.id
      join public.role r on r.id = rg.role_id
      left join public.role_module_access a on a.role_key = r.key and a.module_key = 'customers'
      where su.id = authz.staff_id()
        and su.status = 'active'
        and rg.revoked_at is null
        and (rg.expires_at is null or rg.expires_at > now())
    )
  end
$$;

revoke all on function authz.customers_level() from public, anon;
grant execute on function authz.customers_level() to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════ 3. notes

create table if not exists public.customer_note (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guest (id) on delete cascade,
  author_id uuid references public.staff_user (id) on delete set null,
  body text not null check (char_length(trim(body)) between 3 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists customer_note_guest_idx on public.customer_note (guest_id, created_at desc);

comment on table public.customer_note is
  'Staff notes on a customer. Disclosed to the customer under a KDPA access request, like guest.staff_notes: keep them factual. Read and written only through the rpc_customer_* functions.';

alter table public.customer_note enable row level security;
revoke all on public.customer_note from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════ internal steps

/* Staff, merchants, riders, hosts and hotel staff have their own records.
   An account that is one of those and never ordered is not a customer. */
create or replace function public.fn_customer_is_partner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_user where user_id = p_user_id)
      or exists (select 1 from public.merchant_user where user_id = p_user_id)
      or exists (select 1 from public.rider where user_id = p_user_id)
      or exists (select 1 from public.host_user where user_id = p_user_id)
      or exists (select 1 from public.hotel_user where user_id = p_user_id)
$$;

/* A customer id is a guest id, or the account id of someone with no guest
   row. Returns the guest and the account behind it (either may be null),
   or no row when the id is neither. */
create or replace function public.fn_customer_resolve(p_id uuid)
returns table (guest_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  (
    select g.id, g.user_id
    from public.guest g
    where g.id = p_id and g.anonymised_at is null
    union all
    select
      (select g.id from public.guest g
        where g.user_id = u.id and g.anonymised_at is null
        order by g.created_at limit 1),
      u.id
    from auth.users u
    where u.id = p_id
      and not coalesce(u.is_anonymous, false)
      and u.deleted_at is null
  )
  limit 1
$$;

/* The guest row an action is recorded on, made for an account that has
   none yet (the same row rpc_guest_ensure would make at its first order). */
create or replace function public.fn_customer_guest_ensure(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest uuid;
  v_user uuid;
  v_name text;
begin
  select r.guest_id, r.user_id into v_guest, v_user from public.fn_customer_resolve(p_id) r;
  if v_guest is not null then
    return v_guest;
  end if;
  if v_user is null then
    raise exception 'No customer with that id.' using errcode = 'P0002';
  end if;
  select nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), '')
    into v_name from auth.users u where u.id = v_user;
  insert into public.guest (user_id, name) values (v_user, v_name) returning id into v_guest;
  return v_guest;
end;
$$;

revoke all on function public.fn_customer_is_partner(uuid) from public, anon, authenticated;
revoke all on function public.fn_customer_resolve(uuid) from public, anon, authenticated;
revoke all on function public.fn_customer_guest_ensure(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 4. the list

create or replace function public.rpc_customer_list(
  p_q text default null,
  p_kind text default 'all',
  p_status text default 'all',
  p_sort text default 'recent',
  p_page integer default 1,
  p_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_level text := authz.customers_level();
  v_size integer := least(greatest(coalesce(p_size, 25), 1), 100);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_digits text;
  v_month timestamptz := date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  v_prev timestamptz := (date_trunc('month', now() at time zone 'Africa/Nairobi') - interval '1 month') at time zone 'Africa/Nairobi';
  v_result jsonb;
begin
  if v_level is null then
    raise exception 'Only people who reach Customers can see this.' using errcode = '42501';
  end if;
  v_digits := nullif(regexp_replace(coalesce(v_q, ''), '[^0-9]', '', 'g'), '');
  if v_digits is not null and length(v_digits) < 3 then
    v_digits := null;
  end if;

  with people as (
    select
      g.id as guest_id,
      g.user_id,
      coalesce(
        nullif(trim(g.name), ''),
        nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), '')
      ) as name,
      u.email::text as email,
      coalesce(nullif(g.phone, ''), nullif(u.phone, '')) as phone,
      g.vip,
      g.blocked,
      least(g.created_at, coalesce(u.created_at, g.created_at)) as joined_at,
      u.email_confirmed_at,
      u.last_sign_in_at,
      (u.id is not null and not coalesce(u.is_anonymous, false)) as has_account
    from public.guest g
    left join auth.users u on u.id = g.user_id
    where g.anonymised_at is null
    union all
    select
      null,
      u.id,
      nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), ''),
      u.email::text,
      nullif(u.phone, ''),
      false,
      false,
      u.created_at,
      u.email_confirmed_at,
      u.last_sign_in_at,
      true
    from auth.users u
    where not coalesce(u.is_anonymous, false)
      and u.deleted_at is null
      and not exists (select 1 from public.guest g where g.user_id = u.id and g.anonymised_at is null)
      and not public.fn_customer_is_partner(u.id)
  ),
  facts as (
    select
      p.*,
      coalesce(p.guest_id, p.user_id) as id,
      coalesce(o.n, 0) + coalesce(b.n, 0) + coalesce(s.n, 0) as purchases,
      coalesce(o.gross, 0) + coalesce(b.paid, 0) + coalesce(s.paid, 0)
        - coalesce(o.refunded, 0) - coalesce(s.refunded, 0) as spend,
      greatest(o.last_at, b.last_at, s.last_at) as last_purchase_at,
      coalesce(o.orders, 0) as orders,
      coalesce(b.bookings, 0) as bookings,
      coalesce(s.stays, 0) as stays
    from people p
    left join lateral (
      select
        count(*) filter (where o.stage <> 'cancelled') as orders,
        count(*) filter (where o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded')) as n,
        coalesce(sum(o.total_cents) filter (
          where o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded')), 0) as gross,
        (select coalesce(sum(r.amount_cents), 0) from public.refund r
          join public.order o2 on o2.id = r.order_id
          where o2.guest_id = p.guest_id and r.status = 'issued') as refunded,
        max(o.placed_at) filter (where o.stage <> 'cancelled') as last_at
      from public.order o
      where p.guest_id is not null and o.guest_id = p.guest_id
    ) o on true
    left join lateral (
      select
        count(*) filter (where bk.status not in ('cancelled', 'blocked')) as bookings,
        count(*) filter (where bk.paid_at is not null) as n,
        coalesce(sum(bk.paid_cents) filter (where bk.paid_at is not null), 0) as paid,
        max(bk.created_at) filter (where bk.status not in ('cancelled', 'blocked')) as last_at
      from public.booking bk
      where (p.user_id is not null and bk.guest_user_id = p.user_id)
         or (bk.guest_user_id is null and p.phone is not null
             and public.fn_phone_key(bk.guest_phone) = public.fn_phone_key(p.phone))
    ) b on true
    left join lateral (
      select
        count(*) filter (where st.status in ('booked', 'in_stay', 'departed')) as stays,
        count(*) filter (where coalesce(st.paid_kes, 0) > 0) as n,
        coalesce(sum(st.paid_kes), 0) * 100 as paid,
        coalesce(sum(coalesce(st.refund_amount_kes, st.paid_kes)) filter (where st.refunded_at is not null), 0) * 100 as refunded,
        max(coalesce(st.confirmed_at, st.created_at)) filter (where st.status in ('booked', 'in_stay', 'departed')) as last_at
      from public.stay st
      where p.user_id is not null and st.guest_user_id = p.user_id
    ) s on true
  ),
  -- A signed-out session that never ordered and left no phone is not anybody.
  real as (
    select * from facts f
    where f.has_account or f.phone is not null or f.purchases > 0 or f.orders > 0
  ),
  kpis as (
    select jsonb_build_object(
      'total', count(*),
      'accounts', count(*) filter (where has_account),
      'guests', count(*) filter (where not has_account),
      'new_month', count(*) filter (where joined_at >= v_month),
      'new_prev_month', count(*) filter (where joined_at >= v_prev and joined_at < v_month),
      'active_30', count(*) filter (where last_purchase_at >= now() - interval '30 days'),
      'buyers', count(*) filter (where purchases >= 1),
      'repeat', count(*) filter (where purchases >= 2),
      'spend', coalesce(sum(spend), 0),
      'suspended', count(*) filter (where blocked),
      'vip', count(*) filter (where vip)
    ) as k
    from real
  ),
  picked as (
    select * from real f
    where (p_kind is null or p_kind = 'all'
           or (p_kind = 'account' and f.has_account)
           or (p_kind = 'guest' and not f.has_account))
      and (p_status is null or p_status = 'all'
           or (p_status = 'active' and f.last_purchase_at >= now() - interval '30 days')
           or (p_status = 'new' and f.joined_at >= v_month)
           or (p_status = 'repeat' and f.purchases >= 2)
           or (p_status = 'never' and f.purchases = 0)
           or (p_status = 'suspended' and f.blocked)
           or (p_status = 'vip' and f.vip)
           or (p_status = 'unverified' and f.has_account and f.email is not null and f.email_confirmed_at is null))
      and (v_q is null
           or lower(coalesce(f.name, '')) like '%' || v_q || '%'
           or lower(coalesce(f.email, '')) like '%' || v_q || '%'
           or (v_digits is not null and regexp_replace(coalesce(f.phone, ''), '[^0-9]', '', 'g') like '%' || v_digits || '%')
           or (v_digits is not null and public.fn_phone_key(f.phone) like '%' || public.fn_phone_key(v_digits) || '%'))
  ),
  ordered as (
    select f.*, count(*) over () as total_rows,
      row_number() over (
        order by
          case when p_sort = 'spend' then f.spend end desc nulls last,
          case when p_sort = 'orders' then f.purchases end desc nulls last,
          case when p_sort = 'last' then f.last_purchase_at end desc nulls last,
          case when p_sort = 'name' then lower(f.name) end asc nulls last,
          f.joined_at desc,
          f.id
      ) as rn
    from picked f
  )
  select jsonb_build_object(
    'level', v_level,
    'kpis', (select k from kpis),
    'total', coalesce((select max(total_rows) from ordered), 0),
    'page', v_page,
    'size', v_size,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'guest_id', o.guest_id,
        'user_id', o.user_id,
        'name', o.name,
        'email', o.email,
        'phone', o.phone,
        'has_account', o.has_account,
        'email_confirmed', o.email_confirmed_at is not null,
        'vip', o.vip,
        'blocked', o.blocked,
        'joined_at', o.joined_at,
        'last_sign_in_at', o.last_sign_in_at,
        'last_purchase_at', o.last_purchase_at,
        'purchases', o.purchases,
        'orders', o.orders,
        'bookings', o.bookings,
        'stays', o.stays,
        'spend', o.spend
      ) order by o.rn)
      from ordered o
      where o.rn > (v_page - 1) * v_size and o.rn <= v_page * v_size
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_customer_list(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.rpc_customer_list(text, text, text, text, integer, integer) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════ 5. the profile

create or replace function public.rpc_customer_profile(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_level text := authz.customers_level();
  v_guest uuid;
  v_user uuid;
  v_phone text;
  v_key text;
  v_result jsonb;
begin
  if v_level is null then
    raise exception 'Only people who reach Customers can see this.' using errcode = '42501';
  end if;

  select r.guest_id, r.user_id into v_guest, v_user from public.fn_customer_resolve(p_id) r;
  if v_guest is null and v_user is null then
    return jsonb_build_object('found', false, 'level', v_level);
  end if;

  select coalesce(nullif(g.phone, ''), nullif(u.phone, ''))
    into v_phone
  from (select 1) x
  left join public.guest g on g.id = v_guest
  left join auth.users u on u.id = v_user;
  v_key := public.fn_phone_key(v_phone);

  -- Contact details show in full, so every opening is on the record.
  perform audit.log('staff'::public.actor_type, 'customers', 'customer.profile_viewed',
    p_target_type => 'customer', p_target_id => coalesce(v_guest, v_user),
    p_severity => 'info'::public.audit_severity);

  with
  orders as (
    select
      o.id, o.reference, o.stage::text as stage, o.payment_status::text as payment_status,
      o.payment_method::text as payment_method, o.total_cents, o.placed_at, o.merchant_id,
      coalesce(nullif(trim(m.trading_name), ''), m.legal_name) as merchant,
      coalesce(nullif(m.category_key, ''), m.category::text) as ckey
    from public.order o
    left join public.merchant m on m.id = o.merchant_id
    where v_guest is not null and o.guest_id = v_guest
  ),
  bookings as (
    select
      bk.id, bk.reference, bk.status::text as status, bk.starts_at, bk.created_at,
      bk.total_cents, bk.paid_cents, bk.paid_at, bk.merchant_id,
      coalesce(nullif(trim(m.trading_name), ''), m.legal_name) as merchant,
      coalesce(nullif(m.category_key, ''), m.category::text) as ckey,
      (bk.guest_user_id is null) as by_phone
    from public.booking bk
    left join public.merchant m on m.id = bk.merchant_id
    where (v_user is not null and bk.guest_user_id = v_user)
       or (bk.guest_user_id is null and v_key is not null and public.fn_phone_key(bk.guest_phone) = v_key)
  ),
  engine as (
    select
      e.id, e.title, e.status, e.starts_at, e.created_at, e.total_cents, e.merchant_id,
      coalesce(nullif(trim(m.trading_name), ''), m.legal_name) as merchant,
      coalesce(nullif(m.category_key, ''), m.category::text) as ckey
    from public.customer_engine_booking e
    left join public.merchant m on m.id = e.merchant_id
    where v_user is not null and e.user_id = v_user and e.forgotten_at is null
  ),
  stays as (
    select
      st.id, st.status::text as status, st.check_in, st.check_out, st.quote_total_kes, st.paid_kes,
      st.payment_reference, st.refunded_at, st.refund_reference, st.refund_note,
      coalesce(st.refund_amount_kes, st.paid_kes) as refund_kes, st.confirmed_at, st.created_at,
      coalesce(p.name, un.name) as place,
      coalesce(nullif(trim(h.display_name), ''), h.contact_name) as host
    from public.stay st
    left join public.property p on p.id = st.property_id
    left join public.unit un on un.id = st.unit_id
    left join public.host h on h.id = st.host_id
    where v_user is not null and st.guest_user_id = v_user
  ),
  paid as (
    select 'order'::text as kind, ckey, merchant_id, merchant, total_cents as cents, placed_at as at
    from orders where payment_status in ('paid', 'collected', 'partially_refunded', 'refunded')
    union all
    select 'booking', ckey, merchant_id, merchant, paid_cents, coalesce(paid_at, created_at)
    from bookings where paid_at is not null
    union all
    select 'stay', 'stays', null, place, paid_kes * 100, coalesce(confirmed_at, created_at)
    from stays where coalesce(paid_kes, 0) > 0
  ),
  refunds as (
    select
      'refund'::text as kind, r.id::text as id, o.reference, r.amount_cents as cents, r.status::text as state,
      r.method::text as channel, null::text as provider, coalesce(r.issued_at, r.requested_at) as at,
      r.reason_text as note
    from public.refund r
    join orders o on o.id = r.order_id
    union all
    select 'refund', st.id::text, st.refund_reference, st.refund_kes * 100, 'issued', 'stay', null,
      st.refunded_at, st.refund_note
    from stays st where st.refunded_at is not null
    union all
    select 'refund', pr.id::text, pr.paystack_refund_id, pr.amount_cents, pr.state::text, pr.kind, 'paystack',
      pr.created_at, null
    from public.paystack_refund pr
    where pr.kind <> 'order'
      and (pr.stay_id in (select id from stays)
           or pr.payment_id in (
             select pay.id from public.payment pay
             where pay.stay_id in (select id from stays)))
  ),
  payments as (
    select
      'payment'::text as kind, pay.id::text as id, pay.reference, pay.amount_cents as cents,
      pay.state::text as state, pay.channel, pay.provider,
      coalesce(pay.paid_at, pay.created_at) as at, pay.failure_reason as note,
      pay.intent::text as intent
    from public.payment pay
    where (v_guest is not null and pay.guest_id = v_guest)
       or pay.order_id in (select id from orders)
       or pay.stay_id in (select id from stays)
  ),
  tickets as (
    select t.id, t.reference, t.topic::text as topic, t.status::text as status, t.created_at,
      t.resolved_at, left(t.body, 240) as body, t.order_reference
    from public.support_ticket t
    where (v_user is not null and t.user_id = v_user)
       or (v_key is not null and public.fn_phone_key(t.phone) = v_key)
  ),
  months as (
    select generate_series(
      date_trunc('month', now() at time zone 'Africa/Nairobi') - interval '11 months',
      date_trunc('month', now() at time zone 'Africa/Nairobi'),
      interval '1 month') as m
  )
  select jsonb_build_object(
    'found', true,
    'level', v_level,
    'customer', (
      select jsonb_build_object(
        'id', coalesce(v_guest, v_user),
        'guest_id', v_guest,
        'user_id', v_user,
        'name', coalesce(
          nullif(trim(g.name), ''),
          nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), '')),
        'email', u.email,
        'phone', v_phone,
        'has_account', (u.id is not null and not coalesce(u.is_anonymous, false)),
        'joined_at', least(g.created_at, u.created_at),
        'email_confirmed_at', u.email_confirmed_at,
        'phone_confirmed_at', u.phone_confirmed_at,
        'last_sign_in_at', u.last_sign_in_at,
        'country_code', g.country_code,
        'vip', coalesce(g.vip, false),
        'blocked', coalesce(g.blocked, false),
        'block_reason', g.block_reason,
        'is_partner', (v_user is not null and public.fn_customer_is_partner(v_user)),
        'marketing_consent', (select gc.granted from public.guest_consent gc
          where gc.guest_id = v_guest and gc.kind = 'marketing' order by gc.at desc limit 1),
        'push_devices', (select count(*) from public.push_subscription ps where v_user is not null and ps.user_id = v_user),
        'push_last_seen_at', (select max(ps.last_seen_at) from public.push_subscription ps where v_user is not null and ps.user_id = v_user)
      )
      from (select 1) x
      left join public.guest g on g.id = v_guest
      left join auth.users u on u.id = v_user
    ),
    'stats', (
      select jsonb_build_object(
        'gross', coalesce((select sum(cents) from paid), 0),
        'refunded', coalesce((select sum(cents) from refunds where state in ('issued', 'processed')), 0),
        'purchases', (select count(*) from paid),
        'orders', (select count(*) from orders where stage <> 'cancelled'),
        'cancelled', (select count(*) from orders where stage = 'cancelled')
          + (select count(*) from bookings where status = 'cancelled')
          + (select count(*) from stays where status = 'cancelled'),
        'bookings', (select count(*) from bookings where status not in ('cancelled', 'blocked'))
          + (select count(*) from engine where coalesce(status, '') <> 'cancelled'),
        'stays', (select count(*) from stays where status in ('booked', 'in_stay', 'departed')),
        'failed_payments', (select count(*) from payments where state = 'failed'),
        'first_purchase_at', (select min(at) from paid),
        'last_purchase_at', (select max(at) from paid),
        'saved', (select count(*) from public.customer_saved cs where v_user is not null and cs.user_id = v_user)
      )
    ),
    'monthly', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(mo.m, 'YYYY-MM'),
        'cents', coalesce((select sum(p.cents) from paid p
          where date_trunc('month', p.at at time zone 'Africa/Nairobi') = mo.m), 0),
        'count', (select count(*) from paid p
          where date_trunc('month', p.at at time zone 'Africa/Nairobi') = mo.m)
      ) order by mo.m)
      from months mo
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('key', c.ckey, 'label', public.fn_merchant_category_label(c.ckey),
        'count', c.n, 'cents', c.cents) order by c.cents desc, c.n desc)
      from (select ckey, count(*) as n, sum(cents) as cents from paid where ckey is not null group by ckey) c
    ), '[]'::jsonb),
    'merchants', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.merchant_id, 'name', c.merchant, 'count', c.n, 'cents', c.cents)
        order by c.n desc, c.cents desc)
      from (
        select merchant_id, merchant, count(*) as n, sum(cents) as cents
        from paid where merchant_id is not null
        group by merchant_id, merchant
        order by count(*) desc, sum(cents) desc
        limit 5
      ) c
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'reference', o.reference, 'merchant', o.merchant, 'merchant_id', o.merchant_id,
        'category', public.fn_merchant_category_label(o.ckey), 'stage', o.stage,
        'payment_status', o.payment_status, 'payment_method', o.payment_method,
        'total_cents', o.total_cents, 'at', o.placed_at) order by o.placed_at desc)
      from (select * from orders order by placed_at desc limit 200) o
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(b.j order by b.at desc)
      from (
        select bk.created_at as at, jsonb_build_object(
          'id', bk.id, 'source', 'booking', 'reference', bk.reference, 'merchant', bk.merchant,
          'merchant_id', bk.merchant_id, 'category', public.fn_merchant_category_label(bk.ckey),
          'status', bk.status, 'starts_at', bk.starts_at, 'total_cents', bk.total_cents,
          'paid_cents', case when bk.paid_at is not null then bk.paid_cents end,
          'by_phone', bk.by_phone, 'at', bk.created_at) as j
        from bookings bk
        union all
        select e.created_at, jsonb_build_object(
          'id', e.id, 'source', 'engine', 'reference', e.title, 'merchant', e.merchant,
          'merchant_id', e.merchant_id, 'category', public.fn_merchant_category_label(e.ckey),
          'status', e.status, 'starts_at', e.starts_at, 'total_cents', e.total_cents,
          'paid_cents', null, 'by_phone', false, 'at', e.created_at)
        from engine e
        order by 1 desc
        limit 200
      ) b
    ), '[]'::jsonb),
    'stays', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'place', st.place, 'host', st.host, 'status', st.status,
        'check_in', st.check_in, 'check_out', st.check_out,
        'quote_cents', st.quote_total_kes * 100, 'paid_cents', st.paid_kes * 100,
        'reference', st.payment_reference, 'refunded_at', st.refunded_at) order by st.check_in desc)
      from (select * from stays order by check_in desc limit 200) st
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(t.j order by t.at desc)
      from (
        select p.at, jsonb_build_object('kind', 'payment', 'id', p.id, 'reference', p.reference,
          'cents', p.cents, 'state', p.state, 'channel', p.channel, 'provider', p.provider,
          'intent', p.intent, 'note', p.note, 'at', p.at) as j
        from payments p
        union all
        select r.at, jsonb_build_object('kind', 'refund', 'id', r.id, 'reference', r.reference,
          'cents', r.cents, 'state', r.state, 'channel', r.channel, 'provider', r.provider,
          'intent', null, 'note', r.note, 'at', r.at)
        from refunds r
        order by 1 desc
        limit 300
      ) t
    ), '[]'::jsonb),
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object('id', gp.id, 'label', gp.label, 'address', gp.address_line,
        'landmark', gp.landmark, 'last_used_at', gp.last_used_at, 'created_at', gp.created_at)
        order by gp.last_used_at desc nulls last)
      from public.guest_place gp
      where v_guest is not null and gp.guest_id = v_guest
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(rv.j order by rv.at desc)
      from (
        select r.created_at as at, jsonb_build_object('kind', 'order', 'stars', r.stars, 'comment', r.comment,
          'subject', coalesce(nullif(trim(m.trading_name), ''), m.legal_name), 'reference', o.reference,
          'at', r.created_at) as j
        from public.order_rating r
        join orders o on o.id = r.order_id
        left join public.merchant m on m.id = r.merchant_id
        union all
        select coalesce(sr.answered_at, sr.created_at), jsonb_build_object('kind', 'stay', 'stars', sr.rating,
          'comment', sr.text, 'subject', st.place, 'reference', null,
          'at', coalesce(sr.answered_at, sr.created_at))
        from public.stay_review sr
        join stays st on st.id = sr.stay_id
        where sr.rating is not null
        union all
        select rv.received_at, jsonb_build_object('kind', 'experience', 'stars', rv.rating, 'comment', rv.body,
          'subject', 'Experience day', 'reference', null, 'at', rv.received_at)
        from public.review rv
        where v_user is not null and rv.user_id = v_user
      ) rv
    ), '[]'::jsonb),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'reference', t.reference, 'topic', t.topic,
        'status', t.status, 'body', t.body, 'order_reference', t.order_reference,
        'created_at', t.created_at, 'resolved_at', t.resolved_at) order by t.created_at desc)
      from (select * from tickets order by created_at desc limit 50) t
    ), '[]'::jsonb),
    'saved', coalesce((
      select jsonb_agg(jsonb_build_object('merchant', s.merchant, 'merchant_id', s.merchant_id, 'items', s.items)
        order by s.at desc)
      from (
        select cs.merchant_id, max(coalesce(nullif(trim(m.trading_name), ''), m.legal_name)) as merchant,
          count(*) filter (where cs.kind = 'item') as items, max(cs.created_at) as at
        from public.customer_saved cs
        join public.merchant m on m.id = cs.merchant_id
        where v_user is not null and cs.user_id = v_user
        group by cs.merchant_id
        order by max(cs.created_at) desc
        limit 20
      ) s
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'at', n.created_at,
        'author', coalesce(su.display_name, su.email)) order by n.created_at desc)
      from public.customer_note n
      left join public.staff_user su on su.id = n.author_id
      where v_guest is not null and n.guest_id = v_guest
    ), '[]'::jsonb),
    'legacy_note', (select nullif(trim(g.staff_notes), '') from public.guest g where g.id = v_guest),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('reason', b.reason, 'at', b.at, 'lifted_at', b.lifted_at,
        'by', coalesce(s1.display_name, s1.email), 'lifted_by', coalesce(s2.display_name, s2.email))
        order by b.at desc)
      from public.guest_block b
      left join public.staff_user s1 on s1.id = b.by
      left join public.staff_user s2 on s2.id = b.lifted_by
      where v_guest is not null and b.guest_id = v_guest
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('action', h.action, 'at', h.at, 'reason', h.reason,
        'by', coalesce(su.display_name, su.email, h.actor_type::text)) order by h.at desc)
      from (
        select a.action, a.at, a.reason, a.actor_id, a.actor_type
        from audit.audit_event a
        where a.target_type = 'customer'
          and a.target_id in (v_guest, v_user)
        order by a.at desc
        limit 40
      ) h
      left join public.staff_user su on su.id = h.actor_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_customer_profile(uuid) from public, anon;
grant execute on function public.rpc_customer_profile(uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════ 6. actions

/* Staff who may act on customers, or an error that says so. */
create or replace function public.fn_customer_require_act(p_reason text, p_what text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(authz.customers_level(), 'view') not in ('full', 'limited') then
    raise exception 'Only people with Customer care access can do this.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception '%', p_what using errcode = '22023';
  end if;
  if char_length(trim(p_reason)) > 2000 then
    raise exception 'Keep it under 2,000 characters.' using errcode = '22023';
  end if;
  return trim(p_reason);
end;
$$;

revoke all on function public.fn_customer_require_act(text, text) from public, anon, authenticated;

create or replace function public.rpc_customer_note_add(p_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := public.fn_customer_require_act(p_body, 'Write the note first.');
  v_guest uuid := public.fn_customer_guest_ensure(p_id);
  v_note uuid;
begin
  insert into public.customer_note (guest_id, author_id, body)
  values (v_guest, authz.staff_id(), v_body)
  returning id into v_note;

  perform audit.log('staff'::public.actor_type, 'customers', 'customer.note_added',
    p_target_type => 'customer', p_target_id => v_guest,
    p_after => jsonb_build_object('note_id', v_note), p_reason => v_body,
    p_severity => 'info'::public.audit_severity);

  return jsonb_build_object('ok', true, 'id', v_note, 'guest_id', v_guest);
end;
$$;

create or replace function public.rpc_customer_set_suspended(p_id uuid, p_suspended boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.fn_customer_require_act(p_reason, 'Say why. The reason is kept with your name.');
  v_guest uuid := public.fn_customer_guest_ensure(p_id);
  v_was boolean;
begin
  if p_suspended is null then
    raise exception 'Say whether to suspend or reactivate.' using errcode = '22023';
  end if;
  select blocked into v_was from public.guest where id = v_guest for update;
  if v_was = p_suspended then
    return jsonb_build_object('ok', true, 'guest_id', v_guest, 'changed', false);
  end if;

  if p_suspended then
    update public.guest set blocked = true, block_reason = v_reason, updated_at = now() where id = v_guest;
    insert into public.guest_block (guest_id, reason, by) values (v_guest, v_reason, authz.staff_id());
  else
    update public.guest set blocked = false, block_reason = null, updated_at = now() where id = v_guest;
    update public.guest_block set lifted_at = now(), lifted_by = authz.staff_id()
    where guest_id = v_guest and lifted_at is null;
  end if;

  perform audit.log('staff'::public.actor_type, 'customers',
    case when p_suspended then 'customer.suspended' else 'customer.reactivated' end,
    p_target_type => 'customer', p_target_id => v_guest,
    p_before => jsonb_build_object('blocked', v_was),
    p_after => jsonb_build_object('blocked', p_suspended),
    p_reason => v_reason,
    p_severity => (case when p_suspended then 'high' else 'notice' end)::public.audit_severity);

  return jsonb_build_object('ok', true, 'guest_id', v_guest, 'changed', true);
end;
$$;

create or replace function public.rpc_customer_set_vip(p_id uuid, p_vip boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.fn_customer_require_act(p_reason, 'Say why. The reason is kept with your name.');
  v_guest uuid := public.fn_customer_guest_ensure(p_id);
  v_was boolean;
begin
  if p_vip is null then
    raise exception 'Say whether the customer is VIP.' using errcode = '22023';
  end if;
  select vip into v_was from public.guest where id = v_guest for update;
  if v_was = p_vip then
    return jsonb_build_object('ok', true, 'guest_id', v_guest, 'changed', false);
  end if;
  update public.guest set vip = p_vip, updated_at = now() where id = v_guest;

  perform audit.log('staff'::public.actor_type, 'customers', 'customer.vip_changed',
    p_target_type => 'customer', p_target_id => v_guest,
    p_before => jsonb_build_object('vip', v_was), p_after => jsonb_build_object('vip', p_vip),
    p_reason => v_reason, p_severity => 'info'::public.audit_severity);

  return jsonb_build_object('ok', true, 'guest_id', v_guest, 'changed', true);
end;
$$;

/* Checks the account can be sent a verification email and records who
   asked. The console then asks Supabase Auth to send it. */
create or replace function public.rpc_customer_verification_resend(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.fn_customer_require_act(p_reason, 'Say why. The reason is kept with your name.');
  v_guest uuid;
  v_user uuid;
  v_email text;
  v_confirmed timestamptz;
begin
  select r.guest_id, r.user_id into v_guest, v_user from public.fn_customer_resolve(p_id) r;
  if v_user is null then
    raise exception 'This customer has no account, so there is nothing to verify.' using errcode = '22023';
  end if;
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_user;
  if coalesce(v_email, '') = '' then
    raise exception 'This account has no email address.' using errcode = '22023';
  end if;
  if v_confirmed is not null then
    raise exception 'This email address is already verified.' using errcode = '22023';
  end if;

  perform audit.log('staff'::public.actor_type, 'customers', 'customer.verification_resent',
    p_target_type => 'customer', p_target_id => coalesce(v_guest, v_user),
    p_reason => v_reason, p_severity => 'notice'::public.audit_severity);

  return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;

revoke all on function public.rpc_customer_note_add(uuid, text) from public, anon;
revoke all on function public.rpc_customer_set_suspended(uuid, boolean, text) from public, anon;
revoke all on function public.rpc_customer_set_vip(uuid, boolean, text) from public, anon;
revoke all on function public.rpc_customer_verification_resend(uuid, text) from public, anon;
grant execute on function public.rpc_customer_note_add(uuid, text) to authenticated;
grant execute on function public.rpc_customer_set_suspended(uuid, boolean, text) to authenticated;
grant execute on function public.rpc_customer_set_vip(uuid, boolean, text) to authenticated;
grant execute on function public.rpc_customer_verification_resend(uuid, text) to authenticated;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('customer.profile_viewed', 'customers', 'info', true, false, false, '{phone,email}', 'A customer profile was opened, contact details in full'),
  ('customer.note_added', 'customers', 'info', false, false, false, '{}', 'A staff note was added to a customer'),
  ('customer.suspended', 'customers', 'high', true, false, false, '{}', 'A customer was suspended and can no longer order'),
  ('customer.reactivated', 'customers', 'notice', false, false, false, '{}', 'A suspended customer was reactivated'),
  ('customer.vip_changed', 'customers', 'info', false, false, false, '{}', 'A customer was marked or unmarked VIP'),
  ('customer.verification_resent', 'customers', 'notice', false, false, false, '{}', 'The verification email was sent to a customer again')
on conflict (action) do nothing;
