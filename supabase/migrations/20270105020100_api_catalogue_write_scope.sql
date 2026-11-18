-- A permission of its own for updating a merchant's catalogue through the API.
--
-- merchant_write was meant to cover catalogue updates as well (see
-- 20260101022900), but it also books services charged to the merchant's
-- account, and NexG decides which live keys may do that. A merchant whose
-- till or ERP should keep NexG's prices and availability up to date needs
-- no credit and no say-so from NexG, so catalogue_write is a scope of its
-- own, and an owner can put it on a live key. 20270105020200 uses it.
--
-- On its own because a new enum value cannot be used in the transaction
-- that adds it.
--
-- Rollback: an enum value cannot be dropped. Revoke the keys that carry it.

alter type public.api_credential_scope add value if not exists 'catalogue_write' after 'merchant_write';

comment on type public.api_credential_scope is
  'What an API credential may do. merchant_* and catalogue_write are bound to one merchant: merchant_read reads its orders, merchant_write books services, catalogue_write updates catalogue prices and availability. internal_* is bound to the audit chain.';
