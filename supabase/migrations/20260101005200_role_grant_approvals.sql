-- Granting super_admin and finance, with two people, from the console.
--
-- The trigger refuses those roles without a second approver, which is right
-- and which made them unreachable from any UI: there was nowhere to put a
-- grant that had been proposed but not yet countersigned.
--
-- approval_request already does exactly this for merchant suspensions, so a
-- role grant becomes another kind of approval rather than a second mechanism
-- that behaves almost the same.

alter type public.approval_kind add value if not exists 'staff_role_grant';
