-- The merchant status controls from the `Merchants` console artboard.
--
-- Four switches sit on the merchant detail panel and none of them existed:
--
--   Accepting orders  the merchant's own tap, off while the kitchen is under
--   Visible in Explore whether the public listing shows them at all
--   Pay on delivery    with a ceiling, because unpaid cash is NexG's risk
--   Concierge pick     editorial. NOT the same thing as `featured`, which is
--                      sold. The artboard labels it "editorial · not paid" and
--                      ground rule 5 means the difference has to be a column,
--                      not a convention someone remembers.
--
-- The cap is nullable with no default: what a sensible ceiling is has not been
-- agreed, and a number invented here would be quoted back as policy
-- (ground rule 3). Null means "no ceiling recorded", which the UI renders [—].

alter table public.merchant
  add column if not exists accepting_orders boolean not null default false,
  add column if not exists explore_visible boolean not null default true,
  add column if not exists pay_on_delivery boolean not null default false,
  add column if not exists pay_on_delivery_cap_kes integer,
  add column if not exists concierge_pick boolean not null default false,
  add column if not exists accepting_orders_changed_at timestamptz;

alter table public.merchant
  add constraint merchant_pay_on_delivery_cap_positive
  check (pay_on_delivery_cap_kes is null or pay_on_delivery_cap_kes > 0);

/*
 * A merchant that is not live must not be accepting orders or carrying an
 * editorial pick. Both are enforced here rather than only in the RPC, because
 * status can also change from rpc_merchant_go_live and the suspension path —
 * a rule that only lives in one caller is a rule that gets bypassed.
 */
alter table public.merchant
  add constraint merchant_not_live_takes_no_orders
  check (status = 'live' or accepting_orders = false);

alter table public.merchant
  add constraint merchant_not_live_is_no_pick
  check (status = 'live' or concierge_pick = false);

comment on column public.merchant.accepting_orders is
  'The merchant''s own switch. Off means the storefront shows but takes nothing.';
comment on column public.merchant.explore_visible is
  'Whether the public Explore listing includes this business. Independent of featured, which is the paid homepage band.';
comment on column public.merchant.concierge_pick is
  'An editorial recommendation. Never sold — that is `featured`. Keeping them apart is what lets the site label sponsored placement honestly.';

-- ------------------------------------------------------------------- view

/*
 * merchant_public gains the two flags the public surfaces filter on. It still
 * cannot return anything that is not live: `explore_visible` narrows what the
 * Explore page shows, it does not widen what anyone can see.
 */
create or replace view public.merchant_public
with (security_invoker = false)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.category_other,
  m.cover_photo_path,
  m.featured,
  c.slug as city_slug,
  c.name as city_name,
  b.name as branch_name,
  b.address_text as branch_address,
  b.latitude as branch_latitude,
  b.longitude as branch_longitude,
  m.created_at as listed_at,
  m.explore_visible,
  m.concierge_pick,
  m.accepting_orders
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b
  on b.merchant_id = m.id and b.is_primary
where m.status = 'live';

alter view public.merchant_public owner to postgres;
grant select on public.merchant_public to anon, authenticated;

-- -------------------------------------------------------------------- rpc

/*
 * One call, not four. A reviewer flipping two switches did one thing, and the
 * audit trail should say so; four events for one action makes the log harder
 * to read, not more precise. Null means "leave this alone".
 */
create or replace function public.rpc_merchant_set_controls(
  p_merchant_id uuid,
  p_accepting_orders boolean default null,
  p_explore_visible boolean default null,
  p_pay_on_delivery boolean default null,
  p_pay_on_delivery_cap_kes integer default null,
  p_concierge_pick boolean default null,
  p_clear_cap boolean default false,
  p_reason text default null
)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.merchant;
  v_after public.merchant;
  v_changes jsonb := '{}'::jsonb;
begin
  select * into v_before from public.merchant where id = p_merchant_id;
  if v_before.id is null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if not authz.can_manage_merchants(v_before.city_id) then
    raise exception 'You cannot change that business.' using errcode = 'insufficient_privilege';
  end if;

  if v_before.status <> 'live' and coalesce(p_accepting_orders, false) then
    raise exception 'A business that is % cannot accept orders.', v_before.status
      using errcode = 'check_violation';
  end if;

  -- The table constraint catches this too, but it reports its own name, and
  -- "merchant_pay_on_delivery_cap_positive" is not a sentence anyone can act on.
  if p_pay_on_delivery_cap_kes is not null and p_pay_on_delivery_cap_kes <= 0 then
    raise exception 'A pay-on-delivery ceiling has to be more than zero.'
      using errcode = 'check_violation';
  end if;

  if v_before.status <> 'live' and coalesce(p_concierge_pick, false) then
    raise exception 'Only a live business can be a concierge pick.'
      using errcode = 'check_violation';
  end if;

  update public.merchant
  set accepting_orders = coalesce(p_accepting_orders, accepting_orders),
      accepting_orders_changed_at = case
        when p_accepting_orders is not null and p_accepting_orders <> accepting_orders
          then now()
        else accepting_orders_changed_at
      end,
      explore_visible = coalesce(p_explore_visible, explore_visible),
      pay_on_delivery = coalesce(p_pay_on_delivery, pay_on_delivery),
      -- Clearing a cap and leaving it alone are different intents, and null
      -- cannot express both.
      pay_on_delivery_cap_kes = case
        when p_clear_cap then null
        else coalesce(p_pay_on_delivery_cap_kes, pay_on_delivery_cap_kes)
      end,
      concierge_pick = coalesce(p_concierge_pick, concierge_pick)
  where id = p_merchant_id
  returning * into v_after;

  if v_after.accepting_orders is distinct from v_before.accepting_orders then
    v_changes := v_changes || jsonb_build_object('accepting_orders', v_after.accepting_orders);
  end if;
  if v_after.explore_visible is distinct from v_before.explore_visible then
    v_changes := v_changes || jsonb_build_object('explore_visible', v_after.explore_visible);
  end if;
  if v_after.pay_on_delivery is distinct from v_before.pay_on_delivery then
    v_changes := v_changes || jsonb_build_object('pay_on_delivery', v_after.pay_on_delivery);
  end if;
  if v_after.pay_on_delivery_cap_kes is distinct from v_before.pay_on_delivery_cap_kes then
    v_changes := v_changes || jsonb_build_object('pay_on_delivery_cap_kes', v_after.pay_on_delivery_cap_kes);
  end if;
  if v_after.concierge_pick is distinct from v_before.concierge_pick then
    v_changes := v_changes || jsonb_build_object('concierge_pick', v_after.concierge_pick);
  end if;

  -- A call that changed nothing is not worth an audit row.
  if v_changes <> '{}'::jsonb then
    perform audit.log(
      p_actor_type => 'staff'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.controls_changed',
      p_target_type => 'merchant',
      p_target_id => p_merchant_id,
      p_before => jsonb_build_object(
        'accepting_orders', v_before.accepting_orders,
        'explore_visible', v_before.explore_visible,
        'pay_on_delivery', v_before.pay_on_delivery,
        'pay_on_delivery_cap_kes', v_before.pay_on_delivery_cap_kes,
        'concierge_pick', v_before.concierge_pick
      ),
      p_after => v_changes,
      p_reason => p_reason,
      p_city_id => v_before.city_id
    );
  end if;

  return v_after;
end;
$$;

comment on function public.rpc_merchant_set_controls is
  'Sets the merchant operational switches in one audited call. Null leaves a switch alone; p_clear_cap is how a pay-on-delivery ceiling is removed, since null already means "unchanged".';

grant execute on function public.rpc_merchant_set_controls(
  uuid, boolean, boolean, boolean, integer, boolean, boolean, text
) to authenticated, service_role;
