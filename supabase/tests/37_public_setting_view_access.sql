begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(
  has_table_privilege('anon', 'public.setting', 'select'),
  'anonymous callers can read the public settings view'
);

select ok(
  not has_schema_privilege('anon', 'settings', 'usage'),
  'anonymous callers cannot access the backing settings schema'
);

select ok(
  not has_table_privilege('anon', 'settings.version', 'select'),
  'anonymous callers cannot read settings versions directly'
);

set local role anon;

select lives_ok(
  $$select value from public.setting where key = 'commission_pct_by_category'$$,
  'the public merchant page can read its configured commission through the view'
);

select lives_ok(
  $$select value from public.setting where key = 'homepage_featured_slots_per_city'$$,
  'the public storefront can read its configured featured-slot setting through the view'
);

select * from finish();
rollback;
