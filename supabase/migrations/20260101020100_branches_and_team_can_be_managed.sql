-- Branches a merchant can open and change, and a team they can
-- add to.
--
-- `rpc_merchant_add_store`, `rpc_merchant_rename_store` and
-- `rpc_merchant_close_store` existed and covered three narrow
-- cases between them. There was no way to open a branch and see
-- it, change its pickup instructions, give riders a number to
-- ring, set a cover photo, or bring somebody onto the team.
--
-- Everything here that staff need to see about goes through
-- `fn_approval_raise`, so the console is told in-app and by
-- email in the same transaction as the write. A merchant
-- uploading a photo and nobody hearing about it for four days
-- is the failure this is built to prevent.

-- ══════════════════════════════════════════ schema additions

alter table public.merchant_branch
  add column if not exists pickup_instructions text,
  add column if not exists rider_phone text,
  add column if not exists photos jsonb not null default '[]'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists pause_reason text;

create index if not exists merchant_branch_live_idx
  on public.merchant_branch (merchant_id) where deleted_at is null;

/*
 * An invitation is not a membership.
 *
 * `merchant_user` needs an `auth.users` row, which somebody
 * invited by phone does not have until they accept. Writing a
 * placeholder user to hold their place would make a membership
 * that grants access to an account nobody has signed into.
 */
create table if not exists public.merchant_invite (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  contact text not null,
  role text not null default 'manager' check (role in ('owner', 'manager', 'cashier')),
  branches uuid[],
  caps jsonb not null default '{}'::jsonb,
  invited_by uuid references auth.users (id) on delete set null,
  token_hash text,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists merchant_invite_open_idx
  on public.merchant_invite (merchant_id, contact)
  where accepted_at is null and revoked_at is null;

alter table public.merchant_user
  add column if not exists branches uuid[],
  add column if not exists caps jsonb not null default '{}'::jsonb;

-- ═════════════════════════════════════════════════ branches

/**
 * Create or change a branch.
 *
 * A new branch is not live. It carries a readiness record and
 * goes live on its own, which is what lets a chain add a fourth
 * shop without the other three waiting for it.
 */
create or replace function public.rpc_branch_upsert(
  p_merchant_id uuid,
  p_branch jsonb,
  p_branch_id uuid default null
)
returns public.merchant_branch
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.merchant_branch;
  v_name text := nullif(trim(p_branch ->> 'name'), '');
  v_lat float8 := nullif(p_branch ->> 'latitude', '')::float8;
  v_lng float8 := nullif(p_branch ->> 'longitude', '')::float8;
  v_city uuid;
  v_zone uuid;
  v_point extensions.geography;
begin
  if not authz.is_merchant_member(p_merchant_id) and not authz.can_manage_merchants(null) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Give the branch a name — it is what guests and your team see.'
      using errcode = '22023';
  end if;

  if v_lat is not null and v_lng is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
    select z.id into v_zone from public.zone z
     where z.active and extensions.st_covers(z.polygon, v_point) limit 1;
  end if;

  select city_id into v_city from public.merchant where id = p_merchant_id;

  if p_branch_id is null then
    if exists (select 1 from public.merchant_branch
                where merchant_id = p_merchant_id and name = v_name and deleted_at is null) then
      raise exception 'You already have a branch called %. Two with one name is how an order reaches the wrong kitchen.', v_name
        using errcode = '23505';
    end if;

    insert into public.merchant_branch (
      merchant_id, name, address_text, latitude, longitude, location, zone_id,
      pickup_instructions, rider_phone, is_primary, source)
    values (
      p_merchant_id, v_name,
      nullif(trim(p_branch ->> 'address_text'), ''),
      v_lat, v_lng, v_point, v_zone,
      nullif(trim(p_branch ->> 'pickup_instructions'), ''),
      nullif(trim(p_branch ->> 'rider_phone'), ''),
      /* The first branch is the primary one; later ones are not,
         and a merchant without a primary branch has no address
         on Explore. */
      not exists (select 1 from public.merchant_branch
                   where merchant_id = p_merchant_id and deleted_at is null),
      'manual')
    returning * into v_branch;
  else
    update public.merchant_branch set
      name = v_name,
      address_text = coalesce(nullif(trim(p_branch ->> 'address_text'), ''), address_text),
      latitude = coalesce(v_lat, latitude),
      longitude = coalesce(v_lng, longitude),
      location = coalesce(v_point, location),
      zone_id = coalesce(v_zone, zone_id),
      pickup_instructions = coalesce(
        nullif(trim(p_branch ->> 'pickup_instructions'), ''), pickup_instructions),
      rider_phone = coalesce(nullif(trim(p_branch ->> 'rider_phone'), ''), rider_phone),
      updated_at = now()
    where id = p_branch_id and merchant_id = p_merchant_id and deleted_at is null
    returning * into v_branch;

    if v_branch.id is null then
      raise exception 'That branch is not on your account, or it has been removed.'
        using errcode = '42501';
    end if;
  end if;

  perform audit.log('merchant_user'::public.actor_type, 'merchants',
    case when p_branch_id is null then 'branch.created' else 'branch.updated' end,
    p_target_type => 'merchant_branch', p_target_id => v_branch.id,
    p_target_label => v_branch.name, p_city_id => v_city,
    p_after => jsonb_build_object('name', v_branch.name, 'zone', v_branch.zone_id));

  /*
   * A new branch needs a human look before it appears on
   * Explore, so the console is told now rather than finding it
   * on a sweep. An edit to an existing one does not — the
   * address and photos are reviewed separately.
   */
  if p_branch_id is null then
    perform public.fn_approval_raise(
      p_kind => 'merchant_delist',
      p_module => 'merchants',
      p_target_type => 'merchant_branch',
      p_target_id => v_branch.id,
      p_title => 'New branch to review: ' || v_branch.name,
      p_body => (select trading_name from public.merchant where id = p_merchant_id)
                || ' added a branch at ' || coalesce(v_branch.address_text, 'an address not yet given') || '.',
      p_href => '/merchants/' || p_merchant_id::text,
      p_city_id => v_city,
      p_payload => jsonb_build_object('branch_id', v_branch.id, 'name', v_branch.name));
  end if;

  return v_branch;
end;
$$;

create or replace function public.rpc_branch_photos_set(p_branch_id uuid, p_photos jsonb)
returns public.merchant_branch
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.merchant_branch;
  v_merchant uuid;
  v_city uuid;
begin
  select merchant_id into v_merchant from public.merchant_branch
   where id = p_branch_id and deleted_at is null;
  if v_merchant is null then
    raise exception 'No such branch.' using errcode = '22023';
  end if;
  if not authz.is_merchant_member(v_merchant) and not authz.can_manage_merchants(null) then
    raise exception 'Not your branch.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 9 then
    raise exception 'A cover and eight more is the most a branch can carry.'
      using errcode = '22023';
  end if;

  update public.merchant_branch set photos = coalesce(p_photos, '[]'::jsonb), updated_at = now()
   where id = p_branch_id returning * into v_branch;

  select city_id into v_city from public.merchant where id = v_merchant;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'branch.photo_changed',
    p_target_type => 'merchant_branch', p_target_id => p_branch_id,
    p_target_label => v_branch.name, p_city_id => v_city,
    p_after => jsonb_build_object('count', jsonb_array_length(v_branch.photos)));

  /* Photos appear on Explore and on host QR landings, so they
     are moderated — and the desk hears about it now. */
  if jsonb_array_length(v_branch.photos) > 0 then
    perform public.fn_approval_raise(
      p_kind => 'merchant_delist', p_module => 'merchants',
      p_target_type => 'merchant_branch', p_target_id => p_branch_id,
      p_title => 'Branch photos to moderate: ' || v_branch.name,
      p_body => 'New or changed photographs, shown on Explore and on host QR landings once approved.',
      p_href => '/merchants/' || v_merchant::text,
      p_city_id => v_city,
      p_payload => jsonb_build_object('branch_id', p_branch_id));
  end if;

  return v_branch;
end;
$$;

create or replace function public.rpc_branch_pause(p_branch_id uuid, p_reason text)
returns public.merchant_branch
language plpgsql
security definer
set search_path = ''
as $$
declare v_branch public.merchant_branch; v_merchant uuid;
begin
  select merchant_id into v_merchant from public.merchant_branch
   where id = p_branch_id and deleted_at is null;
  if v_merchant is null then
    raise exception 'No such branch.' using errcode = '22023';
  end if;
  if not authz.is_merchant_member(v_merchant) then
    raise exception 'Not your branch.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why. Guests are told the branch is closed, and your team will want to know when it reopens.'
      using errcode = '22023';
  end if;

  update public.merchant_branch
     set paused_at = now(), pause_reason = p_reason, updated_at = now()
   where id = p_branch_id returning * into v_branch;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'branch.paused',
    p_target_type => 'merchant_branch', p_target_id => p_branch_id,
    p_target_label => v_branch.name,
    p_after => jsonb_build_object('reason', p_reason));

  return v_branch;
end;
$$;

create or replace function public.rpc_branch_resume(p_branch_id uuid)
returns public.merchant_branch
language plpgsql
security definer
set search_path = ''
as $$
declare v_branch public.merchant_branch; v_merchant uuid;
begin
  select merchant_id into v_merchant from public.merchant_branch
   where id = p_branch_id and deleted_at is null;
  if v_merchant is null or not authz.is_merchant_member(v_merchant) then
    raise exception 'Not your branch.' using errcode = '42501';
  end if;

  update public.merchant_branch
     set paused_at = null, pause_reason = null, updated_at = now()
   where id = p_branch_id returning * into v_branch;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'branch.resumed',
    p_target_type => 'merchant_branch', p_target_id => p_branch_id,
    p_target_label => v_branch.name);

  return v_branch;
end;
$$;

/**
 * Remove a branch, when that is honest.
 *
 * Refused while something still hangs off it, and the refusal
 * names which thing — the alternative generates a support
 * ticket. Soft delete, because statements referencing it have
 * to stay answerable for seven years.
 */
create or replace function public.rpc_branch_delete(p_branch_id uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.merchant_branch;
  v_live integer;
  v_only integer;
begin
  select * into v_branch from public.merchant_branch
   where id = p_branch_id and deleted_at is null;
  if v_branch.id is null then
    raise exception 'No such branch.' using errcode = '22023';
  end if;
  if not authz.is_merchant_member(v_branch.merchant_id) then
    raise exception 'Not your branch.' using errcode = '42501';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_branch.name)) then
    raise exception 'Type the branch name exactly to confirm: %', v_branch.name
      using errcode = '22023';
  end if;

  select count(*) into v_live from public."order"
   where branch_id = p_branch_id
     and stage not in ('delivered', 'cancelled', 'refunded');
  if v_live > 0 then
    raise exception 'There are % order(s) still in progress at this branch. They have guests waiting.', v_live
      using errcode = '23503';
  end if;

  select count(*) into v_only from public.merchant_branch
   where merchant_id = v_branch.merchant_id and deleted_at is null;
  if v_only <= 1 then
    raise exception 'This is your only branch. Removing it would take the business off Explore entirely — pause it instead.'
      using errcode = '23503';
  end if;

  update public.merchant_branch
     set deleted_at = now(), updated_at = now()
   where id = p_branch_id;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'branch.deleted',
    p_target_type => 'merchant_branch', p_target_id => p_branch_id,
    p_target_label => v_branch.name,
    p_before => jsonb_build_object('name', v_branch.name, 'address', v_branch.address_text));

  return jsonb_build_object('ok', true,
    'note', 'Removed from your account and from Explore. Statements and the audit trail are kept.');
end;
$$;

-- ═════════════════════════════════════════════════════ team

/**
 * Invite somebody onto the account.
 *
 * Creates an invitation, not a membership. `merchant_user`
 * needs an `auth.users` row that an invited person does not
 * have yet, and writing a placeholder to hold their place makes
 * a membership granting access to an account nobody has signed
 * into.
 */
create or replace function public.rpc_merchant_invite_member(
  p_merchant_id uuid,
  p_contact text,
  p_role text default 'manager',
  p_branches uuid[] default null,
  p_caps jsonb default '{}'::jsonb
)
returns public.merchant_invite
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.merchant_invite;
  v_contact text := nullif(trim(p_contact), '');
  v_me text;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;
  if v_contact is null then
    raise exception 'A phone number or an email — it is how they are sent the invitation.'
      using errcode = '22023';
  end if;
  if p_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Role must be owner, manager or cashier.' using errcode = '22023';
  end if;

  if exists (select 1 from public.merchant_invite
              where merchant_id = p_merchant_id and contact = v_contact
                and accepted_at is null and revoked_at is null) then
    raise exception 'There is already an open invitation to %. Resend it rather than making a second.', v_contact
      using errcode = '23505';
  end if;

  insert into public.merchant_invite (
    merchant_id, contact, role, branches, caps, invited_by)
  values (
    p_merchant_id, v_contact, p_role, p_branches,
    coalesce(p_caps, '{}'::jsonb), (select auth.uid()))
  returning * into v_invite;

  select trading_name into v_me from public.merchant where id = p_merchant_id;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.member_invited',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => v_me,
    p_after => jsonb_build_object('role', p_role, 'branches',
      coalesce(array_length(p_branches, 1), 0)));

  /* The invitation itself goes out through the outbox; the
     dispatch worker decides SMS or email from the shape of the
     contact. */
  perform public.fn_notify_enqueue(
    p_channel => case when v_contact like '%@%' then 'email' else 'sms' end,
    p_recipient => v_contact,
    p_template => 'merchant_team_invite',
    p_subject => 'You have been added to ' || coalesce(v_me, 'a business') || ' on NexG',
    p_body => coalesce(v_me, 'A business') || ' has invited you as a ' || p_role
      || '. Sign in at nexgapp.com with this number or address to accept.',
    p_payload => jsonb_build_object('invite_id', v_invite.id, 'merchant_id', p_merchant_id),
    p_sensitive => false);

  return v_invite;
end;
$$;

create or replace function public.rpc_merchant_membership_update(
  p_merchant_id uuid,
  p_user_id uuid,
  p_role text default null,
  p_branches uuid[] default null,
  p_caps jsonb default null
)
returns public.merchant_user
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.merchant_user; v_owners integer;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;

  /*
   * An account with no owner is one nobody can change payout
   * details on, invite to, or close. Demoting the last one is
   * refused rather than discovered later.
   */
  if p_role is not null and p_role <> 'owner' then
    select count(*) into v_owners from public.merchant_user
     where merchant_id = p_merchant_id and role = 'owner' and user_id <> p_user_id;
    if v_owners = 0 then
      raise exception 'That is the only owner. Make somebody else an owner first.'
        using errcode = '23503';
    end if;
  end if;

  update public.merchant_user set
    role = coalesce(nullif(p_role, ''), role),
    branches = coalesce(p_branches, branches),
    caps = coalesce(p_caps, caps),
    updated_at = now()
  where merchant_id = p_merchant_id and user_id = p_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'That person is not on this account.' using errcode = '22023';
  end if;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.member_updated',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('role', v_row.role));

  return v_row;
end;
$$;

create or replace function public.rpc_merchant_membership_remove(
  p_merchant_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_owners integer;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;

  select count(*) into v_owners from public.merchant_user
   where merchant_id = p_merchant_id and role = 'owner' and user_id <> p_user_id;
  if v_owners = 0 then
    raise exception 'That is the only owner. Make somebody else an owner before removing them.'
      using errcode = '23503';
  end if;

  delete from public.merchant_user
   where merchant_id = p_merchant_id and user_id = p_user_id;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.member_removed',
    p_target_type => 'merchant', p_target_id => p_merchant_id);

  return jsonb_build_object('ok', true, 'note', 'Removed. They lose access at their next request.');
end;
$$;

create or replace function public.rpc_merchant_invite_revoke(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from public.merchant_invite
   where id = p_invite_id and accepted_at is null and revoked_at is null;
  if v_merchant is null then
    raise exception 'No open invitation with that id.' using errcode = '22023';
  end if;
  if not authz.is_merchant_member(v_merchant) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;

  update public.merchant_invite set revoked_at = now() where id = p_invite_id;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.invite_revoked',
    p_target_type => 'merchant', p_target_id => v_merchant);

  return jsonb_build_object('ok', true, 'note', 'Withdrawn. The link in their message stops working.');
end;
$$;

-- ════════════════════════════════════════════════════ views

create or replace view merchant_branch_list_v
with (security_invoker = false) as
select
  b.id,
  b.merchant_id,
  b.name,
  b.address_text,
  b.latitude,
  b.longitude,
  b.zone_id,
  z.name as zone_name,
  b.is_primary,
  b.pickup_instructions,
  b.rider_phone,
  b.photos,
  b.paused_at,
  b.pause_reason,
  b.closed_at,
  b.created_at,
  case
    when b.closed_at is not null then 'closed'
    when b.paused_at is not null then 'paused'
    when b.latitude is null then 'setup'
    else 'live'
  end as state,
  coalesce(t.orders_today, 0) as orders_today,
  t.prep_avg_minutes,
  coalesce(o.orders_30d, 0) as orders_30d,
  r.rating
from public.merchant_branch b
left join public.zone z on z.id = b.zone_id
left join lateral (
  select count(*) as orders_today,
         round(avg(extract(epoch from (ord.ready_at - ord.confirmed_at)) / 60)) as prep_avg_minutes
  from public."order" ord
   where ord.branch_id = b.id
     and ord.placed_at >= date_trunc('day', now() at time zone 'Africa/Nairobi')
) t on true
left join lateral (
  select count(*) as orders_30d from public."order" ord
   where ord.branch_id = b.id and ord.placed_at > now() - interval '30 days'
) o on true
/*
 * There is no order-rating table yet.
 *
 * `review` is the experiences one, keyed on a plan, and the
 * merchant Reviews module needs its own. Rather than average
 * something unrelated and put a plausible 4.6 on a branch card,
 * this is null until the table exists and the page shows a
 * dash. A wrong rating on a branch is worse than no rating: it
 * is the number a merchant would act on.
 */
left join lateral (select null::numeric as rating) r on true
where b.deleted_at is null
  and (authz.is_merchant_member(b.merchant_id) or authz.can_manage_merchants(null));

create or replace view merchant_member_v
with (security_invoker = false) as
select
  mu.merchant_id,
  mu.user_id,
  mu.role::text as role,
  mu.branches,
  mu.caps,
  mu.created_at,
  u.email,
  /* First name only. A team list is not a place that needs a
     surname, and the column would be copied into an export. */
  split_part(coalesce(u.raw_user_meta_data ->> 'full_name', u.email), ' ', 1) as first_name,
  null::uuid as invite_id,
  null::text as invite_contact,
  'active' as status
from public.merchant_user mu
join auth.users u on u.id = mu.user_id
where authz.is_merchant_member(mu.merchant_id) or authz.can_manage_merchants(null)
union all
select
  i.merchant_id,
  null::uuid as user_id,
  i.role,
  i.branches,
  i.caps,
  i.created_at,
  case when i.contact like '%@%' then i.contact end as email,
  null as first_name,
  i.id as invite_id,
  /* Masked: an invite list is read by every manager, and a
     colleague's phone number is not theirs to collect. */
  case
    when i.contact like '%@%' then i.contact
    when length(i.contact) > 6
      then left(i.contact, 4) || repeat('•', greatest(0, length(i.contact) - 7)) || right(i.contact, 2)
    else '•••'
  end as invite_contact,
  'pending' as status
from public.merchant_invite i
where i.accepted_at is null and i.revoked_at is null
  and (authz.is_merchant_member(i.merchant_id) or authz.can_manage_merchants(null));

alter table public.merchant_invite enable row level security;

drop policy if exists merchant_invite_read on public.merchant_invite;
create policy merchant_invite_read on public.merchant_invite
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.can_manage_merchants(null));

grant select on merchant_branch_list_v, merchant_member_v to authenticated;
grant select on public.merchant_invite to authenticated;
revoke all on merchant_branch_list_v, merchant_member_v from anon;
revoke insert, update, delete, truncate on
  merchant_branch_list_v, merchant_member_v from authenticated;

revoke execute on function
  public.rpc_branch_upsert(uuid, jsonb, uuid),
  public.rpc_branch_photos_set(uuid, jsonb),
  public.rpc_branch_pause(uuid, text),
  public.rpc_branch_resume(uuid),
  public.rpc_branch_delete(uuid, text),
  public.rpc_merchant_invite_member(uuid, text, text, uuid[], jsonb),
  public.rpc_merchant_membership_update(uuid, uuid, text, uuid[], jsonb),
  public.rpc_merchant_membership_remove(uuid, uuid),
  public.rpc_merchant_invite_revoke(uuid)
from public, anon;

grant execute on function
  public.rpc_branch_upsert(uuid, jsonb, uuid),
  public.rpc_branch_photos_set(uuid, jsonb),
  public.rpc_branch_pause(uuid, text),
  public.rpc_branch_resume(uuid),
  public.rpc_branch_delete(uuid, text),
  public.rpc_merchant_invite_member(uuid, text, text, uuid[], jsonb),
  public.rpc_merchant_membership_update(uuid, uuid, text, uuid[], jsonb),
  public.rpc_merchant_membership_remove(uuid, uuid),
  public.rpc_merchant_invite_revoke(uuid)
to authenticated;
