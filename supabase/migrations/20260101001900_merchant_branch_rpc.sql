-- Where a rider collects from — spec section 4.3, step 2.
--
-- The apply flow asked for a collection address and then dropped it: nothing
-- wrote merchant_branch, so a reviewer opened the application with no idea
-- where the shop is, and rpc_merchant_go_live has nowhere to send a rider.
--
-- This is an upsert on the primary branch rather than an insert, because the
-- applicant can go back a step and correct the address before submitting, and
-- a second branch is a different thing entirely (added with the merchant
-- portal in M5).

create or replace function public.rpc_merchant_set_primary_branch(
  p_merchant_id uuid,
  p_address_text text,
  p_name text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_branch_id uuid;
  v_name text;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'That business is not yours to edit.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_merchant from public.merchant where id = p_merchant_id;
  if v_merchant.id is null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if coalesce(trim(p_address_text), '') = '' then
    raise exception 'Enter where a rider collects from.' using errcode = 'check_violation';
  end if;

  -- An unnamed branch is the business itself; naming it "Main" for everyone
  -- would read as though they had chosen it.
  v_name := coalesce(nullif(trim(p_name), ''), v_merchant.trading_name);

  select id into v_branch_id
  from public.merchant_branch
  where merchant_id = p_merchant_id and is_primary
  limit 1;

  if v_branch_id is null then
    insert into public.merchant_branch (
      merchant_id, name, address_text, latitude, longitude, is_primary
    )
    values (p_merchant_id, v_name, trim(p_address_text), p_latitude, p_longitude, true)
    returning id into v_branch_id;
  else
    update public.merchant_branch
    set name = v_name,
        address_text = trim(p_address_text),
        latitude = coalesce(p_latitude, latitude),
        longitude = coalesce(p_longitude, longitude)
    where id = v_branch_id;
  end if;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.branch_saved',
    p_target_type => 'merchant_branch',
    p_target_id => v_branch_id,
    p_after => jsonb_build_object('address_text', trim(p_address_text), 'is_primary', true),
    p_city_id => v_merchant.city_id
  );

  return v_branch_id;
end;
$$;

comment on function public.rpc_merchant_set_primary_branch is
  'Saves the collection address for a business. Upsert, not insert: the applicant may correct it before submitting. The map pin arrives with the Maps picker in M5.';

grant execute on function public.rpc_merchant_set_primary_branch(
  uuid, text, text, double precision, double precision
) to authenticated;
