insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('merchant.subcategory_set', 'merchants', 'info', false, false, false, '{}', 'merchant subcategory selected')
on conflict (action) do nothing;
