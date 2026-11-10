-- A payment can be for a stay. On its own because Postgres will not use a
-- new enum value in the same transaction that adds it; the checkout
-- migration that follows uses it.
alter type public.payment_intent add value if not exists 'stay';
