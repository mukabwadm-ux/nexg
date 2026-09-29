-- Icons on the console rail, as the artboards draw them.
--
-- The name lives here rather than in a map in the app for the same reason
-- the label and the href do: the sidebar is built from this table, and a
-- module added by someone editing rows should arrive with its icon rather
-- than as a gap until a developer ships a lookup.
--
-- What is stored is a name, not markup. The app maps it to a component, so
-- a typo renders the fallback rather than an empty space, and nothing in
-- the database decides how anything is drawn.

alter table public.console_module
  add column if not exists icon text;

update public.console_module set icon = v.icon from (values
  ('overview',   'home'),
  ('support',    'life-buoy'),
  ('live_ops',   'radio'),
  ('orders',     'shopping-bag'),
  ('merchants',  'store'),
  ('riders',     'bike'),
  ('hotels',     'building'),
  ('featured',   'star'),
  ('experiences','sparkles'),
  ('careers',    'briefcase'),
  ('finance',    'wallet'),
  ('staff',      'users'),
  ('settings',   'settings'),
  ('audit',      'scroll-text')
) as v(key, icon) where public.console_module.key = v.key;

comment on column public.console_module.icon is
  'A lucide icon name the console maps to a component. A name the app does not know renders a neutral fallback, so an unrecognised value is a plain icon rather than a hole in the rail.';
