-- `suspended` for merchants — spec section 5.2, `Merchants` console artboard.
--
-- The artboard shows PAUSED and SUSPENDED as different states and treats them
-- differently: a pause is the merchant's own temporary stop, a suspension is
-- imposed by NexG, needs a reason and a second approver, and holds payout
-- while it lasts. Folding them together would lose the distinction that
-- decides whether money moves.
--
-- `delisted` stays what it is: permanent removal, not a sanction.
--
-- Alone in its own migration because Postgres will not let a new enum value be
-- used in the transaction that adds it, and Supabase runs one transaction per
-- file.

alter type public.partner_status add value if not exists 'suspended' after 'paused';
