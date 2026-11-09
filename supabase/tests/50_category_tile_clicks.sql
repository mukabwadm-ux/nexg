-- Popular categories: taps are counted per tile per day, with nothing about the visitor.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

delete from public.category_tile_click;

set local role anon;
select public.rpc_category_tile_click('laundry');
select public.rpc_category_tile_click('laundry');
select public.rpc_category_tile_click('beauty');
select public.rpc_category_tile_click('Not a tile; drop table');

select is(
  (select array_agg(tile || ':' || clicks order by clicks desc, tile) from public.rpc_category_tile_popularity(30)),
  array['laundry:2', 'beauty:1'],
  'Anyone can tap a tile, and the most tapped comes first.');

select throws_ok(
  $$ select * from public.category_tile_click $$,
  '42501', null,
  'The raw counts are not readable directly.');
reset role;

select is(
  (select count(*)::int from public.category_tile_click),
  2,
  'A malformed tile name is ignored rather than stored.');

select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.columns
    where table_schema = 'public' and table_name = 'category_tile_click'),
  array['clicks', 'day', 'tile'],
  'Only the day, the tile and a count are stored: nothing about the visitor.');

insert into public.category_tile_click (day, tile, clicks)
values ((now() at time zone 'Africa/Nairobi')::date - 40, 'groceries', 99);

select is(
  (select array_agg(tile order by clicks desc, tile) from public.rpc_category_tile_popularity(30)),
  array['laundry', 'beauty'],
  'Taps older than the window do not count.');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical' and finding ilike '%category_tile%'),
  0,
  'The counter is on the anon allow-list with its reason, and needs no audit entry.');

select * from finish();
rollback;
