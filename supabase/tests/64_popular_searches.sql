-- Popular searches: hero searches are counted per topic per day, with nothing about the visitor.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

delete from public.popular_search_count;

set local role anon;
select public.rpc_popular_search_hit('stays');
select public.rpc_popular_search_hit('stays');
select public.rpc_popular_search_hit('laundry');
select public.rpc_popular_search_hit('Not a topic; drop table');

select is(
  (select array_agg(topic || ':' || searches order by searches desc, topic) from public.rpc_popular_search_ranking(30)),
  array['stays:2', 'laundry:1'],
  'Anyone can count a search, and the most searched comes first.');

select throws_ok(
  $$ select * from public.popular_search_count $$,
  '42501', null,
  'The raw counts are not readable directly.');
reset role;

select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.columns
    where table_schema = 'public' and table_name = 'popular_search_count'),
  array['day', 'searches', 'topic'],
  'Only the day, the topic and a count are stored: not the words, nothing about the visitor.');

insert into public.popular_search_count (day, topic, searches)
values ((now() at time zone 'Africa/Nairobi')::date - 40, 'groceries', 99);

select is(
  (select array_agg(topic order by searches desc, topic) from public.rpc_popular_search_ranking(30)),
  array['stays', 'laundry'],
  'Searches older than the window do not count.');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical' and finding ilike '%popular_search%'),
  0,
  'The counter is on the anon allow-list with its reason, and needs no audit entry.');

select * from finish();
rollback;
