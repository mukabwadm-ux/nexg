-- An Explore plan's stop says which shop it is at (R9, shared services; owner
-- 23 Nov 2026).
--
-- The Consumer app's Explore saves a plan's stops (meals, venues, activities)
-- straight into plan_block, as the plan's owner may (policy
-- plan_block_write_owner). The website's planner links each block to an
-- experience component, which leads to a merchant through its partner; the
-- app's stops have no component, so nothing said which shop a stop was at.
--
-- 1. plan_block.merchant_id: the shop a stop is at. Optional; cleared if the
--    merchant is deleted. The owner sets it like any other block field.
-- 2. When a block has a component and no merchant, the component's partner's
--    merchant is filled in (trigger plan_block_merchant_from_component).
-- 3. fn_plan_view, which the website and the apps read a plan through,
--    returns each block's merchant_id and the shop's public name
--    (merchant_public), so an app can open the shop's page.
--
-- Rollback:
--   re-run fn_plan_view from 20260101021100;
--   drop trigger if exists plan_block_merchant_from_component on public.plan_block;
--   drop function if exists public.tg_plan_block_merchant_from_component();
--   alter table public.plan_block drop column if exists merchant_id;

alter table public.plan_block
  add column merchant_id uuid references public.merchant (id) on delete set null;

create index plan_block_merchant_idx on public.plan_block (merchant_id) where merchant_id is not null;

comment on column public.plan_block.merchant_id is
  'R9: the shop this stop is at. Set by the plan''s owner (the apps), or from the component''s partner.';

create or replace function public.tg_plan_block_merchant_from_component()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.merchant_id is null and new.component_id is not null then
    select p.merchant_id into new.merchant_id
      from public.experience_component k
      join public.experience_partner p on p.id = k.partner_id
     where k.id = new.component_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_plan_block_merchant_from_component() from public, anon, authenticated;

create trigger plan_block_merchant_from_component
  before insert or update of component_id, merchant_id on public.plan_block
  for each row execute function public.tg_plan_block_merchant_from_component();

-- fn_plan_view: 20260101021100's body, with merchant_id and merchant_name on each block.
create or replace function public.fn_plan_view(p_plan_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'plan', (
      select to_jsonb(x) from (
        select
          p.id, p.reference, p.status, p.duration, p.party_type, p.party_size,
          p.date, p.end_date, p.budget_kes, p.moods, p.answers, p.notes, p.stay_label,
          p.estimate_total_kes, p.quote_total_kes, p.pay_on_day_total_kes,
          p.concierge_fee_kes, p.expires_at, p.guest_name, p.guest_phone,
          p.curated_day_id, p.city_id,
          s.display_name as concierge_name
        from public.plan p
        left join public.staff_user s on s.id = p.concierge_id
        where p.id = p_plan_id
      ) x
    ),
    'blocks', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.sort) from (
        select
          pb.id, pb.slot, pb.start_time, pb.end_time, pb.kind, pb.component_id,
          pb.event_id, pb.title_snapshot, pb.subtitle_snapshot,
          pb.price_estimate_kes, pb.price_quoted_kes, pb.pay_on_day,
          pb.included_by, pb.anchored, pb.swap_group, pb.status,
          pb.change_note, pb.changed_from, pb.hold_status, pb.sort,
          coalesce((
            select jsonb_agg(to_jsonb(o)) from public.fn_swap_options(pb.id) o
          ), '[]'::jsonb) as swaps,
          case
            when pb.kind = 'transport' then 'transport'
            when pb.event_id is not null then 'events'
            else k.mood::text
          end as mood,
          pb.merchant_id,
          mp.trading_name as merchant_name
        from public.plan_block pb
        left join public.experience_component k on k.id = pb.component_id
        left join public.merchant_public mp on mp.id = pb.merchant_id
        where pb.plan_id = p_plan_id and pb.status <> 'removed'
      ) b
    ), '[]'::jsonb),
    'totals', coalesce((
      select jsonb_object_agg(t.mood, t.total_kes) from public.fn_plan_totals(p_plan_id) t
    ), '{}'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at) from (
        select pm.id, pm.author_type, pm.body, pm.created_at,
               s.display_name as author_name
        from public.plan_message pm
        left join public.staff_user s
          on s.id = pm.author_id and pm.author_type = 'staff'
        where pm.plan_id = p_plan_id
      ) m
    ), '[]'::jsonb)
  )
$function$;
