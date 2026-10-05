-- Settings gets a door, and the schema gets an API.
--
-- The module row has had a null href since the console was first
-- laid out. There is now something behind it.

update public.console_module set href = '/settings' where key = 'settings';

/* Finance and the DPO need to reach it; they already hold the roles
   the approval pairs name. */
insert into public.role_module_access (role_key, module_key, level, note)
values
  ('finance', 'settings', 'limited', 'Fees, commissions, rate cards, settlement, payments and rails.'),
  ('dpo', 'settings', 'limited', 'Retention and consent wording.'),
  ('growth', 'settings', 'limited', 'Template wording and branding.'),
  ('ops_manager', 'settings', 'limited', 'Cities, zones, dispatch, hours and holidays.')
on conflict (role_key, module_key) do update
  set level = excluded.level, note = excluded.note;
