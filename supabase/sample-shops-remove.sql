-- Removes exactly the sample shops that sample-shops.sql loads, and nothing else.
--
-- Run it before real partners go live in the same city, or whenever the
-- sample catalogue should go. Only merchants that are both in the sample id
-- range and marked is_sample are deleted; their branches, sections, items,
-- hours and every other merchant-owned row go with them (the foreign keys
-- cascade). A sample shop cannot have orders or payments
-- (20270107000100_sample_merchants), so nothing that restricts a delete can
-- point at one.
--
--   set nexg.sample_shops = 'remove';
--   \i supabase/sample-shops-remove.sql

begin;

do $$
begin
  if coalesce(current_setting('nexg.sample_shops', true), '') <> 'remove' then
    raise exception 'Run: set nexg.sample_shops = ''remove''; in the same session first.';
  end if;
end $$;

delete from public.merchant
where is_sample
  and id::text like 'c1000000-0000-4000-8000-%';

commit;

select
  (select count(*) from public.merchant where is_sample) as sample_shops_remaining,
  (select count(*) from public.merchant) as merchants_remaining;
