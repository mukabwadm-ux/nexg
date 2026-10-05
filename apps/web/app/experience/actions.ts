'use server';

import type { Json } from '@nexg/db';

import { createClient } from '@/lib/supabase/server';

import type { Mood, PlanView } from '@/components/experience/types';

export interface PlanResult {
  ok: boolean;
  message?: string;
  view?: PlanView;
  planId?: string;
}

/** Everything the builder needs, in the one round trip fn_plan_view exists for. */
async function read(planId: string): Promise<PlanView | undefined> {
  const supabase = createClient();
  const { data } = await supabase.rpc('fn_plan_view', { p_plan_id: planId });
  const view = (data as PlanView | null) ?? undefined;

  /*
   * fn_plan_view always returns an object; `plan` inside it is null when
   * row-level security hides the row — a session that has not landed yet,
   * or somebody else's day. A view with no plan in it is not a view, and
   * saying so here keeps every caller from having to know that.
   */
  return view?.plan ? view : undefined;
}

/**
 * The plan this browser is building, creating one if there is not one yet.
 *
 * A draft is per session rather than per visit: coming back on the same
 * browser picks up the same day, which is the behaviour the merchant and
 * rider applications already have. Sent plans are deliberately excluded —
 * once a concierge has it, tapping Build starts something new rather than
 * quietly editing work somebody is in the middle of.
 */
export async function ensurePlan(citySlug = 'nairobi'): Promise<PlanResult> {
  const supabase = createClient();

  /*
   * The session is made here, on the server, and not in the browser.
   *
   * It used to be the browser's job, and two anonymous users were being
   * created for one visitor: React StrictMode runs effects twice in
   * development, both invocations saw no session, and both called
   * signInAnonymously. The plan was then written for the first user
   * while the cookie held the second — so every later save updated zero
   * rows, silently, because an UPDATE that row-level security filters
   * out is not an error. It would happen in production too, on any
   * double mount or a fast second navigation.
   *
   * One server action is one request, so the sign-in and the cookie that
   * carries it are written together and cannot race.
   */
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { data: fresh, error } = await supabase.auth.signInAnonymously();
    if (error) return { ok: false, message: error.message };
    user = fresh.user;
  }
  if (!user) return { ok: false, message: 'Could not start a session.' };

  const { data: existing } = await supabase
    .from('plan')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { ok: true, planId: existing.id, view: await read(existing.id) };

  const { data: city } = await supabase
    .from('city')
    .select('id')
    .eq('slug', citySlug)
    .maybeSingle();
  if (!city) return { ok: false, message: 'We are not in that city yet.' };

  const { data: created, error } = await supabase
    .from('plan')
    .insert({ user_id: user.id, city_id: city.id, status: 'draft' })
    .select('id')
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, planId: created.id, view: await read(created.id) };
}

export interface PlanPatch {
  duration?: string;
  party_type?: string;
  party_size?: number;
  date?: string | null;
  budget_kes?: number;
  moods?: Mood[];
  answers?: Record<string, Json>;
  notes?: string;
  stay_label?: string;
}

/**
 * Save the answers, rebuild the day, hand back the result.
 *
 * One call rather than save-then-fetch, because the builder does this on
 * every tap and the artboard promises the day "rebuilds as you tap".
 */
export async function savePlan(planId: string, patch: PlanPatch): Promise<PlanResult> {
  const supabase = createClient();

  /*
   * `.select()` so we can tell the difference between "saved" and "row-level
   * security matched nothing". An UPDATE that touches no rows returns no
   * error, which made a broken session look like a successful save for
   * every tap the guest made.
   */
  const { data: rows, error } = await supabase
    .from('plan')
    .update(patch)
    .eq('id', planId)
    .select('id');
  if (error) return { ok: false, message: error.message };
  if (!rows || rows.length === 0) {
    return { ok: false, message: 'That day is not yours to change any more.' };
  }

  const { error: buildError } = await supabase.rpc('fn_build_plan', { p_plan_id: planId });
  if (buildError) return { ok: false, message: buildError.message };

  return { ok: true, planId, view: await read(planId) };
}

/**
 * Swap one block for a neighbour in its group.
 *
 * Written straight onto the block rather than through the allocator: the
 * guest chose this one, and a rebuild would immediately fit it back to the
 * budget and undo the choice in front of them.
 */
export async function swapBlock(planId: string, blockId: string, componentId: string) {
  const supabase = createClient();

  const [{ data: plan }, { data: component }] = await Promise.all([
    supabase.from('plan').select('party_size').eq('id', planId).maybeSingle(),
    supabase
      .from('component_public')
      .select('title, subtitle, price_kes, price_basis, default_slot, duration_min, pay_on_day')
      .eq('id', componentId)
      .maybeSingle(),
  ]);

  if (!plan || !component) return { ok: false, message: 'That swap is no longer available.' };

  const size = plan.party_size ?? 1;
  const price =
    component.price_kes === null
      ? null
      : component.price_basis === 'per_person'
        ? component.price_kes * Math.max(size, 1)
        : component.price_kes;

  const { error } = await supabase
    .from('plan_block')
    .update({
      component_id: componentId,
      title_snapshot: component.title ?? 'Something else',
      subtitle_snapshot: component.subtitle,
      price_estimate_kes: price,
      pay_on_day: component.pay_on_day ?? [],
    })
    .eq('id', blockId)
    .eq('status', 'proposed');

  if (error) return { ok: false, message: error.message };

  /* The totals and the bar are derived, so they have to be recomputed. */
  await supabase.rpc('fn_event_anchor_effects', { p_plan_id: planId });
  return { ok: true, planId, view: await read(planId) };
}

export async function sendPlan(planId: string, name: string, phone: string): Promise<PlanResult> {
  const supabase = createClient();

  const { error } = await supabase.rpc('rpc_send_plan', {
    p_plan_id: planId,
    p_guest_name: name,
    p_guest_phone: phone,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, planId, view: await read(planId) };
}

export async function refreshPlan(planId: string): Promise<PlanResult> {
  return { ok: true, planId, view: await read(planId) };
}

/**
 * "Make it yours": start from a curated day rather than from nothing.
 *
 * The blocks are copied in as proposed, so the allocator still fits them
 * to whatever budget the guest then sets and every one of them can still
 * be swapped. Copying them as confirmed would make a curated day a
 * take-it-or-leave-it, which is the opposite of the point.
 */
export async function applyCuratedDay(planId: string, slug: string): Promise<PlanResult> {
  const supabase = createClient();

  const { data: plan } = await supabase
    .from('plan')
    .select('city_id, party_size')
    .eq('id', planId)
    .maybeSingle();
  if (!plan) return { ok: false, message: 'No day to start from.' };

  const { data: day } = await supabase
    .from('curated_day_public')
    .select('id, duration, party_types')
    .eq('slug', slug)
    .eq('city_id', plan.city_id)
    .maybeSingle();
  if (!day?.id) return { ok: false, message: 'That day is not running just now.' };

  const { data: blocks } = await supabase
    .from('curated_day_block')
    .select('component_id, slot, start_time, sort')
    .eq('curated_day_id', day.id)
    .order('sort');

  const ids = (blocks ?? []).map((b) => b.component_id);
  if (ids.length === 0) return { ok: false, message: 'That day has nothing in it yet.' };

  const { data: components } = await supabase
    .from('component_public')
    .select(
      'id, mood, title, subtitle, kind, price_kes, price_basis, pay_on_day, swap_group, default_slot, duration_min',
    )
    .in('id', ids);

  const size = plan.party_size ?? 1;
  const byId = new Map((components ?? []).map((c) => [c.id, c]));

  await supabase.from('plan_block').delete().eq('plan_id', planId).eq('status', 'proposed');

  const rows = (blocks ?? []).flatMap((b, i) => {
    const c = b.component_id ? byId.get(b.component_id) : undefined;
    if (!c) return [];
    const price =
      c.price_kes === null
        ? null
        : c.price_basis === 'per_person'
          ? c.price_kes * Math.max(size, 1)
          : c.price_kes;
    return [
      {
        plan_id: planId,
        slot: b.slot,
        start_time: b.start_time,
        kind: c.kind!,
        component_id: c.id!,
        title_snapshot: c.title ?? 'Something',
        subtitle_snapshot: c.subtitle,
        price_estimate_kes: price,
        pay_on_day: c.pay_on_day ?? [],
        swap_group: c.swap_group,
        sort: i + 1,
      },
    ];
  });

  /*
   * The plan fields go first and the blocks second, and neither step
   * calls the allocator. fn_build_plan deletes every proposed block
   * before it rebuilds, so rebuilding here would throw away the curated
   * day the guest just chose — the next tap rebuilds around it instead.
   */
  const moods = [...new Set((components ?? []).map((c) => c.mood).filter(Boolean))] as Mood[];

  const { error: planError } = await supabase
    .from('plan')
    .update({ curated_day_id: day.id, duration: day.duration ?? 'day', moods })
    .eq('id', planId);
  if (planError) return { ok: false, message: planError.message };

  if (rows.length > 0) {
    const { error: blockError } = await supabase.from('plan_block').insert(rows);
    if (blockError) return { ok: false, message: blockError.message };
  }

  /* Totals are derived from the blocks, so they have to be recomputed —
     but by summing, not by rebuilding. */
  const { data: fresh } = await supabase
    .from('plan_block')
    .select('price_estimate_kes, included_by, status')
    .eq('plan_id', planId);

  const estimate = (fresh ?? [])
    .filter((b) => b.included_by === null && b.status !== 'removed')
    .reduce((sum, b) => sum + (b.price_estimate_kes ?? 0), 0);

  await supabase.from('plan').update({ estimate_total_kes: estimate }).eq('id', planId);

  return { ok: true, planId, view: await read(planId) };
}

// ───────────────────────────────────── what the guest does with a quote

export async function approvePlan(planId: string): Promise<PlanResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_approve_plan', { p_plan_id: planId });
  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  return {
    ok: true,
    planId,
    view: await read(planId),
    message: 'Approved. Your concierge is booking it.',
  };
}

export async function requestChanges(planId: string, message: string): Promise<PlanResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_request_changes', {
    p_plan_id: planId,
    p_message: message,
  });
  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  return { ok: true, planId, view: await read(planId), message: 'They will come back to you.' };
}

export async function sendGuestMessage(planId: string, body: string): Promise<PlanResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_plan_message', { p_plan_id: planId, p_body: body });
  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  return { ok: true, planId, view: await read(planId) };
}
