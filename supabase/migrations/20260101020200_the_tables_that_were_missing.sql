-- The tables that were missing, and only those.
--
-- The merchant modules prompt lists a dozen "data additions".
-- Most of them already exist under a different name, and
-- creating them again is how an account ends up with two places
-- holding the same fact and a page reading whichever one is
-- empty:
--
--   merchant_document  → `document`, generic, keyed by owner
--   merchant_dispute   → `dispute`, which already carries
--                        merchant_reply and merchant_reply_due_at
--   merchant_health    → merchant.health_band + merchant_health_snapshot
--   merchant_override  → merchant_hours_override and branch_override
--   notification rules → notification_rule, platform-wide
--
-- `merchant_review` looks like the guest rating and is not: it
-- is a staff member's review of a merchant *application*, with
-- a checklist and an outcome. Averaging it into a branch card
-- would have put a number on screen that means something else
-- entirely.
--
-- So this creates five things that genuinely have nowhere to
-- live, each with the foreign keys that stop a row outliving
-- what it points at.

-- ═══════════════════════════════════════════ guest ratings

/**
 * What a guest thought of a delivered order.
 *
 * One per order, enforced — a guest who rates twice is
 * changing their mind, not adding a second opinion, and two
 * rows would double-count in every average.
 *
 * The reply lives here rather than in a separate table because
 * there is exactly one, from the merchant, and a one-to-one
 * split across two tables is a join nobody needs and a place
 * for an orphan to appear.
 */
create table if not exists public.order_rating (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public."order" (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  branch_id uuid references public.merchant_branch (id) on delete set null,
  rider_id uuid references public.rider (id) on delete set null,

  stars smallint not null check (stars between 1 and 5),
  comment text,
  /* Rule-based tags from the comment — "late", "missing item",
     "cold". Phase one is keyword matching, so they are stored
     rather than recomputed and cannot drift when the rules
     change. */
  themes text[] not null default '{}',

  /* Which side the guest was unhappy with, when it can be told
     apart. A rider arriving late is not the kitchen's fault and
     must not move the merchant's health band. */
  about text not null default 'order'
    check (about in ('order', 'food', 'rider', 'app')),

  reply_body text,
  reply_at timestamptz,
  reply_by uuid references auth.users (id) on delete set null,
  /* A reply is public on Explore, so it is moderated. */
  reply_status text not null default 'none'
    check (reply_status in ('none', 'pending', 'published', 'rejected')),
  reply_decided_by uuid references public.staff_user (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_rating_merchant_idx
  on public.order_rating (merchant_id, created_at desc);
create index if not exists order_rating_branch_idx
  on public.order_rating (branch_id, created_at desc);
create index if not exists order_rating_unanswered_idx
  on public.order_rating (merchant_id) where reply_at is null and stars <= 3;

-- ══════════════════════════════════════════════ modifiers

/**
 * The choices on an item: spice level, extras, portion.
 *
 * These existed only as a design. The consequence was quiet and
 * bad: `order_item` has a `note` and nothing else, so a guest
 * picking "Hot, extra raita, large" either lost the choice or
 * had it flattened into free text the kitchen had to read and
 * the price could not account for.
 */
create table if not exists public.modifier_group (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  name text not null,
  /* Required means the guest cannot check out without choosing;
     `max_choices` 1 makes it a radio, more makes it a list. */
  required boolean not null default false,
  min_choices smallint not null default 0,
  max_choices smallint not null default 1,
  sort smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),

  constraint modifier_group_choices_make_sense
    check (max_choices >= greatest(min_choices, 1))
);

create table if not exists public.modifier_option (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_group (id) on delete cascade,
  name text not null,
  /* In cents, like every other price on an order. Zero is a
     choice that costs nothing, which is different from null. */
  extra_cents bigint not null default 0 check (extra_cents >= 0),
  available boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists modifier_option_group_idx on public.modifier_option (group_id, sort);

/* Which items carry which groups. A group belongs to the
   merchant and is attached to many items, so "spice level" is
   written once and edited once. */
create table if not exists public.catalogue_item_modifier (
  item_id uuid not null references public.catalogue_item (id) on delete cascade,
  group_id uuid not null references public.modifier_group (id) on delete cascade,
  sort smallint not null default 0,
  primary key (item_id, group_id)
);

/**
 * What the guest actually chose, on the order line.
 *
 * The price is copied, not joined. An order is a record of what
 * was agreed at the time; if "extra chicken" goes up next month
 * a six-week-old receipt must not quietly change, and a
 * statement built from a join would.
 */
create table if not exists public.order_item_modifier (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_item (id) on delete cascade,
  group_id uuid references public.modifier_group (id) on delete set null,
  option_id uuid references public.modifier_option (id) on delete set null,
  group_name text not null,
  option_name text not null,
  extra_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists order_item_modifier_line_idx
  on public.order_item_modifier (order_item_id);

-- ══════════════════════════════════════════ item photographs

/**
 * More than one photo per item.
 *
 * `catalogue_item.photo_path` holds one and stays as it is —
 * everything reading it keeps working, and it is the cover.
 * This is the gallery behind it.
 */
create table if not exists public.catalogue_photo (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.catalogue_item (id) on delete cascade,
  storage_path text not null,
  alt text,
  sort smallint not null default 0,
  is_cover boolean not null default false,
  /* Shown on Explore, so moderated. */
  status text not null default 'pending'
    check (status in ('pending', 'published', 'rejected')),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists catalogue_photo_one_cover
  on public.catalogue_photo (item_id) where is_cover;

-- ═══════════════════════════════════════ per-branch overrides

/**
 * One catalogue, different prices and availability per branch.
 *
 * A null price means "use the shared one" — different from a
 * price of zero, which would make the item free. Both columns
 * are nullable for that reason.
 */
create table if not exists public.catalogue_branch_override (
  item_id uuid not null references public.catalogue_item (id) on delete cascade,
  branch_id uuid not null references public.merchant_branch (id) on delete cascade,
  price_kes bigint check (price_kes is null or price_kes >= 0),
  available boolean,
  sold_out_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (item_id, branch_id)
);

-- ══════════════════════════════════════════ counter devices

/**
 * The phone on the counter that plays the order sound.
 *
 * `rider_device` exists and this is its merchant equivalent,
 * deliberately not shared: a rider device is bound to a person
 * and follows them, a counter device is bound to a branch and
 * stays when the staff change.
 */
create table if not exists public.merchant_device (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  branch_id uuid references public.merchant_branch (id) on delete cascade,
  label text not null,
  platform text,
  app_version text,
  push_token text,
  last_seen_at timestamptz,
  sound_test_at timestamptz,
  paired_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists merchant_device_branch_idx
  on public.merchant_device (branch_id) where revoked_at is null;

/* The notification matrix, on the merchant, matching how the
   host portal stores its own. */
alter table public.merchant
  add column if not exists notification_rules jsonb not null default '{}'::jsonb,
  add column if not exists quiet_hours jsonb;

-- ═══════════════════════════════════════════════════ policies

alter table public.order_rating enable row level security;
alter table public.modifier_group enable row level security;
alter table public.modifier_option enable row level security;
alter table public.catalogue_item_modifier enable row level security;
alter table public.order_item_modifier enable row level security;
alter table public.catalogue_photo enable row level security;
alter table public.catalogue_branch_override enable row level security;
alter table public.merchant_device enable row level security;

drop policy if exists order_rating_read on public.order_rating;
create policy order_rating_read on public.order_rating
  for select to authenticated
  using (
    authz.is_merchant_member(merchant_id)
    or authz.can_manage_merchants(null)
    or authz.reaches_module('orders')
  );

drop policy if exists modifier_group_read on public.modifier_group;
create policy modifier_group_read on public.modifier_group
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.can_manage_merchants(null));

drop policy if exists modifier_option_read on public.modifier_option;
create policy modifier_option_read on public.modifier_option
  for select to authenticated
  using (exists (
    select 1 from public.modifier_group g
     where g.id = group_id
       and (authz.is_merchant_member(g.merchant_id) or authz.can_manage_merchants(null))));

drop policy if exists catalogue_item_modifier_read on public.catalogue_item_modifier;
create policy catalogue_item_modifier_read on public.catalogue_item_modifier
  for select to authenticated
  using (exists (
    select 1 from public.catalogue_item i
     where i.id = item_id
       and (authz.is_merchant_member(i.merchant_id) or authz.can_manage_merchants(null))));

drop policy if exists order_item_modifier_read on public.order_item_modifier;
create policy order_item_modifier_read on public.order_item_modifier
  for select to authenticated
  using (exists (
    select 1 from public.order_item oi
      join public."order" o on o.id = oi.order_id
     where oi.id = order_item_id
       and (authz.is_merchant_member(o.merchant_id)
            or authz.reaches_module('orders'))));

drop policy if exists catalogue_photo_read on public.catalogue_photo;
create policy catalogue_photo_read on public.catalogue_photo
  for select to authenticated
  using (exists (
    select 1 from public.catalogue_item i
     where i.id = item_id
       and (authz.is_merchant_member(i.merchant_id) or authz.can_manage_merchants(null))));

drop policy if exists catalogue_branch_override_read on public.catalogue_branch_override;
create policy catalogue_branch_override_read on public.catalogue_branch_override
  for select to authenticated
  using (exists (
    select 1 from public.catalogue_item i
     where i.id = item_id
       and (authz.is_merchant_member(i.merchant_id) or authz.can_manage_merchants(null))));

drop policy if exists merchant_device_read on public.merchant_device;
create policy merchant_device_read on public.merchant_device
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.can_manage_merchants(null));

grant select on
  public.order_rating, public.modifier_group, public.modifier_option,
  public.catalogue_item_modifier, public.order_item_modifier,
  public.catalogue_photo, public.catalogue_branch_override, public.merchant_device
to authenticated;

-- ══════════════════════════════════════════════════════ views

/**
 * Ratings as the Reviews board reads them.
 *
 * Guests by first name, which is all a merchant needs and all
 * they get. The order reference is shown because it is how a
 * merchant finds the order a complaint is about.
 */
create or replace view merchant_rating_v
with (security_invoker = true) as
select
  r.id,
  r.merchant_id,
  r.branch_id,
  b.name as branch_name,
  r.order_id,
  o.reference as order_reference,
  r.stars,
  r.comment,
  r.themes,
  r.about,
  r.reply_body,
  r.reply_at,
  r.reply_status,
  r.created_at,
  split_part(coalesce(g.name, 'Guest'), ' ', 1) as guest_first_name,
  (r.reply_at is null and r.stars <= 3) as needs_a_reply
from public.order_rating r
join public."order" o on o.id = r.order_id
left join public.merchant_branch b on b.id = r.branch_id
left join public.guest g on g.id = o.guest_id;

/**
 * Whether a branch is ready to go live.
 *
 * A view rather than a table: every part of it is derived, and
 * a stored copy is one that goes stale the moment somebody sets
 * hours and nothing recomputes it.
 */
create or replace view branch_readiness_v
with (security_invoker = true) as
select
  b.id as branch_id,
  b.merchant_id,
  b.name,
  (b.address_text is not null and b.latitude is not null) as address_and_pin,
  exists (select 1 from public.catalogue_item i
           where i.merchant_id = b.merchant_id and i.available) as catalogue,
  exists (select 1 from public.merchant_hours h
           where h.merchant_id = b.merchant_id) as hours,
  exists (select 1 from public.merchant_device d
           where d.branch_id = b.id and d.revoked_at is null) as counter_device,
  jsonb_array_length(coalesce(b.photos, '[]'::jsonb)) > 0 as photos,
  (
    (b.address_text is not null and b.latitude is not null)::int
    + exists (select 1 from public.catalogue_item i
               where i.merchant_id = b.merchant_id and i.available)::int
    + exists (select 1 from public.merchant_hours h
               where h.merchant_id = b.merchant_id)::int
    + exists (select 1 from public.merchant_device d
               where d.branch_id = b.id and d.revoked_at is null)::int
    + (jsonb_array_length(coalesce(b.photos, '[]'::jsonb)) > 0)::int
  ) as ready_count,
  5 as ready_of
from public.merchant_branch b
where b.deleted_at is null;

grant select on merchant_rating_v, branch_readiness_v to authenticated;
revoke all on merchant_rating_v, branch_readiness_v from anon;

/*
 * The branch card can show a real rating now.
 *
 * It was returning a hard null with a comment saying there was
 * no source. There is one.
 */
drop view if exists merchant_branch_list_v;
create view merchant_branch_list_v
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
  r.rating,
  coalesce(r.ratings, 0) as ratings,
  coalesce(d.devices, 0) as devices
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
left join lateral (
  select round(avg(rt.stars), 1) as rating, count(*) as ratings
    from public.order_rating rt where rt.branch_id = b.id
) r on true
left join lateral (
  select count(*) as devices from public.merchant_device dv
   where dv.branch_id = b.id and dv.revoked_at is null
) d on true
where b.deleted_at is null
  and (authz.is_merchant_member(b.merchant_id) or authz.can_manage_merchants(null));

grant select on merchant_branch_list_v to authenticated;
revoke all on merchant_branch_list_v from anon;
revoke insert, update, delete, truncate on merchant_branch_list_v from authenticated;
