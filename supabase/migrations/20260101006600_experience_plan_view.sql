-- One read for the whole day.
--
-- The builder re-reads on every tap. Fetching the plan, then the blocks,
-- then the swap options for each block would be a dozen round trips per
-- tap over a 3G connection (ground rule 7) — the day would visibly lag
-- behind the finger. This is one.
--
-- Security invoker, so the caller sees their own day and nothing else:
-- the policies on plan and plan_block are what decide, exactly as they
-- would for a direct select.

create or replace function public.fn_plan_view(p_plan_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', (
      select to_jsonb(x) from (
        select
          p.id, p.reference, p.status, p.duration, p.party_type, p.party_size,
          p.date, p.budget_kes, p.moods, p.answers, p.notes, p.stay_label,
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
          /*
           * One cheaper, one pricier. Folded in here rather than fetched
           * per block, which is the whole reason this function exists.
           */
          coalesce((
            select jsonb_agg(to_jsonb(o)) from public.fn_swap_options(pb.id) o
          ), '[]'::jsonb) as swaps,
          /* Same rule as the budget bar: a car is its own segment, not
             whatever mood the component happens to be filed under. */
          case
            when pb.kind = 'transport' then 'transport'
            when pb.event_id is not null then 'events'
            else k.mood::text
          end as mood
        from public.plan_block pb
        left join public.experience_component k on k.id = pb.component_id
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
$$;

comment on function public.fn_plan_view is
  'The whole day in one read: plan, blocks with their swap options, mood totals and the thread. Invoker, so RLS decides who sees what exactly as it would for a direct select.';

grant execute on function public.fn_plan_view(uuid) to anon, authenticated;

/*
 * The chips under each mood in the builder. Public: it is the catalogue,
 * and the component view already decides what may be seen.
 */
create or replace function public.fn_mood_chips(p_city_id uuid)
returns table (
  mood public.mood, swap_group text, id uuid, title text, tier integer,
  price_kes bigint, price_basis public.price_basis, default_slot public.block_slot
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.mood, c.swap_group, c.id, c.title, c.tier, c.price_kes,
         c.price_basis, c.default_slot
  from public.component_public c
  where c.city_id = p_city_id
  order by c.mood, public.fn_slot_order(c.default_slot), c.tier, c.title
$$;

grant execute on function public.fn_mood_chips(uuid) to anon, authenticated;
