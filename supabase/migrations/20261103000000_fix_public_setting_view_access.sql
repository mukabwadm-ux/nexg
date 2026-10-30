-- The public.setting compatibility view deliberately filters to active
-- global/city settings. Let the view owner read its private backing table;
-- callers still receive only the columns and rows selected by the view.
alter view public.setting set (security_invoker = false);

comment on view public.setting is
  'Public compatibility read for active global and city settings. Access to settings.version remains restricted; writes go through the settings RPCs.';
