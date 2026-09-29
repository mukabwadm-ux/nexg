-- What a merchant actually sells — the `Individual merchant` artboard.
--
-- Sections ("Popular", "Grills", "Drinks"), the items in them, and the hours
-- the shop keeps. This is the merchant's own content, so the shape follows
-- what a shop can actually tell us rather than what an order would need: no
-- stock levels, no modifiers, no variant matrix. Those arrive when there is
-- an order to apply them to.
--
-- Prices are real numbers here, unlike everything else on the site. A menu of
-- [—] cannot be read, and unlike a delivery estimate or a commission rate a
-- price is the merchant's own fact to state — we are not inventing it, we are
-- storing what they told us. Nothing computes a total from them yet.

create table public.catalogue_section (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  name text not null,
  /* "Most ordered by NexG guests" under the Popular heading. */
  blurb text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint catalogue_section_name_not_blank check (length(trim(name)) > 0),
  unique (merchant_id, name)
);

create index catalogue_section_merchant_idx
  on public.catalogue_section (merchant_id, sort);

create trigger catalogue_section_set_updated_at
  before update on public.catalogue_section
  for each row execute function public.tg_set_updated_at();

create table public.catalogue_item (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.catalogue_section (id) on delete cascade,
  /*
   * Denormalised from the section so every policy and every public read can
   * be answered without a join, and so an item can never be orphaned onto
   * another merchant's section.
   */
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  name text not null,
  description text,
  /*
   * Whole shillings. Kenya has no circulating subunit worth modelling, and an
   * integer cannot drift the way a float does.
   */
  price_kes integer,
  photo_path text,
  /* The artboard's "Sold out today" — the merchant's own switch. */
  available boolean not null default true,
  /* Alcohol, and anything else a rider has to check ID for. */
  age_restricted boolean not null default false,
  /* "Popular" badge, decided by the merchant until orders can decide it. */
  highlighted boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint catalogue_item_name_not_blank check (length(trim(name)) > 0),
  constraint catalogue_item_price_sane check (
    price_kes is null or (price_kes > 0 and price_kes <= 1000000)
  ),
  constraint catalogue_item_description_length check (
    description is null or length(description) <= 400
  )
);

create index catalogue_item_section_idx on public.catalogue_item (section_id, sort);
create index catalogue_item_merchant_idx on public.catalogue_item (merchant_id);

create trigger catalogue_item_set_updated_at
  before update on public.catalogue_item
  for each row execute function public.tg_set_updated_at();

/*
 * An item must belong to a section of the same merchant. A foreign key cannot
 * express that on its own, so it is a trigger — without it, a merchant could
 * hang an item off somebody else's section and have it appear on their page.
 */
create or replace function public.tg_catalogue_item_matches_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select merchant_id into v_owner
  from public.catalogue_section
  where id = new.section_id;

  if v_owner is null or v_owner <> new.merchant_id then
    raise exception 'That section belongs to a different business.'
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger catalogue_item_section_belongs
  before insert or update of section_id, merchant_id on public.catalogue_item
  for each row execute function public.tg_catalogue_item_matches_section();

-- ------------------------------------------------------------------- hours

create table public.merchant_hours (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  /* 0 = Sunday, matching Postgres `dow` and JavaScript `getDay`. */
  day_of_week smallint not null,
  opens time,
  closes time,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_hours_day_range check (day_of_week between 0 and 6),
  /*
   * A day is either closed, or it has both ends. `closes` before `opens` is
   * allowed on purpose: a kitchen open 18:00-01:00 is a normal thing and the
   * reader resolves it, not the schema.
   */
  constraint merchant_hours_open_days_have_times check (
    closed or (opens is not null and closes is not null)
  ),
  unique (merchant_id, day_of_week)
);

create index merchant_hours_merchant_idx on public.merchant_hours (merchant_id, day_of_week);

create trigger merchant_hours_set_updated_at
  before update on public.merchant_hours
  for each row execute function public.tg_set_updated_at();

-- --------------------------------------------------------------------- RLS

alter table public.catalogue_section enable row level security;
alter table public.catalogue_item enable row level security;
alter table public.merchant_hours enable row level security;

/*
 * Anyone may read the catalogue of a live business, and nobody may read one
 * that is not live. That is the same rule merchant_public enforces for the
 * listing, applied here so a delisted shop's menu does not remain readable by
 * anyone who kept the id (ground rule 5).
 */
create policy catalogue_section_read_public on public.catalogue_section
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.merchant m
      where m.id = catalogue_section.merchant_id and m.status = 'live'
    )
  );

create policy catalogue_item_read_public on public.catalogue_item
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.merchant m
      where m.id = catalogue_item.merchant_id and m.status = 'live'
    )
  );

create policy merchant_hours_read_public on public.merchant_hours
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.merchant m
      where m.id = merchant_hours.merchant_id and m.status = 'live'
    )
  );

/* The merchant's own people, whatever the status — they have to build it
   before going live. */
create policy catalogue_section_write_own on public.catalogue_section
  for all to authenticated
  using (authz.is_merchant_member(merchant_id))
  with check (authz.is_merchant_member(merchant_id));

create policy catalogue_item_write_own on public.catalogue_item
  for all to authenticated
  using (authz.is_merchant_member(merchant_id))
  with check (authz.is_merchant_member(merchant_id));

create policy merchant_hours_write_own on public.merchant_hours
  for all to authenticated
  using (authz.is_merchant_member(merchant_id))
  with check (authz.is_merchant_member(merchant_id));

/* Staff in the right city, so the desk can fix a menu over the phone. */
create policy catalogue_section_write_staff on public.catalogue_section
  for all to authenticated
  using (
    exists (select 1 from public.merchant m
            where m.id = catalogue_section.merchant_id
              and authz.can_manage_merchants(m.city_id))
  )
  with check (
    exists (select 1 from public.merchant m
            where m.id = catalogue_section.merchant_id
              and authz.can_manage_merchants(m.city_id))
  );

create policy catalogue_item_write_staff on public.catalogue_item
  for all to authenticated
  using (
    exists (select 1 from public.merchant m
            where m.id = catalogue_item.merchant_id
              and authz.can_manage_merchants(m.city_id))
  )
  with check (
    exists (select 1 from public.merchant m
            where m.id = catalogue_item.merchant_id
              and authz.can_manage_merchants(m.city_id))
  );

create policy merchant_hours_write_staff on public.merchant_hours
  for all to authenticated
  using (
    exists (select 1 from public.merchant m
            where m.id = merchant_hours.merchant_id
              and authz.can_manage_merchants(m.city_id))
  )
  with check (
    exists (select 1 from public.merchant m
            where m.id = merchant_hours.merchant_id
              and authz.can_manage_merchants(m.city_id))
  );

comment on table public.catalogue_section is
  'A heading on a merchant page. Readable by anyone while the business is live, editable by the merchant and by staff in its city.';
comment on table public.catalogue_item is
  'One thing a merchant sells. price_kes is whole shillings and is the merchant''s own stated price — nothing here computes a total.';
comment on table public.merchant_hours is
  'Opening hours, one row per weekday. A close time before the open time means the shop trades past midnight.';
