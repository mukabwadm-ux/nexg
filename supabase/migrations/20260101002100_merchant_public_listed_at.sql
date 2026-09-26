-- Give the public listing something to order by — spec section 4.1.
--
-- The homepage band has four slots and merchant_public exposed no date, so
-- the four it showed were whatever Postgres returned: a merchant featured
-- today could sit behind four older ones and never appear, with nothing in
-- the query explaining why.
--
-- `listed_at` is when the business joined. It says nothing a visitor could
-- not already infer from the listing existing, and it is not the merchant's
-- private data — unlike legal name, contact details or settlement account,
-- which stay out of this view.
--
-- Which featured merchant wins a slot is still a product decision waiting on
-- setting.homepage_featured_slots_per_city (seeded null, ground rule 3). This
-- only makes the current behaviour explainable instead of arbitrary.

create or replace view public.merchant_public
with (security_invoker = false)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.category_other,
  m.cover_photo_path,
  m.featured,
  c.slug as city_slug,
  c.name as city_name,
  b.name as branch_name,
  b.address_text as branch_address,
  b.latitude as branch_latitude,
  b.longitude as branch_longitude,
  -- Appended, not inserted: `create or replace view` may only add columns
  -- at the end, and renaming the existing ones would break every caller.
  m.created_at as listed_at
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b
  on b.merchant_id = m.id and b.is_primary
where m.status = 'live';

comment on view public.merchant_public is
  'Every merchant a visitor is allowed to see, and nothing else. Legal name, contact details and settlement account are deliberately absent.';

alter view public.merchant_public owner to postgres;

grant select on public.merchant_public to anon, authenticated;
