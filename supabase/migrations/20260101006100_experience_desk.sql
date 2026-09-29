-- Room for the desk: the notification kinds and columns a plan needs.
--
-- This is its own migration for one reason. A value added to an enum
-- cannot be *used* in the transaction that adds it, and the RPCs in the
-- next file cast to these kinds by name — putting both in one file fails
-- with "unsafe use of new value of enum type", which reads like a bug in
-- the RPC rather than a transaction boundary.

-- ───────────────────────────── notifications learn about plans

/*
 * The notification table was built for support tickets and carries a FK to
 * one. Widening it beats a second table: one place to look when somebody
 * asks whether the guest was actually told.
 */
alter table public.notification
  add column if not exists plan_id uuid references public.plan (id) on delete cascade,
  add column if not exists to_phone text;

alter type public.notification_kind add value if not exists 'plan_received';
alter type public.notification_kind add value if not exists 'plan_first_reply';
alter type public.notification_kind add value if not exists 'plan_quoted';
alter type public.notification_kind add value if not exists 'plan_quote_expiring';
alter type public.notification_kind add value if not exists 'plan_quote_expired';
alter type public.notification_kind add value if not exists 'plan_changes_needed';
alter type public.notification_kind add value if not exists 'plan_approved';
alter type public.notification_kind add value if not exists 'plan_paid';
alter type public.notification_kind add value if not exists 'plan_driver_assigned';
alter type public.notification_kind add value if not exists 'plan_reminder_day_before';
alter type public.notification_kind add value if not exists 'plan_completed';
alter type public.notification_kind add value if not exists 'partner_hold_request';
alter type public.notification_kind add value if not exists 'desk_new_plan';
alter type public.notification_kind add value if not exists 'desk_sla_breach';
alter type public.notification_kind add value if not exists 'review_request';
alter type public.notification_kind add value if not exists 'review_reply';
alter type public.notification_kind add value if not exists 'event_submission_reviewed';

alter type public.approval_kind add value if not exists 'experience_refund';

create index if not exists notification_plan_idx on public.notification (plan_id, created_at);
