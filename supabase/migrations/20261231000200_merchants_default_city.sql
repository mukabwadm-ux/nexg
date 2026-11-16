-- Every merchant has a city: Nairobi when none was given.
--
-- The application form creates merchants without a city. merchant_home_v
-- inner-joins city, so those merchants had no summary row: the Business
-- page said "Your business records could not be loaded" and the portal
-- header fell back to "Merchant workspace". City-scoped staff queues,
-- Explore and the holiday calendar all skip them too.
--
-- Every merchant with a city today is in Nairobi, and the form does not ask
-- for one yet, so:
--   - new merchants without a city get Nairobi (a BEFORE INSERT trigger, so
--     every insert path is covered without touching the application RPCs);
--   - the merchants already without one are given Nairobi.

create or replace function public.tg_merchant_default_city()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.city_id is null then
    new.city_id := (select c.id from public.city c where c.slug = 'nairobi');
  end if;
  return new;
end;
$$;

comment on function public.tg_merchant_default_city() is
  'Gives a new merchant Nairobi when it arrives without a city.';

revoke execute on function public.tg_merchant_default_city() from public, anon, authenticated;

drop trigger if exists merchant_default_city on public.merchant;
create trigger merchant_default_city
  before insert on public.merchant
  for each row execute function public.tg_merchant_default_city();

update public.merchant
set city_id = (select c.id from public.city c where c.slug = 'nairobi')
where city_id is null;
