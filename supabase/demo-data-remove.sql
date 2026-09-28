-- Removes exactly what demo-data.sql inserts, and nothing else.
--
-- Run this before the site carries real traffic. Demo merchants are invented
-- businesses with plausible names; leaving them live means a guest trying to
-- order from a shop that does not exist.
--
-- Identified by the reserved `nexg.invalid` email domain and the +254700000
-- phone block, both of which no real partner can hold: `.invalid` is reserved
-- by RFC 2606 precisely so it can never be registered.

begin;

delete from public.merchant_branch
where merchant_id in (
  select id from public.merchant where contact_email like 'demo.%@nexg.invalid'
);

delete from public.merchant
where contact_email like 'demo.%@nexg.invalid';

delete from public.rider
where phone like '+2547000002%';

commit;

select
  (select count(*) from public.merchant) as merchants_remaining,
  (select count(*) from public.rider) as riders_remaining;
