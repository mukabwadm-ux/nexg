-- The catalogue policies could never pass.
--
-- Each one asked "is this merchant live?" with a subquery against
-- public.merchant. Policies run as the calling role, and anon has had SELECT
-- on that table revoked since the public view was introduced — deliberately,
-- because merchant_public is meant to be the only way in. So the check itself
-- raised "permission denied for table merchant" and every menu came back
-- empty.
--
-- It failed the same way in every environment and would have shipped as "the
-- merchant has not uploaded a menu", which is exactly the kind of wrong that
-- does not look like a bug.
--
-- The question is asked through a security-definer function instead. It
-- answers one thing, takes an id, and leaks nothing else about the row —
-- merchant stays unreadable to anon.

create or replace function public.fn_merchant_is_live(p_merchant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant m
    where m.id = p_merchant_id and m.status = 'live'
  );
$$;

comment on function public.fn_merchant_is_live is
  'Whether a business is live. A function rather than a subquery because the catalogue policies run as anon, which cannot read public.merchant.';

grant execute on function public.fn_merchant_is_live(uuid) to anon, authenticated, service_role;

drop policy if exists catalogue_section_read_public on public.catalogue_section;
create policy catalogue_section_read_public on public.catalogue_section
  for select to anon, authenticated
  using (public.fn_merchant_is_live(merchant_id));

drop policy if exists catalogue_item_read_public on public.catalogue_item;
create policy catalogue_item_read_public on public.catalogue_item
  for select to anon, authenticated
  using (public.fn_merchant_is_live(merchant_id));

drop policy if exists merchant_hours_read_public on public.merchant_hours;
create policy merchant_hours_read_public on public.merchant_hours
  for select to anon, authenticated
  using (public.fn_merchant_is_live(merchant_id));
