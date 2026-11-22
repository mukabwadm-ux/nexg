-- The application review function keeps its timeouts.
--
-- 20261102000100_merchant_application.sql gives every merchant application
-- function a 5-second statement timeout and a 2-second lock timeout, so a
-- review that meets a held lock fails fast instead of hanging the admin
-- request. In production rpc_merchant_application_review had neither (seen
-- 18 Nov 2026): it was re-created by hand after that loop ran, and
-- `create or replace function` drops settings the new text does not repeat.
-- On a database built from the migrations this changes nothing.
--
-- Rollback: alter function public.rpc_merchant_application_review(uuid, bigint, uuid, text, text)
--   reset statement_timeout; then the same for lock_timeout.

alter function public.rpc_merchant_application_review(uuid, bigint, uuid, text, text)
  set statement_timeout = '5s';
alter function public.rpc_merchant_application_review(uuid, bigint, uuid, text, text)
  set lock_timeout = '2s';
