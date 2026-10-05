-- A big cancellation is a two-person decision, and the approvals
-- queue is where those already live.
--
-- Its own migration because `alter type ... add value` cannot be
-- used in the same transaction that adds it, and the next migration
-- needs to reference it.

alter type public.approval_kind add value if not exists 'order_cancel';
