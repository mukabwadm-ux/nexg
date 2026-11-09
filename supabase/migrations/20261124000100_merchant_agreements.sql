-- Per-category merchant agreements, accepted online at application.
--
-- The 18 NexG merchant agreements are published as PDFs under
-- /legal/merchant-agreements/ (apps/web/public). Each merchant category maps
-- to exactly one (packages/contracts/src/merchant-agreements.ts is the
-- source of the mapping and the versions seeded below). Three categories use
-- an interim agreement until their own exists: vehicle_rentals -> Vehicle
-- Services, health -> Wellness, concierge_services -> Marketplace.
--
-- The PDFs carry no version or date, so a version is the publication date
-- plus a short SHA-256 of the PDF. A revised PDF is a new row here with a new
-- version; the newest published row is the one a merchant must accept.
--
-- Acceptance is recorded per merchant, agreement and version, with who and
-- when. Submitting an application requires an acceptance of the current
-- agreement for the application's category, so a category change means
-- accepting that category's agreement.
--
-- Idempotent; safe to re-run.

create table if not exists public.merchant_agreement (
  id text not null check (id ~ '^[a-z0-9-]{1,80}$'),
  version text not null check (length(version) between 1 and 80),
  title text not null check (length(title) between 1 and 120),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  path text not null check (path ~ '^/legal/merchant-agreements/[a-z0-9-]+\.pdf$'),
  published_on date not null,
  created_at timestamptz not null default now(),
  primary key (id, version)
);

create table if not exists public.merchant_agreement_category (
  category text primary key,
  agreement_id text not null,
  interim boolean not null default false
);

create table if not exists public.merchant_agreement_acceptance (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  category text not null,
  agreement_id text not null,
  version text not null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz not null default now(),
  foreign key (agreement_id, version) references public.merchant_agreement (id, version),
  unique (merchant_id, agreement_id, version)
);
create index if not exists merchant_agreement_acceptance_merchant_idx
  on public.merchant_agreement_acceptance (merchant_id, accepted_at desc);

alter table public.merchant_agreement enable row level security;
alter table public.merchant_agreement_category enable row level security;
alter table public.merchant_agreement_acceptance enable row level security;

-- The agreements and the mapping are public documents.
drop policy if exists merchant_agreement_read on public.merchant_agreement;
create policy merchant_agreement_read on public.merchant_agreement
  for select to anon, authenticated using (true);
drop policy if exists merchant_agreement_category_read on public.merchant_agreement_category;
create policy merchant_agreement_category_read on public.merchant_agreement_category
  for select to anon, authenticated using (true);

-- Acceptances: the merchant's own members and merchant staff may read; only
-- rpc_merchant_agreement_accept writes.
drop policy if exists merchant_agreement_acceptance_read on public.merchant_agreement_acceptance;
create policy merchant_agreement_acceptance_read on public.merchant_agreement_acceptance
  for select to authenticated using (
    authz.is_merchant_member(merchant_id) or authz.merchant_application_staff(merchant_id)
  );
revoke insert, update, delete on public.merchant_agreement, public.merchant_agreement_category,
  public.merchant_agreement_acceptance from anon, authenticated;
grant select on public.merchant_agreement, public.merchant_agreement_category to anon, authenticated;
grant select on public.merchant_agreement_acceptance to authenticated;

-- Seed: generated from packages/contracts/src/merchant-agreements.ts.
insert into public.merchant_agreement (id, title, version, sha256, path, published_on) values
  ('airport-transfers', 'Airport Transfers', '2026-11-09+51ecbbf2e6a1', '51ecbbf2e6a1bf632f2388978f0b380edc9a395fb5d28833453c6b4cfda7b252', '/legal/merchant-agreements/airport-transfers.pdf', date '2026-11-09'),
  ('alcohol-and-beverages', 'Alcohol & Beverages', '2026-11-09+5652f0c81665', '5652f0c81665102b76b1a72ff2d698fe9a0a12d9e80260b4ac4ac6185500685e', '/legal/merchant-agreements/alcohol-and-beverages.pdf', date '2026-11-09'),
  ('pharmacy', 'Pharmacy', '2026-11-09+19c1bf17fd11', '19c1bf17fd119b98fd2ee3bb57ce210489d2f5a77067e545deab1eee591006e8', '/legal/merchant-agreements/pharmacy.pdf', date '2026-11-09'),
  ('travel-and-tours', 'Travel & Tours', '2026-11-09+d5b45fe20ed5', 'd5b45fe20ed5575decdad245186d1ae358f71df159dc9dad42f2e4bb7b562a42', '/legal/merchant-agreements/travel-and-tours.pdf', date '2026-11-09'),
  ('vehicle-services', 'Vehicle Services', '2026-11-09+71b0785120b2', '71b0785120b28c19b1726412c72c2b2684f551b21b445c7dc1187a0d8f56e989', '/legal/merchant-agreements/vehicle-services.pdf', date '2026-11-09'),
  ('adults-only', 'Adults Only', '2026-11-09+2b747895e917', '2b747895e9175ee4369e8c0b8f6fa0bedbf6df11872d98bdaebcd3c3f08fa8c8', '/legal/merchant-agreements/adults-only.pdf', date '2026-11-09'),
  ('financial-services', 'Financial Services', '2026-11-09+ac172ace6525', 'ac172ace652515c670e33981636f1b82ac338be09174332a860641c08be37141', '/legal/merchant-agreements/financial-services.pdf', date '2026-11-09'),
  ('fashion-and-apparel', 'Fashion & Apparel', '2026-11-09+589d4f152297', '589d4f1522972c348438e124c372445ddb325b2ff587a3d2a5882ee60ce6666d', '/legal/merchant-agreements/fashion-and-apparel.pdf', date '2026-11-09'),
  ('beauty', 'Beauty', '2026-11-09+8d1f082f56c1', '8d1f082f56c1f172464552f5f27da0a63e7da6fabf947bd4a649a12821633d4c', '/legal/merchant-agreements/beauty.pdf', date '2026-11-09'),
  ('experiences', 'Experiences', '2026-11-09+56fae07e493d', '56fae07e493d612017c8cbab9ce6fc8164a4e67ff769da1d1dc7cae50344380a', '/legal/merchant-agreements/experiences.pdf', date '2026-11-09'),
  ('flowers-and-gifts', 'Flowers & Gifts', '2026-11-09+a08cd5118e48', 'a08cd5118e489fd2b8595f800bb393ee5a87d0b0676b09a623dde24c5be99178', '/legal/merchant-agreements/flowers-and-gifts.pdf', date '2026-11-09'),
  ('restaurants-and-food', 'Restaurants & Food', '2026-11-09+28d556906df7', '28d556906df71586c6dbdd8071f0855008f83d63c441c008c30533144bb85ede', '/legal/merchant-agreements/restaurants-and-food.pdf', date '2026-11-09'),
  ('groceries', 'Groceries', '2026-11-09+708e5c4036d2', '708e5c4036d29affdcf9a6c67d6a0dc294146b263b7ba65dc03ef72b2ba816ee', '/legal/merchant-agreements/groceries.pdf', date '2026-11-09'),
  ('laundry-and-cleaning', 'Laundry & Cleaning', '2026-11-09+d0b2d4d97cb4', 'd0b2d4d97cb42ae7b6eb827afadd7b6842842524c2582acb388afc6b09fd77bf', '/legal/merchant-agreements/laundry-and-cleaning.pdf', date '2026-11-09'),
  ('marketplace', 'Marketplace', '2026-11-09+87b99f62c582', '87b99f62c582212563d30bc8597bf9fa742e2104fe02620b118928ee8501ad99', '/legal/merchant-agreements/marketplace.pdf', date '2026-11-09'),
  ('tech-and-electronics', 'Tech & Electronics', '2026-11-09+dd618869d269', 'dd618869d269f898940985f15f6386ea6d1efb5b33efd35c7f77f4a0e4cfdb3a', '/legal/merchant-agreements/tech-and-electronics.pdf', date '2026-11-09'),
  ('wellness', 'Wellness', '2026-11-09+5962b8f0419d', '5962b8f0419d4b3adebcaeb248744f74e92dd77ea365a40db2aec3f49d9e495b', '/legal/merchant-agreements/wellness.pdf', date '2026-11-09'),
  ('logistics-and-shipping', 'Logistics & Shipping', '2026-11-09+e11686d6c3b5', 'e11686d6c3b503e6292ab4a8c998fd639bb2fe894284904d263f75479e29d820', '/legal/merchant-agreements/logistics-and-shipping.pdf', date '2026-11-09')
on conflict (id, version) do nothing;

insert into public.merchant_agreement_category (category, agreement_id, interim) values
  ('adults_only', 'adults-only', false),
  ('airport_transfers', 'airport-transfers', false),
  ('alcohol_beverages', 'alcohol-and-beverages', false),
  ('fashion_apparel', 'fashion-and-apparel', false),
  ('beauty', 'beauty', false),
  ('vehicle_rentals', 'vehicle-services', true),
  ('experiences', 'experiences', false),
  ('financial_services', 'financial-services', false),
  ('flowers_gifts', 'flowers-and-gifts', false),
  ('restaurants_food', 'restaurants-and-food', false),
  ('groceries_essentials', 'groceries', false),
  ('laundry_cleaning', 'laundry-and-cleaning', false),
  ('marketplace', 'marketplace', false),
  ('pharmacy', 'pharmacy', false),
  ('health', 'wellness', true),
  ('tech_electronics', 'tech-and-electronics', false),
  ('travel_tours', 'travel-and-tours', false),
  ('vehicle_services', 'vehicle-services', false),
  ('wellness', 'wellness', false),
  ('concierge_services', 'marketplace', true),
  ('logistics_shipping', 'logistics-and-shipping', false)
on conflict (category) do update set agreement_id = excluded.agreement_id, interim = excluded.interim;

/* The newest published version of the agreement a category uses. */
create or replace function public.fn_merchant_agreement_for_category(p_category text)
returns public.merchant_agreement
language sql stable security definer set search_path = '' as $$
  select a.* from public.merchant_agreement_category c
  join public.merchant_agreement a on a.id = c.agreement_id
  where c.category = p_category
  order by a.published_on desc, a.created_at desc
  limit 1;
$$;

/* The category an application or merchant currently has. */
create or replace function public.fn_merchant_agreement_category(p_merchant_id uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select nullif(a.payload ->> 'categoryId', '') from public.merchant_application a
      where a.merchant_id = p_merchant_id),
    (select coalesce(m.category_key, m.category::text) from public.merchant m
      where m.id = p_merchant_id)
  );
$$;

/*
 * What a merchant (or reviewing staff) needs to show: the agreement for the
 * merchant's category, whether its current version is accepted, and the
 * latest acceptance on record.
 */
create or replace function public.rpc_merchant_agreement_status(p_merchant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_category text;
  v_agreement public.merchant_agreement;
  v_interim boolean;
  v_current public.merchant_agreement_acceptance;
  v_latest public.merchant_agreement_acceptance;
  v_latest_title text;
begin
  if not (
    authz.is_merchant_member(p_merchant_id) or authz.merchant_application_staff(p_merchant_id)
  ) then
    raise exception 'Not yours to look at.' using errcode = '42501';
  end if;
  v_category := public.fn_merchant_agreement_category(p_merchant_id);
  v_agreement := public.fn_merchant_agreement_for_category(v_category);
  select interim into v_interim from public.merchant_agreement_category where category = v_category;
  if v_agreement.id is not null then
    select * into v_current from public.merchant_agreement_acceptance
      where merchant_id = p_merchant_id and agreement_id = v_agreement.id
        and version = v_agreement.version;
  end if;
  select * into v_latest from public.merchant_agreement_acceptance
    where merchant_id = p_merchant_id order by accepted_at desc limit 1;
  if v_latest.id is not null then
    select title into v_latest_title from public.merchant_agreement
      where id = v_latest.agreement_id and version = v_latest.version;
  end if;
  return jsonb_build_object(
    'category', v_category,
    'interim', coalesce(v_interim, false),
    'agreement', case when v_agreement.id is null then null else jsonb_build_object(
      'id', v_agreement.id, 'title', v_agreement.title, 'version', v_agreement.version,
      'path', v_agreement.path, 'published_on', v_agreement.published_on) end,
    'accepted', v_current.id is not null,
    'accepted_at', v_current.accepted_at,
    'latest', case when v_latest.id is null then null else jsonb_build_object(
      'agreement_id', v_latest.agreement_id, 'title', v_latest_title,
      'version', v_latest.version, 'category', v_latest.category,
      'accepted_at', v_latest.accepted_at, 'accepted_by', v_latest.accepted_by) end
  );
end;
$$;

/*
 * Record that the signed-in owner accepted the current agreement for the
 * merchant's category. The caller names the agreement and version they were
 * shown; if either is not the current one for the category, nothing is
 * recorded and they are asked to reload. Idempotent.
 */
create or replace function public.rpc_merchant_agreement_accept(
  p_merchant_id uuid, p_agreement_id text, p_version text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_category text;
  v_agreement public.merchant_agreement;
  v_inserted uuid;
begin
  if (select auth.uid()) is null or not authz.merchant_application_owner(p_merchant_id) then
    raise exception 'Only the business owner can accept the merchant agreement.'
      using errcode = '42501';
  end if;
  v_category := public.fn_merchant_agreement_category(p_merchant_id);
  v_agreement := public.fn_merchant_agreement_for_category(v_category);
  if v_agreement.id is null then
    raise exception 'Choose your business category first.' using errcode = '22023';
  end if;
  if v_agreement.id is distinct from p_agreement_id or v_agreement.version is distinct from p_version then
    raise exception 'The merchant agreement for your category has changed. Reload the page and read it again.'
      using errcode = '40001';
  end if;
  insert into public.merchant_agreement_acceptance
    (merchant_id, category, agreement_id, version, accepted_by)
    values (p_merchant_id, v_category, v_agreement.id, v_agreement.version, (select auth.uid()))
    on conflict (merchant_id, agreement_id, version) do nothing
    returning id into v_inserted;
  if v_inserted is not null then
    perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchant',
      p_action => 'merchant.agreement_accepted', p_target_type => 'merchant',
      p_target_id => p_merchant_id,
      p_after => jsonb_build_object('agreement', v_agreement.id, 'version', v_agreement.version,
        'category', v_category));
  end if;
  return public.rpc_merchant_agreement_status(p_merchant_id);
end;
$$;

/* Submitting requires the current agreement for the submitted category. */
create or replace function public.tg_merchant_application_agreement_required()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_agreement public.merchant_agreement;
begin
  if new.submitted_revision is not null
     and new.submitted_revision is distinct from old.submitted_revision then
    v_agreement := public.fn_merchant_agreement_for_category(new.payload ->> 'categoryId');
    if v_agreement.id is not null and not exists (
      select 1 from public.merchant_agreement_acceptance x
      where x.merchant_id = new.merchant_id and x.agreement_id = v_agreement.id
        and x.version = v_agreement.version
    ) then
      raise exception 'Read and accept the NexG Merchant Agreement for your category before submitting.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists merchant_application_agreement_required on public.merchant_application;
create trigger merchant_application_agreement_required
  before update of submitted_revision on public.merchant_application
  for each row execute function public.tg_merchant_application_agreement_required();

revoke all on function public.fn_merchant_agreement_for_category(text),
  public.fn_merchant_agreement_category(uuid),
  public.tg_merchant_application_agreement_required() from public, anon, authenticated;
revoke all on function public.rpc_merchant_agreement_status(uuid),
  public.rpc_merchant_agreement_accept(uuid, text, text) from public, anon;
grant execute on function public.rpc_merchant_agreement_status(uuid),
  public.rpc_merchant_agreement_accept(uuid, text, text) to authenticated;
