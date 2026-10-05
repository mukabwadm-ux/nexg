-- Registering what the Settings module emits.
--
-- Caught by the audit suite rather than by me: assertion 18 of
-- `16_audit_console.sql` is "every action the earlier modules emit
-- is in the registry", and the moment Settings started logging it
-- went red. That is the whole reason the registry exists — a module
-- that invents a vocabulary nobody declared turns the review queue
-- into noise within a week.
--
-- `settings.activated` is the one that matters most and is the
-- quietest: it is written by a cron at midnight, nobody is watching,
-- and it is the record of a price actually changing.

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('settings.change_requested', 'settings', 'notice', false, false, false,
   'A settings change was submitted for approval'),
  ('settings.change_approved', 'settings', 'high', false, true, false,
   'A settings change was approved'),
  ('settings.change_rejected', 'settings', 'notice', false, false, false,
   'A settings change was rejected'),
  ('settings.activated', 'settings', 'high', false, false, false,
   'Scheduled settings took effect'),
  ('settings.rolled_back', 'settings', 'high', true, false, false,
   'A setting was rolled back'),
  ('payment_method.toggled', 'settings', 'high', true, false, true,
   'A guest payment method was switched on or off')
on conflict (action) do update set
  module = excluded.module,
  description = coalesce(nullif(audit.action_registry.description, ''), excluded.description);
