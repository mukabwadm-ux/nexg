-- rpc_order_read_api: what GET /v1/orders and GET /v1/orders/{id} read.
-- It failed on every call until 20261205000100 (min() of a uuid, a jsonb
-- slice, and a trim that dropped the newest order). Uses the seeded orders.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- The seeded merchant with the most orders, a key that may read them, and one that may not.
create temp table t_merchant on commit drop as
  select merchant_id from public."order" group by merchant_id order by count(*) desc, merchant_id limit 1;

create temp table t_orders on commit drop as
  select o.id, o.created_at
  from public."order" o join t_merchant m using (merchant_id)
  order by o.created_at desc, o.id desc;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select merchant_id, encode(sha256(convert_to('test-order-read-key-0123456789abcdef', 'UTF8')), 'hex'),
       'testread', '{merchant_read}', 600
from t_merchant;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select merchant_id, encode(sha256(convert_to('test-order-public-key-0123456789abcd', 'UTF8')), 'hex'),
       'testpubl', '{public_read}', 600
from t_merchant;

-- Every page, following next_cursor, as one list of order ids.
create function pg_temp.all_pages(p_limit integer) returns uuid[] language plpgsql as $$
declare
  v_page jsonb;
  v_ids uuid[] := '{}';
  v_at timestamptz;
  v_id uuid;
begin
  for guard in 1..500 loop
    v_page := public.rpc_order_read_api('test-order-read-key-0123456789abcdef', null, p_limit, v_at, v_id);
    v_ids := v_ids || array(select (e ->> 'order_id')::uuid from jsonb_array_elements(v_page -> 'items') e);
    exit when jsonb_typeof(v_page -> 'next_cursor') is distinct from 'object';
    v_at := (v_page -> 'next_cursor' ->> 'created_at')::timestamptz;
    v_id := (v_page -> 'next_cursor' ->> 'id')::uuid;
  end loop;
  return v_ids;
end
$$;

select ok((select count(*) from t_orders) >= 2, 'the seed gives the merchant at least two orders to page');

select lives_ok(
  $$ select public.rpc_order_read_api('test-order-read-key-0123456789abcdef') $$,
  'a page of orders reads without error');

select is(
  (public.rpc_order_read_api('test-order-read-key-0123456789abcdef', null, 1) -> 'items' -> 0 ->> 'order_id')::uuid,
  (select id from t_orders limit 1),
  'the first page starts with the newest order');

select is(
  jsonb_typeof(public.rpc_order_read_api('test-order-read-key-0123456789abcdef', null, 1) -> 'next_cursor'),
  'object',
  'a full page says where the next one starts');

select is(pg_temp.all_pages(1), array(select id from t_orders),
  'paging one at a time returns every order once, newest first');

select is(pg_temp.all_pages(100), array(select id from t_orders),
  'one large page returns the same orders in the same order');

select is(
  (public.rpc_order_read_api('test-order-read-key-0123456789abcdef', (select id from t_orders offset 1 limit 1))
     -> 'items' -> 0 ->> 'order_id')::uuid,
  (select id from t_orders offset 1 limit 1),
  'one order reads by its id');

select throws_ok(
  format($$ select public.rpc_order_read_api('test-order-read-key-0123456789abcdef', %L::uuid) $$,
         coalesce((select o.id from public."order" o where o.merchant_id <> (select merchant_id from t_merchant) limit 1),
                  '00000000-0000-4000-8000-000000000000'::uuid)),
  '22023', 'That order does not exist.',
  'another merchant''s order is answered as not existing');

select throws_ok(
  $$ select public.rpc_order_read_api('test-order-public-key-0123456789abcd') $$,
  '42501', 'This key cannot read a merchant''s orders.',
  'a key without merchant_read is refused');

select ok(
  not has_function_privilege('anon', 'public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid)', 'execute'),
  'the anonymous key cannot call it');

select * from finish();
rollback;
