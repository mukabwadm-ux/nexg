-- More reasons a rider is not offered a job.
--
-- Each one already exists as a fact on `public.rider` — offers
-- paused, not cleared for alcohol, beyond the distance they said
-- they ride. The cascade was silently ignoring all of them, which
-- means the console could not have explained an exclusion it never
-- made.
--
-- Its own migration: `alter type ... add value` cannot be used in
-- the transaction that adds it.

alter type dispatch.skip_reason add value if not exists 'offers_paused';
alter type dispatch.skip_reason add value if not exists 'beyond_their_max_km';
alter type dispatch.skip_reason add value if not exists 'not_large_item_eligible';
alter type dispatch.skip_reason add value if not exists 'suspended';
