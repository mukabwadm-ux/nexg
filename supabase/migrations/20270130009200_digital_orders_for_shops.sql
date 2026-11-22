-- R38, part 1: the shop's Work page sends the code for a digital order.
--
-- rpc_merchant_digital_orders(order ids) tells the Work page which of the
-- caller's shop's orders are digital, which lines still need a code and
-- whether the buyer gave an ID. The page asks it on its own, so the orders
-- list works the same before this reaches the database. The page then sends
-- each code with rpc_merchant_order_send_codes (20270130000400).
--
-- Rollback: drop function public.rpc_merchant_digital_orders(uuid[]).

create or replace function public.rpc_merchant_digital_orders(p_order_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', o.id,
           'codes_missing', (select count(*) from public.order_item oi
                               join public.catalogue_item ci on ci.id = oi.catalogue_item_id
                              where oi.order_id = o.id and ci.digital
                                and not exists (select 1 from public.order_item_code c
                                                 where c.order_item_id = oi.id)),
           'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                              'order_item_id', oi.id, 'name', oi.name,
                              'has_code', exists (select 1 from public.order_item_code c
                                                   where c.order_item_id = oi.id))
                              order by oi.name, oi.id), '[]'::jsonb)
                       from public.order_item oi
                       join public.catalogue_item ci on ci.id = oi.catalogue_item_id
                      where oi.order_id = o.id and ci.digital),
           'has_buyer_id', exists (select 1 from public.order_buyer_id b where b.order_id = o.id))
         order by o.placed_at desc), '[]'::jsonb)
    from public.order o
   where o.id = any (coalesce(p_order_ids, '{}'::uuid[]))
     and o.fulfilment = 'digital'
     and (select auth.uid()) is not null
     and authz.is_merchant_member(o.merchant_id);
$$;
revoke execute on function public.rpc_merchant_digital_orders(uuid[]) from public, anon;
grant execute on function public.rpc_merchant_digital_orders(uuid[]) to authenticated;
comment on function public.rpc_merchant_digital_orders(uuid[]) is
  'For the shop''s Work page: which of these orders are digital, the lines still needing a code, and whether a buyer ID was given. Never returns codes or the ID itself.';
