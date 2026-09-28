-- `went_live_at` records when a business first opened, not whether it is open.
--
-- The original constraint was an equivalence:
--
--   (status = 'live') = (went_live_at is not null)
--
-- which makes pausing impossible without erasing the date. That is the wrong
-- trade: "joined [—]" on the merchant panel, the age of the relationship, and
-- any question about how long a business has been with NexG all come from that
-- timestamp, and a pause is meant to be a temporary, reversible thing.
--
-- The rule that actually matters is one-directional: a live business must have
-- gone live at some point. A paused or suspended one keeps its history.

alter table public.merchant
  drop constraint if exists merchant_go_live_is_attributed;

alter table public.merchant
  add constraint merchant_live_has_gone_live
  check (status <> 'live' or went_live_at is not null);

comment on column public.merchant.went_live_at is
  'When this business first went live. Survives a pause or a suspension — it is history, not current state.';
