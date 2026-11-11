-- The delivery rate card, readable by visitors.
--
-- Checkout prices delivery with fn_delivery_price_per_km: a base fee for the
-- first kilometre, a rate for each commenced kilometre after it, and a
-- maximum distance, all city settings. Explore's merchant cards show the
-- same price before checkout (from the visitor's spot, or the base fee when
-- they have not set one), so the website needs those three numbers.
--
-- Visitors cannot read the settings schema, so this returns just the three,
-- for one city, and nothing else. They are public prices: every guest sees
-- them at checkout anyway.

create or replace function public.rpc_delivery_rate(p_city_slug text)
returns table (base numeric, per_km numeric, max_km integer)
language sql
stable
security definer
set search_path = ''
as $$
  select settings.fn_num('fees.delivery.base', c.id),
         settings.fn_num('fees.delivery.per_km', c.id),
         settings.fn_int('fees.delivery.max_km', c.id)
    from public.city c
   where c.slug = p_city_slug
     and c.status <> 'waitlist';
$$;

comment on function public.rpc_delivery_rate(text) is
  'The per-km delivery rate card for one city (base, per commenced km after the first, max km), as fn_delivery_price_per_km charges it. Public prices, for the Explore cards.';

revoke execute on function public.rpc_delivery_rate(text) from public;
grant execute on function public.rpc_delivery_rate(text) to anon, authenticated;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_delivery_rate', 'Visitors browsing Explore see delivery prices before they sign in.',
   'Read-only: returns three public delivery prices for a named city and nothing else.')
on conflict (function_name) do nothing;
