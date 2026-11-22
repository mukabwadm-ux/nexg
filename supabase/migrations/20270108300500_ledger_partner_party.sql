-- Experience partners become a party on the ledger.
--
-- The venues and operators behind concierge experience plans are paid in the
-- weekly settlement run, next to merchants, hosts and riders. What NexG owes
-- each one is kept on payable.experience_partner:<partner id>, which needs a
-- party kind of its own.
--
-- This file holds the enum value alone: a value added to an enum cannot be
-- used in the transaction that adds it, and 20270108300600 uses it. Run this
-- file, and let it commit, before that one.
--
-- Rollback: nothing to do while nothing uses the value. Postgres cannot drop
-- one enum value; the type would have to be rebuilt.

alter type ledger.party_kind add value if not exists 'experience_partner';
