-- Merchant hours, team and settings actions are registered.
--
-- These commands have always written audit events, but their actions were
-- never added to the registry, so every use also raised an
-- audit.unknown_action alert for review. 20261218000200 registered the
-- application and setup actions; these are the rest a merchant command logs:
--
--   merchant.hours_set               rpc_hours_set, rpc_merchant_setup_hours_save
--   merchant.hours_copied            rpc_hours_copy
--   merchant.holiday_hours_set       rpc_merchant_holiday_set
--   merchant.hours_override_cleared  rpc_merchant_hours_override_clear
--   merchant.member_updated          rpc_merchant_membership_update
--   merchant.member_removed          rpc_merchant_membership_remove
--   merchant.invite_revoked          rpc_merchant_invite_revoke
--   merchant.settings_changed        rpc_merchant_settings_update
--
-- None of them copies contact details into the log, so none lists PII
-- fields. Team changes are notices, like merchant.member_invited; the rest
-- are info, like merchant.hours_override_set.

insert into audit.action_registry (action, module, default_severity, description) values
  ('merchant.hours_set', 'merchants', 'info', 'Merchant set its weekly opening hours'),
  ('merchant.hours_copied', 'merchants', 'info', 'Merchant copied its weekly hours to a branch'),
  ('merchant.holiday_hours_set', 'merchants', 'info', 'Merchant or staff set the hours for a public holiday'),
  ('merchant.hours_override_cleared', 'merchants', 'info', 'Merchant or staff removed a day''s special hours, such as a holiday or closing early'),
  ('merchant.member_updated', 'merchants', 'notice', 'Merchant changed a team member''s role'),
  ('merchant.member_removed', 'merchants', 'notice', 'Merchant removed somebody from the account'),
  ('merchant.invite_revoked', 'merchants', 'notice', 'Merchant withdrew a team invitation before it was accepted'),
  ('merchant.settings_changed', 'merchants', 'info', 'Merchant changed its settings. Records which settings, not their values.')
on conflict (action) do nothing;
