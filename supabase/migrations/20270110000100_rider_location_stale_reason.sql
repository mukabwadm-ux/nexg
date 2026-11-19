-- A rider whose last position is old is skipped, and says why.
--
-- Its own file: a new enum value cannot be used in the transaction that adds
-- it, and 20270110000200 uses it.
--
-- Rollback: enum values cannot be dropped; the value is harmless unused.
--   delete from settings.definition where key = 'dispatch.location_fresh_s';

alter type dispatch.skip_reason add value if not exists 'location_stale';

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('dispatch.location_fresh_s', 'dispatch', 'city', 'int', 's',
   'Rider position counts for',
   'Seconds a rider''s last reported position is trusted. Older than this, the rider is skipped as "position too old" rather than offered a job from where they used to be.',
   false, true, 'single:ops_manager', '{dispatch}', '120'::jsonb, 209)
on conflict (key) do nothing;
