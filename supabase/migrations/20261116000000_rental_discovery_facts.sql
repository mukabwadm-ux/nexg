-- Merchant-supplied, offering-level facts for rental discovery. NULL means unknown;
-- an empty terms array means the merchant explicitly declares none of these terms.
create table public.rental_offering_facts (
  item_id uuid primary key references public.catalogue_item(id) on delete cascade,
  car_type text check (car_type in ('sedan','suv','hatchback','van','pickup','convertible','other')),
  seats smallint check (seats between 1 and 99),
  daily_price_kes integer check (daily_price_kes between 1 and 1000000),
  terms text[] check (terms is null or (array_position(terms, null) is null
    and terms <@ array['free_cancellation','unlimited_mileage','insurance_included','no_deposit','pay_at_pickup',
      'airport_pickup','delivery','four_wheel_drive','air_conditioning']::text[])),
  updated_at timestamptz not null default now()
);

create trigger rental_offering_facts_updated_at before update on public.rental_offering_facts
  for each row execute function public.tg_set_updated_at();

alter table public.rental_offering_facts enable row level security;
revoke all on public.rental_offering_facts from public, anon, authenticated;
grant select, insert, update, delete on public.rental_offering_facts to authenticated;

-- The existing catalogue ownership rule is the authority; no category label grants access.
create policy rental_offering_facts_own on public.rental_offering_facts
  for all to authenticated
  using (exists (select 1 from public.catalogue_item i where i.id = rental_offering_facts.item_id and authz.is_merchant_member(i.merchant_id)))
  with check (exists (select 1 from public.catalogue_item i where i.id = rental_offering_facts.item_id and authz.is_merchant_member(i.merchant_id)));

-- Public facts inherit the existing catalogue's live, visible and licensing gates.
create view public.rental_offering_public with (security_barrier = true) as
select f.item_id, f.car_type, f.seats, f.daily_price_kes, f.terms, f.updated_at
from public.rental_offering_facts f
join public.catalogue_public c on c.id = f.item_id;
revoke all on public.rental_offering_public from public;
grant select on public.rental_offering_public to anon, authenticated;

comment on table public.rental_offering_facts is
  'Source-supplied rental discovery facts; no date availability, final quote, or booking confirmation is implied.';
