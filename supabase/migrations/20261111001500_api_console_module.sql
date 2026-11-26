-- Give the 'api' audit module a home in the console registry.
--
-- API key issue/revoke and API-placed service orders log under module 'api'
-- (20260101022900, 20260101023000, 20261102000200), but console_module had no
-- such key, so the audit console could not label or group those events
-- (tests/16 caught it).
--
-- No href: there is no API page yet, and no role_module_access rows, so this
-- does not add a sidebar entry for anyone. It only names the module.
insert into public.console_module (key, label, section, href, sort, icon)
values ('api', 'API & integrations', 'Control', null, 125, null)
on conflict (key) do nothing;
