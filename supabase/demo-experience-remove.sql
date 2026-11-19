-- Removes the demo experience catalogue that
-- 20260101022100_demo_experience_catalogue.sql seeded, and nothing else.
--
-- Run by hand in the Supabase SQL editor (owner, 19 Nov 2026). Not a
-- migration: the seed migration stays in history, so local and CI databases
-- still get the demo catalogue to test against.
--
-- What counts as demo, exactly as the seed marked it:
--   partners    name starts with 'Demo · '
--   components  tags contain 'demo', or owned by a demo partner
--   curated     slug starts with 'demo-'
--   events      organiser_name = 'Demo organiser'
--
-- Step 1 only reads. Step 2 deletes in one transaction. Unpaid customer
-- plans that used a demo item keep their blocks (title and price are copied
-- into each block) with the link cleared. It stops, deleting nothing, if a
-- paid, running or finished plan, a partner hold, a ledger account or a
-- non-demo curated day still uses a demo row.

-- ------------------------------------------------------------- 1. preview

select 'partners' as what, count(*) as rows, string_agg(name, ', ' order by name) as names
  from public.experience_partner where name like 'Demo · %'
union all
select 'components', count(*), string_agg(title, ', ' order by title)
  from public.experience_component k
 where k.tags @> array['demo']
    or k.partner_id in (select id from public.experience_partner where name like 'Demo · %')
union all
select 'curated days', count(*), string_agg(slug, ', ' order by slug)
  from public.curated_day where slug like 'demo-%'
union all
select 'events', count(*), string_agg(name, ', ' order by name)
  from public.event where organiser_name = 'Demo organiser'
union all
select 'customer plan blocks using them', count(*), null
  from public.plan_block b
 where b.component_id in (select id from public.experience_component
                          where tags @> array['demo']
                             or partner_id in (select id from public.experience_partner where name like 'Demo · %'))
    or b.event_id in (select id from public.event where organiser_name = 'Demo organiser')
    or b.assigned_driver_partner_id in (select id from public.experience_partner where name like 'Demo · %')
union all
select 'plans started from a demo curated day', count(*), null
  from public.plan where curated_day_id in (select id from public.curated_day where slug like 'demo-%')
union all
select 'partner holds', count(*), null
  from public.partner_hold where partner_id in (select id from public.experience_partner where name like 'Demo · %')
union all
select 'ledger accounts', count(*), null
  from ledger.account
 where party_type::text = 'experience_partner'
   and party_id in (select id from public.experience_partner where name like 'Demo · %');

-- ------------------------------------------------------------- 2. delete

-- One statement, so it is all-or-nothing even in the SQL editor, which
-- commits each statement on its own (temporary tables do not survive there).
do $remove$
declare
  v_partners uuid[];
  v_components uuid[];
  v_curated uuid[];
  v_events uuid[];
  v_blocks integer;
  v_plans integer;
  v_holds integer;
  v_ledger integer;
  v_curated_used integer;
begin
  select coalesce(array_agg(id), '{}') into v_partners
    from public.experience_partner where name like 'Demo · %';
  select coalesce(array_agg(id), '{}') into v_components
    from public.experience_component where tags @> array['demo'] or partner_id = any (v_partners);
  select coalesce(array_agg(id), '{}') into v_curated
    from public.curated_day where slug like 'demo-%';
  select coalesce(array_agg(id), '{}') into v_events
    from public.event where organiser_name = 'Demo organiser';

  -- Blocks keep their own title and price (the snapshots), and the foreign
  -- keys clear the link, so a plan that is not paid just loses the link to
  -- the demo item (owner, 19 Nov 2026: 11 blocks). A paid, running or
  -- finished plan involves money, so that still stops the delete.
  select count(*) into v_blocks from public.plan_block b
    join public.plan p on p.id = b.plan_id
   where (b.component_id = any (v_components) or b.event_id = any (v_events)
          or b.assigned_driver_partner_id = any (v_partners))
     and p.status::text in ('paid', 'in_progress', 'completed');
  select count(*) into v_plans from public.plan
   where curated_day_id = any (v_curated) and status::text in ('paid', 'in_progress', 'completed');
  select count(*) into v_holds from public.partner_hold where partner_id = any (v_partners);
  select count(*) into v_ledger from ledger.account
   where party_type::text = 'experience_partner' and party_id = any (v_partners);
  select count(*) into v_curated_used from public.curated_day_block cb
   where cb.component_id = any (v_components) and not (cb.curated_day_id = any (v_curated));
  if v_blocks + v_plans + v_holds + v_ledger + v_curated_used > 0 then
    raise exception 'Nothing deleted. Still in use: % blocks in paid plans, % paid plans from a demo day, % partner holds, % ledger accounts, % blocks in real curated days.',
      v_blocks, v_plans, v_holds, v_ledger, v_curated_used;
  end if;

  -- Curated days take their blocks with them (cascade).
  delete from public.curated_day where id = any (v_curated);
  delete from public.event where id = any (v_events);
  -- Components take their availability with them (cascade).
  delete from public.experience_component where id = any (v_components);
  -- Documents point at partners by owner id, without a foreign key.
  delete from public.document where owner_type = 'experience_partner' and owner_id = any (v_partners);
  -- Partners take their payout details with them (cascade); events and
  -- client invoices that named one keep their row with the link cleared.
  delete from public.experience_partner where id = any (v_partners);

  if exists (select 1 from public.experience_partner where name like 'Demo · %')
     or exists (select 1 from public.experience_component where tags @> array['demo'])
     or exists (select 1 from public.curated_day where slug like 'demo-%')
     or exists (select 1 from public.event where organiser_name = 'Demo organiser') then
    raise exception 'Demo rows are still there; nothing was deleted.';
  end if;

  raise notice 'Removed % partners, % components, % curated days, % events.',
    cardinality(v_partners), cardinality(v_components), cardinality(v_curated), cardinality(v_events);
end
$remove$;
