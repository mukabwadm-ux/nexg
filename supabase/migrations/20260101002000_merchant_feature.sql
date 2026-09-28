-- Putting a live merchant in the homepage band — spec section 4.1.
--
-- `merchant.featured` is what public.merchant_public exposes and what the
-- homepage filters on, but nothing could set it: staff had no route to it
-- except a raw update, which would skip the audit event that ground rule 4
-- requires in the same transaction.
--
-- Two rules are enforced here rather than left to the caller:
--   * only a live merchant can be featured — the band is public, and a
--     merchant that is not live must never be reachable from it (ground
--     rule 5);
--   * the per-city slot count in `setting` is respected when it is set. It is
--     seeded null on purpose, because nobody has agreed a number yet
--     (ground rule 3); null means "not limited yet", not "unlimited forever".

create or replace function public.rpc_merchant_set_featured(
  p_merchant_id uuid,
  p_featured boolean,
  p_reason text default null
)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_limit integer;
  v_used integer;
begin
  select * into v_merchant from public.merchant where id = p_merchant_id;
  if v_merchant.id is null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if not authz.can_manage_merchants(v_merchant.city_id) then
    raise exception 'You cannot change featured placement in that city.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_featured and v_merchant.status <> 'live' then
    raise exception 'Only a live business can be featured. This one is %.', v_merchant.status
      using errcode = 'check_violation';
  end if;

  if p_featured and not v_merchant.featured then
    select nullif(value #>> '{}', '')::integer into v_limit
    from public.setting
    where key = 'homepage_featured_slots_per_city';

    if v_limit is not null then
      select count(*) into v_used
      from public.merchant m
      where m.city_id = v_merchant.city_id and m.featured and m.status = 'live';

      if v_used >= v_limit then
        raise exception 'Every featured slot in that city is taken (% of %).', v_used, v_limit
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  update public.merchant
  set featured = p_featured
  where id = p_merchant_id
  returning * into v_merchant;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => case when p_featured then 'merchant.featured' else 'merchant.unfeatured' end,
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_before => jsonb_build_object('featured', not p_featured),
    p_after => jsonb_build_object('featured', p_featured),
    p_reason => p_reason,
    p_city_id => v_merchant.city_id
  );

  return v_merchant;
end;
$$;

comment on function public.rpc_merchant_set_featured is
  'Adds or removes a live merchant from the homepage band, honouring the per-city slot limit when one is configured. Refuses anything that is not live: the band is public.';

grant execute on function public.rpc_merchant_set_featured(uuid, boolean, text)
  to authenticated, service_role;
