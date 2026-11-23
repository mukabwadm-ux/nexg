-- Pets becomes NexG's 22nd merchant category (owner, 23 Nov 2026).
-- Separate from 20270223000200_pets_category.sql because a new enum value
-- cannot be used in the transaction that adds it.

alter type public.merchant_category add value if not exists 'pets';
