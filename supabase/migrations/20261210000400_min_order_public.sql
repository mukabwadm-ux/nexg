-- The minimum order for a category, readable by visitors.
--
-- fees.min_order is a city + category setting ("the smallest basket this
-- category will accept"). The merchant page shows it as a chip so a guest
-- knows before they build a basket. Visitors cannot read the settings schema,
-- so this returns that one number, or null when it is not set, in which case
-- the page leaves the chip out rather than guess.

create or replace function public.rpc_min_order(p_city_slug text, p_category text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select settings.fn_int('fees.min_order', c.id, p_category)
    from public.city c
   where c.slug = p_city_slug
     and c.status <> 'waitlist';
$$;

comment on function public.rpc_min_order(text, text) is
  'fees.min_order for one city and category, or null when unset. A public price, for the merchant page.';

revoke execute on function public.rpc_min_order(text, text) from public;
grant execute on function public.rpc_min_order(text, text) to anon, authenticated;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_min_order', 'Visitors see a merchant''s minimum order before they sign in.',
   'Read-only: returns one public price (the minimum order) for a city and category, and nothing else.')
on conflict (function_name) do nothing;
