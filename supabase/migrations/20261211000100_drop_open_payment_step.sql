-- The open payment step goes.
--
-- rpc_payment_authorised (last defined in 20260101017700) runs as the
-- database owner, checks nothing about its caller, and anon and
-- authenticated could execute it (20260101014800, 20260101015200). With only
-- a pending payment reference (NXP-…, which appears in /pay links) anyone
-- could mark that payment "authorised", overwrite its provider reference and
-- plant any payment link on it. It could not mark a payment paid or change an
-- amount, but the link a guest is sent to pay on is exactly what it rewrote.
--
-- The Paystack start route was its only caller, and Paystack was removed in
-- 20261204000100. Nothing has called it since: on 12 Nov 2026 the only
-- reference outside migrations was packages/db/src/types.generated.ts.
-- Bank collections record their own authorisation through
-- rpc_payment_bank_started, which checks the server's bank secret and the
-- payer, and M-Pesa through rpc_payment_mpesa_sent.
--
-- Its wiring_anon_allow row said the caller "must own the order", which was
-- never true, and that row is what kept it off the wiring check's list.
-- Both go.
--
-- Rollback: none intended. Restoring the function reopens the hole. A future
-- card or wallet provider that needs an "authorised" step gets its own
-- function that checks a server-held secret, as rpc_payment_bank_started does.

drop function if exists public.rpc_payment_authorised(text, text, text);

delete from public.wiring_anon_allow where function_name = 'rpc_payment_authorised';
