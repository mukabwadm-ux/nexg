-- The public merchant listing — spec section 3.3.
--
-- Ground rule 5: public visibility is a database rule. This view is the only
-- thing anon can read about a merchant, and it cannot return anything that is
-- not live. The frontend never filters on status itself.

create view public.merchant_public
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
  b.longitude as branch_longitude
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b
  on b.merchant_id = m.id and b.is_primary
where m.status = 'live';

comment on view public.merchant_public is
  'Every merchant a visitor is allowed to see, and nothing else. Legal name, contact details and settlement account are deliberately absent.';

-- security_invoker = false so the view reads through its owner and is not
-- blocked by the merchant table's RLS; the WHERE clause is the filter.
alter view public.merchant_public owner to postgres;

grant select on public.merchant_public to anon, authenticated;

-- The base tables stay unreadable to anon. This is what makes the view the
-- only route in.
revoke all on public.merchant from anon;
revoke all on public.merchant_branch from anon;
