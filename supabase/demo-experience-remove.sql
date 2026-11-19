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
-- Step 1 only reads. Step 2 deletes in one transaction and stops, deleting
-- nothing, if any customer plan, partner hold, ledger account or non-demo
-- curated day still uses a demo row. Then those need a decision first.

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

begin;

create temporary table demo_partner on commit drop as
  select id from public.experience_partner where name like 'Demo · %';
create temporary table demo_component on commit drop as
  select id from public.experience_component
   where tags @> array['demo'] or partner_id in (select id from demo_partner);
create temporary table demo_curated on commit drop as
  select id from public.curated_day where slug like 'demo-%';
create temporary table demo_event on commit drop as
  select id from public.event where organiser_name = 'Demo organiser';

do $guard$
declare
  v_blocks integer;
  v_plans integer;
  v_holds integer;
  v_ledger integer;
  v_curated integer;
begin
  select count(*) into v_blocks from public.plan_block b
   where b.component_id in (select id from demo_component)
      or b.event_id in (select id from demo_event)
      or b.assigned_driver_partner_id in (select id from demo_partner);
  select count(*) into v_plans from public.plan
   where curated_day_id in (select id from demo_curated);
  select count(*) into v_holds from public.partner_hold
   where partner_id in (select id from demo_partner);
  select count(*) into v_ledger from ledger.account
   where party_type::text = 'experience_partner' and party_id in (select id from demo_partner);
  select count(*) into v_curated from public.curated_day_block cb
   where cb.component_id in (select id from demo_component)
     and cb.curated_day_id not in (select id from demo_curated);
  if v_blocks + v_plans + v_holds + v_ledger + v_curated > 0 then
    raise exception 'Nothing deleted. Still in use: % plan blocks, % plans, % partner holds, % ledger accounts, % blocks in real curated days.',
      v_blocks, v_plans, v_holds, v_ledger, v_curated;
  end if;
end
$guard$;

-- Curated days take their blocks with them (cascade).
delete from public.curated_day where id in (select id from demo_curated);
delete from public.event where id in (select id from demo_event);
-- Components take their availability with them (cascade).
delete from public.experience_component where id in (select id from demo_component);
-- Documents point at partners by owner id, without a foreign key.
delete from public.document
 where owner_type = 'experience_partner' and owner_id in (select id from demo_partner);
-- Partners take their payout details with them (cascade); events and
-- client invoices that named one keep their row with the link cleared.
delete from public.experience_partner where id in (select id from demo_partner);

do $check$
begin
  if exists (select 1 from public.experience_partner where name like 'Demo · %')
     or exists (select 1 from public.experience_component where tags @> array['demo'])
     or exists (select 1 from public.curated_day where slug like 'demo-%')
     or exists (select 1 from public.event where organiser_name = 'Demo organiser') then
    raise exception 'Demo rows are still there; rolled back.';
  end if;
end
$check$;

commit;
