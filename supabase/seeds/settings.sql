-- The development account reaches the Settings module.
--
-- Local only. `seed.sql` grants the dev account seven roles and none
-- of them is `finance`, `tech`, `legal` or `super_admin` — which are
-- the four the Settings approval pairs are written against. Without
-- them the console is correctly locked and looks broken, and there
-- is no way to try the module at all.
--
-- This was briefly a migration, which was wrong twice over: it ran
-- before the seed created the account so it did nothing, and a
-- migration that grants super_admin is not a thing that should exist
-- in a file production replays.

do $$
declare
  v_dev uuid;
  v_other uuid;
  r record;
begin
  select id into v_dev from public.staff_user where email = 'dev.admin@nexgapp.com';
  select id into v_other from public.staff_user where email <> 'dev.admin@nexgapp.com' limit 1;
  if v_dev is null or v_other is null then return; end if;

  /* A grant needs a granter who is not the approver. */
  for r in select id from public.role where key in ('finance', 'tech', 'legal', 'super_admin') loop
    insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
    values (v_dev, r.id, v_other, v_dev)
    on conflict do nothing;
  end loop;
exception when others then
  raise notice 'Settings seed skipped: %', sqlerrm;
end $$;
